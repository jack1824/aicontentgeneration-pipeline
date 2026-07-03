"""FastAPI entry — the orchestrator API (file 05).

Endpoints wired so far:
    GET  /health            liveness
    POST /generate          start a job (background thread) -> {job_id}
    GET  /jobs/{id}         status: queued|tts|generating|assembling|done|error (+progress/detail)
    GET  /jobs/{id}/video   download the finished mp4

Jobs are held in memory (fine for 3-4 users / dev); the DB arrives in Phase 3.
Run:  ./.venv/bin/uvicorn app.main:app --port 8000
"""
import threading
import uuid
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app import pipeline, postprocess
from app.providers import llm

app = FastAPI(title="adgen orchestrator")

JOBS: dict[str, dict] = {}


class Shot(BaseModel):
    prompt: str                          # Wan 2.2 positive box
    negative_prompt: str | None = None   # Wan 2.2 negative box


class GenerateRequest(BaseModel):
    mode: str = "overlay"
    shots: list[Shot] = Field(min_length=1)
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
    job_id = uuid.uuid4().hex[:12]
    JOBS[job_id] = {"status": "queued", "progress": 0, "detail": "",
                    "video_path": None, "error": None}

    def run() -> None:
        def on_progress(status: str, pct: int, detail: str) -> None:
            JOBS[job_id].update(status=status, progress=pct, detail=detail)
        try:
            final = pipeline.generate(req.model_dump(), name=req.name or job_id,
                                      on_progress=on_progress)
            JOBS[job_id].update(status="done", progress=100, detail="", video_path=final)
        except Exception as e:  # surface the real cause to the poller
            JOBS[job_id].update(status="error", error=f"{type(e).__name__}: {e}")

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
    job_id = uuid.uuid4().hex[:12]
    JOBS[job_id] = {"status": "queued", "progress": 0, "detail": "",
                    "video_path": None, "error": None}

    def run() -> None:
        try:
            JOBS[job_id].update(status="postprocess", progress=10,
                                detail="CodeFormer -> SeedVR2 -> RIFE")
            out = postprocess.postprocess_video(
                req.video_path, restore_face=req.restore_face,
                resolution=req.resolution, source_fps=req.source_fps,
                multiplier=req.multiplier, fidelity=req.fidelity,
            )
            JOBS[job_id].update(status="done", progress=100, detail="", video_path=out)
        except Exception as e:
            JOBS[job_id].update(status="error", error=f"{type(e).__name__}: {e}")

    threading.Thread(target=run, daemon=True).start()
    return {"job_id": job_id}


@app.get("/jobs/{job_id}")
def job_status(job_id: str):
    job = JOBS.get(job_id)
    if job is None:
        raise HTTPException(404, f"unknown job_id {job_id}")
    return job


@app.get("/jobs/{job_id}/video")
def job_video(job_id: str):
    job = JOBS.get(job_id)
    if job is None:
        raise HTTPException(404, f"unknown job_id {job_id}")
    if job["status"] != "done" or not job["video_path"]:
        raise HTTPException(409, f"job is '{job['status']}', video not ready")
    return FileResponse(job["video_path"], media_type="video/mp4",
                        filename=f"adgen_{job_id}.mp4")
