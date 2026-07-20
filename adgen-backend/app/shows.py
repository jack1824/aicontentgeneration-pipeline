"""Shows — the episodic ad TEMPLATE (Show Templates, 2026-07-20).

A Show is a production recipe locked ONCE and reused for every episode: the cast
(character ids), the rooms (environment ids), a frozen LOOK (the verbatim
CHARACTER/SETTING/LOOK blocks + canonical negative + grade + art style), and the
shot GRAMMAR (per-beat engine routing + knob defaults). The point of the client
ask: pick the show, feed a new script, get the same teacher in the same classroom
in Episode 5 as in Episode 1.

Lifecycle — draft -> validated -> locked:
  draft      being assembled; freely editable.
  validated  passed the lock-time validation batch (measured baselines stored in
             `calibration`); ready to lock.
  locked     IMMUTABLE. Editing a locked show forks a new version (parent_id ->
             the original, version += 1) rather than mutating it, so episodes
             already shipped on v1 stay reproducible. (The industry "freeze the
             references" rule — consistency dies the moment the assets can change
             quietly between episodes.)

JSON is stored as TEXT columns and (de)serialized here. Same SQLite file as
characters/environments/avatars: data/adgen.db.
"""
import json
import sqlite3
import time
import uuid
from pathlib import Path

DB_PATH = Path("data/adgen.db")

STATUSES = ("draft", "validated", "locked")

# JSON-typed columns: parsed on the way out, dumped on the way in.
_JSON_COLS = ("character_ids", "environment_ids", "look", "grammar",
              "calibration", "keyframe_bank")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS shows (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    character_ids  TEXT NOT NULL DEFAULT '[]',   -- cast: character ids (order = billing)
    environment_ids TEXT NOT NULL DEFAULT '[]',  -- rooms: environment ids
    look           TEXT NOT NULL DEFAULT '{}',   -- frozen blocks: character/setting/look/
                                                 --   negative/grade/style(cartoon|photoreal)
    grammar        TEXT NOT NULL DEFAULT '{}',   -- knobs: language/aspect/quality/engine/
                                                 --   duration_target/camera menu
    status         TEXT NOT NULL DEFAULT 'draft',
    version        INTEGER NOT NULL DEFAULT 1,
    parent_id      TEXT,                         -- the show this was forked from (versioning)
    calibration    TEXT NOT NULL DEFAULT '{}',   -- lock-time baseline scores (pod, later)
    keyframe_bank  TEXT NOT NULL DEFAULT '[]',   -- approved keyframes reused across episodes
    created_at     REAL NOT NULL,
    locked_at      REAL
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
        try:
            d[col] = json.loads(d[col]) if d.get(col) else _default_for(col)
        except (TypeError, json.JSONDecodeError):
            d[col] = _default_for(col)
    return d


def _default_for(col: str):
    return [] if col in ("character_ids", "environment_ids", "keyframe_bank") else {}


def list_shows() -> list[dict]:
    with _conn() as conn:
        rows = conn.execute("SELECT * FROM shows ORDER BY created_at DESC").fetchall()
    return [_to_dict(r) for r in rows]


def get_show(show_id: str) -> dict | None:
    with _conn() as conn:
        row = conn.execute("SELECT * FROM shows WHERE id = ?", (show_id,)).fetchone()
    return _to_dict(row) if row else None


def create_show(*, name: str, character_ids: list | None = None,
                environment_ids: list | None = None, look: dict | None = None,
                grammar: dict | None = None, parent_id: str | None = None,
                version: int = 1) -> dict:
    show_id = uuid.uuid4().hex[:12]
    with _conn() as conn:
        conn.execute(
            "INSERT INTO shows (id, name, character_ids, environment_ids, look, grammar, "
            "status, version, parent_id, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)",
            (show_id, name, json.dumps(character_ids or []),
             json.dumps(environment_ids or []), json.dumps(look or {}),
             json.dumps(grammar or {}), version, parent_id, time.time()),
        )
    return get_show(show_id)


def update_show(show_id: str, **fields) -> dict | None:
    """Patch a DRAFT/VALIDATED show. A locked show is immutable — callers that
    want to change one must fork_version() first (enforced in the endpoint)."""
    sets, vals = [], []
    for col in ("name", "character_ids", "environment_ids", "look", "grammar",
                "calibration", "keyframe_bank", "status"):
        if col in fields and fields[col] is not None:
            val = fields[col]
            if col in _JSON_COLS:
                val = json.dumps(val)
            sets.append(f"{col} = ?")
            vals.append(val)
    if sets:
        with _conn() as conn:
            conn.execute(f"UPDATE shows SET {', '.join(sets)} WHERE id = ?", (*vals, show_id))
    return get_show(show_id)


def set_status(show_id: str, status: str) -> dict | None:
    if status not in STATUSES:
        raise ValueError(f"unknown status {status!r}")
    locked_at = time.time() if status == "locked" else None
    with _conn() as conn:
        conn.execute("UPDATE shows SET status = ?, locked_at = ? WHERE id = ?",
                     (status, locked_at, show_id))
    return get_show(show_id)


def fork_version(show_id: str) -> dict | None:
    """Clone a (locked) show into a fresh DRAFT v(n+1) pointing back at it, so an
    edit never mutates a show that episodes already shipped on."""
    src = get_show(show_id)
    if src is None:
        return None
    forked = create_show(
        name=src["name"], character_ids=src["character_ids"],
        environment_ids=src["environment_ids"], look=src["look"],
        grammar=src["grammar"], parent_id=show_id, version=src["version"] + 1,
    )
    return forked


def delete_show(show_id: str) -> bool:
    if get_show(show_id) is None:
        return False
    with _conn() as conn:
        conn.execute("DELETE FROM shows WHERE id = ?", (show_id,))
    return True
