"""Post-processing chain (docs file 03 — 'the biggest quality lever').

Runs on the pod via ComfyUI: CodeFormer face restore -> SeedVR2 temporally-consistent
upscale -> RIFE 2x frame interpolation, keeping the source video's audio. Applied to
EXISTING videos (non-destructive — writes a new *-post.mp4 next to the input).

LONG videos are enhanced in CHUNKS: one SeedVR2 job on 1300+ frames OOM-killed
the pod (the 28s farmer master), so anything past ~15s splits into ~10s pieces,
each runs the chain alone, and the pieces re-join with the ORIGINAL audio laid
back over the whole thing (chunk boundaries would otherwise click).

Graph authored programmatically against the pod's own node schemas (workflows/postprocess.json).
"""
import subprocess
import tempfile
from pathlib import Path

from app.assembly import ffmpeg
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


# Past this, one pod job risks the container RAM limit — split into chunks.
CHUNK_THRESHOLD_S = 15.0
CHUNK_SECONDS = 10.0


def _run_chain(pod: str, src: Path, out_path: str, restore_face: bool,
               resolution: int, source_fps: float, multiplier: int,
               fidelity: float, on_submit=None) -> str:
    """One pod pass of CodeFormer -> SeedVR2 -> RIFE on a single (short) file."""
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
    return comfy.comfy_generate(
        pod, wf, inputs, POSTPROCESS_MAPPING,
        out_path=out_path, timeout=POSTPROCESS_TIMEOUT, on_submit=on_submit,
    )


def postprocess_video(
    video_path: str,
    out_path: str | None = None,
    restore_face: bool = True,
    resolution: int = 864,
    source_fps: float = 16.0,
    multiplier: int = 2,
    fidelity: float = 0.6,
    on_submit=None,
) -> str:
    """Run the full chain on a local video file. Returns the saved output path.

    restore_face=False bypasses CodeFormer (rewires SeedVR2 to the raw frames) —
    use for product/no-face clips where face detection is wasted work.
    Videos longer than ~15s run the chain per ~10s chunk, then re-join with the
    original soundtrack laid back over the full length.
    """
    src = Path(video_path)
    if not src.exists():
        raise FileNotFoundError(f"postprocess input not found: {video_path}")
    if not COMFY_POD_URLS:
        raise RuntimeError("COMFY_POD_URLS is not set in .env — no pod to post-process on.")
    pod = COMFY_POD_URLS[0]
    out_path = out_path or str(src.with_name(src.stem + "-post.mp4"))

    duration = ffmpeg.probe(str(src))["duration"]
    if duration <= CHUNK_THRESHOLD_S:
        result = _run_chain(pod, src, out_path, restore_face, resolution,
                            source_fps, multiplier, fidelity, on_submit)
    else:
        n = max(2, int(duration // CHUNK_SECONDS) + (1 if duration % CHUNK_SECONDS > 0.5 else 0))
        span = duration / n
        with tempfile.TemporaryDirectory(dir=str(src.parent)) as tmp:
            enhanced: list[str] = []
            for i in range(n):
                piece = Path(tmp) / f"c{i}.mp4"
                # precise re-encode cut (stream-copy would snap to keyframes)
                subprocess.run(
                    ["ffmpeg", "-y", "-loglevel", "error",
                     "-ss", f"{i * span:.3f}", "-i", str(src), "-t", f"{span:.3f}",
                     "-c:v", "libx264", "-crf", "16", "-preset", "fast",
                     "-c:a", "aac", str(piece)],
                    check=True,
                )
                enhanced.append(_run_chain(
                    pod, piece, str(Path(tmp) / f"c{i}-post.mp4"), restore_face,
                    resolution, source_fps, multiplier, fidelity, on_submit))
            joined = ffmpeg.concat_reencode(enhanced, out=str(Path(tmp) / "joined.mp4"))
            # Chunk seams can click — the ORIGINAL soundtrack goes back on whole.
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", joined, "-i", str(src),
                 "-map", "0:v", "-map", "1:a?", "-c:v", "copy", "-c:a", "aac",
                 "-shortest", out_path],
                check=True,
            )
            result = out_path

    # Voice-lock survives enhancement: a lip-synced final stays lip-synced in its
    # -post copy, so /revoice must keep refusing it.
    sidecar = src.with_suffix(".meta.json")
    if sidecar.exists():
        Path(result).with_suffix(".meta.json").write_text(sidecar.read_text())
    return result
