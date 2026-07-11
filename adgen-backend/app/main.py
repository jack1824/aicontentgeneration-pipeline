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
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app import avatars, characters, keyframes, pipeline, postprocess
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
                    "video_path": None, "error": None, "warnings": [],
                    "kind": kind, "name": name, "created": time.time()}
    return job_id


def _update(job_id: str, **fields) -> None:
    """Job update that NEVER overwrites a user cancellation — worker threads keep
    running after cancel and must not resurrect the job as running/done."""
    job = JOBS.get(job_id)
    if job and job["status"] != "cancelled":
        job.update(**fields)


def _warn(job_id: str, msg: str) -> None:
    """Append to the job's warnings list — unlike `detail`, warnings accumulate,
    so a later progress update can't silently erase a 'this cut has a problem'."""
    job = JOBS.get(job_id)
    if job and job["status"] != "cancelled":
        job.setdefault("warnings", []).append(msg)


def _attach_sync(job_id: str, video_path: str, ok_tail_s: float = 1.0) -> None:
    """Post-assembly ground truth: silence-analyze the final and flag anything a
    client would hear as 'no voice' (mid-video gaps, long silent tails). Stores
    the full report on the job as `sync`. Analysis must never fail the render.
    ok_tail_s: tail silence that's by design (an end card's read time) isn't flagged."""
    try:
        rep = ffmpeg.sync_report(video_path)
    except Exception:
        return
    job = JOBS.get(job_id)
    if job is not None:
        job["sync"] = rep
    if rep.get("silent"):
        _warn(job_id, "no audible audio anywhere in the final")
        return
    for g in rep.get("gaps", []):
        _warn(job_id, f"silent gap {g['start']}–{g['end']}s ({g['len']}s)")
    if rep.get("tail", 0) > ok_tail_s:
        _warn(job_id, f"video runs {rep['tail']}s past the last sound — Library → ✂ Fix timing")


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


class DuoTurn(BaseModel):
    """One line of a multi-stream duo conversation (speaker 0 = LEFT seat)."""
    speaker: Literal[0, 1]
    text: str = Field(min_length=1, max_length=300)


class Segment(BaseModel):
    """One timeline entry of a sequence job (file 15's 60s mixed-pipeline ad)."""
    pipeline: Literal["overlay", "lipsync", "product", "cinematic"]
    prompt: str
    negative_prompt: str | None = None
    script: str | None = None            # this segment's script slice (lipsync: required)
    image: str | None = None             # product photo / reference face for this segment
                                         # (cinematic + image = brand-locked b-roll:
                                         #  the real product appears IN the scene)
    image_description: str | None = None  # cinematic+image: what the photo shows
    voice_id: str | None = None          # per-segment voice (dialogue ads: A vs B);
                                         # falls back to the job-level voice_id
    avatar_id: str | None = None         # saved avatar profile — fills image + voice_id


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
    avatar_id: str | None = None         # saved avatar profile (Phase 3) — resolves to
                                         # avatar_image + voice_id unless overridden
    character_ids: list[str] | None = None  # saved cast — anchors injected into every
                                            # shot prompt; face/sheet/voice fill gaps
    sheet_image: str | None = None       # ingredients: reference sheet image path
    sheet_description: str | None = None  # ingredients: what the sheet's panels contain
    duo_turns: list[DuoTurn] | None = None  # duo: the conversation, alternating speakers
    duo_voices: list[str] | None = None     # duo: [voice for speaker 0, voice for speaker 1]
    source_video: str | None = None         # redub: existing render whose lips to re-render
    postprocess: bool = False            # True = run the post chain after assembly (one-call
                                         # Enhanced/Master presets; adds a "post" stage)
    qc: bool | None = None               # shot QC gate (vision review + auto re-roll).
                                         # None = ON for every render incl. FAST (user rule:
                                         # fast must not degrade); false is the only off-switch
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
    # Saved cast: the plan must reuse these characters' anchors VERBATIM.
    cast_ids: list[str] = Field(default_factory=list, max_length=4)


class PlanQuestionsRequest(BaseModel):
    idea: str = Field(min_length=2)
    language: str = "en"


@app.post("/plan-questions")
def plan_questions_endpoint(req: PlanQuestionsRequest):
    """Dynamic intake: the brain asks idea-specific follow-ups (replaces the
    hardcoded audience/vibe questions). Rides the full LLM ladder incl. Groq."""
    try:
        return llm.plan_questions(req.idea, language=req.language)
    except llm.PlanError as e:
        raise HTTPException(502, str(e))


@app.post("/plan")
def plan_endpoint(req: PlanRequest):
    cast = []
    for cid in req.cast_ids:
        ch = characters.get_character(cid)
        if ch is None:
            raise HTTPException(404, f"unknown character_id {cid}")
        cast.append({"name": ch["name"], "anchor": ch["anchor"]})
    try:
        return llm.plan(req.idea, language=req.language, ad_format=req.format,
                        duration_s=req.duration_s, avoid=req.avoid or None,
                        cast=cast or None)
    except llm.PlanError as e:
        raise HTTPException(502, str(e))


class DialoguePlanRequest(BaseModel):
    idea: str = Field(min_length=3)
    language: str = "en"
    turns: int = Field(default=2, ge=2, le=6)
    regenerate: bool = False  # true = "fresh take" re-roll, runs hotter


@app.post("/plan-dialogue")
def plan_dialogue_endpoint(req: DialoguePlanRequest):
    """The Dialogue page's brain: idea -> two speakers + alternating turns."""
    try:
        return llm.plan_dialogue(req.idea, language=req.language,
                                 turns=req.turns, regenerate=req.regenerate)
    except llm.PlanError as e:
        raise HTTPException(502, str(e))


@app.post("/generate")
def generate_endpoint(req: GenerateRequest):
    if req.mode == "sequence":
        if not req.segments:
            raise HTTPException(422, "sequence mode needs `segments` — a non-empty timeline")
    elif not req.shots:
        raise HTTPException(422, "shots must contain at least one shot")
    if req.mode == "redub":
        if not req.source_video:
            raise HTTPException(422, "redub needs `source_video` — pick a Library video")
        sv = Path(req.source_video)
        if not sv.exists():
            raise HTTPException(404, f"source_video not found: {req.source_video}")
        if not _under_outputs(sv):
            raise HTTPException(422, "only videos under outputs/ can be re-dubbed")
        if not req.script:
            raise HTTPException(422, "redub needs `script` — the new spoken line(s)")
    if req.mode == "duo":
        if not req.duo_turns or len(req.duo_turns) < 2:
            raise HTTPException(422, "duo needs `duo_turns` — at least 2 conversation turns")
        if not req.duo_voices or len(req.duo_voices) != 2:
            raise HTTPException(422, "duo needs `duo_voices` — exactly one voice per speaker")
        if req.duo_voices[0] == req.duo_voices[1]:
            raise HTTPException(422, "duo speakers need two DIFFERENT voices")
        if not req.avatar_image:
            raise HTTPException(422, "duo needs `avatar_image` — the staged two-person "
                                     "still (speaker 1 LEFT, speaker 2 RIGHT)")
    # Phase 3: a saved avatar profile supplies the locked face + its voice.
    # Explicit per-request values win; the profile only fills the gaps (file 09:
    # the models have no memory — the stored reference_image IS the consistency).
    if req.avatar_id:
        prof = avatars.get_profile(req.avatar_id)
        if prof is None:
            raise HTTPException(404, f"unknown avatar_id {req.avatar_id}")
        req.avatar_image = req.avatar_image or prof["reference_image"]
        req.voice_id = req.voice_id or prof["voice_id"]
    for i, seg in enumerate(req.segments or []):
        if seg.avatar_id:
            prof = avatars.get_profile(seg.avatar_id)
            if prof is None:
                raise HTTPException(404, f"segment {i + 1}: unknown avatar_id {seg.avatar_id}")
            seg.image = seg.image or prof["reference_image"]
            seg.voice_id = seg.voice_id or prof["voice_id"]
    # Cast: saved characters carry the consistency. Their anchors are injected
    # into every shot prompt by the pipeline (verbatim repetition IS the same
    # actor across cuts); face/sheet/voice only fill gaps, explicit values win.
    cast_anchors: list[str] = []
    for cid in req.character_ids or []:
        ch = characters.get_character(cid)
        if ch is None:
            raise HTTPException(404, f"unknown character_id {cid}")
        cast_anchors.append(ch["anchor"])
        if ch["face_image"] and not req.avatar_image:
            req.avatar_image = ch["face_image"]
        if ch["voice_id"] and not req.voice_id:
            req.voice_id = ch["voice_id"]
        if req.mode == "ingredients" and ch["sheet_image"] and not req.sheet_image:
            req.sheet_image = ch["sheet_image"]
            req.sheet_description = req.sheet_description or ch["anchor"]
    # Fail-fast asset checks at REQUEST time — a typo'd path must cost an instant 404,
    # not a full render + TTS spend that dies at the assembly step.
    for label, p in (("music", req.music), ("avatar_image", req.avatar_image),
                     ("product_image", req.product_image), ("sheet_image", req.sheet_image)):
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
            # ⚠-prefixed details are actionable warnings — persist them in the
            # accumulating list so later progress updates can't erase them.
            if detail.startswith("⚠"):
                _warn(job_id, detail.lstrip("⚠ "))
            _update(job_id, status=status, progress=pct, detail=detail)

        def on_submit(prompt_id: str) -> None:
            # Raw write (not _update): the cancel path needs the prompt_id even
            # after cancellation to clear it from the pod queue.
            if job_id in JOBS:
                JOBS[job_id]["prompt_id"] = prompt_id

        try:
            payload = req.model_dump()
            payload["cast_anchors"] = cast_anchors
            final = pipeline.generate(payload, name=req.name or job_id,
                                      on_progress=on_progress, on_submit=on_submit)
            if req.postprocess:
                on_progress("post", 95, "CodeFormer -> SeedVR2 -> RIFE")
                if req.mode == "sequence":
                    # Face restore only makes sense when the timeline has faces.
                    restore = any(s.pipeline == "lipsync" for s in (req.segments or []))
                else:
                    restore = req.mode != "product"
                # RIFE's output fps MUST come from the file itself: the old
                # mode-based guess retimed a 25fps LTX final assumed to be 16fps
                # into 1.56x slow motion (ltx-master postmortem, 2026-07-09 audit).
                pre_info = ffmpeg.probe(final)
                src_fps = pre_info["fps"] if pre_info["fps"] > 1 else (
                    25.0 if req.mode in ("cinematic", "ingredients") else 16.0)
                pre_post = final
                final = postprocess.postprocess_video(
                    final,
                    restore_face=restore,
                    resolution=min(1088, 2 * min(req.width or 640, req.height or 640)),
                    source_fps=src_fps,
                    on_submit=on_submit,
                )
                # Belt-and-braces: the chain must never change wall-clock length.
                # If it did, ship the un-posted final instead of a slow-mo file —
                # and delete the rejected -post file so the Library never lists it.
                post_dur = ffmpeg.probe(final)["duration"]
                if abs(post_dur - pre_info["duration"]) > 0.3:
                    _warn(job_id, f"post chain changed duration "
                          f"{pre_info['duration']:.2f}s -> {post_dur:.2f}s — "
                          f"kept the un-enhanced final")
                    Path(final).unlink(missing_ok=True)
                    Path(final).with_suffix(".meta.json").unlink(missing_ok=True)
                    final = pre_post
            _attach_sync(job_id, final)
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
    # None = derive from the video itself. A hardcoded 16fps default retimed
    # 25fps LTX renders into 1.56x slow motion with drifting audio.
    resolution: int | None = Field(default=None, ge=480, le=2160)  # SeedVR2 short-side
    source_fps: float | None = None
    multiplier: int = Field(default=2, ge=2, le=4)          # RIFE factor
    fidelity: float = Field(default=0.6, ge=0.0, le=1.0)    # CodeFormer 0.5-0.7 per docs


@app.post("/postprocess")
def postprocess_endpoint(req: PostprocessRequest):
    src = Path(req.video_path)
    if not src.exists():
        raise HTTPException(404, f"video not found: {req.video_path}")
    if not _under_outputs(src):
        raise HTTPException(422, "only videos under outputs/ can be post-processed")
    # Derive fps/target-size from the actual file — the Library can't know them.
    info = ffmpeg.probe(str(src))
    source_fps = req.source_fps or (info["fps"] if info["fps"] > 1 else 16.0)
    # 2x the short side, hard-capped: SeedVR2 at 1408+ on verticals OOM-kills
    # the pod even in 10s chunks (the sa01 polish crash) — 1088 is the safe roof.
    resolution = req.resolution or max(
        480, min(1088, 2 * min(info["width"] or 432, info["height"] or 432))
    )
    job_id = _new_job("postprocess", src.stem)

    def run() -> None:
        def on_submit(prompt_id: str) -> None:
            if job_id in JOBS:
                JOBS[job_id]["prompt_id"] = prompt_id
        try:
            _update(job_id, status="postprocess", progress=10,
                    detail="CodeFormer -> SeedVR2 -> RIFE")
            pre_dur = ffmpeg.probe(req.video_path)["duration"]
            out = postprocess.postprocess_video(
                req.video_path, restore_face=req.restore_face,
                resolution=resolution, source_fps=source_fps,
                multiplier=req.multiplier, fidelity=req.fidelity,
                on_submit=on_submit,
            )
            # Same belt-and-braces as /generate: a duration change means the fps
            # math went wrong (slow-mo) — never hand back a retimed file.
            post_dur = ffmpeg.probe(out)["duration"]
            if abs(post_dur - pre_dur) > 0.3:
                Path(out).unlink(missing_ok=True)
                Path(out).with_suffix(".meta.json").unlink(missing_ok=True)
                raise RuntimeError(
                    f"post chain changed duration {pre_dur:.2f}s -> {post_dur:.2f}s "
                    f"(bad source_fps?) — discarded the retimed output")
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
                                         on_warning=lambda w: _warn(job_id, w))
            _attach_sync(job_id, final)
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


class EndCardRequest(BaseModel):
    """Append a branded end card — the one place on-screen text belongs (video
    models garble rendered text, so shot prompts ban it)."""
    video_path: str
    brand: str = Field(min_length=1, max_length=48)
    tagline: str | None = Field(default=None, max_length=80)
    offer: str | None = Field(default=None, max_length=60)
    seconds: float = Field(default=2.5, ge=1.0, le=5.0)


@app.post("/endcard")
def endcard_endpoint(req: EndCardRequest):
    src = Path(req.video_path)
    if not src.exists():
        raise HTTPException(404, f"video not found: {req.video_path}")
    if not _under_outputs(src):
        raise HTTPException(422, "only videos under outputs/ can get an end card")
    job_id = _new_job("endcard", src.stem)

    def run() -> None:
        try:
            _update(job_id, status="assembling", progress=40, detail="rendering end card")
            out = src.with_name(f"{src.stem}-card.mp4")
            k = 2
            while out.exists():
                out = src.with_name(f"{src.stem}-card{k}.mp4")
                k += 1
            final = ffmpeg.end_card(
                str(src), req.brand, tagline=req.tagline, offer=req.offer,
                seconds=req.seconds, out=str(out),
            )
            sidecar = src.with_suffix(".meta.json")
            if sidecar.exists():  # a carded avatar stays voice-locked
                Path(final).with_suffix(".meta.json").write_text(sidecar.read_text())
            # The card's silent read-time is by design — don't flag it as dead air.
            _attach_sync(job_id, final, ok_tail_s=req.seconds + 1.0)
            _update(job_id, status="done", progress=100, detail="", video_path=final)
        except Exception as e:
            _update(job_id, status="error", error=f"{type(e).__name__}: {e}")

    threading.Thread(target=run, daemon=True).start()
    return {"job_id": job_id}


class Caption(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    text: str = Field(min_length=1, max_length=120)
    position: Literal["top", "bottom", "center"] = "bottom"
    accent: bool = False


class BrandPassRequest(BaseModel):
    """The composited brand layer (ad-agent panel, 2026-07-11): burned captions/
    supers for the muted majority + an end card carrying the REAL product photo.
    All overlay pixels, zero regeneration — the 'generated motion + composited
    brand' architecture. Local FFmpeg only, no pod."""
    video_path: str
    captions: list[Caption] = Field(default_factory=list, max_length=12)
    brand: str | None = None             # end card brand line; None = no end card
    tagline: str | None = None
    offer: str | None = None             # CTA line (accent color)
    product_image: str | None = None     # REAL pack shot composited on the card
    card_seconds: float = Field(default=2.0, ge=1.0, le=5.0)


@app.post("/brand-pass")
def brand_pass_endpoint(req: BrandPassRequest):
    src = Path(req.video_path)
    if not src.exists():
        raise HTTPException(404, f"video not found: {req.video_path}")
    if not _under_outputs(src):
        raise HTTPException(422, "only videos under outputs/ can be branded")
    if req.product_image and not Path(req.product_image).exists():
        raise HTTPException(404, f"product_image not found: {req.product_image}")
    job_id = _new_job("brandpass", src.stem)

    def run() -> None:
        try:
            work = str(src)
            if req.captions:
                _update(job_id, status="assembling", progress=25, detail="burning captions")
                work = ffmpeg.burn_captions(
                    work, [c.model_dump() for c in req.captions],
                    out=str(src.with_name(f"{src.stem}-captioned.mp4")))
            final = work
            if req.brand:
                _update(job_id, status="assembling", progress=60, detail="product end card")
                final = ffmpeg.end_card(
                    work, req.brand, tagline=req.tagline, offer=req.offer,
                    seconds=req.card_seconds, product_image=req.product_image,
                    out=str(src.with_name(f"{src.stem}-branded.mp4")))
                if work != str(src):
                    Path(work).unlink(missing_ok=True)  # captioned intermediate
            sidecar = src.with_suffix(".meta.json")
            if sidecar.exists():  # voice-lock survives the overlay pass
                Path(final).with_suffix(".meta.json").write_text(sidecar.read_text())
            recipe = src.parent / (src.stem.replace("-final", "") + "-recipe.json")
            if recipe.exists():  # chips survive too
                bp = Path(final)
                (bp.parent / (bp.stem.replace("-final", "") + "-recipe.json")).write_text(
                    recipe.read_text())
            _attach_sync(job_id, final, ok_tail_s=(req.card_seconds + 1.0) if req.brand else 1.0)
            _update(job_id, status="done", progress=100, detail="", video_path=final)
        except Exception as e:
            _update(job_id, status="error", error=f"{type(e).__name__}: {e}")

    threading.Thread(target=run, daemon=True).start()
    return {"job_id": job_id}


class SyncReportRequest(BaseModel):
    """Where does the sound live in this video? Client-facing gap analysis —
    lead-in, mid-video silences, dead tail — without rendering anything."""
    video_path: str


@app.post("/sync-report")
def sync_report_endpoint(req: SyncReportRequest):
    src = Path(req.video_path)
    if not src.exists():
        raise HTTPException(404, f"video not found: {req.video_path}")
    if not _under_outputs(src):
        raise HTTPException(422, "only videos under outputs/ can be analyzed")
    return ffmpeg.sync_report(str(src))


class TimelineClip(BaseModel):
    path: str
    in_s: float = Field(default=0.0, ge=0)
    out_s: float | None = Field(default=None, gt=0)  # None = play to clip end


class TimelineNarration(BaseModel):
    path: str | None = None              # reuse an existing narration file…
    script: str | None = None            # …or synthesize fresh
    voice_id: str | None = None
    language: str = "hi"
    offset_ms: int = Field(default=0, ge=0, le=20000)
    gain: float = Field(default=1.0, ge=0.2, le=3.0)


class TimelineExportRequest(BaseModel):
    """Timeline editor export (client problem #3): trim each clip frame-
    accurately (cut_precise), join with the conform pass, lay narration/music.
    Every adjustment is FFmpeg-only — never re-renders video."""
    clips: list[TimelineClip] = Field(min_length=1, max_length=24)
    narration: TimelineNarration | None = None
    music: str | None = None
    music_gain: float = Field(default=0.15, ge=0.0, le=1.0)
    name: str | None = Field(default=None, pattern=r"^[a-zA-Z0-9._-]+$")


@app.post("/timeline/export")
def timeline_export_endpoint(req: TimelineExportRequest):
    for c in req.clips:
        cp = Path(c.path)
        if not cp.exists():
            raise HTTPException(404, f"clip not found: {c.path}")
        if not _under_outputs(cp):
            raise HTTPException(422, f"only clips under outputs/ can be edited: {c.path}")
    if req.narration and req.narration.path:
        np_ = Path(req.narration.path)
        if not np_.exists():
            raise HTTPException(404, f"narration not found: {req.narration.path}")
    if req.music and not Path(req.music).exists():
        raise HTTPException(404, f"music file not found: {req.music}")
    wants_narration = bool(req.narration and (req.narration.path or req.narration.script))
    if wants_narration and any(_voice_locked(Path(c.path)) for c in req.clips):
        raise HTTPException(
            422,
            "This timeline contains lip-synced avatar clips — a new narration "
            "would desync their mouths. Remove them or drop the narration.",
        )
    job_id = _new_job("timeline", req.name)

    def run() -> None:
        import tempfile
        try:
            out_dir = Path("outputs/remix/video")
            audio_dir = Path("outputs/remix/audio")
            out_dir.mkdir(parents=True, exist_ok=True)
            audio_dir.mkdir(parents=True, exist_ok=True)
            base = req.name or f"timeline-{job_id}"
            final_path = str(out_dir / f"{base}-final.mp4")
            with tempfile.TemporaryDirectory(dir=str(out_dir)) as tmp:
                pieces: list[str] = []
                for i, c in enumerate(req.clips):
                    dur = ffmpeg.probe(c.path)["duration"]
                    out_s = min(c.out_s, dur) if c.out_s else dur
                    if c.in_s <= 0.05 and out_s >= dur - 0.05:
                        pieces.append(c.path)  # untrimmed — use as-is
                        continue
                    _update(job_id, status="assembling", progress=5 + int(50 * i / len(req.clips)),
                            detail=f"trimming clip {i + 1}/{len(req.clips)}")
                    pieces.append(ffmpeg.cut_precise(
                        c.path, c.in_s, out_s - c.in_s, str(Path(tmp) / f"t{i}.mp4")))
                _update(job_id, status="assembling", progress=60, detail="joining timeline")
                joined = ffmpeg.concat_reencode(pieces, out=str(Path(tmp) / "joined.mp4"))

                narration_file: str | None = None
                if wants_narration and req.narration.script:
                    _update(job_id, status="tts", progress=70, detail="synthesizing narration")
                    narration_file = synthesize_voice(
                        req.narration.script, voice_id=req.narration.voice_id,
                        language=req.narration.language,
                        output_path=str(audio_dir / f"{base}-narration.mp3"))
                elif wants_narration:
                    narration_file = req.narration.path

                if narration_file:
                    _update(job_id, status="assembling", progress=85, detail="narration overlay")
                    final = ffmpeg.replace_audio(
                        joined, narration_file, music=req.music, out=final_path,
                        narration_delay_ms=req.narration.offset_ms,
                        narration_gain=req.narration.gain, music_gain=req.music_gain,
                        on_warning=lambda w: _warn(job_id, w))
                elif req.music:
                    _update(job_id, status="assembling", progress=85, detail="music bed")
                    final = ffmpeg.stitch_plus_music([joined], music=req.music, out=final_path)
                else:
                    Path(joined).replace(final_path)
                    final = final_path
            if any(_voice_locked(Path(c.path)) for c in req.clips):
                Path(final).with_suffix(".meta.json").write_text(json.dumps({"voice_lock": True}))
            _attach_sync(job_id, final)
            _update(job_id, status="done", progress=100, detail="", video_path=final)
        except Exception as e:
            _update(job_id, status="error", error=f"{type(e).__name__}: {e}")

    threading.Thread(target=run, daemon=True).start()
    return {"job_id": job_id}


@app.get("/render-assets")
def render_assets(video: str):
    """A final's editable ingredients, by name-prefix convention: its sibling
    segment/clip files (takes included — the keep-all-takes rule) and matching
    narration audio. The Timeline editor preloads from here."""
    src = Path(video)
    if not src.exists():
        raise HTTPException(404, f"video not found: {video}")
    if not _under_outputs(src):
        raise HTTPException(422, "only videos under outputs/ can be opened")
    import re as _re
    prefix = _re.sub(r"-(full-final|final|branded|post|card\d*|joined).*$", "", src.stem)
    raw: list[dict] = []
    for p in sorted(src.parent.glob(f"{prefix}-*.mp4")):
        if p == src or "-final" in p.stem or p.stem.endswith("-joined") or p.stem.endswith("-branded"):
            continue
        try:
            info = ffmpeg.probe(str(p))
        except Exception:
            continue
        raw.append({"path": str(p), "url": f"/files/{p.relative_to('outputs').as_posix()}",
                    "name": p.name, "duration": info["duration"],
                    "voice_lock": _voice_locked(p)})
    # Group QC takes as ALTERNATES of their shot (keep-all-takes rule): the
    # canonical file is what shipped; -takeN siblings are swappable in the
    # Timeline. Grouping key strips the take suffix (and -voiced, so a silent
    # kept take groups with its voiced shipped sibling). The QC sidecar tells
    # us WHICH take number each file is — so the UI can say "Scene 3 · take 2"
    # instead of leaving the user to decode filenames.
    take_of: dict[str, int] = {}
    qc_sidecar = src.parent / (prefix + "-qc.json")
    if qc_sidecar.exists():
        try:
            for rec in json.loads(qc_sidecar.read_text()):
                take_of[Path(rec.get("clip", "")).stem] = rec.get("take", 0)
        except (OSError, json.JSONDecodeError, AttributeError):
            pass
    groups: dict[str, dict] = {}
    for c in raw:
        stem = Path(c["path"]).stem
        key = _re.sub(r"-take\d+$", "", stem).removesuffix("-voiced")
        # scene number for display, from the -segN / -clipN convention
        mscene = _re.search(r"-(?:seg|clip)(\d+)", stem)
        c = {**c, "scene": int(mscene.group(1)) if mscene else None}
        g = groups.setdefault(key, {"main": None, "alts": []})
        m = _re.search(r"-take(\d+)$", stem)
        if m:
            g["alts"].append({**c, "take": int(m.group(1))})
        elif g["main"] is None or stem.endswith("-voiced"):
            # the shipped file: its take number lives in the sidecar
            c["take"] = take_of.get(stem) or take_of.get(stem.removesuffix("-voiced")) or 1
            g["main"] = c
        else:
            g["alts"].append({**c, "take": take_of.get(stem, 0)})
    clips = []
    for g in groups.values():
        main = g["main"] or (g["alts"] and dict(g["alts"][0]))
        if not main:
            continue
        main = dict(main)
        main["alternates"] = sorted(
            (a for a in g["alts"] if a["path"] != main["path"]),
            key=lambda a: a.get("take", 0))
        clips.append(main)
    clips.sort(key=lambda c: (c.get("scene") or 999, c["name"]))
    audio = []
    audio_dir = src.parent.parent / "audio"
    if audio_dir.is_dir():
        for a in sorted(audio_dir.glob(f"{prefix}-*.mp3")):
            audio.append({"path": str(a),
                          "url": f"/files/{a.relative_to('outputs').as_posix()}",
                          "name": a.name})
    self_info = ffmpeg.probe(str(src))
    return {"video": {"path": str(src), "duration": self_info["duration"]},
            "clips": clips, "audio": audio}


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
                    on_warning=lambda w: _warn(job_id, w),
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
            _attach_sync(job_id, final)
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


AVATAR_IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp"}


@app.get("/avatars")
def list_avatars():
    """All saved avatar profiles, newest first (the Avatars page grid)."""
    return {"avatars": avatars.list_profiles()}


class FaceGenRequest(BaseModel):
    """Generate a synthetic avatar face: Wan t2v renders exactly ONE frame (a
    photoreal portrait still) — no image model install needed."""
    description: str = Field(min_length=3, max_length=500)
    negative: str | None = Field(default=None, max_length=300)
    seed: int | None = None


@app.post("/avatars/generate-face")
def generate_face_endpoint(req: FaceGenRequest):
    job_id = _new_job("generate", "avatar-face")  # pod-occupying — shows in the queue

    def run() -> None:
        def on_submit(prompt_id: str) -> None:
            if job_id in JOBS:
                JOBS[job_id]["prompt_id"] = prompt_id
        try:
            _update(job_id, status="generating", progress=15,
                    detail="rendering portrait still (1-frame Wan, 20 steps)")
            # Fresh random seed per click unless pinned — "try again" must differ.
            seed = req.seed or (int(uuid.uuid4().hex[:6], 16) % 900000) + 1
            png = pipeline.generate_face(
                req.description, negative=req.negative, seed=seed,
                out_stem=f"gen-{job_id}", on_submit=on_submit,
            )
            _update(job_id, status="done", progress=100, detail="", video_path=png,
                    image_url=f"/assets-files/avatars/{Path(png).name}")
        except JobCancelled:
            pass
        except Exception as e:
            _update(job_id, status="error", error=f"{type(e).__name__}: {e}")

    threading.Thread(target=run, daemon=True).start()
    return {"job_id": job_id}


class SheetGenRequest(BaseModel):
    """Generate a Brand Lock reference sheet: one Wan still laid out as clean
    panels (characters/products/setting) on a black background — the same
    description then serves as the sheet's panel text in the two-part prompt."""
    description: str = Field(min_length=3, max_length=800)
    width: int = Field(default=896, ge=448, le=1920, multiple_of=16)
    height: int = Field(default=1536, ge=448, le=1920, multiple_of=16)
    seed: int | None = None


class SceneGenRequest(BaseModel):
    """Generate a staged scene still — e.g. the duo reference: two people at one
    table, speaker 1 on the LEFT, speaker 2 on the RIGHT."""
    description: str = Field(min_length=3, max_length=800)
    width: int = Field(default=832, ge=448, le=1920, multiple_of=16)
    height: int = Field(default=480, ge=448, le=1920, multiple_of=16)
    seed: int | None = None


@app.post("/stills/generate")
def generate_scene_endpoint(req: SceneGenRequest):
    job_id = _new_job("generate", "scene-still")

    def run() -> None:
        def on_submit(prompt_id: str) -> None:
            if job_id in JOBS:
                JOBS[job_id]["prompt_id"] = prompt_id
        try:
            _update(job_id, status="generating", progress=15,
                    detail="rendering scene still (1-frame Wan, 20 steps)")
            seed = req.seed or (int(uuid.uuid4().hex[:6], 16) % 900000) + 1
            png = pipeline.generate_scene(
                req.description, width=req.width, height=req.height, seed=seed,
                out_stem=f"gen-{job_id}", on_submit=on_submit,
            )
            _update(job_id, status="done", progress=100, detail="", video_path=png,
                    image_url=f"/assets-files/stills/{Path(png).name}")
        except JobCancelled:
            pass
        except Exception as e:
            _update(job_id, status="error", error=f"{type(e).__name__}: {e}")

    threading.Thread(target=run, daemon=True).start()
    return {"job_id": job_id}


class KeyframeSetRequest(BaseModel):
    """Stills-first stage: derive one keyframe per scene from the SAME character
    still and/or product photo (Gemini image edit) — approve the stills, then
    animate each as a sequence `product` segment. Pod-free; needs image quota."""
    scenes: list[str] = Field(min_length=1, max_length=12)
    character_image: str | None = None   # canonical character still (local path)
    product_image: str | None = None     # canonical product photo (local path)
    name: str = Field(pattern=r"^[a-zA-Z0-9._-]+$")


@app.post("/keyframes/generate")
def generate_keyframes_endpoint(req: KeyframeSetRequest):
    if not req.character_image and not req.product_image:
        raise HTTPException(422, "keyframes need character_image and/or product_image")
    for label, p in (("character_image", req.character_image),
                     ("product_image", req.product_image)):
        if p and not Path(p).exists():
            raise HTTPException(404, f"{label} not found: {p}")
    job_id = _new_job("keyframes", req.name)

    def run() -> None:
        def on_progress(status: str, pct: int, detail: str) -> None:
            if JOBS.get(job_id, {}).get("status") == "cancelled":
                raise JobCancelled()
            _update(job_id, status=status, progress=pct, detail=detail)
        try:
            paths = keyframes.derive_set(
                req.scenes, req.name, req.character_image, req.product_image,
                on_progress=on_progress)
            _update(job_id, status="done", progress=100, detail="",
                    keyframes=[f"/assets-files/keyframes/{Path(p).name}" for p in paths],
                    keyframe_paths=paths)
        except JobCancelled:
            pass
        except Exception as e:
            _update(job_id, status="error", error=f"{type(e).__name__}: {e}")

    threading.Thread(target=run, daemon=True).start()
    return {"job_id": job_id}


@app.post("/sheets/generate")
def generate_sheet_endpoint(req: SheetGenRequest):
    job_id = _new_job("generate", "brand-sheet")  # pod-occupying — shows in the queue

    def run() -> None:
        def on_submit(prompt_id: str) -> None:
            if job_id in JOBS:
                JOBS[job_id]["prompt_id"] = prompt_id
        try:
            _update(job_id, status="generating", progress=15,
                    detail="rendering reference sheet (1-frame Wan, 20 steps)")
            seed = req.seed or (int(uuid.uuid4().hex[:6], 16) % 900000) + 1
            png = pipeline.generate_sheet(
                req.description, width=req.width, height=req.height, seed=seed,
                out_stem=f"gen-{job_id}", on_submit=on_submit,
            )
            _update(job_id, status="done", progress=100, detail="", video_path=png,
                    image_url=f"/assets-files/sheets/{Path(png).name}")
        except JobCancelled:
            pass
        except Exception as e:
            _update(job_id, status="error", error=f"{type(e).__name__}: {e}")

    threading.Thread(target=run, daemon=True).start()
    return {"job_id": job_id}


@app.post("/avatars")
async def create_avatar(
    file: UploadFile | None = File(None),
    image_path: str | None = Form(None),  # server-side face (from /avatars/generate-face)
    name: str = Form(..., min_length=1, max_length=48),
    voice_id: str = Form(..., min_length=1),
    type: str = Form("byo"),
    consent: bool = Form(False),
    language: str = Form("en"),
):
    """Create a profile: locked face image + tied ElevenLabs voice.

    The face comes from EITHER a browser upload (`file`) or a generated still
    already on the server (`image_path`). BYO faces REQUIRE consent (file 07) —
    a real person's face must not enter the render path without an explicit yes.
    """
    if type not in ("library", "byo"):
        raise HTTPException(422, "type must be 'library' or 'byo'")
    if type == "byo" and not consent:
        raise HTTPException(422, "BYO avatars need consent=true — confirm you have "
                                 "permission to use this person's face")
    if file is not None:
        ext = Path(file.filename or "face").suffix.lower()
        if ext not in AVATAR_IMAGE_EXT:
            raise HTTPException(415, f"unsupported image type '{ext}' — allowed: {sorted(AVATAR_IMAGE_EXT)}")
        data = await file.read()
        if not data:
            raise HTTPException(422, "empty image upload")
    elif image_path:
        src = Path(image_path)
        # Only faces the server itself produced/stored — never arbitrary paths.
        if not src.resolve().is_relative_to(Path("assets").resolve()):
            raise HTTPException(422, "image_path must live under assets/")
        if not src.exists():
            raise HTTPException(404, f"image not found: {image_path}")
        ext = src.suffix.lower()
        data = src.read_bytes()
    else:
        raise HTTPException(422, "provide a face: upload `file` or pass `image_path`")
    profile = avatars.create_profile(
        name=name.strip(), voice_id=voice_id, image_bytes=data, image_ext=ext,
        type_=type, consent=consent, default_settings={"language": language},
    )
    return profile


class AvatarUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=48)
    voice_id: str | None = None


@app.patch("/avatars/{avatar_id}")
def update_avatar(avatar_id: str, req: AvatarUpdateRequest):
    if avatars.get_profile(avatar_id) is None:
        raise HTTPException(404, f"unknown avatar_id {avatar_id}")
    return avatars.update_profile(avatar_id, name=req.name, voice_id=req.voice_id)


@app.delete("/avatars/{avatar_id}")
def delete_avatar(avatar_id: str):
    if not avatars.delete_profile(avatar_id):
        raise HTTPException(404, f"unknown avatar_id {avatar_id}")
    return {"ok": True}


# ---- Characters (the cast): anchor-first consistency across ads ----

class CharacterCreateRequest(BaseModel):
    """A saved character = a verbatim shot-prompt anchor (+ optional face/sheet/
    voice). The anchor is pasted word-for-word into every shot it's cast in —
    that repetition is what keeps the same actor across cuts and across ads."""
    name: str = Field(min_length=1, max_length=48)
    anchor: str = Field(min_length=10, max_length=400)
    face_image: str | None = None   # server path under assets/ (upload or generated)
    sheet_image: str | None = None
    voice_id: str | None = None


class CharacterUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=48)
    anchor: str | None = Field(default=None, min_length=10, max_length=400)
    face_image: str | None = None
    sheet_image: str | None = None
    voice_id: str | None = None


def _check_asset_path(label: str, p: str | None) -> None:
    if p is None:
        return
    path = Path(p)
    if not path.exists():
        raise HTTPException(404, f"{label} file not found: {p}")
    if not path.resolve().is_relative_to(Path("assets").resolve()):
        raise HTTPException(422, f"{label} must live under assets/")


@app.get("/characters")
def list_characters_endpoint():
    """All saved characters, newest first (the Cast page grid)."""
    return {"characters": characters.list_characters()}


@app.post("/characters")
def create_character_endpoint(req: CharacterCreateRequest):
    _check_asset_path("face_image", req.face_image)
    _check_asset_path("sheet_image", req.sheet_image)
    return characters.create_character(
        name=req.name, anchor=req.anchor.strip(), face_image=req.face_image,
        sheet_image=req.sheet_image, voice_id=req.voice_id,
    )


@app.patch("/characters/{char_id}")
def update_character_endpoint(char_id: str, req: CharacterUpdateRequest):
    if characters.get_character(char_id) is None:
        raise HTTPException(404, f"unknown character_id {char_id}")
    _check_asset_path("face_image", req.face_image)
    _check_asset_path("sheet_image", req.sheet_image)
    return characters.update_character(
        char_id, name=req.name, anchor=req.anchor and req.anchor.strip(),
        face_image=req.face_image, sheet_image=req.sheet_image, voice_id=req.voice_id,
    )


@app.delete("/characters/{char_id}")
def delete_character_endpoint(char_id: str):
    if not characters.delete_character(char_id):
        raise HTTPException(404, f"unknown character_id {char_id}")
    return {"ok": True}


@app.post("/characters/{char_id}/generate-face")
def character_face_endpoint(char_id: str):
    """Render the character's portrait from their anchor (1-frame Wan still)
    and attach it to the profile — unlocks the avatar modes for this character."""
    ch = characters.get_character(char_id)
    if ch is None:
        raise HTTPException(404, f"unknown character_id {char_id}")
    job_id = _new_job("generate", f"face-{ch['name']}")

    def run() -> None:
        def on_submit(prompt_id: str) -> None:
            if job_id in JOBS:
                JOBS[job_id]["prompt_id"] = prompt_id
        try:
            _update(job_id, status="generating", progress=15,
                    detail="rendering portrait still (1-frame Wan, 20 steps)")
            seed = (int(uuid.uuid4().hex[:6], 16) % 900000) + 1
            characters.IMAGES_DIR.mkdir(parents=True, exist_ok=True)
            png = pipeline.generate_face(
                ch["anchor"], seed=seed, out_stem=f"char-{char_id}", on_submit=on_submit,
            )
            # generate_face writes to assets/avatars/ — move into the cast folder.
            dest = characters.IMAGES_DIR / Path(png).name
            Path(png).replace(dest)
            characters.update_character(char_id, face_image=str(dest))
            _update(job_id, status="done", progress=100, detail="", video_path=str(dest),
                    image_url=f"/assets-files/characters/{dest.name}")
        except JobCancelled:
            pass
        except Exception as e:
            _update(job_id, status="error", error=f"{type(e).__name__}: {e}")

    threading.Thread(target=run, daemon=True).start()
    return {"job_id": job_id}


@app.post("/characters/{char_id}/generate-sheet")
def character_sheet_endpoint(char_id: str):
    """Render the character's turnaround reference sheet (front close-up +
    full-body views) from their anchor — unlocks Brand Lock identity carry."""
    ch = characters.get_character(char_id)
    if ch is None:
        raise HTTPException(404, f"unknown character_id {char_id}")
    job_id = _new_job("generate", f"sheet-{ch['name']}")

    def run() -> None:
        def on_submit(prompt_id: str) -> None:
            if job_id in JOBS:
                JOBS[job_id]["prompt_id"] = prompt_id
        try:
            _update(job_id, status="generating", progress=15,
                    detail="rendering character sheet (1-frame Wan, 20 steps)")
            seed = (int(uuid.uuid4().hex[:6], 16) % 900000) + 1
            characters.IMAGES_DIR.mkdir(parents=True, exist_ok=True)
            png = pipeline.generate_sheet(
                f"one character: {ch['anchor']}", seed=seed,
                out_stem=f"char-{char_id}-sheet", on_submit=on_submit,
            )
            dest = characters.IMAGES_DIR / Path(png).name
            Path(png).replace(dest)
            characters.update_character(char_id, sheet_image=str(dest))
            _update(job_id, status="done", progress=100, detail="", video_path=str(dest),
                    image_url=f"/assets-files/characters/{dest.name}")
        except JobCancelled:
            pass
        except Exception as e:
            _update(job_id, status="error", error=f"{type(e).__name__}: {e}")

    threading.Thread(target=run, daemon=True).start()
    return {"job_id": job_id}


@app.get("/stills")
def list_stills():
    """Generated stills — reference sheets and avatar faces rendered on the pod.
    Sheets are reusable brand assets: the Brand Lock UI lists them for reuse and
    the Library shows the whole gallery."""
    items = []
    for kind, folder, pattern in (("sheet", Path("assets/sheets"), "gen-*.png"),
                                  ("face", Path("assets/avatars"), "gen-*.png"),
                                  ("scene", Path("assets/stills"), "gen-*.png")):
        if not folder.exists():
            continue
        for p in folder.glob(pattern):
            try:
                st = p.stat()
            except OSError:
                continue
            items.append({
                "path": str(p),
                "url": f"/assets-files/{p.relative_to('assets').as_posix()}",
                "name": p.name,
                "kind": kind,
                "size_bytes": st.st_size,
                "modified": int(st.st_mtime),
            })
    items.sort(key=lambda i: i["modified"], reverse=True)
    return {"stills": items}


# (path, mtime) -> seconds; videos are immutable once written, so mtime is a
# sufficient cache key and the dict never needs eviction at our scale.
_DURATION_CACHE: dict[tuple[str, float], float] = {}


def _cached_duration(path: str, mtime: float) -> float | None:
    key = (path, mtime)
    if key not in _DURATION_CACHE:
        try:
            _DURATION_CACHE[key] = round(ffmpeg.probe(path)["duration"], 3)
        except Exception:
            return None
    return _DURATION_CACHE[key]


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
        item = {
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
            # Timeline needs durations; mtime-keyed cache avoids an ffprobe storm
            # (first listing warms it, subsequent listings are dict hits).
            "duration": _cached_duration(str(p), st.st_mtime),
        }
        # Multi-model recipe chips: finals carry the {name}-recipe.json sidecar
        # (which engine made each span + the QC story) when the pipeline wrote one.
        if item["kind"] != "clip":
            rp = p.parent / (p.stem.replace("-final", "").replace("-post", "") + "-recipe.json")
            if rp.exists():
                try:
                    item["recipe"] = json.loads(rp.read_text())
                except (OSError, json.JSONDecodeError):
                    pass
        items.append(item)
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
