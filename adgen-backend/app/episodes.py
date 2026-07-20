"""Episodes — one script rendered through a locked Show (Show Templates, 2026-07-20).

An episode is the ONLY thing that varies between instalments: a Show id + a new
script. The planner splits the script into typed BEATS (type / speaker / room /
verbatim line / duration) which the compiler routes to engines and renders. Beats
are editable on the Episodes board before the render fires.

Everything durable about an episode lives here (survives a backend restart, unlike
the in-memory JOBS dict): the script, the approved beat list, the effective seeds
(so "the look that won" is reproducible), the output paths, and the adherence
scores. Same SQLite file: data/adgen.db.

status:  draft -> planned -> rendering -> done | error
  draft      created; no beats yet.
  planned    beats computed and (optionally) edited; ready to render.
  rendering  a render job is in flight.
  done       has an output video.
"""
import json
import sqlite3
import time
import uuid
from pathlib import Path

DB_PATH = Path("data/adgen.db")

STATUSES = ("draft", "planned", "rendering", "done", "error")

_JSON_COLS = ("beats", "seeds", "outputs", "adherence")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS episodes (
    id          TEXT PRIMARY KEY,
    show_id     TEXT NOT NULL,
    number      INTEGER NOT NULL,        -- Ep 1, 2, 3 within a show
    title       TEXT NOT NULL DEFAULT '',
    script      TEXT NOT NULL DEFAULT '',
    language    TEXT NOT NULL DEFAULT 'hi',
    beats       TEXT NOT NULL DEFAULT '[]',   -- the editable beat list (typed rows)
    seeds       TEXT NOT NULL DEFAULT '{}',   -- effective per-beat seeds (reproducibility)
    outputs     TEXT NOT NULL DEFAULT '{}',   -- {final, clips[], report}
    adherence   TEXT NOT NULL DEFAULT '{}',   -- per-beat identity/room scores (the receipt)
    status      TEXT NOT NULL DEFAULT 'draft',
    created_at  REAL NOT NULL
)
"""


def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute(_SCHEMA)
    return conn


def _to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    for col in _JSON_COLS:
        default = [] if col == "beats" else {}
        try:
            d[col] = json.loads(d[col]) if d.get(col) else default
        except (TypeError, json.JSONDecodeError):
            d[col] = default
    return d


def list_episodes(show_id: str | None = None) -> list[dict]:
    with _conn() as conn:
        if show_id:
            rows = conn.execute(
                "SELECT * FROM episodes WHERE show_id = ? ORDER BY number ASC, created_at ASC",
                (show_id,)).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM episodes ORDER BY created_at DESC").fetchall()
    return [_to_dict(r) for r in rows]


def get_episode(ep_id: str) -> dict | None:
    with _conn() as conn:
        row = conn.execute("SELECT * FROM episodes WHERE id = ?", (ep_id,)).fetchone()
    return _to_dict(row) if row else None


def next_number(show_id: str) -> int:
    with _conn() as conn:
        row = conn.execute(
            "SELECT MAX(number) AS n FROM episodes WHERE show_id = ?", (show_id,)).fetchone()
    return (row["n"] or 0) + 1


def create_episode(*, show_id: str, title: str = "", script: str = "",
                   language: str = "hi", number: int | None = None) -> dict:
    ep_id = uuid.uuid4().hex[:12]
    num = number if number is not None else next_number(show_id)
    with _conn() as conn:
        conn.execute(
            "INSERT INTO episodes (id, show_id, number, title, script, language, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (ep_id, show_id, num, title, script, language, time.time()),
        )
    return get_episode(ep_id)


def update_episode(ep_id: str, **fields) -> dict | None:
    sets, vals = [], []
    for col in ("title", "script", "language", "beats", "seeds", "outputs",
                "adherence", "status", "number"):
        if col in fields and fields[col] is not None:
            val = fields[col]
            if col in _JSON_COLS:
                val = json.dumps(val)
            sets.append(f"{col} = ?")
            vals.append(val)
    if sets:
        with _conn() as conn:
            conn.execute(f"UPDATE episodes SET {', '.join(sets)} WHERE id = ?",
                         (*vals, ep_id))
    return get_episode(ep_id)


def delete_episode(ep_id: str) -> bool:
    if get_episode(ep_id) is None:
        return False
    with _conn() as conn:
        conn.execute("DELETE FROM episodes WHERE id = ?", (ep_id,))
    return True
