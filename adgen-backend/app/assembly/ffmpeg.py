"""FFmpeg assembly: stitch clips + overlay narration/music (proven commands, files 11/13).

Runs on the backend host (ffmpeg must be installed there — file 08). Helpers, matching
the audio strategy (file 04):
  - stitch()             concat clips (codec copy — clips from the same workflow share codec/res/fps)
  - stitch_and_overlay() silent video + narration on top (+ optional ducked music)  [AUDIO-AFTER]
  - stitch_plus_music()  video that already has audio (+ optional music bed)        [lipsync/LTX]
  - replace_audio()      swap a video's ENTIRE soundtrack for new narration (revoice/reassemble)
  - concat_reencode()    concat MIXED-SOURCE clips (sequence mode): re-encode video, give
                         silent clips a real silent track so audio streams line up

Gotcha (file 11): `-c copy` concat only works if all clips share codec/res/fps — true for
same-workflow clips; mixed sources go through concat_reencode() instead.
"""
import json
import subprocess
import tempfile
from pathlib import Path

# Narration starts 300ms in (proven value; `|300` covers a 2nd channel if the file is stereo).
# `apad` extends the narration with silence so a SHORT narration never truncates the video
# via -shortest (which caps everything at the video's length).
NARRATION_DELAY_FILTER = "[1:a]adelay=300|300,apad[narr]"
MUSIC_DUCK_VOLUME = 0.15


def _run(cmd: list[str]) -> None:
    """Run ffmpeg, surfacing stderr in the exception if it fails."""
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            f"ffmpeg failed (exit {proc.returncode}): {' '.join(cmd)}\n{proc.stderr[-2000:]}"
        )


def stitch(clips: list[str], out: str = "stitched.mp4") -> str:
    """Concat clips into one video (codec copy). Returns the output path."""
    if not clips:
        raise ValueError("stitch() needs at least one clip.")
    # concat demuxer needs a list file; use a temp file with absolute paths.
    with tempfile.NamedTemporaryFile(
        "w", suffix=".txt", delete=False, dir=str(Path(out).resolve().parent)
    ) as f:
        for c in clips:
            f.write(f"file '{Path(c).resolve()}'\n")
        list_path = f.name
    try:
        _run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_path,
              "-c", "copy", out])
    finally:
        Path(list_path).unlink(missing_ok=True)
    return out


def _stitched_path(out: str) -> str:
    """Intermediate stitched file, named after the final output (no collisions between jobs)."""
    p = Path(out).resolve()
    return str(p.with_name(p.stem + ".stitched.mp4"))


def stitch_and_overlay(
    clips: list[str],
    narration: str,
    music: str | None = None,
    out: str = "final.mp4",
) -> str:
    """Stitch silent clips and lay narration on top (+ optional ducked music). [AUDIO-AFTER]"""
    stitched = stitch(clips, out=_stitched_path(out))
    if music:
        fc = (f"{NARRATION_DELAY_FILTER};"
              f"[2:a]volume={MUSIC_DUCK_VOLUME}[bg];"
              f"[narr][bg]amix=inputs=2:duration=first[mix]")
        cmd = ["ffmpeg", "-y", "-i", stitched, "-i", narration, "-i", music,
               "-filter_complex", fc,
               "-map", "0:v", "-map", "[mix]", "-c:v", "copy", "-c:a", "aac",
               "-shortest", out]
    else:
        cmd = ["ffmpeg", "-y", "-i", stitched, "-i", narration,
               "-filter_complex", NARRATION_DELAY_FILTER,
               "-map", "0:v", "-map", "[narr]", "-c:v", "copy", "-c:a", "aac",
               "-shortest", out]
    _run(cmd)
    Path(stitched).unlink(missing_ok=True)  # drop the intermediate; keep output folders clean
    return out


def probe(path: str) -> dict:
    """Media facts via ffprobe: duration, has_audio, width/height/fps of the first
    video stream (0/None when absent)."""
    proc = subprocess.run(
        ["ffprobe", "-v", "error", "-show_format", "-show_streams",
         "-of", "json", path],
        capture_output=True, text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffprobe failed for {path}: {proc.stderr[-500:]}")
    info = json.loads(proc.stdout)
    width = height = 0
    fps = 0.0
    for s in info.get("streams", []):
        if s.get("codec_type") == "video":
            width = int(s.get("width") or 0)
            height = int(s.get("height") or 0)
            rate = s.get("avg_frame_rate") or "0/1"
            try:
                num, den = rate.split("/")
                fps = float(num) / float(den) if float(den) else 0.0
            except ValueError:
                fps = 0.0
            break
    return {
        "duration": float(info.get("format", {}).get("duration") or 0.0),
        "has_audio": any(s.get("codec_type") == "audio" for s in info.get("streams", [])),
        "width": width,
        "height": height,
        "fps": fps,
    }


def replace_audio(
    video: str,
    narration: str,
    music: str | None = None,
    out: str = "revoiced.mp4",
    narration_delay_ms: int = 300,
    narration_gain: float = 1.0,
    music_gain: float = MUSIC_DUCK_VOLUME,
) -> str:
    """Replace a video's ENTIRE soundtrack with narration (+ optional ducked music).

    Used by /revoice (edit the voice of an existing final) and /reassemble (lay a new
    narration over a re-stitched timeline). Video stream is copied untouched.
    """
    d = narration_delay_ms
    narr = f"[1:a]adelay={d}|{d},volume={narration_gain},apad[narr]"
    if music:
        fc = (f"{narr};[2:a]volume={music_gain}[bg];"
              f"[narr][bg]amix=inputs=2:duration=first[mix]")
        cmd = ["ffmpeg", "-y", "-i", video, "-i", narration, "-i", music,
               "-filter_complex", fc,
               "-map", "0:v", "-map", "[mix]", "-c:v", "copy", "-c:a", "aac",
               "-shortest", out]
    else:
        cmd = ["ffmpeg", "-y", "-i", video, "-i", narration,
               "-filter_complex", narr,
               "-map", "0:v", "-map", "[narr]", "-c:v", "copy", "-c:a", "aac",
               "-shortest", out]
    _run(cmd)
    return out


def concat_reencode(clips: list[str], out: str = "sequence.mp4") -> str:
    """Concat clips from MIXED workflows (sequence mode: t2v + i2v + S2V segments).

    Re-encodes video (mixed sources rarely share exact encoder params) and guarantees
    every segment contributes an audio track — silent clips get anullsrc for their
    duration so the concat filter's audio lane never breaks. All clips must share
    resolution and fps (sequence mode renders every segment at the job's WxH @16fps).
    """
    if not clips:
        raise ValueError("concat_reencode() needs at least one clip.")
    probed = [probe(c) for c in clips]

    # First clip is canon: every lane is scaled/padded/retimed to it, so a 9:16 raw
    # clip, a 1:1 clip and a 32fps enhanced file can share one timeline.
    canon_w = probed[0]["width"] or 640
    canon_h = probed[0]["height"] or 640
    canon_fps = probed[0]["fps"] or 16.0

    cmd: list[str] = ["ffmpeg", "-y"]
    for c in clips:
        cmd += ["-i", c]
    # Silent clips borrow audio from anullsrc inputs appended after the real ones.
    null_index: dict[int, int] = {}
    n_inputs = len(clips)
    for i, p in enumerate(probed):
        if not p["has_audio"]:
            cmd += ["-f", "lavfi", "-t", f"{max(p['duration'], 0.1):.3f}",
                    "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"]
            null_index[i] = n_inputs
            n_inputs += 1

    parts: list[str] = []
    lanes: list[str] = []
    for i in range(len(clips)):
        parts.append(
            f"[{i}:v]scale={canon_w}:{canon_h}:force_original_aspect_ratio=decrease,"
            f"pad={canon_w}:{canon_h}:(ow-iw)/2:(oh-ih)/2,fps={canon_fps:g},setsar=1[v{i}]"
        )
        a_src = f"[{null_index[i]}:a]" if i in null_index else f"[{i}:a]"
        parts.append(f"{a_src}aresample=44100,aformat=channel_layouts=stereo[a{i}]")
        lanes += [f"[v{i}]", f"[a{i}]"]
    fc = ";".join(parts) + f";{''.join(lanes)}concat=n={len(clips)}:v=1:a=1[v][a]"

    cmd += ["-filter_complex", fc, "-map", "[v]", "-map", "[a]",
            "-c:v", "libx264", "-crf", "18", "-preset", "veryfast",
            "-pix_fmt", "yuv420p", "-c:a", "aac", out]
    _run(cmd)
    return out


def stitch_plus_music(
    clips: list[str],
    music: str | None = None,
    out: str = "final.mp4",
) -> str:
    """Stitch clips whose video ALREADY has audio (S2V/MultiTalk/LTX); optionally mix a music bed."""
    stitched = stitch(clips, out=_stitched_path(out))
    if not music:
        return stitched
    fc = (f"[0:a]volume=1.0[v];[1:a]volume={MUSIC_DUCK_VOLUME}[bg];"
          f"[v][bg]amix=inputs=2:duration=first[mix]")
    cmd = ["ffmpeg", "-y", "-i", stitched, "-i", music,
           "-filter_complex", fc,
           "-map", "0:v", "-map", "[mix]", "-c:v", "copy", "-c:a", "aac",
           "-shortest", out]
    _run(cmd)
    Path(stitched).unlink(missing_ok=True)  # drop the intermediate; keep output folders clean
    return out
