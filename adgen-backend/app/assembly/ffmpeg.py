"""FFmpeg assembly: stitch clips + overlay narration/music (proven commands, files 11/13).

Runs on the backend host (ffmpeg must be installed there — file 08). Three helpers, matching
the audio strategy (file 04):
  - stitch()             concat clips (codec copy — clips from the same workflow share codec/res/fps)
  - stitch_and_overlay() silent video + narration on top (+ optional ducked music)  [AUDIO-AFTER]
  - stitch_plus_music()  video that already has audio (+ optional music bed)        [lipsync/LTX]

Gotcha (file 11): `-c copy` concat only works if all clips share codec/res/fps — true for
same-workflow clips; mixed sources would need a re-encode.
"""
import subprocess
import tempfile
from pathlib import Path

# Narration starts 300ms in (proven value; `|300` covers a 2nd channel if the file is stereo).
NARRATION_DELAY_FILTER = "[1:a]adelay=300|300[narr]"
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
    """Intermediate stitched file, kept next to the final output (avoids cwd collisions)."""
    return str(Path(out).resolve().with_name("stitched.mp4"))


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
    return out
