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

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app import pipeline

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


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/generate")
def generate_endpoint(req: GenerateRequest):
    job_id = uuid.uuid4().hex[:12]
    JOBS[job_id] = {"status": "queued", "progress": 0, "detail": "",
                    "video_path": None, "error": None}

    def run() -> None:
        def on_progress(status: str, pct: int, detail: str) -> None:
            JOBS[job_id].update(status=status, progress=pct, detail=detail)
        try:
            final = pipeline.generate(req.model_dump(), workdir=f"jobs/{job_id}",
                                      on_progress=on_progress)
            JOBS[job_id].update(status="done", progress=100, detail="", video_path=final)
        except Exception as e:  # surface the real cause to the poller
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
