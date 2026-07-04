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

OUTPUTS_ROOT = Path("outputs").resolve()


def _under_outputs(p: Path) -> bool:
    """Resolved containment check — 'outputs/../anything' and absolute paths that merely
    CONTAIN an outputs component must not pass (they used to)."""
    try:
        return p.resolve().is_relative_to(OUTPUTS_ROOT)
    except OSError:
        return False


class JobCancelled(RuntimeError):
    """Raised inside a worker thread when its job was cancelled — aborts remaining stages."""


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
    # Titles the user rejected (Regenerate button) — the new batch avoids them.
    avoid: list[str] = Field(default_factory=list, max_length=12)


@app.post("/plan")
def plan_endpoint(req: PlanRequest):
    try:
        return llm.plan(req.idea, language=req.language, ad_format=req.format,
                        duration_s=req.duration_s, avoid=req.avoid or None)
    except llm.PlanError as e:
        raise HTTPException(502, str(e))


@app.post("/generate")
def generate_endpoint(req: GenerateRequest):
    if req.mode == "sequence":
        if not req.segments:
            raise HTTPException(422, "sequence mode needs `segments` — a non-empty timeline")
    elif not req.shots:
        raise HTTPException(422, "shots must contain at least one shot")
    # Fail-fast asset checks at REQUEST time — a typo'd path must cost an instant 404,
    # not a full render + TTS spend that dies at the assembly step.
    for label, p in (("music", req.music), ("avatar_image", req.avatar_image),
                     ("product_image", req.product_image)):
        if p and not Path(p).exists():
            raise HTTPException(404, f"{label} file not found: {p}")
    for i, seg in enumerate(req.segments or []):
        if seg.image and not Path(seg.image).exists():
            raise HTTPException(404, f"segment {i + 1} image not found: {seg.image}")
    job_id = _new_job("generate", req.name)

    def run() -> None:
        def on_progress(status: str, pct: int, detail: str) -> None:
            # Cancelled jobs must stop BURNING pod/TTS work, not just hide their
            # updates: abort the worker at the next stage/clip boundary.
            if JOBS.get(job_id, {}).get("status") == "cancelled":
                raise JobCancelled()
            _update(job_id, status=status, progress=pct, detail=detail)

        def on_submit(prompt_id: str) -> None:
            # Raw write (not _update): the cancel path needs the prompt_id even
            # after cancellation to clear it from the pod queue.
            if job_id in JOBS:
                JOBS[job_id]["prompt_id"] = prompt_id

        try:
            final = pipeline.generate(req.model_dump(), name=req.name or job_id,
                                      on_progress=on_progress, on_submit=on_submit)
            if req.postprocess:
                on_progress("post", 95, "CodeFormer -> SeedVR2 -> RIFE")
                if req.mode == "sequence":
                    # Face restore only makes sense when the timeline has faces.
                    restore = any(s.pipeline == "lipsync" for s in (req.segments or []))
                else:
                    restore = req.mode != "product"
                final = postprocess.postprocess_video(
                    final,
                    restore_face=restore,
                    resolution=2 * min(req.width or 640, req.height or 640),
                    # LTX renders 25fps (RIFE 2x -> 50); Wan-era clips are 16 -> 32.
                    # Getting this wrong retimes the output into slow motion.
                    source_fps=25.0 if req.mode == "cinematic" else 16.0,
                    on_submit=on_submit,
                )
            _update(job_id, status="done", progress=100, detail="", video_path=final)
        except JobCancelled:
            pass  # job already shows 'cancelled'; nothing to report
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
    src = Path(req.video_path)
    if not src.exists():
        raise HTTPException(404, f"video not found: {req.video_path}")
    if not _under_outputs(src):
        raise HTTPException(422, "only videos under outputs/ can be post-processed")
    job_id = _new_job("postprocess", src.stem)

    def run() -> None:
        def on_submit(prompt_id: str) -> None:
            if job_id in JOBS:
                JOBS[job_id]["prompt_id"] = prompt_id
        try:
            _update(job_id, status="postprocess", progress=10,
                    detail="CodeFormer -> SeedVR2 -> RIFE")
            out = postprocess.postprocess_video(
                req.video_path, restore_face=req.restore_face,
                resolution=req.resolution, source_fps=req.source_fps,
                multiplier=req.multiplier, fidelity=req.fidelity,
                on_submit=on_submit,
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
    """Cancel a job, stopping exactly ITS pod work — never someone else's.

    ComfyUI's /interrupt kills whichever prompt is RUNNING, so blindly interrupting
    used to murder job A when a user cancelled queued job B. Now: interrupt only if
    THIS job's prompt is the running one; delete it from the pod queue if pending;
    otherwise just flag cancelled — the worker thread aborts at its next checkpoint.
    """
    job = JOBS.get(job_id)
    if job is None:
        raise HTTPException(404, f"unknown job_id {job_id}")
    if job["status"] in ("done", "error", "cancelled"):
        raise HTTPException(409, f"job already '{job['status']}'")
    # Mark cancelled FIRST: the worker's progress checkpoints see it immediately,
    # and _update() keeps the thread from resurrecting the job.
    job.update(status="cancelled", detail="interrupted by user")
    if job.get("kind") in POD_KINDS and COMFY_POD_URLS:
        pod = COMFY_POD_URLS[0].rstrip("/")
        pid = job.get("prompt_id")
        try:
            if pid:
                q = httpx.get(f"{pod}/queue", timeout=15).json()
                running = {e[1] for e in q.get("queue_running", [])}
                pending = {e[1] for e in q.get("queue_pending", [])}
                if pid in running:
                    httpx.post(f"{pod}/interrupt", timeout=30)
                elif pid in pending:
                    httpx.post(f"{pod}/queue", json={"delete": [pid]}, timeout=15)
                # else: between clips — nothing on the pod right now; the worker
                # thread stops at its next progress checkpoint.
        except httpx.HTTPError:
            # Job is already flagged cancelled locally; pod-side prompt may finish
            # its current clip but the worker discards it at the next checkpoint.
            job.update(detail="cancelled (pod unreachable — current clip may finish)")
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
    if not _under_outputs(src):
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
            final = ffmpeg.replace_audio(str(src), narration, music=req.music, out=str(out),
                                         on_warning=lambda w: _update(job_id, detail=w))
            _update(job_id, status="done", progress=100, video_path=final)
        except Exception as e:
            _update(job_id, status="error", error=f"{type(e).__name__}: {e}")

    threading.Thread(target=run, daemon=True).start()
    return {"job_id": job_id}


class FitRequest(BaseModel):
    """User-facing timing fix: trim a video so it ends right after its audio does
    (auto) or at an exact second (manual). Fixes the dead-silent-tail slop on
    existing videos; new renders auto-fit at assembly time."""
    video_path: str
    mode: Literal["auto", "manual"] = "auto"
    tail_s: float = Field(default=0.45, ge=0.0, le=2.0)   # beat kept after the voice ends
    end_s: float | None = Field(default=None, gt=0.5)     # manual cut point


@app.post("/fit")
def fit_endpoint(req: FitRequest):
    src = Path(req.video_path)
    if not src.exists():
        raise HTTPException(404, f"video not found: {req.video_path}")
    if not _under_outputs(src):
        raise HTTPException(422, "only videos under outputs/ can be trimmed")
    duration = ffmpeg.probe(str(src))["duration"]
    if req.mode == "manual":
        if req.end_s is None:
            raise HTTPException(422, "manual mode needs `end_s`")
        if req.end_s >= duration:
            raise HTTPException(422, f"end_s must be under the video's {duration:.2f}s")
    job_id = _new_job("fit", src.stem)

    def run() -> None:
        try:
            _update(job_id, status="assembling", progress=30, detail="finding the cut point")
            if req.mode == "manual":
                end = float(req.end_s or duration)
            else:
                end = min(duration, ffmpeg.detect_audio_end(str(src)) + req.tail_s)
            if end < 1.0:  # fully-silent track: refuse to produce a sub-second stub
                _update(job_id, status="done", progress=100,
                        detail="audio looks silent throughout — nothing sensible to trim to",
                        video_path=str(src))
                return
            if end >= duration - 0.05:
                _update(job_id, status="done", progress=100,
                        detail="no dead tail found — video already ends with its audio",
                        video_path=str(src))
                return
            out = src.with_name(f"{src.stem}-fit.mp4")
            k = 2
            while out.exists():
                out = src.with_name(f"{src.stem}-fit{k}.mp4")
                k += 1
            _update(job_id, status="assembling", progress=70, detail=f"trimming to {end:.2f}s")
            final = ffmpeg.trim_end(str(src), end, str(out))
            sidecar = src.with_suffix(".meta.json")
            if sidecar.exists():  # a trimmed avatar/sequence stays voice-locked
                Path(final).with_suffix(".meta.json").write_text(sidecar.read_text())
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
        cp = Path(c)
        if not cp.exists():
            raise HTTPException(404, f"clip not found: {c}")
        if not _under_outputs(cp):
            raise HTTPException(422, f"only clips under outputs/ can be remixed: {c}")
    if req.music:
        mp = Path(req.music)
        if not mp.exists():
            raise HTTPException(404, f"music file not found: {req.music}")
        if not (_under_outputs(mp) or mp.resolve().is_relative_to(Path("assets").resolve())):
            raise HTTPException(422, "music must live under outputs/ or assets/")
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
        # Assembly intermediates are transient (and deleted mid-flight) — never list them.
        if p.stem.endswith(".stitched") or p.stem.endswith("-joined"):
            continue
        try:
            st = p.stat()
        except OSError:
            continue  # a running job deleted it between rglob and stat — skip, don't 500
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
            "size_bytes": st.st_size,
            "modified": int(st.st_mtime),
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
