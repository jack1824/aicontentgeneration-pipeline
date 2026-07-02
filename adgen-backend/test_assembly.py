"""Chunk 4 test: FFmpeg assembly — overlay real narration onto the real generated clip.

Uses the Chunk 3 clip (clip_0.mp4) + a Chunk 1 narration (narration_hi.mp3; run test_tts.py
first if it doesn't exist). Produces final_test.mp4 (video with voice).

Run from adgen-backend/:
    ./.venv/bin/python test_assembly.py
"""
import os
from pathlib import Path

from app.assembly import ffmpeg

CLIP = "clip_0.mp4"
NARRATION = "narration_hi.mp3"


def main() -> None:
    for f in (CLIP, NARRATION):
        if not Path(f).exists():
            raise SystemExit(
                f"missing {f} — "
                + ("run test_generate.py first." if f == CLIP else "run test_tts.py first.")
            )

    out = ffmpeg.stitch_and_overlay([CLIP], narration=NARRATION, out="final_test.mp4")
    size = os.path.getsize(out)
    print(f"wrote: {out} ({size:,} bytes)")
    print("Play it back: the honey clip should now have the Hindi narration over it.")


if __name__ == "__main__":
    main()
