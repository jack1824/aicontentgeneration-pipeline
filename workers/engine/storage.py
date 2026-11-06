"""Phase 0 asset store: a local folder, content-addressed. MinIO replaces it in task 1.1 behind the same API.

A ref is "<kind>/<sha256>.<ext>" (e.g. "stills/2cf2…9824.png"), always relative to the store root. Refs are
validated strictly, so an absolute path, "..", a URL or any other shape is refused. Provider URLs never enter the
store: every provider output is downloaded first (Higgsfield URLs expire in 7 days).
"""
from __future__ import annotations

import fcntl
import hashlib
import os
import re
import tempfile
from pathlib import Path
from typing import BinaryIO, Callable, Protocol

from engine.redact import redact

_KIND = re.compile(r"[a-z0-9][a-z0-9_-]{0,63}")  # used with fullmatch: "$" would allow a trailing newline
_EXT = re.compile(r"[a-z0-9]{1,8}")
_REF = re.compile(r"[a-z0-9][a-z0-9_-]{0,63}/[0-9a-f]{64}\.[a-z0-9]{1,8}")


class AssetStore(Protocol):
    def put_bytes(self, data: bytes, *, kind: str, ext: str) -> str: ...
    def put_file(self, src: Path, *, kind: str) -> str: ...
    def read_bytes(self, ref: str) -> bytes: ...
    def exists(self, ref: str) -> bool: ...


def _kind(kind: str) -> str:
    if not _KIND.fullmatch(kind or ""):
        raise ValueError(f"bad asset kind: {_shown(kind)}")
    return kind


def _ext(ext: str) -> str:
    if not _EXT.fullmatch(ext or ""):
        raise ValueError(f"bad asset extension: {_shown(ext)}")
    return ext


def check_ref(ref: str) -> str:
    if not isinstance(ref, str) or not _REF.fullmatch(ref):
        raise ValueError(f"not an asset ref: {_shown(ref)}")
    return ref


def _shown(value: object) -> str:
    """A rejected value as it may appear in an error: redacted and short (a provider URL can carry a key)."""
    return redact(repr(value))[:120]


class LocalFolderStore:
    def __init__(self, root: Path) -> None:
        self.root = Path(root)

    def put_bytes(self, data: bytes, *, kind: str, ext: str) -> str:
        def write(out: BinaryIO, h: "hashlib._Hash") -> None:
            h.update(data)
            out.write(data)
        return self._store(write, _kind(kind), _ext(ext))

    def put_file(self, src: Path, *, kind: str) -> str:
        src = Path(src)
        ext = _ext(src.suffix.lstrip(".").lower())

        def copy(out: BinaryIO, h: "hashlib._Hash") -> None:
            # One read of the source: the bytes hashed are exactly the bytes stored.
            with open(src, "rb") as f:
                for chunk in iter(lambda: f.read(1 << 20), b""):
                    h.update(chunk)
                    out.write(chunk)
        return self._store(copy, _kind(kind), ext)

    def local_path(self, ref: str) -> Path:
        return self.root / check_ref(ref)

    def read_bytes(self, ref: str) -> bytes:
        return self.local_path(ref).read_bytes()

    def exists(self, ref: str) -> bool:
        return self.local_path(ref).is_file()

    def _store(self, write: Callable[[BinaryIO, "hashlib._Hash"], None], kind: str, ext: str) -> str:
        folder = self.root / kind
        folder.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=folder, prefix=".tmp-")
        try:
            h = hashlib.sha256()
            with os.fdopen(fd, "wb") as out:
                write(out, h)
                if out.tell() == 0:
                    raise ValueError("refusing to store an empty asset (an empty download is not an output)")
                out.flush()
                _full_fsync(out.fileno())
            digest = h.hexdigest()
            ref = f"{kind}/{digest}.{ext}"
            dest = self.root / ref
            if dest.is_file() and _sha256_of(dest) == digest:
                os.unlink(tmp)  # an identical copy is already stored
            else:
                os.replace(tmp, dest)  # new, or repairs a stored file whose bytes no longer match its name
                _fsync_folder(folder)
            return ref
        except BaseException:
            try:
                os.unlink(tmp)
            except FileNotFoundError:
                pass
            raise


def _sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _full_fsync(fd: int) -> None:
    """On macOS plain fsync() does not flush the drive cache; F_FULLFSYNC does."""
    if hasattr(fcntl, "F_FULLFSYNC"):
        try:
            fcntl.fcntl(fd, fcntl.F_FULLFSYNC)
            return
        except OSError:
            pass
    os.fsync(fd)


def _fsync_folder(folder: Path) -> None:
    """Make the rename itself durable. Best effort: some file systems refuse fsync on a folder."""
    try:
        fd = os.open(folder, os.O_RDONLY)
    except OSError:
        return
    try:
        os.fsync(fd)
    except OSError:
        pass
    finally:
        os.close(fd)
