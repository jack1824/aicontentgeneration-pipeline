"""Avatar profiles — Phase 3 (files 07/09).

A profile stores a locked reference face + an ElevenLabs voice so "pick Priya
and she looks and sounds the same every time" works. The generation models have
no memory: the orchestrator re-injects `reference_image` into S2V/LongCat on
every run (file 09's key principle).

Storage is SQLite (file 09: start with SQLite, Postgres later) at data/adgen.db.
Reference images live in assets/avatars/ — already covered by the /assets-files
static mount, so the browser previews them with zero extra plumbing.
"""
import json
import sqlite3
import time
import uuid
from pathlib import Path

DB_PATH = Path("data/adgen.db")
IMAGES_DIR = Path("assets/avatars")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS avatar_profiles (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    type             TEXT NOT NULL DEFAULT 'byo',      -- 'library' | 'byo'
    reference_image  TEXT NOT NULL,                    -- server path fed into S2V/LongCat
    voice_id         TEXT NOT NULL,                    -- ElevenLabs voice tied to this face
    default_settings TEXT NOT NULL DEFAULT '{}',       -- JSON: language, notes, ...
    lora_path        TEXT,                             -- future: per-avatar trained LoRA
    consent          INTEGER NOT NULL DEFAULT 0,       -- BYO faces require consent
    created_at       REAL NOT NULL
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
    d["consent"] = bool(d["consent"])
    try:
        d["default_settings"] = json.loads(d["default_settings"] or "{}")
    except json.JSONDecodeError:
        d["default_settings"] = {}
    # Browser-facing preview URL (assets/ is mounted at /assets-files).
    ref = Path(d["reference_image"])
    d["image_url"] = f"/assets-files/{ref.relative_to('assets').as_posix()}" \
        if ref.parts and ref.parts[0] == "assets" else None
    return d


def list_profiles() -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM avatar_profiles ORDER BY created_at DESC").fetchall()
    return [_to_dict(r) for r in rows]


def get_profile(avatar_id: str) -> dict | None:
    with _conn() as conn:
        row = conn.execute("SELECT * FROM avatar_profiles WHERE id = ?",
                           (avatar_id,)).fetchone()
    return _to_dict(row) if row else None


def create_profile(*, name: str, voice_id: str, image_bytes: bytes, image_ext: str,
                   type_: str = "byo", consent: bool = False,
                   default_settings: dict | None = None) -> dict:
    avatar_id = uuid.uuid4().hex[:12]
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    image_path = IMAGES_DIR / f"{avatar_id}{image_ext}"
    image_path.write_bytes(image_bytes)
    with _conn() as conn:
        conn.execute(
            "INSERT INTO avatar_profiles "
            "(id, name, type, reference_image, voice_id, default_settings, consent, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (avatar_id, name, type_, str(image_path), voice_id,
             json.dumps(default_settings or {}), int(consent), time.time()),
        )
    return get_profile(avatar_id)  # round-trip so the caller sees the stored shape


def update_profile(avatar_id: str, *, name: str | None = None,
                   voice_id: str | None = None) -> dict | None:
    sets, vals = [], []
    if name is not None:
        sets.append("name = ?"); vals.append(name)
    if voice_id is not None:
        sets.append("voice_id = ?"); vals.append(voice_id)
    if sets:
        with _conn() as conn:
            conn.execute(f"UPDATE avatar_profiles SET {', '.join(sets)} WHERE id = ?",
                         (*vals, avatar_id))
    return get_profile(avatar_id)


def delete_profile(avatar_id: str) -> bool:
    prof = get_profile(avatar_id)
    if prof is None:
        return False
    with _conn() as conn:
        conn.execute("DELETE FROM avatar_profiles WHERE id = ?", (avatar_id,))
    Path(prof["reference_image"]).unlink(missing_ok=True)
    return True
