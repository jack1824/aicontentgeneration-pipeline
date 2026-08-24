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
import hashlib
import json
import threading
import time
import traceback
import uuid
from pathlib import Path
from typing import Literal

import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app import (adminstore, avatars, characters, checkpoint, environments, episodes,
                 keyframes, pipeline, postprocess, shows, starters)
from app.assembly import ffmpeg
from app.config import COMFY_POD_URLS, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID
from app.providers import llm
from app.providers.tts import synthesize_voice

app = FastAPI(title="adgen orchestrator")

Path("outputs").mkdir(exist_ok=True)
Path("assets/uploads").mkdir(parents=True, exist_ok=True)
app.mount("/files", StaticFiles(directory="outputs"), name="outputs")
app.mount("/assets-files", StaticFiles(directory="assets"), name="assets")

JOBS: dict[str, dict] = {}
# Mounted after JOBS exists — admin_api reads it lazily inside handlers, so the
# import order here is the only thing that matters.
from app import admin_api  # noqa: E402  (deliberate: needs `app` and JOBS defined)

app.include_router(admin_api.router)

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
    # JOBS is in-memory and dies with the process, so anything worth reviewing after
    # the fact goes to the durable admin log too (adminstore).
    adminstore.emit(adminstore.JOB_START, job_id=job_id, kind=kind, name=name)
    return job_id


def _update(job_id: str, **fields) -> None:
    """Job update that NEVER overwrites a user cancellation — worker threads keep
    running after cancel and must not resurrect the job as running/done."""
    job = JOBS.get(job_id)
    if job and job["status"] != "cancelled":
        was = job.get("status")
        job.update(**fields)
        now = job.get("status")
        if now != was and now in ("done", "error", "cancelled"):
            adminstore.emit(
                {"done": adminstore.JOB_DONE, "error": adminstore.JOB_ERROR,
                 "cancelled": adminstore.JOB_CANCELLED}[now],
                job_id=job_id, kind=job.get("kind"), name=job.get("name"),
                error=job.get("error"), error_kind=job.get("error_kind"),
                video_path=job.get("video_path"),
                warnings=list(job.get("warnings") or []),
                elapsed_s=round(time.time() - (job.get("created") or time.time()), 1))


def _warn(job_id: str, msg: str) -> None:
    """Append to the job's warnings list — unlike `detail`, warnings accumulate,
    so a later progress update can't silently erase a 'this cut has a problem'."""
    job = JOBS.get(job_id)
    if job and job["status"] != "cancelled":
        job.setdefault("warnings", []).append(msg)
        adminstore.emit(adminstore.WARNING, job_id=job_id, kind=job.get("kind"),
                        name=job.get("name"), message=msg)


def _attach_sync(job_id: str, video_path: str, ok_tail_s: float = 1.0,
                 narration_path: str | None = None) -> None:
    """Post-assembly ground truth: silence-analyze the final and flag anything a
    client would hear as 'no voice' (mid-video gaps, long silent tails). Stores
    the full report on the job as `sync`. Analysis must never fail the render.
    ok_tail_s: tail silence that's by design (an end card's read time) isn't flagged.

    narration_path closes the MUSIC-BED BLIND SPOT. Every metric here derives from
    silencedetect at -45dB, but a ducked bed sits at 0.15 gain — far above that — so
    on a mixed render `tail` reads 0 and a film that keeps playing long after the VO
    stops is silently declared clean. When the narration file is known we can measure
    the speech directly and flag the gap regardless of what the bed is covering.
    """
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
    if rep.get("lead_in", 0) > 2.5:
        _warn(job_id, f"first sound arrives at {rep['lead_in']}s — silent open")
    # narration-aware tail check: works even when a bed masks the silence
    if narration_path and rep.get("tail", 0) <= ok_tail_s:
        try:
            ndur = ffmpeg.probe(narration_path)["duration"]
            vdur = float(rep.get("duration") or 0.0)
            speech_gap = vdur - ndur
            if vdur > 0 and speech_gap > max(ok_tail_s, 1.5):
                _warn(job_id, f"the narration ends {speech_gap:.1f}s before the film — "
                              f"music covers the tail, but no one is speaking over it")
        except Exception:
            pass


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
    seed: int | None = Field(default=None, ge=0, le=2_147_483_647)
                                         # identity-lock: the approved keyframe's PINNED
                                         # seed — this beat renders with it every time
    identity_lock: bool = False          # True = `image` is an APPROVED keyframe; the
                                         # first-frame identity QC compares against it


class GenerateRequest(BaseModel):
    mode: str = "overlay"
    shots: list[Shot] = []               # non-sequence modes; validated in the endpoint
    segments: list[Segment] | None = None  # sequence mode timeline
    script: str | None = None            # narration text; None -> silent stitch
    language: str = "hi"
    seed: int | None = None
    music: str | None = None             # optional path to a music bed
    end_card: dict | None = None         # branded end frame {brand, tagline?, offer?, image?}
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
    legacy_audio_fit: bool = False       # True = keep the pre-2026-08 behaviour of CUTTING a
                                         # narration that outruns the picture. Ads never set
                                         # this (they hold the last frame so the voice
                                         # finishes); ONLY /episodes/{id}/render does, because
                                         # episode beats are cut to fixed-length takes and a
                                         # freeze would break the show's rhythm. It lives on the
                                         # model, not as a local, so an episode RETRY (which
                                         # replays req.model_dump()) keeps episode behaviour.
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
    # A script the USER wrote. With verbatim=True it is reproduced byte-identically
    # and the film is sized to it; otherwise it is treated as a draft to improve.
    script: str | None = Field(default=None, max_length=12000)
    verbatim: bool = False
    # Force a specialized director brain instead of the generic 3-approach planner.
    # None = auto (the brain picks the pipeline). Set from the mode the user is on so
    # a cinematic surface plans like a cinematic director, a sequence surface like an
    # editor, etc. — every returned approach commits to this pipeline.
    mode: Literal["cinematic", "sequence", "product", "lipsync", "overlay"] | None = None


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
    """ASYNC: returns a job_id immediately; the plan is computed in a background
    thread and read back via GET /jobs/{id} (field `plan`). Gemini takes 60-100s+
    on long verbatim briefs — a single synchronous request that long trips the
    Cloudflare quick-tunnel's ~100s cap (524) and Vercel/proxy timeouts. Polling a
    fast job endpoint sidesteps every one of those, exactly like renders do."""
    cast = []
    for cid in req.cast_ids:  # resolve synchronously so unknown ids 404 up front
        ch = characters.get_character(cid)
        if ch is None:
            raise HTTPException(404, f"unknown character_id {cid}")
        cast.append({"name": ch["name"], "anchor": ch["anchor"]})
    job_id = _new_job("plan", "ad plan")  # kind="plan" -> not pod-bound

    def run() -> None:
        try:
            _update(job_id, status="planning", progress=25, detail="writing treatments")
            result = llm.plan(req.idea, language=req.language, ad_format=req.format,
                              duration_s=req.duration_s, avoid=req.avoid or None,
                              cast=cast or None, script=req.script,
                              verbatim=req.verbatim, mode=req.mode)
            _update(job_id, status="done", progress=100, detail="", plan=result)
        except llm.PlanError as e:
            _update(job_id, status="error", error=str(e))
        except Exception as e:
            traceback.print_exc()
            _update(job_id, status="error", error=f"planner error ({type(e).__name__}): {e}")

    threading.Thread(target=run, daemon=True).start()
    return {"job_id": job_id}


class DialoguePlanRequest(BaseModel):
    idea: str = Field(min_length=3)
    language: str = "en"
    turns: int = Field(default=2, ge=2, le=6)
    regenerate: bool = False  # true = "fresh take" re-roll, runs hotter
    script: str | None = Field(default=None, max_length=12000)
    verbatim: bool = False


@app.post("/plan-dialogue")
def plan_dialogue_endpoint(req: DialoguePlanRequest):
    """The Dialogue page's brain: idea -> two speakers + alternating turns."""
    try:
        return llm.plan_dialogue(req.idea, language=req.language,
                                 turns=req.turns, regenerate=req.regenerate,
                                 script=req.script, verbatim=req.verbatim)
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
    # Stash the request so a failed render can be replayed by POST /jobs/{id}/retry
    # (episode renders route through here too, so their compiled segments retry as-is).
    JOBS[job_id]["retry"] = {"kind": "generate", "req": req.model_dump()}

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
            # Typed failure (Phase 2): pod-down is an OPS state ("renders paused"),
            # not a content error — the UI can say so instead of a raw stack. The
            # job also advertises whether a checkpoint manifest makes it resumable.
            msg = f"{type(e).__name__}: {e}"
            # "Lost contact with pod" is what comfy.poll_until_done actually raises
            # when the pod dies mid-render (found in production, 2026-08-15) — it
            # MUST classify as pod_down, or the UI blames the content for an ops
            # outage and the user re-renders instead of restarting the service.
            kind = ("pod_down" if any(s in msg for s in (
                "Lost contact with pod", "ConnectError", "ConnectTimeout",
                "ReadTimeout", "pod unreachable", "system_stats", "502", "503",
            )) else "render")
            _update(job_id, status="error", error=msg, error_kind=kind,
                    resumable=checkpoint.exists(req.name or job_id))

    threading.Thread(target=run, daemon=True).start()
    return {"job_id": job_id}


@app.get("/healthz")
def healthz():
    """Is the render service reachable? The studio polls this to show
    'renders paused' up front instead of failing a submit with a raw error."""
    if not COMFY_POD_URLS:
        return {"pod_up": False, "reason": "no render service configured"}
    try:
        httpx.get(f"{COMFY_POD_URLS[0].rstrip('/')}/system_stats",
                  timeout=8).raise_for_status()
        return {"pod_up": True, "reason": None}
    except httpx.HTTPError as e:
        return {"pod_up": False, "reason": type(e).__name__}


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
             "status": j["status"], "progress": j["progress"], "detail": j["detail"],
             "warnings": j.get("warnings") or [], "error": j.get("error"),
             "retriable": bool(j.get("retry")), "created": j.get("created")}
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


@app.post("/jobs/{job_id}/retry")
def job_retry(job_id: str):
    """Re-run a failed render by replaying its stashed request. Returns a NEW job_id
    (the render tray swaps the failed row for it). Only jobs created with a `retry`
    descriptor (generate / episode renders) are retriable."""
    job = JOBS.get(job_id)
    if job is None:
        raise HTTPException(404, f"unknown job_id {job_id}")
    r = job.get("retry")
    if not r:
        raise HTTPException(422, "this job can't be retried")
    if r.get("kind") == "generate":
        return generate_endpoint(GenerateRequest(**r["req"]))
    raise HTTPException(422, f"unknown retry kind: {r.get('kind')}")


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
            _attach_sync(job_id, final, narration_path=narration)
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


class CoverRequest(BaseModel):
    """Pick a COVER/thumbnail for a finished ad — the shelf image every social
    surface shows in-grid and pre-autoplay. A raw first frame is usually a black
    fade or a mid-blink mouth; letting the user pick a frame (+ optional hook line
    burned on) is a small change with outsized tap-through impact."""
    video_path: str
    at_s: float = Field(default=0.0, ge=0.0)   # timestamp to grab
    hook: str | None = Field(default=None, max_length=120)  # optional burned-on line


@app.post("/cover")
def cover_endpoint(req: CoverRequest):
    """Write outputs/.../<stem>-cover.png next to the video (sync — one frame grab).
    The Library listing then surfaces it as `cover_url`. Downloadable/shareable."""
    src = Path(req.video_path)
    if not src.exists():
        raise HTTPException(404, f"video not found: {req.video_path}")
    if not _under_outputs(src):
        raise HTTPException(422, "only videos under outputs/ can get a cover")
    out = src.with_name(src.stem + "-cover.png")
    try:
        dur = ffmpeg.probe(str(src)).get("duration") or 0.0
        at = min(float(req.at_s), max(0.0, dur - 0.05))
        ffmpeg.cover_frame(str(src), str(out), at_s=at, hook=req.hook)
    except Exception as e:
        raise HTTPException(500, f"cover failed: {type(e).__name__}: {e}")
    # resolve() both sides so an absolute video_path (which _under_outputs accepts)
    # still maps to a /files-relative URL instead of ValueError-ing.
    rel = out.resolve().relative_to(Path("outputs").resolve()).as_posix()
    return {"cover_url": f"/files/{rel}", "path": str(out), "at_s": at}


@app.delete("/outputs")
def delete_output_endpoint(path: str):
    """Delete a Library render (and its sidecars: -cover.png, .meta.json, -recipe.json).
    `path` is the item's stored `path` (outputs/...). Guarded to the outputs tree."""
    src = Path(path)
    if not _under_outputs(src):
        raise HTTPException(422, "only files under outputs/ can be deleted")
    if not src.exists():
        raise HTTPException(404, f"not found: {path}")
    mtime = src.stat().st_mtime
    src.unlink(missing_ok=True)
    # sweep the sidecars that ride alongside THIS file
    src.with_name(src.stem + "-cover.png").unlink(missing_ok=True)
    src.with_suffix(".meta.json").unlink(missing_ok=True)
    # The recipe sidecar is SHARED by the -final and -final-post siblings (list_outputs
    # strips both suffixes to the same base). Only sweep it once no sibling still needs it.
    stem = src.stem.replace("-final", "").replace("-post", "")
    siblings = [src.parent / f"{stem}-final.mp4", src.parent / f"{stem}-final-post.mp4"]
    if not any(s.exists() for s in siblings):
        (src.parent / f"{stem}-recipe.json").unlink(missing_ok=True)
    _DURATION_CACHE.pop((str(src), mtime), None)
    return {"ok": True, "deleted": path}


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
    # trim window WITHIN the narration file (Timeline voice-block edge drags:
    # "cut the first 2s of the VO") — 0/None means use the whole file
    in_s: float = Field(default=0.0, ge=0)
    out_s: float | None = Field(default=None, gt=0)


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

                if narration_file and req.narration and (
                    req.narration.in_s > 0.05 or req.narration.out_s is not None
                ):
                    adur = ffmpeg.probe(narration_file)["duration"]
                    a_out = min(req.narration.out_s or adur, adur)
                    if a_out - req.narration.in_s < 0.2:
                        # inverted / out-of-range window would leave a 0.1s voice
                        # stub — keep the full narration and say so loudly
                        _warn(job_id,
                              f"voice trim {req.narration.in_s:.1f}–{a_out:.1f}s is empty "
                              f"(file is {adur:.1f}s) — ignored, using the full narration")
                    elif req.narration.in_s > 0.05 or a_out < adur - 0.05:
                        _update(job_id, status="assembling", progress=80, detail="trimming voice")
                        narration_file = ffmpeg.cut_audio(
                            narration_file, req.narration.in_s,
                            a_out - req.narration.in_s, str(Path(tmp) / "voice-trim.mp3"))

                # Actionable fit check BEFORE the mix: TTS pace varies ±30%, so a
                # script written "by feel" often undershoots the film (protein +
                # journey postmortems). Tell the user how many words are missing.
                if narration_file and req.narration:
                    try:
                        ndur = ffmpeg.probe(narration_file)["duration"]
                        vdur = ffmpeg.probe(joined)["duration"]
                        n_end = req.narration.offset_ms / 1000.0 + ndur
                        script_txt = req.narration.script or ""
                        if n_end < vdur - 3.0 and script_txt and ndur > 1:
                            pace = len(script_txt.split()) / ndur
                            _warn(job_id,
                                  f"narration will end at {n_end:.1f}s of {vdur:.1f}s — "
                                  f"~{max(1, int((vdur - 1.0 - n_end) * pace))} more words "
                                  f"would carry it to the end")
                    except Exception:
                        pass

                if narration_file:
                    _update(job_id, status="assembling", progress=85, detail="narration overlay")
                    final = ffmpeg.replace_audio(
                        joined, narration_file, music=req.music, out=final_path,
                        narration_delay_ms=req.narration.offset_ms,
                        narration_gain=req.narration.gain, music_gain=req.music_gain,
                        # the user placed this narration on a timeline they cut by hand —
                        # never silently shorten their film to match the voice
                        strict=False,
                        on_warning=lambda w: _warn(job_id, w))
                elif req.music:
                    _update(job_id, status="assembling", progress=85, detail="music bed")
                    final = ffmpeg.stitch_plus_music([joined], music=req.music, out=final_path)
                else:
                    Path(joined).replace(final_path)
                    final = final_path
            if any(_voice_locked(Path(c.path)) for c in req.clips):
                Path(final).with_suffix(".meta.json").write_text(json.dumps({"voice_lock": True}))
            _attach_sync(job_id, final, narration_path=narration_file)
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
        # scene number for display: -sceneN (current), -segN / -clipN (legacy)
        mscene = _re.search(r"-(?:scene|seg|clip)(\d+)", stem)
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
                    # re-assembly of a hand-picked clip list — keep the user's full cut
                    strict=False,
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
    description: str = Field(min_length=3, max_length=800)
    negative: str | None = Field(default=None, max_length=300)
    seed: int | None = None
    # "person" -> studio headshot; "product" -> studio packshot with no people
    # (so "generate a pizza box" stops rendering a human face).
    subject: Literal["person", "product"] = "person"


@app.post("/avatars/generate-face")
def generate_face_endpoint(req: FaceGenRequest):
    job_id = _new_job("generate", "avatar-face")  # pod-occupying — shows in the queue

    def run() -> None:
        def on_submit(prompt_id: str) -> None:
            if job_id in JOBS:
                JOBS[job_id]["prompt_id"] = prompt_id
        try:
            is_product = req.subject == "product"
            _update(job_id, status="generating", progress=15,
                    detail=f"rendering {'product' if is_product else 'portrait'} still (1-frame Wan, 20 steps)")
            # Fresh random seed per click unless pinned — "try again" must differ.
            seed = req.seed or (int(uuid.uuid4().hex[:6], 16) % 900000) + 1
            png = pipeline.generate_face(
                req.description, negative=req.negative, seed=seed,
                subject=req.subject, out_stem=f"gen-{job_id}", on_submit=on_submit,
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


class KeyframeVariantsRequest(BaseModel):
    """Emotion variants of an approved hero portrait (the emotional-arc fix):
    same woman, same framing, only the expression changes — each character beat
    then starts i2v from the variant matching its planned emotion."""
    portrait: str                              # approved hero portrait (local path)
    name: str = Field(pattern=r"^[a-zA-Z0-9._-]+$")
    emotions: list[str] | None = Field(default=None, max_length=8)


@app.post("/keyframes/variants")
def keyframe_variants_endpoint(req: KeyframeVariantsRequest):
    if not Path(req.portrait).exists():
        raise HTTPException(404, f"portrait not found: {req.portrait}")
    job_id = _new_job("keyframes", req.name)

    def run() -> None:
        def on_progress(status: str, pct: int, detail: str) -> None:
            if JOBS.get(job_id, {}).get("status") == "cancelled":
                raise JobCancelled()
            _update(job_id, status=status, progress=pct, detail=detail)
        try:
            paths = keyframes.derive_variants(
                req.portrait, req.name, emotions=req.emotions, on_progress=on_progress)
            _update(job_id, status="done", progress=100, detail="",
                    keyframes=[f"/assets-files/keyframes/{Path(p).name}" for p in paths],
                    keyframe_paths=paths)
        except JobCancelled:
            pass
        except Exception as e:
            _update(job_id, status="error", error=f"{type(e).__name__}: {e}")

    threading.Thread(target=run, daemon=True).start()
    return {"job_id": job_id}


class DirectorIntentRequest(BaseModel):
    """One director-chat turn: a natural-language instruction + the current
    timeline state -> validated editor operations the frontend executes."""
    message: str = Field(min_length=1, max_length=6000)
    context: dict = Field(default_factory=dict)
    history: list[dict] = Field(default_factory=list, max_length=12)


@app.post("/director/intent")
def director_intent_endpoint(req: DirectorIntentRequest):
    try:
        return llm.director_intent(req.message, req.context, req.history)
    except llm.PlanError as e:
        raise HTTPException(502, str(e))


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
    # May be empty: when the voice roster is unavailable (a key without the
    # `voices_read` permission) the UI has nothing to pick from, and a required
    # field here turned that into a permanently-dead Save button. Fall back to the
    # configured default voice instead of 422-ing.
    voice_id: str = Form(""),
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
    voice_id = (voice_id or "").strip() or (ELEVENLABS_VOICE_ID or "")
    if not voice_id:
        raise HTTPException(422, "no voice_id given and ELEVENLABS_VOICE_ID is not set "
                                 "— add one to adgen-backend/.env")
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
    # Collect candidates first, then warm the duration cache in PARALLEL. A cold
    # Library used to ffprobe ~300 files serially (~9s) — the frontend's fetch
    # stalled and the grid showed nothing. 16-way probing makes it ~instant.
    cands = []
    for p in Path("outputs").rglob("*.mp4"):
        # Assembly intermediates are transient (and deleted mid-flight) — never list them.
        if p.stem.endswith(".stitched") or p.stem.endswith("-joined"):
            continue
        try:
            st = p.stat()
        except OSError:
            continue  # a running job deleted it between rglob and stat — skip, don't 500
        cands.append((p, st))
    _uncached = [(str(p), st.st_mtime) for p, st in cands
                 if (str(p), st.st_mtime) not in _DURATION_CACHE]
    if _uncached:
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=16) as ex:
            list(ex.map(lambda a: _cached_duration(*a), _uncached))
    items = []
    for p, st in cands:
        rel = p.relative_to("outputs")
        parts = rel.parts
        cover = p.with_name(p.stem + "-cover.png")
        item = {
            "path": str(p),
            "url": f"/files/{rel.as_posix()}",
            "cover_url": (f"/files/{cover.relative_to('outputs').as_posix()}"
                          if cover.exists() else None),
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


def _default_voice_entry() -> list[dict]:
    """The configured fallback voice as a one-item roster."""
    if not ELEVENLABS_VOICE_ID:
        return []
    return [{"voice_id": ELEVENLABS_VOICE_ID, "name": "Default voice",
             "category": "default", "labels": {}}]


@app.get("/voices")
def list_voices():
    """Proxy the ElevenLabs voice list for the UI's voice picker (key stays server-side).

    DEGRADES INSTEAD OF FAILING. A key without the `voices_read` permission (or a
    dead upstream) used to 502 here — which rendered the voice picker as nothing,
    which left `voice_id` empty, which permanently disabled the avatar Save button
    with no message. Speech synthesis needs a different permission and keeps
    working, so a missing roster must never block a save: fall back to the
    configured default voice and say so via `degraded`.
    """
    reason = ""
    if not ELEVENLABS_API_KEY:
        reason = "ELEVENLABS_API_KEY not configured"
    else:
        try:
            r = httpx.get("https://api.elevenlabs.io/v2/voices?page_size=100",
                          headers={"xi-api-key": ELEVENLABS_API_KEY}, timeout=30)
            if r.status_code == 200:
                voices = [{
                    "voice_id": v["voice_id"],
                    "name": v["name"],
                    "category": v.get("category"),
                    "labels": v.get("labels") or {},
                } for v in r.json().get("voices", [])]
                if voices:
                    return {"voices": voices, "degraded": None}
                reason = "ElevenLabs returned an empty voice list"
            else:
                reason = f"ElevenLabs voices failed ({r.status_code}): {r.text[:200]}"
        except httpx.HTTPError as e:
            reason = f"ElevenLabs unreachable: {type(e).__name__}"
    return {"voices": _default_voice_entry(), "degraded": reason}


# Language-appropriate audition lines so a Hindi show never previews a Hindi-capable
# voice reading an English boilerplate sentence (the "hear it before you lock it" fix).
_PREVIEW_SAMPLES = {
    "hi": "नमस्ते! यही मेरी आवाज़ है — आपके विज्ञापन के लिए एकदम सही।",
    "en": "Your ad, your voice — this is how I sound.",
}


class VoicePreviewRequest(BaseModel):
    voice_id: str
    # None -> a language-appropriate default sample; the UI usually passes the
    # character's REAL line so the audition is the actual delivery, not boilerplate.
    text: str | None = None
    language: str = "en"


@app.post("/voice-preview")
def voice_preview(req: VoicePreviewRequest):
    """Generate a short TTS sample for the voice picker's preview button.

    Keyed by (voice_id, language, text) so previewing the ACTUAL line — or the
    same voice in Hindi vs English — each get their own cached clip.
    """
    text = (req.text or "").strip() or _PREVIEW_SAMPLES.get(
        (req.language or "en").split("-")[0], _PREVIEW_SAMPLES["en"])
    # Empty voice_id = audition the server's Default voice (the "Default voice" chip).
    voice_id = req.voice_id.strip() or ELEVENLABS_VOICE_ID
    if not voice_id:
        raise HTTPException(422, "no voice_id and no server default voice configured")
    out = Path("outputs/voice-previews")
    out.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha1(f"{voice_id}|{req.language}|{text}".encode()).hexdigest()[:16]
    dest = out / f"{voice_id}-{key}.mp3"
    if not dest.exists() or dest.stat().st_mtime < time.time() - 86400:
        try:
            synthesize_voice(text[:200], voice_id=voice_id,
                             language=req.language, output_path=str(dest))
        except Exception as e:
            raise HTTPException(502, f"preview failed: {e}")
    return FileResponse(str(dest), media_type="audio/mpeg")


# ====================================================================
# SHOW TEMPLATES — episodic ads (2026-07-20)
# A Show = a locked recipe (cast + rooms + look + grammar). An Episode =
# that Show + a new script. Consistency lives in stored artifacts, not chat
# memory: the cast's anchors/faces and the rooms' plates are re-injected on
# every episode so Ep2's teacher/classroom match Ep1's.
# The identity-keyframe pass (Qwen-Edit composite) + ltx2_i2v lane are the
# pod-day upgrade; today's compile uses the mechanisms already live —
# per-segment lipsync from a character's face+voice, brand-lock room plates,
# and verbatim anchor injection.
# ====================================================================

# ---- Environments (rooms) ----

class EnvironmentCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    anchor: str = Field(min_length=10, max_length=400)
    plate_wide: str | None = None
    plate_reverse: str | None = None
    plate_detail: str | None = None


class EnvironmentUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    anchor: str | None = Field(default=None, min_length=10, max_length=400)
    plate_wide: str | None = None
    plate_reverse: str | None = None
    plate_detail: str | None = None


@app.get("/environments")
def list_environments_endpoint():
    return {"environments": environments.list_environments()}


@app.post("/environments")
def create_environment_endpoint(req: EnvironmentCreateRequest):
    for lbl, p in (("plate_wide", req.plate_wide), ("plate_reverse", req.plate_reverse),
                   ("plate_detail", req.plate_detail)):
        _check_asset_path(lbl, p)
    return environments.create_environment(
        name=req.name, anchor=req.anchor.strip(), plate_wide=req.plate_wide,
        plate_reverse=req.plate_reverse, plate_detail=req.plate_detail)


@app.patch("/environments/{env_id}")
def update_environment_endpoint(env_id: str, req: EnvironmentUpdateRequest):
    if environments.get_environment(env_id) is None:
        raise HTTPException(404, f"unknown environment_id {env_id}")
    for lbl, p in (("plate_wide", req.plate_wide), ("plate_reverse", req.plate_reverse),
                   ("plate_detail", req.plate_detail)):
        _check_asset_path(lbl, p)
    return environments.update_environment(
        env_id, name=req.name, anchor=req.anchor and req.anchor.strip(),
        plate_wide=req.plate_wide, plate_reverse=req.plate_reverse,
        plate_detail=req.plate_detail)


@app.delete("/environments/{env_id}")
def delete_environment_endpoint(env_id: str):
    if not environments.delete_environment(env_id):
        raise HTTPException(404, f"unknown environment_id {env_id}")
    return {"ok": True}


@app.post("/environments/{env_id}/generate-plate")
def environment_plate_endpoint(env_id: str, angle: str = "wide"):
    """Render one room plate from the environment's anchor (1-frame Wan still)
    and attach it as the wide/reverse/detail plate. NEEDS THE POD."""
    env = environments.get_environment(env_id)
    if env is None:
        raise HTTPException(404, f"unknown environment_id {env_id}")
    if angle not in ("wide", "reverse", "detail"):
        raise HTTPException(422, "angle must be wide|reverse|detail")
    job_id = _new_job("generate", f"plate-{env['name']}-{angle}")
    hint = {"wide": "wide establishing shot of the empty room, no people",
            "reverse": "reverse angle of the same room, no people",
            "detail": "close detail insert of the room, no people"}[angle]

    def run() -> None:
        def on_submit(prompt_id: str) -> None:
            if job_id in JOBS:
                JOBS[job_id]["prompt_id"] = prompt_id
        try:
            _update(job_id, status="generating", progress=15,
                    detail=f"rendering {angle} plate (1-frame Wan, 20 steps)")
            seed = (int(uuid.uuid4().hex[:6], 16) % 900000) + 1
            environments.IMAGES_DIR.mkdir(parents=True, exist_ok=True)
            png = pipeline.generate_scene(
                f"{env['anchor']}. {hint}", seed=seed,
                out_stem=f"env-{env_id}-{angle}", on_submit=on_submit)
            dest = environments.IMAGES_DIR / Path(png).name
            Path(png).replace(dest)
            environments.update_environment(env_id, **{f"plate_{angle}": str(dest)})
            _update(job_id, status="done", progress=100, detail="", video_path=str(dest),
                    image_url=f"/assets-files/environments/{dest.name}")
        except JobCancelled:
            pass
        except Exception as e:
            _update(job_id, status="error", error=f"{type(e).__name__}: {e}")

    threading.Thread(target=run, daemon=True).start()
    return {"job_id": job_id}


# ---- Shows (templates) ----

class ShowCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    character_ids: list[str] = Field(default_factory=list, max_length=6)
    environment_ids: list[str] = Field(default_factory=list, max_length=8)
    look: dict = Field(default_factory=dict)      # character/setting/look/negative/grade/style
    grammar: dict = Field(default_factory=dict)   # language/aspect/quality/engine/duration


class ShowUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    character_ids: list[str] | None = None
    environment_ids: list[str] | None = None
    look: dict | None = None
    grammar: dict | None = None


def _resolve_show_assets(show: dict) -> dict:
    """Attach the show's live cast + rooms (fully resolved) for the board's
    right-hand pane — ids alone can't be rendered as cards."""
    cast = [c for c in (characters.get_character(cid) for cid in show["character_ids"]) if c]
    rooms = [e for e in (environments.get_environment(eid) for eid in show["environment_ids"]) if e]
    return {**show, "cast": cast, "rooms": rooms}


@app.get("/shows")
def list_shows_endpoint():
    return {"shows": [_resolve_show_assets(s) for s in shows.list_shows()]}


@app.get("/shows/{show_id}")
def get_show_endpoint(show_id: str):
    show = shows.get_show(show_id)
    if show is None:
        raise HTTPException(404, f"unknown show_id {show_id}")
    return _resolve_show_assets(show)


@app.post("/shows")
def create_show_endpoint(req: ShowCreateRequest):
    for cid in req.character_ids:
        if characters.get_character(cid) is None:
            raise HTTPException(404, f"unknown character_id {cid}")
    for eid in req.environment_ids:
        if environments.get_environment(eid) is None:
            raise HTTPException(404, f"unknown environment_id {eid}")
    show = shows.create_show(name=req.name, character_ids=req.character_ids,
                             environment_ids=req.environment_ids, look=req.look,
                             grammar=req.grammar)
    return _resolve_show_assets(show)


@app.patch("/shows/{show_id}")
def update_show_endpoint(show_id: str, req: ShowUpdateRequest):
    show = shows.get_show(show_id)
    if show is None:
        raise HTTPException(404, f"unknown show_id {show_id}")
    if show["status"] == "locked":
        raise HTTPException(409, "this show is LOCKED — fork a new version to edit "
                                 "(POST /shows/{id}/fork). Locked shows stay immutable "
                                 "so shipped episodes remain reproducible.")
    for cid in (req.character_ids or []):
        if characters.get_character(cid) is None:
            raise HTTPException(404, f"unknown character_id {cid}")
    for eid in (req.environment_ids or []):
        if environments.get_environment(eid) is None:
            raise HTTPException(404, f"unknown environment_id {eid}")
    # Editing a validated show drops it back to draft — the baselines no longer apply.
    patch = req.model_dump(exclude_none=True)
    if show["status"] == "validated":
        patch["status"] = "draft"
        patch["calibration"] = {}
    show = shows.update_show(show_id, **patch)
    return _resolve_show_assets(show)


@app.post("/shows/{show_id}/validate")
def validate_show_endpoint(show_id: str):
    """Mark a show validated (draft -> validated). The measured lock-time batch
    lands in `calibration` on pod day; today this is the manual gate."""
    show = shows.get_show(show_id)
    if show is None:
        raise HTTPException(404, f"unknown show_id {show_id}")
    if not show["character_ids"] and not show["environment_ids"]:
        raise HTTPException(422, "a show needs at least one character or room before validation")
    return _resolve_show_assets(shows.set_status(show_id, "validated"))


@app.post("/shows/{show_id}/lock")
def lock_show_endpoint(show_id: str):
    show = shows.get_show(show_id)
    if show is None:
        raise HTTPException(404, f"unknown show_id {show_id}")
    return _resolve_show_assets(shows.set_status(show_id, "locked"))


@app.post("/shows/{show_id}/fork")
def fork_show_endpoint(show_id: str):
    """Clone a show into a fresh draft v(n+1) so a locked show can be revised
    without breaking the episodes already rendered on it."""
    forked = shows.fork_version(show_id)
    if forked is None:
        raise HTTPException(404, f"unknown show_id {show_id}")
    return _resolve_show_assets(forked)


@app.delete("/shows/{show_id}")
def delete_show_endpoint(show_id: str):
    if not shows.delete_show(show_id):
        raise HTTPException(404, f"unknown show_id {show_id}")
    return {"ok": True}


# ---- Show automation: the brain drafts a template, starters, batch assets ----

class ShowDraftRequest(BaseModel):
    brief: str = Field(min_length=3, max_length=2000)
    language: str = "hi"


@app.post("/shows/draft")
def draft_show_endpoint(req: ShowDraftRequest):
    """ASYNC (Gemini, pod-free): turn a one-line show description into a full
    proposed template — cast + rooms + look + example episode ideas. Nothing is
    saved; the frontend shows editable cards, then calls /shows/instantiate on
    approval. Poll GET /jobs/{id} (field `draft`)."""
    job_id = _new_job("plan", "show draft")

    def run() -> None:
        try:
            _update(job_id, status="planning", progress=25, detail="designing the template")
            result = llm.draft_show(req.brief, language=req.language)
            _update(job_id, status="done", progress=100, detail="", draft=result)
        except llm.PlanError as e:
            _update(job_id, status="error", error=str(e))
        except Exception as e:
            traceback.print_exc()
            _update(job_id, status="error", error=f"draft error ({type(e).__name__}): {e}")

    threading.Thread(target=run, daemon=True).start()
    return {"job_id": job_id}


# NOTE: distinct path (not /shows/starters) so it can't be swallowed by the
# /shows/{show_id} route matcher.
@app.get("/show-starters")
def list_starters_endpoint():
    """Generic archetype scaffolds — a head start, fully editable. Instantiating
    one is identical to a brain-drafted or hand-built show."""
    return {"starters": starters.STARTERS}


class ShowInstantiateRequest(BaseModel):
    """Create a whole show in one call from an approved draft/starter: the cast
    become characters, the rooms become environments, and the show ties them
    together as a draft. This is the 'approve' click — no per-asset round trips."""
    name: str = Field(min_length=1, max_length=80)
    cast: list[dict] = Field(default_factory=list, max_length=6)      # [{name, anchor, voice_id?}]
    rooms: list[dict] = Field(default_factory=list, max_length=8)     # [{name, anchor}]
    look: dict = Field(default_factory=dict)
    grammar: dict = Field(default_factory=dict)


@app.post("/shows/instantiate")
def instantiate_show_endpoint(req: ShowInstantiateRequest):
    char_ids: list[str] = []
    for c in req.cast:
        name, anchor = str(c.get("name", "")).strip(), str(c.get("anchor", "")).strip()
        if not name or len(anchor) < 10:
            continue  # skip incomplete cards rather than fail the whole show
        ch = characters.create_character(name=name, anchor=anchor,
                                         voice_id=(c.get("voice_id") or None))
        char_ids.append(ch["id"])
    env_ids: list[str] = []
    for r in req.rooms:
        name, anchor = str(r.get("name", "")).strip(), str(r.get("anchor", "")).strip()
        if not name or len(anchor) < 10:
            continue
        en = environments.create_environment(name=name, anchor=anchor)
        env_ids.append(en["id"])
    show = shows.create_show(name=req.name, character_ids=char_ids,
                             environment_ids=env_ids, look=req.look, grammar=req.grammar)
    return _resolve_show_assets(show)


@app.post("/shows/{show_id}/generate-assets")
def generate_show_assets_endpoint(show_id: str):
    """ONE-CLICK batch: render every MISSING cast face and room plate for a show,
    in sequence, on the pod. Returns a job_id whose progress narrates each asset;
    the characters/environments are updated as each finishes. NEEDS THE POD."""
    show = shows.get_show(show_id)
    if show is None:
        raise HTTPException(404, f"unknown show_id {show_id}")
    cast = [c for c in (characters.get_character(cid) for cid in show["character_ids"]) if c]
    rooms = [e for e in (environments.get_environment(eid) for eid in show["environment_ids"]) if e]
    todo_faces = [c for c in cast if not c["face_image"]]
    todo_plates = [r for r in rooms if not r["primary_plate"]]
    if not todo_faces and not todo_plates:
        raise HTTPException(422, "every cast face and room plate already exists")
    job_id = _new_job("generate", f"assets-{show['name']}")
    total = len(todo_faces) + len(todo_plates)

    def run() -> None:
        def on_submit(prompt_id: str) -> None:
            if job_id in JOBS:
                JOBS[job_id]["prompt_id"] = prompt_id
        done = 0
        try:
            for c in todo_faces:
                if JOBS.get(job_id, {}).get("status") == "cancelled":
                    raise JobCancelled()
                _update(job_id, status="generating", progress=int(10 + 80 * done / total),
                        detail=f"portrait: {c['name']}")
                seed = (int(uuid.uuid4().hex[:6], 16) % 900000) + 1
                characters.IMAGES_DIR.mkdir(parents=True, exist_ok=True)
                png = pipeline.generate_face(c["anchor"], seed=seed,
                                             out_stem=f"char-{c['id']}", on_submit=on_submit)
                dest = characters.IMAGES_DIR / Path(png).name
                Path(png).replace(dest)
                characters.update_character(c["id"], face_image=str(dest))
                done += 1
            for r in todo_plates:
                if JOBS.get(job_id, {}).get("status") == "cancelled":
                    raise JobCancelled()
                _update(job_id, status="generating", progress=int(10 + 80 * done / total),
                        detail=f"room plate: {r['name']}")
                seed = (int(uuid.uuid4().hex[:6], 16) % 900000) + 1
                environments.IMAGES_DIR.mkdir(parents=True, exist_ok=True)
                png = pipeline.generate_scene(
                    f"{r['anchor']}. wide establishing shot of the empty room, no people",
                    seed=seed, out_stem=f"env-{r['id']}-wide", on_submit=on_submit)
                dest = environments.IMAGES_DIR / Path(png).name
                Path(png).replace(dest)
                environments.update_environment(r["id"], plate_wide=str(dest))
                done += 1
            _update(job_id, status="done", progress=100, detail=f"{done} assets ready")
        except JobCancelled:
            pass
        except Exception as e:
            _update(job_id, status="error", error=f"{type(e).__name__}: {e}")

    threading.Thread(target=run, daemon=True).start()
    return {"job_id": job_id, "faces": len(todo_faces), "plates": len(todo_plates)}


# ---- Episodes ----

class EpisodeCreateRequest(BaseModel):
    show_id: str
    title: str = Field(default="", max_length=120)
    script: str = Field(default="", max_length=12000)
    language: str = "hi"


class EpisodeUpdateRequest(BaseModel):
    title: str | None = Field(default=None, max_length=120)
    script: str | None = Field(default=None, max_length=12000)
    language: str | None = None
    beats: list[dict] | None = None
    status: str | None = None
    outputs: dict | None = None  # e.g. swap in a trimmed final after an inline Fix-timing


class EpisodePlanRequest(BaseModel):
    script: str | None = Field(default=None, max_length=12000)  # override the stored script


@app.get("/episodes")
def list_episodes_endpoint(show_id: str | None = None):
    return {"episodes": episodes.list_episodes(show_id)}


@app.get("/episodes/{ep_id}")
def get_episode_endpoint(ep_id: str):
    ep = episodes.get_episode(ep_id)
    if ep is None:
        raise HTTPException(404, f"unknown episode_id {ep_id}")
    return ep


@app.post("/episodes")
def create_episode_endpoint(req: EpisodeCreateRequest):
    if shows.get_show(req.show_id) is None:
        raise HTTPException(404, f"unknown show_id {req.show_id}")
    return episodes.create_episode(show_id=req.show_id, title=req.title,
                                   script=req.script, language=req.language)


@app.patch("/episodes/{ep_id}")
def update_episode_endpoint(ep_id: str, req: EpisodeUpdateRequest):
    if episodes.get_episode(ep_id) is None:
        raise HTTPException(404, f"unknown episode_id {ep_id}")
    return episodes.update_episode(ep_id, **req.model_dump(exclude_none=True))


@app.delete("/episodes/{ep_id}")
def delete_episode_endpoint(ep_id: str):
    if not episodes.delete_episode(ep_id):
        raise HTTPException(404, f"unknown episode_id {ep_id}")
    return {"ok": True}


@app.post("/episodes/{ep_id}/plan")
def plan_episode_endpoint(ep_id: str, req: EpisodePlanRequest):
    """ASYNC: split the episode's script into typed beats for its Show's cast/rooms.
    Pod-free (Gemini only). Returns a job_id; poll GET /jobs/{id} (field `beats`).
    The stored episode is updated with the beats + status=planned when done."""
    ep = episodes.get_episode(ep_id)
    if ep is None:
        raise HTTPException(404, f"unknown episode_id {ep_id}")
    show = shows.get_show(ep["show_id"])
    if show is None:
        raise HTTPException(404, f"episode's show {ep['show_id']} is gone")
    script = (req.script if req.script is not None else ep["script"]) or ""
    if not script.strip():
        raise HTTPException(422, "this episode has no script to plan")
    cast = [{"name": c["name"], "anchor": c["anchor"]}
            for c in (characters.get_character(cid) for cid in show["character_ids"]) if c]
    rooms = [{"name": e["name"], "anchor": e["anchor"]}
             for e in (environments.get_environment(eid) for eid in show["environment_ids"]) if e]
    style = (show.get("look") or {}).get("style", "")
    job_id = _new_job("plan", f"episode {ep['number']} beats")

    def run() -> None:
        try:
            _update(job_id, status="planning", progress=25, detail="breaking the script into beats")
            result = llm.plan_episode(script, cast, rooms, language=ep["language"], style=style)
            episodes.update_episode(ep_id, script=script, beats=result["beats"], status="planned")
            _update(job_id, status="done", progress=100, detail="", beats=result["beats"],
                    spoken_s=result["spoken_s"])
        except llm.PlanError as e:
            _update(job_id, status="error", error=str(e))
        except Exception as e:
            traceback.print_exc()
            _update(job_id, status="error", error=f"episode planner error ({type(e).__name__}): {e}")

    threading.Thread(target=run, daemon=True).start()
    return {"job_id": job_id}


class EpisodeWriteRequest(BaseModel):
    idea: str = Field(min_length=3, max_length=2000)  # one-line episode idea


@app.post("/episodes/{ep_id}/write")
def write_episode_endpoint(ep_id: str, req: EpisodeWriteRequest):
    """PROMPT-ONLY: the brain AUTHORS the whole episode (dialogue + beats) from a
    one-line idea, using the Show's locked cast/rooms/look — no pre-written script
    needed. ASYNC (Gemini). Returns a job_id; poll GET /jobs/{id} (fields `beats`,
    `script`). The stored episode gets the written script + beats + status=planned.
    The user reviews/edits the beats, then renders — the confirm gate stays in the UI."""
    ep = episodes.get_episode(ep_id)
    if ep is None:
        raise HTTPException(404, f"unknown episode_id {ep_id}")
    show = shows.get_show(ep["show_id"])
    if show is None:
        raise HTTPException(404, f"episode's show {ep['show_id']} is gone")
    cast = [{"name": c["name"], "anchor": c["anchor"]}
            for c in (characters.get_character(cid) for cid in show["character_ids"]) if c]
    rooms = [{"name": e["name"], "anchor": e["anchor"]}
             for e in (environments.get_environment(eid) for eid in show["environment_ids"]) if e]
    style = (show.get("look") or {}).get("style", "")
    job_id = _new_job("plan", f"write episode {ep['number']}")

    def run() -> None:
        try:
            _update(job_id, status="planning", progress=25, detail="writing the episode")
            result = llm.write_episode(req.idea, cast, rooms,
                                       language=ep["language"], style=style)
            episodes.update_episode(ep_id, script=result["script"],
                                    beats=result["beats"], status="planned")
            _update(job_id, status="done", progress=100, detail="",
                    beats=result["beats"], script=result["script"],
                    spoken_s=result["spoken_s"])
        except llm.PlanError as e:
            _update(job_id, status="error", error=str(e))
        except Exception as e:
            traceback.print_exc()
            _update(job_id, status="error", error=f"episode writer error ({type(e).__name__}): {e}")

    threading.Thread(target=run, daemon=True).start()
    return {"job_id": job_id}


def _slug(text: str, fallback: str) -> str:
    import re as _re
    s = _re.sub(r"[^a-zA-Z0-9._-]+", "-", (text or "").strip()).strip("-")
    return s[:40] or fallback


def _beat_prompt(beat: dict, speaker: dict | None, room: dict | None, look: dict) -> str:
    """Assemble one beat's shot prompt from the FROZEN template constants —
    the speaker's verbatim anchor, the room's verbatim anchor, the beat's own
    action/camera, and the show's look/grade/style. Verbatim repetition of the
    anchors is the same-actor / same-room consistency mechanism (inject_cast
    doctrine), now sourced from the locked Show instead of retyped per ad."""
    parts: list[str] = []
    if speaker and speaker.get("anchor"):
        parts.append(f"Featuring {speaker['anchor']}.")
    if room and room.get("anchor"):
        parts.append(room["anchor"])
    if beat.get("action"):
        parts.append(beat["action"])
    cam = beat.get("camera")
    if cam:
        parts.append(f"{cam} shot")
    if look.get("style"):
        parts.append(look["style"])
    if look.get("look_block"):
        parts.append(look["look_block"])
    if look.get("grade"):
        parts.append(look["grade"])
    return " ".join(p.strip().rstrip(".") + "." for p in parts if p and p.strip())


# Per-show write lock for keyframe_bank: approve (request threadpool), compose and
# reroll (daemon workers) all read-modify-write the same JSON column. Every writer
# takes this lock around ONLY the read+write (GPU work stays outside), so a
# concurrent approval can never be reverted by a worker's snapshot.
_KF_LOCKS: dict[str, threading.Lock] = {}
_KF_LOCKS_GUARD = threading.Lock()


def _kf_lock(show_id: str) -> threading.Lock:
    with _KF_LOCKS_GUARD:
        return _KF_LOCKS.setdefault(show_id, threading.Lock())


def _kf_seed(show_id: str, character_id: str, environment_id: str, reroll: int = 0) -> int:
    """Deterministic keyframe seed per (show, character, room[, reroll]). The SAME
    pair always composes with the SAME seed (reproducible re-composition), and this
    seed is then PINNED on every beat that animates the approved still — identity is
    a property of a frozen asset, not a per-take dice roll. Rerolls bump by a fixed
    prime so 'give me a different take' is itself reproducible."""
    h = hashlib.sha1(f"{show_id}|{character_id}|{environment_id}".encode()).hexdigest()
    return (int(h, 16) + reroll * 7919) % (2**31 - 1) + 1


def _lookup_keyframe(show: dict, character_id: str, environment_id: str) -> dict | None:
    """The APPROVED character-in-room composite for this pair, or None. Returns the
    bank entry ({image, seed, ...}) so the compiler can pin both the still AND its
    seed on every beat. Entries composed before the approval gate carry no
    'approved' key — those are backfill-approved as-is (frozen), so live shows keep
    rendering; entries composed after the gate need an explicit sign-off."""
    for kf in show.get("keyframe_bank") or []:
        if (kf.get("character_id") == character_id
                and kf.get("environment_id") == environment_id):
            p = kf.get("image")
            if p and Path(p).exists() and kf.get("approved", True):
                return kf
    return None


def _keyframe_pair(show: dict, character_id: str, environment_id: str) -> dict | None:
    """Any bank entry for the pair (approved or not) whose file exists — the
    approval UI and the render gate need to distinguish 'missing' from 'awaiting
    approval'."""
    for kf in show.get("keyframe_bank") or []:
        if (kf.get("character_id") == character_id
                and kf.get("environment_id") == environment_id):
            p = kf.get("image")
            if p and Path(p).exists():
                return kf
    return None


def _compose_show_keyframes(show_id: str, style: str | None = None,
                            on_progress=None, on_submit=None) -> list[dict]:
    """Composite each cast character (with a face) INTO each room (with a plate) via
    Qwen-Edit and cache the results in the show's keyframe_bank as CANDIDATES
    (approved=False) — a human signs them off via /shows/{id}/keyframes/approve
    before any episode may render against them. Each pair composes with its
    deterministic seed (stored on the entry) so identity is reproducible.
    Idempotent: existing (character, room) entries are kept, only missing pairs
    are composed."""
    show = shows.get_show(show_id)
    if show is None:
        raise ValueError(f"unknown show_id {show_id}")
    style = style or (show.get("look") or {}).get("art_style") or "realistic"
    chars = [c for c in (characters.get_character(cid) for cid in show["character_ids"])
             if c and c.get("face_image")]
    rooms = [e for e in (environments.get_environment(eid) for eid in show["environment_ids"])
             if e and e.get("primary_plate")]
    bank = list(show.get("keyframe_bank") or [])
    # Skip-set counts only entries whose FILE still exists — a manually deleted PNG
    # must be re-composable, or compose would skip the pair forever while the
    # approved-lookup keeps rejecting it (a permanent un-renderable gap).
    have = {(k.get("character_id"), k.get("environment_id")) for k in bank
            if k.get("image") and Path(k["image"]).exists()}
    pairs = [(c, r) for r in rooms for c in chars if (c["id"], r["id"]) not in have]
    for i, (c, r) in enumerate(pairs):
        if on_progress:
            on_progress("keyframes", 5 + int(85 * i / max(1, len(pairs))),
                        f"composing {c['name']} in {r['name']} ({i + 1}/{len(pairs)})")
        seed = _kf_seed(show_id, c["id"], r["id"])
        out = str(keyframes.KEYFRAMES_DIR / f"show-{show_id}-{c['id']}-{r['id']}.png")
        img = keyframes.composite_into_scene(
            c["face_image"], r["primary_plate"], out, style=style, seed=seed,
            on_submit=on_submit)
        # Serialized upsert: re-read the live bank UNDER the per-show lock and patch
        # only this pair — each compose is ~a minute of GPU and an approval made
        # meanwhile must never be clobbered by a stale snapshot.
        with _kf_lock(show_id):
            live = shows.get_show(show_id) or {}
            bank = [k for k in (live.get("keyframe_bank") or [])
                    if not (k.get("character_id") == c["id"]
                            and k.get("environment_id") == r["id"])]
            bank.append({"character_id": c["id"], "environment_id": r["id"],
                         "character": c["name"], "environment": r["name"],
                         "image": img, "style": style, "seed": seed,
                         "approved": False, "reroll": 0})
            shows.update_show(show_id, keyframe_bank=bank)  # persist incrementally
    return bank


def _compile_episode_segments(show: dict, ep: dict) -> list[dict]:
    """Turn approved beats into sequence segments the existing pipeline renders.

    Identity-locked routing (nextplan Phase 1):
      * a SPEAK beat whose character has a saved face -> lipsync, animating the
        APPROVED character-in-room keyframe with its PINNED seed (identity_lock);
        bare face only when no keyframe exists (roomless shows — background drifts).
        Single-character framing by construction: the speaker's own keyframe holds
        exactly one person, so only the speaker's mouth can move.
      * a NON-speak beat featuring a character with an approved keyframe -> the
        i2v-from-still lane (sequence `product` + I2V_PRESERVE): the approved still
        is animated near pixel-lock instead of re-imagined by t2v.
      * any other beat in a room WITH a plate -> cinematic brand-lock;
      * otherwise -> cinematic from the assembled prompt.
    Verbatim `line` becomes the segment script; the frozen negative rides along.
    """
    look = show.get("look") or {}
    negative = look.get("negative") or None
    by_name_char = {c["name"]: c for c in
                    (characters.get_character(cid) for cid in show["character_ids"]) if c}
    by_name_room = {e["name"]: e for e in
                    (environments.get_environment(eid) for eid in show["environment_ids"]) if e}
    segments: list[dict] = []
    for beat in ep.get("beats") or []:
        speaker = by_name_char.get(beat.get("speaker") or "")
        room = by_name_room.get(beat.get("room") or "")
        prompt = _beat_prompt(beat, speaker, room, look) or "cinematic advertisement shot."
        line = (beat.get("line") or "").strip() or None
        kf = (_lookup_keyframe(show, speaker["id"], room["id"])
              if speaker and room else None)
        if beat.get("type") == "speak" and speaker and speaker.get("face_image"):
            seg = {"pipeline": "lipsync", "prompt": prompt, "negative_prompt": negative,
                   "script": line or "", "image": (kf or {}).get("image") or speaker["face_image"],
                   "voice_id": speaker.get("voice_id"),
                   "seed": (kf or {}).get("seed"), "identity_lock": bool(kf)}
        elif speaker and kf:
            # Featured character, no dialogue: animate the approved still directly
            # (motion-only) — the identity CANNOT drift because the pixels are the
            # approved keyframe, not a fresh generation.
            seg = {"pipeline": "product", "prompt": prompt, "negative_prompt": negative,
                   "script": line, "image": kf["image"],
                   "voice_id": speaker.get("voice_id"),
                   "seed": kf.get("seed"), "identity_lock": True}
        elif room and room.get("primary_plate"):
            seg = {"pipeline": "cinematic", "prompt": prompt, "negative_prompt": negative,
                   "script": line, "image": room["primary_plate"],
                   "image_description": room["anchor"],
                   "voice_id": speaker.get("voice_id") if speaker else None}
        else:
            seg = {"pipeline": "cinematic", "prompt": prompt, "negative_prompt": negative,
                   "script": line,
                   "voice_id": speaker.get("voice_id") if speaker else None}
        segments.append(seg)
    return segments


def _episode_voice_gaps(show: dict, ep: dict) -> list[str]:
    """Speaking characters with no assigned voice. A spoken beat for such a
    character would raise inside synthesize_voice AFTER the GPU spend — reject the
    render up front instead. Returns the character names (or beat labels) to fix."""
    chars = {c["name"]: c for c in
             (characters.get_character(cid) for cid in show["character_ids"]) if c}
    gaps: set[str] = set()
    for n, b in enumerate(ep.get("beats") or [], 1):
        if b.get("type") != "speak" or not (b.get("line") or "").strip():
            continue
        ch = chars.get(b.get("speaker") or "")
        if not ch or not ch.get("voice_id"):
            gaps.add(b.get("speaker") or f"beat {n}")
    return sorted(gaps)


def _watch_episode_render(ep_id: str, job_id: str) -> None:
    """Bridge the in-memory JOB to the durable episode row. The rendered final +
    sync report live only on the JOBS dict (gone on restart); when the render
    reaches a terminal state, copy them into episodes.outputs so the episode has a
    durable video path + a dead-air receipt. Runs in a daemon thread."""
    def watch() -> None:
        while True:
            job = JOBS.get(job_id)
            if job and job.get("status") in TERMINAL_STATES:
                break
            time.sleep(2)
        job = JOBS.get(job_id) or {}
        ep = episodes.get_episode(ep_id)
        if ep is None:
            return
        base = {**(ep.get("outputs") or {}), "job_id": job_id}
        if job.get("status") == "done" and job.get("video_path"):
            episodes.update_episode(
                ep_id, status="done",
                outputs={**base, "final": job["video_path"],
                         "report": job.get("sync") or {},
                         "warnings": job.get("warnings") or []},
                adherence=job.get("sync") or {})
        else:
            episodes.update_episode(
                ep_id, status="error",
                outputs={**base, "error": job.get("error") or "render did not finish"})
    threading.Thread(target=watch, daemon=True).start()


@app.post("/shows/{show_id}/compose-keyframes")
def compose_show_keyframes_endpoint(show_id: str):
    """Composite each cast member INTO each room plate (Qwen-Edit) and cache them in
    keyframe_bank — the background-lock references the episode lipsync lane animates,
    so the room stays identical across cuts and across episodes. NEEDS THE POD;
    requires faces + plates to already exist. Async — poll GET /jobs/{id}."""
    show = shows.get_show(show_id)
    if show is None:
        raise HTTPException(404, f"unknown show_id {show_id}")
    job_id = _new_job("generate", f"compose-{show['name']}")

    def run() -> None:
        def on_submit(prompt_id: str) -> None:
            if job_id in JOBS:
                JOBS[job_id]["prompt_id"] = prompt_id

        def on_progress(status: str, pct: int, detail: str) -> None:
            _update(job_id, status=status, progress=pct, detail=detail)
        try:
            bank = _compose_show_keyframes(show_id, on_progress=on_progress, on_submit=on_submit)
            _update(job_id, status="done", progress=100,
                    detail=f"{len(bank)} keyframe(s) cached", video_path=None)
        except Exception as e:
            _update(job_id, status="error", error=f"{type(e).__name__}: {e}")

    threading.Thread(target=run, daemon=True).start()
    return {"job_id": job_id, "show_id": show_id}


class KeyframeApproveRequest(BaseModel):
    """Sign off candidate keyframes. `all=True` approves every pending candidate in
    one click (the batch path — one review per SHOW, amortized across episodes);
    otherwise `pairs` names specific (character, room) entries."""
    pairs: list[dict] | None = None      # [{character_id, environment_id}]
    all: bool = False


@app.post("/shows/{show_id}/keyframes/approve")
def approve_keyframes_endpoint(show_id: str, req: KeyframeApproveRequest):
    """Flip candidate keyframes to approved — the human sign-off that freezes each
    still as the identity artifact of record. Sync + instant (no pod).

    Deliberately allowed on LOCKED shows: locking freezes the TEMPLATE (cast/rooms/
    look); the keyframe bank is a production asset that keeps evolving (compose has
    always written it on locked shows), so this is not routed through the
    immutability check in PATCH /shows/{id}."""
    show = shows.get_show(show_id)
    if show is None:
        raise HTTPException(404, f"unknown show_id {show_id}")
    wanted = {(p.get("character_id"), p.get("environment_id"))
              for p in (req.pairs or [])}
    if not req.all and not wanted:
        raise HTTPException(422, "pass `pairs` or `all: true`")
    with _kf_lock(show_id):
        live = shows.get_show(show_id) or {}
        bank = list(live.get("keyframe_bank") or [])
        n = 0
        for kf in bank:
            key = (kf.get("character_id"), kf.get("environment_id"))
            # Absent 'approved' = legacy backfill-approved (same default the render
            # gate and UI use) — only explicit approved:False entries are pending.
            if (req.all or key in wanted) and not kf.get("approved", True):
                kf["approved"] = True
                n += 1
        shows.update_show(show_id, keyframe_bank=bank)
    return {"ok": True, "approved": n,
            "pending": sum(1 for k in bank if not k.get("approved", True))}


class KeyframeRerollRequest(BaseModel):
    character_id: str
    environment_id: str


@app.post("/shows/{show_id}/keyframes/reroll")
def reroll_keyframe_endpoint(show_id: str, req: KeyframeRerollRequest):
    """Re-compose ONE candidate with the next deterministic seed (reroll+1) — a
    reproducible 'different take', not a dice roll. The new still replaces the old
    candidate and stays approved=False until signed off. NEEDS THE POD. Async."""
    show = shows.get_show(show_id)
    if show is None:
        raise HTTPException(404, f"unknown show_id {show_id}")
    ch = characters.get_character(req.character_id)
    env = environments.get_environment(req.environment_id)
    if not ch or not ch.get("face_image"):
        raise HTTPException(404, "character not found or has no face image")
    if not env or not env.get("primary_plate"):
        raise HTTPException(404, "room not found or has no plate")
    style = (show.get("look") or {}).get("art_style") or "realistic"
    job_id = _new_job("generate", f"reroll-{ch['name']}-{env['name']}")

    def run() -> None:
        def on_submit(prompt_id: str) -> None:
            if job_id in JOBS:
                JOBS[job_id]["prompt_id"] = prompt_id
        try:
            _update(job_id, status="keyframes", progress=20,
                    detail=f"re-composing {ch['name']} in {env['name']}")
            # Quick read just for the reroll counter (the seed bump input).
            pre = shows.get_show(show_id) or {}
            entry0 = next((k for k in (pre.get("keyframe_bank") or [])
                           if k.get("character_id") == req.character_id
                           and k.get("environment_id") == req.environment_id), None)
            nxt = (entry0.get("reroll", 0) + 1) if entry0 else 1
            seed = _kf_seed(show_id, req.character_id, req.environment_id, reroll=nxt)
            # Take-suffixed filename: never overwrite the previous still — an
            # in-flight render may be reading it, and the browser caches by URL.
            out = str(keyframes.KEYFRAMES_DIR /
                      f"show-{show_id}-{req.character_id}-{req.environment_id}-t{nxt}.png")
            img = keyframes.composite_into_scene(
                ch["face_image"], env["primary_plate"], out, style=style, seed=seed,
                on_submit=on_submit)
            # Serialized swap UNDER the per-show lock: compose takes ~a minute, so
            # re-read the live bank and patch only THIS pair — approvals made in the
            # meantime survive (read-modify-write race closed).
            with _kf_lock(show_id):
                live = shows.get_show(show_id) or {}
                bank = [k for k in (live.get("keyframe_bank") or [])
                        if not (k.get("character_id") == req.character_id
                                and k.get("environment_id") == req.environment_id)]
                bank.append({"character_id": req.character_id,
                             "environment_id": req.environment_id,
                             "character": ch["name"], "environment": env["name"],
                             "image": img, "style": style, "seed": seed,
                             "approved": False, "reroll": nxt})
                shows.update_show(show_id, keyframe_bank=bank)
            _update(job_id, status="done", progress=100, detail="new candidate ready",
                    image_url=f"/assets-files/keyframes/{Path(img).name}")
        except Exception as e:
            _update(job_id, status="error", error=f"{type(e).__name__}: {e}")

    threading.Thread(target=run, daemon=True).start()
    return {"job_id": job_id}


def _episode_keyframe_gaps(show: dict, ep: dict) -> list[str]:
    """Composable (speaker, room) pairs this episode NEEDS that lack an APPROVED
    keyframe — the identity gate. Only pairs that CAN be composed count (character
    has a face AND the room has a plate); a roomless speak beat has no set to lock,
    so it falls back to the bare face rather than blocking the render. Returns
    'Character in Room (status)' labels for the 422."""
    by_name_char = {c["name"]: c for c in
                    (characters.get_character(cid) for cid in show["character_ids"]) if c}
    by_name_room = {e["name"]: e for e in
                    (environments.get_environment(eid) for eid in show["environment_ids"]) if e}
    missing: dict[tuple[str, str], str] = {}
    for b in ep.get("beats") or []:
        sp = by_name_char.get(b.get("speaker") or "")
        rm = by_name_room.get(b.get("room") or "")
        if not sp or not sp.get("face_image") or not rm or not rm.get("primary_plate"):
            continue  # not composable — bare-face / plate fallbacks apply
        if _lookup_keyframe(show, sp["id"], rm["id"]):
            continue  # approved — good
        pending = _keyframe_pair(show, sp["id"], rm["id"]) is not None
        missing[(sp["id"], rm["id"])] = (
            f"{sp['name']} in {rm['name']}" + (" (awaiting approval)" if pending
                                               else " (not composed yet)"))
    return sorted(missing.values())


@app.post("/episodes/{ep_id}/render")
def render_episode_endpoint(ep_id: str):
    """Compile the episode's approved beats into a sequence render and fire it
    through the existing pipeline. NEEDS THE POD. Returns the render job_id;
    the frontend polls it and PATCHes the episode's output when done."""
    ep = episodes.get_episode(ep_id)
    if ep is None:
        raise HTTPException(404, f"unknown episode_id {ep_id}")
    if not ep.get("beats"):
        raise HTTPException(422, "plan this episode into beats before rendering "
                                 "(POST /episodes/{id}/plan)")
    show = shows.get_show(ep["show_id"])
    if show is None:
        raise HTTPException(404, f"episode's show {ep['show_id']} is gone")
    segments = _compile_episode_segments(show, ep)
    if not segments:
        raise HTTPException(422, "no renderable beats")
    # Fail fast BEFORE the pod spend: a speaking character with no voice would
    # crash mid-render in synthesize_voice.
    gaps = _episode_voice_gaps(show, ep)
    if gaps:
        raise HTTPException(422, "assign a voice to these speaking characters before "
                                 f"rendering (Show cast → pick a voice): {', '.join(gaps)}")
    # Identity gate (nextplan Phase 1): every composable character-in-room this
    # episode uses must have an APPROVED keyframe — no GPU spend on an unlocked
    # identity. Mirrors the voice gate above.
    kf_gaps = _episode_keyframe_gaps(show, ep)
    if kf_gaps:
        raise HTTPException(422, "lock the look first — these character-in-room stills "
                                 "need composing/approval (Show assets → Keyframes): "
                                 + "; ".join(kf_gaps))
    grammar = show.get("grammar") or {}
    look = show.get("look") or {}
    # Branded end frame (reference's closing social/CTA card) — only when the Show
    # carries a brand name; tagline/offer/logo are optional.
    end_card = None
    if look.get("brand"):
        end_card = {"brand": look["brand"], "tagline": look.get("tagline"),
                    "offer": look.get("offer"), "image": look.get("end_card_image")}
    name = f"ep{ep['number']}-{_slug(show['name'], show['id'])}"
    gen = GenerateRequest(
        mode="sequence", segments=[Segment(**s) for s in segments],
        language=ep["language"], name=name,
        quality=grammar.get("quality", "quality"),
        width=grammar.get("width"), height=grammar.get("height"),
        end_card=end_card,
        # Episodes keep the legacy audio fit — ads now hold the final frame when a
        # narration outruns its shot, but an episode's beats are timed to fixed takes.
        legacy_audio_fit=True,
    )
    result = generate_endpoint(gen)  # reuses all validation + cast/avatar resolution + sync
    job_id = result["job_id"]
    episodes.update_episode(ep_id, status="rendering",
                            outputs={**(ep.get("outputs") or {}), "job_id": job_id})
    # Persist the final + sync report back to the episode when the job finishes
    # (the JOBS dict is in-memory; the episode row must survive a restart).
    _watch_episode_render(ep_id, job_id)
    return {"job_id": job_id, "name": name, "segments": len(segments)}
