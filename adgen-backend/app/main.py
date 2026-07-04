"""FastAPI entry — the orchestrator API (file 05).

Endpoints:
    GET  /health              liveness
    POST /plan                Gemini: idea -> 1-3 proposed ad approaches
    POST /generate            start a job (background thread) -> {job_id}
    GET  /jobs/{id}           status/progress/detail
    GET  /jobs/{id}/video     download the finished mp4
    POST /jobs/{id}/cancel    interrupt the running pod job
    POST /postprocess         CodeFormer -> SeedVR2 -> RIFE on an existing video
    POST /assets              upload an image (avatar/product) from the browser
    GET  /outputs             list generated videos (Library grid data)
    GET  /voices              list ElevenLabs voices (for the voice picker)
    POST /voice-preview       short TTS sample of a voice
    /files/*  /assets-files/* static serving of outputs and uploaded assets

Jobs are held in memory (fine for 3-4 users / dev); the DB arrives in Phase 3.
Run:  ./.venv/bin/uvicorn app.main:app --port 8000
"""
import json
import threading
import time
import uuid
from pathlib import Path
from typing import Literal

import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app import pipeline, postprocess
from app.assembly import ffmpeg
from app.config import COMFY_POD_URLS, ELEVENLABS_API_KEY
from app.providers import llm
from app.providers.tts import synthesize_voice

app = FastAPI(title="adgen orchestrator")

Path("outputs").mkdir(exist_ok=True)
Path("assets/uploads").mkdir(parents=True, exist_ok=True)
app.mount("/files", StaticFiles(directory="outputs"), name="outputs")
app.mount("/assets-files", StaticFiles(directory="assets"), name="assets")

JOBS: dict[str, dict] = {}
TERMINAL_STATES = {"done", "error", "cancelled"}
POD_KINDS = {"generate", "postprocess"}  # kinds that occupy a pod (queue-relevant)


def _new_job(kind: str, name: str | None = None) -> str:
    """Register a job with the metadata the queue view needs."""
    job_id = uuid.uuid4().hex[:12]
    JOBS[job_id] = {"status": "queued", "progress": 0, "detail": "",
                    "video_path": None, "error": None,
                    "kind": kind, "name": name, "created": time.time()}
    return job_id


def _update(job_id: str, **fields) -> None:
    """Job update that NEVER overwrites a user cancellation — worker threads keep
    running after cancel and must not resurrect the job as running/done."""
    job = JOBS.get(job_id)
    if job and job["status"] != "cancelled":
        job.update(**fields)


def _voice_locked(path: Path) -> bool:
    """True when a video's speech is lip-synced to its baked-in voice: anything from
    the wans2v pipeline, or a sequence/remix final whose sidecar says voice_lock
    (it contains avatar segments). Revoicing these would visibly desync the mouth."""
    if "wans2v" in path.parts:
        return True
    sidecar = path.with_suffix(".meta.json")
    if sidecar.exists():
        try:
            return bool(json.loads(sidecar.read_text()).get("voice_lock"))
        except (json.JSONDecodeError, OSError):
            return False
    return False


class Shot(BaseModel):
    prompt: str                          # Wan 2.2 positive box
    negative_prompt: str | None = None   # Wan 2.2 negative box


class Segment(BaseModel):
    """One timeline entry of a sequence job (file 15's 60s mixed-pipeline ad)."""
    pipeline: Literal["overlay", "lipsync", "product"]
    prompt: str
    negative_prompt: str | None = None
    script: str | None = None            # this segment's script slice (lipsync: required)
    image: str | None = None             # product photo / reference face for this segment


class GenerateRequest(BaseModel):
    mode: str = "overlay"
    shots: list[Shot] = []               # non-sequence modes; validated in the endpoint
    segments: list[Segment] | None = None  # sequence mode timeline
    script: str | None = None            # narration text; None -> silent stitch
    language: str = "hi"
    seed: int | None = None
    music: str | None = None             # optional path to a music bed
    quality: Literal["quality", "fast"] = "quality"   # fast = 4-step preview mode
    name: str | None = Field(default=None, pattern=r"^[a-zA-Z0-9._-]+$")
    # ^ prefixes output files (outputs/video/<name>-*.mp4); defaults to the job id
    avatar_image: str | None = None      # lipsync: path to the reference face image
    product_image: str | None = None     # product: path to the product photo (i2v start image)
    voice_id: str | None = None          # TTS voice override (default: ELEVENLABS_VOICE_ID)
    postprocess: bool = False            # True = run the post chain after assembly (one-call
                                         # Enhanced/Master presets; adds a "post" stage)
    width: int | None = Field(default=None, ge=64, le=1920, multiple_of=16)
    height: int | None = Field(default=None, ge=64, le=1920, multiple_of=16)
    # ^ frame size override (e.g. 432x768 = 9:16 vertical for reels); default = workflow's own
    steps: int | None = Field(default=None, ge=1, le=50)
    # ^ sampler steps override ("fast but some quality" middle ground, e.g. 6-8 with the LoRA)


@app.get("/health")
def health():
    return {"ok": True}


class PlanRequest(BaseModel):
    idea: str = Field(min_length=3)
    language: str = "en"
    format: str = "9:16"
    duration_s: int = Field(default=15, ge=5, le=60)


@app.post("/plan")
def plan_endpoint(req: PlanRequest):
    try:
        return llm.plan(req.idea, language=req.language, ad_format=req.format,
                        duration_s=req.duration_s)
    except llm.PlanError as e:
        raise HTTPException(502, str(e))


@app.post("/generate")
def generate_endpoint(req: GenerateRequest):
    if req.mode == "sequence":
        if not req.segments:
            raise HTTPException(422, "sequence mode needs `segments` — a non-empty timeline")
    elif not req.shots:
        raise HTTPException(422, "shots must contain at least one shot")
    job_id = _new_job("generate", req.name)

    def run() -> None:
        def on_progress(status: str, pct: int, detail: str) -> None:
            _update(job_id, status=status, progress=pct, detail=detail)
        try:
            final = pipeline.generate(req.model_dump(), name=req.name or job_id,
                                      on_progress=on_progress)
            if req.postprocess:
                _update(job_id, status="post", progress=95,
                        detail="CodeFormer -> SeedVR2 -> RIFE")
                if req.mode == "sequence":
                    # Face restore only makes sense when the timeline has faces.
                    restore = any(s.pipeline == "lipsync" for s in (req.segments or []))
                else:
                    restore = req.mode != "product"
                final = postprocess.postprocess_video(
                    final,
                    restore_face=restore,
                    resolution=2 * min(req.width or 640, req.height or 640),
                )
            _update(job_id, status="done", progress=100, detail="", video_path=final)
        except Exception as e:  # surface the real cause to the poller
            _update(job_id, status="error", error=f"{type(e).__name__}: {e}")

    threading.Thread(target=run, daemon=True).start()
    return {"job_id": job_id}


class PostprocessRequest(BaseModel):
    video_path: str                      # local path of an existing generated video
    restore_face: bool = True            # False for product/no-face clips
    resolution: int = Field(default=864, ge=480, le=2160)   # SeedVR2 target short-side
    source_fps: float = 16.0
    multiplier: int = Field(default=2, ge=2, le=4)          # RIFE factor
    fidelity: float = Field(default=0.6, ge=0.0, le=1.0)    # CodeFormer 0.5-0.7 per docs


@app.post("/postprocess")
def postprocess_endpoint(req: PostprocessRequest):
    job_id = _new_job("postprocess", Path(req.video_path).stem)

    def run() -> None:
        try:
            _update(job_id, status="postprocess", progress=10,
                    detail="CodeFormer -> SeedVR2 -> RIFE")
            out = postprocess.postprocess_video(
                req.video_path, restore_face=req.restore_face,
                resolution=req.resolution, source_fps=req.source_fps,
                multiplier=req.multiplier, fidelity=req.fidelity,
            )
            _update(job_id, status="done", progress=100, detail="", video_path=out)
        except Exception as e:
            _update(job_id, status="error", error=f"{type(e).__name__}: {e}")

    threading.Thread(target=run, daemon=True).start()
    return {"job_id": job_id}


@app.get("/jobs/{job_id}")
def job_status(job_id: str):
    job = JOBS.get(job_id)
    if job is None:
        raise HTTPException(404, f"unknown job_id {job_id}")
    # Renders ahead of this one on the pod(s): pod-bound jobs created earlier and
    # still running. The UI shows "N ahead" — matters more once pods multiply.
    ahead = 0
    if job.get("kind") in POD_KINDS and job["status"] not in TERMINAL_STATES:
        ahead = sum(
            1 for j in JOBS.values()
            if j is not job and j.get("kind") in POD_KINDS
            and j["status"] not in TERMINAL_STATES
            and j.get("created", 0) < job.get("created", 0)
        )
    return {**job, "queue_position": ahead}


@app.get("/queue")
def queue_state():
    """Every non-terminal job, oldest first — the Create page's queue strip."""
    active = sorted(
        (
            {"job_id": jid, "kind": j.get("kind"), "name": j.get("name"),
             "status": j["status"], "progress": j["progress"], "detail": j["detail"]}
            for jid, j in JOBS.items() if j["status"] not in TERMINAL_STATES
        ),
        key=lambda a: JOBS[a["job_id"]].get("created", 0),
    )
    return {"active": active,
            "pod_jobs": sum(1 for a in active if a["kind"] in POD_KINDS)}


@app.get("/jobs/{job_id}/video")
def job_video(job_id: str):
    job = JOBS.get(job_id)
    if job is None:
        raise HTTPException(404, f"unknown job_id {job_id}")
    if job["status"] != "done" or not job["video_path"]:
        raise HTTPException(409, f"job is '{job['status']}', video not ready")
    return FileResponse(job["video_path"], media_type="video/mp4",
                        filename=f"adgen_{job_id}.mp4")


@app.post("/jobs/{job_id}/cancel")
def job_cancel(job_id: str):
    """Interrupt whatever the pod is currently rendering and mark the job cancelled.

    ComfyUI's /interrupt stops the RUNNING prompt — with our sequential single-pod usage
    that is this job's work. The job thread will surface an error/cancelled state.
    """
    job = JOBS.get(job_id)
    if job is None:
        raise HTTPException(404, f"unknown job_id {job_id}")
    if job["status"] in ("done", "error", "cancelled"):
        raise HTTPException(409, f"job already '{job['status']}'")
    # Only pod-bound jobs have anything to interrupt on the pod. Local jobs
    # (revoice/reassemble) are just marked cancelled — _update() keeps their
    # worker threads from resurrecting them.
    if job.get("kind") in POD_KINDS and COMFY_POD_URLS:
        try:
            httpx.post(f"{COMFY_POD_URLS[0].rstrip('/')}/interrupt", timeout=30)
        except httpx.HTTPError as e:
            raise HTTPException(502, f"could not reach pod to interrupt: {e}")
    job.update(status="cancelled", detail="interrupted by user")
    return {"ok": True, "status": "cancelled"}


class RevoiceRequest(BaseModel):
    """Edit the voice of a video already in the Library: NEW narration replaces the
    ENTIRE soundtrack (+ optional ducked music bed). Avatar (wans2v) videos are
    blocked — their lips are synced to the original voice; re-render instead."""
    video_path: str
    script: str = Field(min_length=3)
    voice_id: str | None = None
    language: str = "en"
    music: str | None = None


@app.post("/revoice")
def revoice_endpoint(req: RevoiceRequest):
    src = Path(req.video_path)
    if not src.exists():
        raise HTTPException(404, f"video not found: {req.video_path}")
    if "outputs" not in src.parts:
        raise HTTPException(422, "only videos under outputs/ can be revoiced")
    if _voice_locked(src):
        raise HTTPException(
            422,
            "This video's speech is lip-synced to its original voice — "
            "re-render with the new voice instead.",
        )
    if req.music and not Path(req.music).exists():
        raise HTTPException(404, f"music file not found: {req.music}")
    job_id = _new_job("revoice", src.stem)

    def run() -> None:
        try:
            _update(job_id, status="tts", progress=15, detail="synthesizing new narration")
            audio_dir = Path("outputs/revoice")
            audio_dir.mkdir(parents=True, exist_ok=True)
            narration = synthesize_voice(
                req.script, voice_id=req.voice_id, language=req.language,
                output_path=str(audio_dir / f"{src.stem}-revoice-{job_id}.mp3"),
            )
            _update(job_id, status="assembling", progress=60, detail="replacing soundtrack")
            out = src.with_name(f"{src.stem}-revoiced.mp4")
            k = 2
            while out.exists():
                out = src.with_name(f"{src.stem}-revoiced{k}.mp4")
                k += 1
            final = ffmpeg.replace_audio(str(src), narration, music=req.music, out=str(out))
            _update(job_id, status="done", progress=100, detail="", video_path=final)
        except Exception as e:
            _update(job_id, status="error", error=f"{type(e).__name__}: {e}")

    threading.Thread(target=run, daemon=True).start()
    return {"job_id": job_id}


class ReassembleRequest(BaseModel):
    """Scene-adjust re-export (file 15): re-join picked clips in a chosen order, with
    optional new narration (voice/volume/offset) and music bed."""
    clips: list[str] = Field(min_length=1)
    script: str | None = None
    voice_id: str | None = None
    language: str = "en"
    music: str | None = None
    narration_delay_ms: int = Field(default=300, ge=0, le=5000)
    narration_gain: float = Field(default=1.0, ge=0.2, le=3.0)
    music_gain: float = Field(default=0.15, ge=0.0, le=1.0)
    name: str | None = Field(default=None, pattern=r"^[a-zA-Z0-9._-]+$")


@app.post("/reassemble")
def reassemble_endpoint(req: ReassembleRequest):
    for c in req.clips:
        if not Path(c).exists():
            raise HTTPException(404, f"clip not found: {c}")
    if req.music and not Path(req.music).exists():
        raise HTTPException(404, f"music file not found: {req.music}")
    has_locked_clip = any(_voice_locked(Path(c)) for c in req.clips)
    if req.script and has_locked_clip:
        raise HTTPException(
            422,
            "This cut contains lip-synced avatar scenes — a new narration would "
            "desync their mouths. Remove those scenes or drop the narration.",
        )
    job_id = _new_job("reassemble", req.name)

    def run() -> None:
        try:
            out_dir = Path("outputs/remix/video")
            audio_dir = Path("outputs/remix/audio")
            out_dir.mkdir(parents=True, exist_ok=True)
            audio_dir.mkdir(parents=True, exist_ok=True)
            base = req.name or f"remix-{job_id}"
            _update(job_id, status="assembling", progress=20, detail="joining scenes")
            joined = ffmpeg.concat_reencode(req.clips, out=str(out_dir / f"{base}-joined.mp4"))
            final_path = str(out_dir / f"{base}-final.mp4")
            if req.script:
                _update(job_id, status="tts", progress=55, detail="synthesizing narration")
                narration = synthesize_voice(
                    req.script, voice_id=req.voice_id, language=req.language,
                    output_path=str(audio_dir / f"{base}-narration.mp3"),
                )
                _update(job_id, status="assembling", progress=80, detail="narration overlay")
                final = ffmpeg.replace_audio(
                    joined, narration, music=req.music, out=final_path,
                    narration_delay_ms=req.narration_delay_ms,
                    narration_gain=req.narration_gain, music_gain=req.music_gain,
                )
                Path(joined).unlink(missing_ok=True)
            elif req.music:
                _update(job_id, status="assembling", progress=70, detail="music bed")
                final = ffmpeg.stitch_plus_music([joined], music=req.music, out=final_path)
                Path(joined).unlink(missing_ok=True)
            else:
                Path(joined).rename(final_path)
                final = final_path
            if has_locked_clip:
                # The cut keeps its avatar scenes' baked-in speech — lock it too.
                Path(final).with_suffix(".meta.json").write_text(
                    json.dumps({"voice_lock": True})
                )
            _update(job_id, status="done", progress=100, detail="", video_path=final)
        except Exception as e:
            _update(job_id, status="error", error=f"{type(e).__name__}: {e}")

    threading.Thread(target=run, daemon=True).start()
    return {"job_id": job_id}


ALLOWED_UPLOAD_EXT = {".png", ".jpg", ".jpeg", ".webp", ".mp3", ".wav"}


@app.post("/assets")
async def upload_asset(file: UploadFile = File(...)):
    """Receive a browser upload (avatar face / product photo / audio bed).

    Returns the server-side path to use as avatar_image / product_image / music in
    /generate, plus a URL the browser can preview it from.
    """
    ext = Path(file.filename or "upload").suffix.lower()
    if ext not in ALLOWED_UPLOAD_EXT:
        raise HTTPException(415, f"unsupported file type '{ext}' — allowed: {sorted(ALLOWED_UPLOAD_EXT)}")
    safe_stem = "".join(c for c in Path(file.filename).stem if c.isalnum() or c in "-_")[:40] or "asset"
    dest = Path("assets/uploads") / f"{safe_stem}-{uuid.uuid4().hex[:8]}{ext}"
    dest.write_bytes(await file.read())
    return {"path": str(dest), "url": f"/assets-files/uploads/{dest.name}"}


@app.get("/outputs")
def list_outputs():
    """List every generated video for the Library grid (newest first)."""
    items = []
    for p in Path("outputs").rglob("*.mp4"):
        rel = p.relative_to("outputs")
        parts = rel.parts
        items.append({
            "path": str(p),
            "url": f"/files/{rel.as_posix()}",
            "name": p.name,
            "pipeline": parts[0] if len(parts) > 2 else "want2v",
            "kind": ("final-post" if p.stem.endswith("-post")
                     else "final" if "final" in p.stem
                     else "clip"),
            "voice_lock": _voice_locked(p),
            "size_bytes": p.stat().st_size,
            "modified": int(p.stat().st_mtime),
        })
    items.sort(key=lambda i: i["modified"], reverse=True)
    return {"outputs": items}


@app.get("/voices")
def list_voices():
    """Proxy the ElevenLabs voice list for the UI's voice picker (key stays server-side)."""
    if not ELEVENLABS_API_KEY:
        raise HTTPException(502, "ELEVENLABS_API_KEY not configured")
    r = httpx.get("https://api.elevenlabs.io/v2/voices?page_size=100",
                  headers={"xi-api-key": ELEVENLABS_API_KEY}, timeout=30)
    if r.status_code != 200:
        raise HTTPException(502, f"ElevenLabs voices failed: {r.text[:300]}")
    voices = [{
        "voice_id": v["voice_id"],
        "name": v["name"],
        "category": v.get("category"),
        "labels": v.get("labels") or {},
    } for v in r.json().get("voices", [])]
    return {"voices": voices}


class VoicePreviewRequest(BaseModel):
    voice_id: str
    text: str = "Your ad, your voice — this is how I sound."
    language: str = "en"


@app.post("/voice-preview")
def voice_preview(req: VoicePreviewRequest):
    """Generate a short TTS sample for the voice picker's preview button."""
    out = Path("outputs/voice-previews")
    out.mkdir(parents=True, exist_ok=True)
    dest = out / f"{req.voice_id}.mp3"
    if not dest.exists() or dest.stat().st_mtime < time.time() - 86400:
        try:
            synthesize_voice(req.text[:120], voice_id=req.voice_id,
                             language=req.language, output_path=str(dest))
        except Exception as e:
            raise HTTPException(502, f"preview failed: {e}")
    return FileResponse(str(dest), media_type="audio/mpeg")
