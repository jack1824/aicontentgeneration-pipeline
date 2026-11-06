"""Phase 0 step cache: one local SQLite file (owner decisions, 4 Nov 2026). Task 1.1 moves it into Postgres.

Every pipeline step is keyed by step_key(step, inputs) = sha256 of canonical JSON {"inputs": …, "step": …}: keys
sorted, compact separators, UTF-8, strings NFC-normalised, whole-number floats written as integers (5.0 -> 5,
-0.0 -> 0; generated models turn 5 into 5.0, and a changed key would mean paying again), other numbers in Python's
JSON text, NaN and infinity refused. Only the Python engine computes step keys: the API sends inputs, never a hash.
The format is frozen, because 1.1 imports these rows.

Statuses and what lookup() answers:
  submitted -> "resume"  a paid request is in flight: poll its request_id again, never submit (and pay) twice
  done      -> "hit"     only while its asset file still exists; otherwise "stale"
  done      -> "stale"   the asset is gone: flag it, never re-pay automatically (an owner-approved re-run calls reset())
  failed    -> "miss"    may be submitted again (attempts counts up)
  nsfw      -> "miss"    same; the caller decides whether a rephrase is allowed
  (no row)  -> "miss"

Rules that protect money (the 0.2 adapters follow them):
- Call mark_failed / mark_nsfw only on a terminal provider status (failed, nsfw, canceled). A poll timeout, a 5xx
  while polling or a dropped connection leaves the row "submitted", so the next run resumes the same request.
- A report on a step in flight (mark_done / mark_failed / mark_nsfw) must name that request_id; a late report about
  an earlier request raises StepConflict instead of losing track of the request now in flight.
- If mark_submitted cannot record a request that the provider has accepted (a conflict, or the database stays
  locked past BUSY_TIMEOUT_MS), it raises RequestNotRecorded carrying the provider and request_id, so the paid id is
  never lost silently.
- mark_done() needs the asset in the store already (download first, then mark done), else AssetNotStored. Both are
  StepConflict, not OSError, so an adapter's `except OSError` cannot turn them into a paid retry.
- reset() refuses a request in flight unless force=True.
- Commits use synchronous=FULL with macOS full fsync, so a committed "submitted" row survives a power loss.
- Error text is redacted (engine.redact) before it is stored. secret_values must be passed explicitly; production
  code passes engine.config.secret_values() (the secret-named values of .env and the environment) plus any others.

Known Phase 0 limits (carried into the 0.2 plan):
- A crash between the provider accepting a request and mark_submitted committing leaves no row, so the next run
  sees "miss". For Higgsfield, the adapter's Idempotency-Key (step key + attempts, so a retry after "failed" is a new
  request) lets the provider return the same job instead of charging twice. ElevenLabs has no idempotency key: a
  crash in that window re-pays one TTS call.
- Two processes that both see "miss" for the same key and both submit would both pay; the second mark_submitted()
  raises RequestNotRecorded. Phase 0 runs one script per proof, so one writer per key.
"""
from __future__ import annotations

import hashlib
import json
import math
import sqlite3
import threading
import unicodedata
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, Iterator, Mapping

from engine.redact import redact
from engine.storage import check_ref

ERROR_MAX_CHARS = 500


class StepConflict(RuntimeError):
    """A transition that would lose track of money or of approved pixels."""


class AssetNotStored(StepConflict):
    """mark_done() was called before the asset was in the store."""


class RequestNotRecorded(StepConflict):
    """A request the provider has already accepted (and may have charged for) could not be recorded."""

    def __init__(self, message: str, *, provider: str, request_id: str) -> None:
        super().__init__(message)
        self.provider = provider
        self.request_id = request_id


def _canon(value: Any) -> Any:
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value)
    if value is None or isinstance(value, (bool, int)):
        return value
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            raise ValueError("NaN and infinity are not allowed in step inputs")
        return int(value) if value.is_integer() else value
    if isinstance(value, Mapping):
        out: dict[str, Any] = {}
        for k, v in value.items():
            if not isinstance(k, str):
                raise TypeError(f"step input keys must be strings, got {type(k).__name__}")
            nk = unicodedata.normalize("NFC", k)
            if nk in out:
                raise ValueError(f"two input keys normalise to the same text: {nk!r}")
            out[nk] = _canon(v)
        return out
    if isinstance(value, (list, tuple)):
        return [_canon(v) for v in value]
    raise TypeError(f"step inputs must be plain JSON, got {type(value).__name__}")


def step_key(step: str, inputs: Mapping[str, Any]) -> str:
    if not isinstance(step, str) or not step:
        raise ValueError("step must be a non-empty string")
    body = json.dumps(
        {"step": _canon(step), "inputs": _canon(inputs)},
        sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False,
    )
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class StepRow:
    key: str
    step: str
    status: str
    provider: str | None
    request_id: str | None
    result_ref: str | None
    error: str | None
    attempts: int
    created_at: str
    updated_at: str


@dataclass(frozen=True)
class Lookup:
    kind: str  # "hit" | "resume" | "miss" | "stale"
    row: StepRow | None


_SCHEMA = (
    """CREATE TABLE IF NOT EXISTS steps (
        key         TEXT PRIMARY KEY,
        step        TEXT NOT NULL,
        status      TEXT NOT NULL CHECK (status IN ('submitted', 'done', 'failed', 'nsfw')),
        provider    TEXT,
        request_id  TEXT,
        result_ref  TEXT,
        error       TEXT,
        attempts    INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
    )""",
    "CREATE INDEX IF NOT EXISTS steps_by_status ON steps (status)",
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def _text_id(request_id: object, *, required: bool) -> str | None:
    if request_id is None and not required:
        return None
    if not isinstance(request_id, str):
        raise TypeError(f"request_id must be text, got {type(request_id).__name__}")
    if required and not request_id:
        raise ValueError("request_id is required")
    return request_id


class StepCache:
    BUSY_TIMEOUT_MS = 60_000

    def __init__(self, path: Path, *, exists: Callable[[str], bool], secret_values: Iterable[str]) -> None:
        self.path = Path(path)
        self._exists = exists
        self._secrets = tuple(secret_values)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._local = threading.local()
        self._conns: list[sqlite3.Connection] = []
        self._lock = threading.Lock()
        with self._tx() as c:
            for stmt in _SCHEMA:
                c.execute(stmt)

    # --- connections and transactions ---

    def _conn(self) -> sqlite3.Connection:
        c = getattr(self._local, "conn", None)
        if c is None:
            c = sqlite3.connect(
                self.path, timeout=self.BUSY_TIMEOUT_MS / 1000, isolation_level=None, check_same_thread=False
            )
            c.row_factory = sqlite3.Row
            c.execute(f"PRAGMA busy_timeout = {int(self.BUSY_TIMEOUT_MS)}")
            c.execute("PRAGMA journal_mode = WAL")
            c.execute("PRAGMA synchronous = FULL")
            c.execute("PRAGMA fullfsync = ON")
            c.execute("PRAGMA checkpoint_fullfsync = ON")
            self._local.conn = c
            with self._lock:
                self._conns.append(c)
        return c

    @contextmanager
    def _tx(self) -> Iterator[sqlite3.Connection]:
        c = self._conn()
        c.execute("BEGIN IMMEDIATE")
        try:
            yield c
        except BaseException:
            c.execute("ROLLBACK")
            raise
        c.execute("COMMIT")

    @staticmethod
    def _get(c: sqlite3.Connection, key: str) -> StepRow | None:
        r = c.execute("SELECT * FROM steps WHERE key = ?", (key,)).fetchone()
        return StepRow(**dict(r)) if r else None

    @staticmethod
    def _same_request(row: StepRow, request_id: str | None, what: str) -> None:
        if row.status == "submitted" and request_id != row.request_id:
            raise StepConflict(
                f"{what} for step {row.key[:12]}… names request {request_id!r}, but {row.request_id!r} is in flight"
            )

    def close(self) -> None:
        with self._lock:
            for c in self._conns:
                c.close()
            self._conns.clear()
        self._local = threading.local()

    # --- reads ---

    def lookup(self, key: str) -> Lookup:
        row = self._get(self._conn(), key)
        if row is None or row.status in ("failed", "nsfw"):
            return Lookup("miss", row)
        if row.status == "submitted":
            return Lookup("resume", row)
        return Lookup("hit" if self._exists(row.result_ref) else "stale", row)

    def pending(self) -> list[StepRow]:
        rows = self._conn().execute("SELECT * FROM steps WHERE status = 'submitted' ORDER BY created_at").fetchall()
        return [StepRow(**dict(r)) for r in rows]

    # --- transitions ---

    def mark_submitted(self, key: str, *, step: str, provider: str, request_id: str) -> None:
        request_id = _text_id(request_id, required=True)
        if not (step and provider):
            raise ValueError("step and provider are required")
        unrecorded = f"the new request {request_id} ({provider}) was not recorded and may already be paid"
        try:
            with self._tx() as c:
                row, now = self._get(c, key), _now()
                if row is None:
                    c.execute(
                        "INSERT INTO steps (key, step, status, provider, request_id, attempts, created_at, updated_at)"
                        " VALUES (?, ?, 'submitted', ?, ?, 1, ?, ?)",
                        (key, step, provider, request_id, now, now),
                    )
                elif row.status == "submitted":
                    if row.request_id != request_id:
                        raise RequestNotRecorded(
                            f"step {key[:12]}… already has request {row.request_id} in flight; {unrecorded}",
                            provider=provider, request_id=request_id,
                        )
                elif row.status == "done":
                    raise RequestNotRecorded(
                        f"step {key[:12]}… is done (reset() it first, owner-approved re-run only); {unrecorded}",
                        provider=provider, request_id=request_id,
                    )
                else:
                    c.execute(
                        "UPDATE steps SET status = 'submitted', step = ?, provider = ?, request_id = ?,"
                        " result_ref = NULL, error = NULL, attempts = attempts + 1, updated_at = ? WHERE key = ?",
                        (step, provider, request_id, now, key),
                    )
        except sqlite3.Error as e:  # locked, corrupt or unreadable: the paid id must still surface
            raise RequestNotRecorded(f"step cache unavailable ({e}); {unrecorded}",
                                     provider=provider, request_id=request_id) from e

    def mark_done(
        self, key: str, *, step: str, result_ref: str, request_id: str | None = None, provider: str | None = None
    ) -> None:
        request_id = _text_id(request_id, required=False)
        check_ref(result_ref)  # a local asset ref only: never a provider URL or a path
        if not self._exists(result_ref):
            raise AssetNotStored(f"asset {result_ref} is not in the store; download it before marking the step done")
        with self._tx() as c:
            row, now = self._get(c, key), _now()
            if row is None:
                c.execute(
                    "INSERT INTO steps (key, step, status, provider, request_id, result_ref, attempts, created_at,"
                    " updated_at) VALUES (?, ?, 'done', ?, ?, ?, 1, ?, ?)",
                    (key, step, provider, request_id, result_ref, now, now),
                )
                return
            if row.status == "done":
                if row.result_ref != result_ref:
                    raise StepConflict(f"step {key[:12]}… is already done with another asset")
                return
            self._same_request(row, request_id, "mark_done")
            c.execute(
                "UPDATE steps SET status = 'done', step = ?, result_ref = ?, error = NULL,"
                " request_id = COALESCE(?, request_id), provider = COALESCE(?, provider), updated_at = ?"
                " WHERE key = ?",
                (step, result_ref, request_id, provider, now, key),
            )

    def mark_failed(
        self, key: str, *, step: str, error: str, request_id: str | None = None, provider: str | None = None
    ) -> None:
        self._mark_bad(key, step, "failed", error, request_id, provider)

    def mark_nsfw(
        self, key: str, *, step: str, detail: str = "", request_id: str | None = None, provider: str | None = None
    ) -> None:
        self._mark_bad(key, step, "nsfw", detail, request_id, provider)

    def _mark_bad(
        self, key: str, step: str, status: str, text: str, request_id: str | None, provider: str | None
    ) -> None:
        request_id = _text_id(request_id, required=False)
        text = redact(text or "", self._secrets)[:ERROR_MAX_CHARS]
        with self._tx() as c:
            row, now = self._get(c, key), _now()
            if row is None:
                c.execute(
                    "INSERT INTO steps (key, step, status, provider, request_id, error, attempts, created_at,"
                    " updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)",
                    (key, step, status, provider, request_id, text, now, now),
                )
                return
            if row.status == "done":
                raise StepConflict(f"step {key[:12]}… is done; a late {status} cannot overwrite it")
            self._same_request(row, request_id, f"mark_{status}")
            c.execute(
                "UPDATE steps SET status = ?, step = ?, error = ?, request_id = COALESCE(?, request_id),"
                " provider = COALESCE(?, provider), updated_at = ? WHERE key = ?",
                (status, step, text, request_id, provider, now, key),
            )

    def reset(self, key: str, *, force: bool = False) -> None:
        """Forget a step so it can run again. Only for an owner-approved re-run (it may mean paying again).
        A request still in flight is refused unless force=True, because its request_id would be lost."""
        with self._tx() as c:
            row = self._get(c, key)
            if row is not None and row.status == "submitted" and not force:
                raise StepConflict(f"step {key[:12]}… has request {row.request_id} in flight; reset(force=True) only "
                                   "after cancelling it")
            c.execute("DELETE FROM steps WHERE key = ?", (key,))
