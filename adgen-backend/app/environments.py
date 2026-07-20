"""Environments — the room/location system (Show Templates, 2026-07-20).

An environment is ONE reusable place: a verbatim setting anchor (~20 words:
the room, its light, its palette) pasted into every shot set there, plus up to
three approved "plates" — a still of the room from a few angles (wide / reverse /
detail). The plates are the consistency mechanism a keyframe pass composites the
cast INTO, so Episode 2's classroom is pixel-for-pixel Episode 1's classroom.

Same storage story as characters/avatars: SQLite at data/adgen.db, images under
assets/environments/ (served by the /assets-files static mount).
"""
import sqlite3
import time
import uuid
from pathlib import Path

DB_PATH = Path("data/adgen.db")
IMAGES_DIR = Path("assets/environments")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS environments (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    anchor        TEXT NOT NULL,      -- verbatim setting anchor (the consistency)
    plate_wide    TEXT,              -- approved room still: establishing / wide
    plate_reverse TEXT,              -- approved room still: reverse angle
    plate_detail  TEXT,              -- approved room still: detail / insert
    created_at    REAL NOT NULL
)
"""


def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute(_SCHEMA)
    return conn


def _url(path: str | None) -> str | None:
    if not path:
        return None
    p = Path(path)
    return f"/assets-files/{p.relative_to('assets').as_posix()}" \
        if p.parts and p.parts[0] == "assets" else None


def _to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["plate_wide_url"] = _url(d["plate_wide"])
    d["plate_reverse_url"] = _url(d["plate_reverse"])
    d["plate_detail_url"] = _url(d["plate_detail"])
    # The plate the keyframe pass reaches for first (wide establishes the room).
    d["primary_plate"] = d["plate_wide"] or d["plate_reverse"] or d["plate_detail"]
    return d


def list_environments() -> list[dict]:
    with _conn() as conn:
        rows = conn.execute("SELECT * FROM environments ORDER BY created_at DESC").fetchall()
    return [_to_dict(r) for r in rows]


def get_environment(env_id: str) -> dict | None:
    with _conn() as conn:
        row = conn.execute("SELECT * FROM environments WHERE id = ?", (env_id,)).fetchone()
    return _to_dict(row) if row else None


def create_environment(*, name: str, anchor: str, plate_wide: str | None = None,
                       plate_reverse: str | None = None,
                       plate_detail: str | None = None) -> dict:
    env_id = uuid.uuid4().hex[:12]
    with _conn() as conn:
        conn.execute(
            "INSERT INTO environments (id, name, anchor, plate_wide, plate_reverse, "
            "plate_detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (env_id, name, anchor, plate_wide, plate_reverse, plate_detail, time.time()),
        )
    return get_environment(env_id)


def update_environment(env_id: str, *, name: str | None = None, anchor: str | None = None,
                       plate_wide: str | None = None, plate_reverse: str | None = None,
                       plate_detail: str | None = None) -> dict | None:
    sets, vals = [], []
    for col, val in [("name", name), ("anchor", anchor), ("plate_wide", plate_wide),
                     ("plate_reverse", plate_reverse), ("plate_detail", plate_detail)]:
        if val is not None:
            sets.append(f"{col} = ?")
            vals.append(val)
    if sets:
        with _conn() as conn:
            conn.execute(f"UPDATE environments SET {', '.join(sets)} WHERE id = ?",
                         (*vals, env_id))
    return get_environment(env_id)


def delete_environment(env_id: str) -> bool:
    env = get_environment(env_id)
    if env is None:
        return False
    with _conn() as conn:
        conn.execute("DELETE FROM environments WHERE id = ?", (env_id,))
    # Only remove plates that live in our own folder — an environment may reference
    # an uploaded location photo that other records still use.
    for img in (env["plate_wide"], env["plate_reverse"], env["plate_detail"]):
        if img and Path(img).parent == IMAGES_DIR:
            Path(img).unlink(missing_ok=True)
    return True
