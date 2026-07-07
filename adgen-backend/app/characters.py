"""Characters — the cast system (client ask 2026-07-07: "consistency in video
characters").

A character is ONE casting decision reused everywhere: a verbatim description
anchor (~20 words: age, face, hair, exact clothing) that gets pasted word-for-
word into every shot prompt, plus an optional generated face (for avatar modes)
and an optional turnaround reference sheet (for Brand Lock's identity carry).
The anchor is the consistency mechanism the prompt doctrine already teaches —
this table just makes it a saved asset instead of something retyped per ad.

Same storage story as avatar profiles: SQLite at data/adgen.db, images under
assets/characters/ (served by the /assets-files static mount).
"""
import sqlite3
import time
import uuid
from pathlib import Path

DB_PATH = Path("data/adgen.db")
IMAGES_DIR = Path("assets/characters")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS characters (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    anchor      TEXT NOT NULL,       -- verbatim shot-prompt anchor (the consistency)
    face_image  TEXT,                -- optional: portrait for lipsync/longcat modes
    sheet_image TEXT,                -- optional: turnaround sheet for Brand Lock
    voice_id    TEXT,                -- optional: ElevenLabs voice tied to this character
    created_at  REAL NOT NULL
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
    d["image_url"] = _url(d["face_image"])
    d["sheet_url"] = _url(d["sheet_image"])
    return d


def list_characters() -> list[dict]:
    with _conn() as conn:
        rows = conn.execute("SELECT * FROM characters ORDER BY created_at DESC").fetchall()
    return [_to_dict(r) for r in rows]


def get_character(char_id: str) -> dict | None:
    with _conn() as conn:
        row = conn.execute("SELECT * FROM characters WHERE id = ?", (char_id,)).fetchone()
    return _to_dict(row) if row else None


def create_character(*, name: str, anchor: str, face_image: str | None = None,
                     sheet_image: str | None = None, voice_id: str | None = None) -> dict:
    char_id = uuid.uuid4().hex[:12]
    with _conn() as conn:
        conn.execute(
            "INSERT INTO characters (id, name, anchor, face_image, sheet_image, voice_id, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (char_id, name, anchor, face_image, sheet_image, voice_id, time.time()),
        )
    return get_character(char_id)


def update_character(char_id: str, *, name: str | None = None, anchor: str | None = None,
                     face_image: str | None = None, sheet_image: str | None = None,
                     voice_id: str | None = None) -> dict | None:
    sets, vals = [], []
    for col, val in [("name", name), ("anchor", anchor), ("face_image", face_image),
                     ("sheet_image", sheet_image), ("voice_id", voice_id)]:
        if val is not None:
            sets.append(f"{col} = ?")
            vals.append(val)
    if sets:
        with _conn() as conn:
            conn.execute(f"UPDATE characters SET {', '.join(sets)} WHERE id = ?",
                         (*vals, char_id))
    return get_character(char_id)


def delete_character(char_id: str) -> bool:
    ch = get_character(char_id)
    if ch is None:
        return False
    with _conn() as conn:
        conn.execute("DELETE FROM characters WHERE id = ?", (char_id,))
    # Only remove images that live in our own folder — a character may reference
    # an avatar's face or an uploaded asset that other records still use.
    for img in (ch["face_image"], ch["sheet_image"]):
        if img and Path(img).parent == IMAGES_DIR:
            Path(img).unlink(missing_ok=True)
    return True
