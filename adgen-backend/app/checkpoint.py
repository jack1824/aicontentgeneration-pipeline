"""Per-job segment checkpoints (nextplan Phase 2) — renders that survive.

A sequence render is minutes-per-segment of GPU; today a failure at segment N
throws away segments 1..N-1 because the completed-clip list lives only in the
worker's memory. This module persists a tiny JSON manifest after every completed
segment so a re-submitted job REUSES finished clips and renders only the rest.

Design:
  * manifest per job NAME (the output stem): outputs/sequence/checkpoints/{name}.json
    {"segments": {"0": {"clip": path, "hash": h}, ...}}
  * `hash` fingerprints the segment's own inputs + the job knobs that change its
    pixels/audio (quality/size/language). A resumed job whose segment content
    changed re-renders that segment instead of reusing a stale clip.
  * The recorded path is the FINAL per-segment artifact (post voice-mux/trim), so
    resume skips TTS + mux too.
  * Cleared on job success — a manifest only ever describes an unfinished job.

Deliberately dumb: plain files, no locks (one render per name at a time), no
dependency on the in-memory JOBS dict, so it survives backend restarts too.
"""
import hashlib
import json
from pathlib import Path

CHECKPOINT_DIR = Path("outputs/sequence/checkpoints")

# Bump whenever the audio/video assembly of a SEGMENT changes, so cached segments from
# the old policy are re-muxed instead of reused. 2 = narration that outruns its shot
# holds the final frame instead of being cut.
FIT_POLICY_VERSION = 2


def _path(name: str) -> Path:
    return CHECKPOINT_DIR / f"{name}.json"


def seg_hash(seg: dict, req: dict) -> str:
    """Fingerprint everything that changes a segment's rendered output."""
    knobs = {
        "seg": {k: v for k, v in seg.items() if k != "avatar_id"},
        "quality": req.get("quality"),
        "width": req.get("width"),
        "height": req.get("height"),
        "language": req.get("language"),
        "steps": req.get("steps"),
        "seed": req.get("seed"),
        # Assembly policy affects the FINISHED per-segment artifact (the -voiced.mp4 we
        # cache), not just the render. Bumping this invalidates every segment muxed under
        # an older policy, so a resume/retry can't ship audio cut by the pre-fix code.
        "fit_policy": FIT_POLICY_VERSION,
        "legacy_audio_fit": bool(req.get("legacy_audio_fit")),
    }
    return hashlib.sha1(json.dumps(knobs, sort_keys=True, default=str).encode()).hexdigest()[:16]


def load(name: str) -> dict:
    """The manifest's segments map ({index-str: {clip, hash}}), or {}."""
    try:
        return json.loads(_path(name).read_text()).get("segments", {})
    except (OSError, json.JSONDecodeError):
        return {}


def record(name: str, index: int, clip: str, h: str) -> None:
    """Persist one completed segment. Read-modify-write is safe: one render per
    job name at a time (the queue serializes on the single pod)."""
    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
    segments = load(name)
    segments[str(index)] = {"clip": clip, "hash": h}
    _path(name).write_text(json.dumps({"segments": segments}))


def usable(name: str, index: int, h: str) -> str | None:
    """The cached clip for this segment IF it exists on disk and its inputs are
    unchanged — else None (render it)."""
    entry = load(name).get(str(index))
    if not entry or entry.get("hash") != h:
        return None
    clip = entry.get("clip")
    return clip if clip and Path(clip).exists() else None


def clear(name: str) -> None:
    """Job finished — its manifest must not resurrect stale clips later."""
    _path(name).unlink(missing_ok=True)


def exists(name: str) -> bool:
    """Is there a resumable manifest for this job name?"""
    return _path(name).exists() and bool(load(name))
