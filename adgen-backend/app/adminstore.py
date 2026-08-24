"""Durable event log for the admin dashboard.

The render pipeline keeps its jobs in an in-memory dict (main.py JOBS), which means
every backend restart erases the entire history — including the evidence you need
when something went wrong. Today alone that cost us: a distilled-LoRA regression that
blurred every clip, a cast-injection bug that turned a photoreal brand film into a
cartoon, a QC vision judge that silently went blind, and a narration truncated
mid-CTA. Every one was reconstructed by hand from files on disk after the fact.

So: an append-only JSONL of the few events worth keeping forever. Not progress ticks
(thousands per render, worthless a minute later) — only the things you would want when
asking "what happened, and when did it start happening?"

Deliberately dependency-free and best-effort: a logging failure must NEVER take down a
render. Every public function swallows its own errors.
"""
import json
import os
import threading
import time
from pathlib import Path

ADMIN_DIR = Path("outputs/admin")
EVENTS = ADMIN_DIR / "events.jsonl"

# Roughly 20k events before rotation — a few months of real use. Keeping one rotated
# generation is enough to survive a bad week without unbounded disk growth.
MAX_BYTES = int(os.getenv("ADMIN_EVENTS_MAX_BYTES", str(8 * 1024 * 1024)))

_LOCK = threading.Lock()

# Event kinds. Kept as constants so the dashboard and the emitters can't drift apart.
JOB_START = "job_start"
JOB_DONE = "job_done"
JOB_ERROR = "job_error"
JOB_CANCELLED = "job_cancelled"
WARNING = "warning"
PROVIDER_PROBE = "provider_probe"


def _rotate_if_needed() -> None:
    try:
        if EVENTS.exists() and EVENTS.stat().st_size > MAX_BYTES:
            EVENTS.replace(EVENTS.with_suffix(".1.jsonl"))
    except OSError:
        pass


def emit(kind: str, **payload) -> None:
    """Append one event. Never raises — a broken log must not break a render."""
    try:
        ADMIN_DIR.mkdir(parents=True, exist_ok=True)
        rec = {"ts": time.time(), "kind": kind, **payload}
        line = json.dumps(rec, default=str, ensure_ascii=False)
        with _LOCK:
            _rotate_if_needed()
            with EVENTS.open("a", encoding="utf-8") as f:
                f.write(line + "\n")
    except Exception:
        pass


def read(limit: int = 500, kinds: set[str] | None = None,
         since: float | None = None) -> list[dict]:
    """Most recent events first. Tolerates a partially-written trailing line."""
    out: list[dict] = []
    for p in (EVENTS, EVENTS.with_suffix(".1.jsonl")):
        try:
            if not p.exists():
                continue
            lines = p.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            continue
        for line in reversed(lines):
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue  # torn write at the tail — skip, don't abort the read
            if kinds and rec.get("kind") not in kinds:
                continue
            if since is not None and (rec.get("ts") or 0) < since:
                continue
            out.append(rec)
            if len(out) >= limit:
                return out
    return out


def counts_since(seconds: float) -> dict[str, int]:
    """Event counts in the trailing window — the dashboard's headline numbers."""
    cutoff = time.time() - seconds
    tally: dict[str, int] = {}
    for rec in read(limit=5000, since=cutoff):
        k = rec.get("kind") or "?"
        tally[k] = tally.get(k, 0) + 1
    return tally
