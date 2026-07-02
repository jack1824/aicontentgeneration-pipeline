"""The generate() flow + mode switch (file 05). Only mode="overlay" is wired so far.

overlay = silent Wan t2v clips + optional narration laid on top (AUDIO-AFTER, file 04).
Other modes (lipsync / cinematic / product / multitalk) raise until their chunks are built.
Clips are generated SEQUENTIALLY on the first pod for now — parallel fan-out is a later chunk.
"""
from pathlib import Path

from app.assembly import ffmpeg
from app.config import COMFY_POD_URLS
from app.providers import comfy
from app.providers.tts import synthesize_voice
from app.workflow_mappings import WAN_T2V_MAPPING

DEFAULT_BASE_SEED = 1000


def generate(req: dict, workdir: str, on_progress=None) -> str:
    """Run one generation job end to end. Returns the final video path.

    req (validated upstream by the API layer):
        mode: "overlay" (only mode wired so far)
        shots: [{prompt, negative_prompt?}, ...]   # user-supplied, both Wan 2.2 boxes
        script: str | None    # narration text; None -> plain stitch, no overlay
        language: "hi" | "en"
        seed: int | None      # base seed; shot i uses seed + i (reproducible)
        music: str | None     # optional music file path

    on_progress(status, progress_pct, detail) is called at each stage transition.
    """
    def report(status: str, pct: int, detail: str = "") -> None:
        if on_progress:
            on_progress(status, pct, detail)

    mode = req["mode"]
    if mode != "overlay":
        raise NotImplementedError(
            f"mode='{mode}' is not built yet — only 'overlay' (Phase 1, Step 4). "
            f"lipsync/cinematic/product/multitalk arrive in later chunks."
        )
    if not COMFY_POD_URLS:
        raise RuntimeError("COMFY_POD_URLS is not set in .env — no pod to generate on.")

    wd = Path(workdir)
    wd.mkdir(parents=True, exist_ok=True)
    pod = COMFY_POD_URLS[0]

    # 1. TTS (skipped when no script — then the result is a plain stitch)
    narration = None
    if req.get("script"):
        report("tts", 5, "synthesizing narration")
        narration = synthesize_voice(
            req["script"],
            language=req.get("language", "hi"),
            output_path=str(wd / "narration.mp3"),
        )

    # 2. GENERATE — sequential clips on one pod (parallel fan-out = later chunk)
    wf = comfy.load_workflow("wan_t2v")
    shots = req["shots"]
    base_seed = req.get("seed") or DEFAULT_BASE_SEED
    clips: list[str] = []
    for i, shot in enumerate(shots):
        pct = 10 + int(75 * i / len(shots))
        report("generating", pct, f"clip {i + 1}/{len(shots)} (several min each)")
        inputs = {"prompt": shot["prompt"], "seed": base_seed + i}
        if shot.get("negative_prompt"):
            inputs["negative_prompt"] = shot["negative_prompt"]
        clips.append(
            comfy.comfy_generate(
                pod, wf, inputs, WAN_T2V_MAPPING, out_path=str(wd / f"clip_{i}.mp4")
            )
        )

    # 3. ASSEMBLE (FFmpeg on this host)
    report("assembling", 90, "stitch + overlay")
    final = str(wd / "final.mp4")
    if narration:
        final = ffmpeg.stitch_and_overlay(clips, narration, music=req.get("music"), out=final)
    else:
        final = ffmpeg.stitch(clips, out=final)  # silent clips, no narration -> plain stitch

    report("done", 100, "")
    return final
