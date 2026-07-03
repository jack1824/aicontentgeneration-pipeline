"""Post-processing chain (docs file 03 — 'the biggest quality lever').

Runs on the pod via ComfyUI: CodeFormer face restore -> SeedVR2 temporally-consistent
upscale -> RIFE 2x frame interpolation, keeping the source video's audio. Applied to
EXISTING videos (non-destructive — writes a new *-post.mp4 next to the input).

Graph authored programmatically against the pod's own node schemas (workflows/postprocess.json).
"""
from pathlib import Path

from app.config import COMFY_POD_URLS
from app.providers import comfy

POSTPROCESS_MAPPING = {
    "video": ("1", "video"),                 # uploaded input video filename (pod-side)
    "fidelity": ("3", "codeformer_fidelity"),  # 0=max restoration, 1=max fidelity (docs 0.5-0.7)
    "upscale_input": ("6", "image"),         # link; ["1",0] skips CodeFormer (product clips)
    "resolution": ("6", "resolution"),       # SeedVR2 target short-side (864 = 2x of 432)
    "out_fps": ("8", "frame_rate"),          # source fps x RIFE multiplier (16x2 = 32)
    "multiplier": ("7", "multiplier"),       # RIFE interpolation factor
}

# These jobs chew through hundreds of frames + a one-time SeedVR2 model download.
POSTPROCESS_TIMEOUT = 3600.0


def postprocess_video(
    video_path: str,
    out_path: str | None = None,
    restore_face: bool = True,
    resolution: int = 864,
    source_fps: float = 16.0,
    multiplier: int = 2,
    fidelity: float = 0.6,
) -> str:
    """Run the full chain on a local video file. Returns the saved output path.

    restore_face=False bypasses CodeFormer (rewires SeedVR2 to the raw frames) —
    use for product/no-face clips where face detection is wasted work.
    """
    src = Path(video_path)
    if not src.exists():
        raise FileNotFoundError(f"postprocess input not found: {video_path}")
    if not COMFY_POD_URLS:
        raise RuntimeError("COMFY_POD_URLS is not set in .env — no pod to post-process on.")
    pod = COMFY_POD_URLS[0]

    pod_name = comfy.upload_file(pod, str(src))
    inputs = {
        "video": pod_name,
        "resolution": resolution,
        "out_fps": source_fps * multiplier,
        "multiplier": multiplier,
        "fidelity": fidelity,
    }
    if not restore_face:
        inputs["upscale_input"] = ["1", 0]   # skip CodeFormer entirely

    wf = comfy.load_workflow("postprocess")
    out_path = out_path or str(src.with_name(src.stem + "-post.mp4"))
    return comfy.comfy_generate(
        pod, wf, inputs, POSTPROCESS_MAPPING,
        out_path=out_path, timeout=POSTPROCESS_TIMEOUT,
    )
