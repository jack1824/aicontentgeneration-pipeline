"""Phase 0 settings: where assets, the step cache and proof outputs live, and which ffmpeg to use.

Settings hold paths only, never a key. Provider keys are read where they are used (the adapters, from 0.2 on).
secret_values() returns the values of secret-named variables for redaction only (engine.redact); they are never
stored in Settings.

Resolution order for each value: process environment, then `<root>/.env`, then the default below. An empty value
counts as unset. Relative paths resolve against the repo root, not the current directory. `~` is expanded.
ffprobe is always taken from the folder of FFMPEG_BIN, never looked up on PATH, so the two always match.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

from dotenv import dotenv_values

REPO_ROOT = Path(__file__).resolve().parents[2]
_SECRET_NAME = re.compile(r"(KEY|SECRET|TOKEN|PASSWORD)", re.IGNORECASE)

DEFAULTS: dict[str, str] = {
    "ASSETS_DIR": "./assets",
    "STEP_CACHE_PATH": "./.cache/steps.sqlite3",
    "PROOFS_OUT_DIR": "./proofs/out",
    "FFMPEG_BIN": "~/tools/ffmpeg/ffmpeg",
}


@dataclass(frozen=True)
class Settings:
    root: Path
    assets_dir: Path
    step_cache_path: Path
    proofs_out_dir: Path
    ffmpeg_bin: Path
    ffprobe_bin: Path


def load_settings(env: Mapping[str, str] | None = None, root: Path | None = None) -> Settings:
    """Build Settings. Pass `env` to use exactly that mapping (tests); leave it None to read the process
    environment over `<root>/.env`."""
    root = Path(root) if root is not None else REPO_ROOT
    if env is None:
        env = _merged_env(root)

    def path(name: str) -> Path:
        raw = (env.get(name) or "").strip() or DEFAULTS[name]
        p = Path(os.path.expanduser(raw))
        return p if p.is_absolute() else Path(os.path.normpath(root / p))

    ffmpeg_bin = path("FFMPEG_BIN")
    return Settings(
        root=root,
        assets_dir=path("ASSETS_DIR"),
        step_cache_path=path("STEP_CACHE_PATH"),
        proofs_out_dir=path("PROOFS_OUT_DIR"),
        ffmpeg_bin=ffmpeg_bin,
        ffprobe_bin=ffmpeg_bin.with_name("ffprobe"),
    )


def _merged_env(root: Path) -> dict[str, str]:
    """`<root>/.env`, then the process environment on top. A blank exported value does not hide the .env value."""
    merged: dict[str, str] = {k: v for k, v in dotenv_values(root / ".env").items() if v is not None}
    merged.update({k: v for k, v in os.environ.items() if v.strip()})
    return merged


def secret_values(env: Mapping[str, str] | None = None, root: Path | None = None) -> tuple[str, ...]:
    """Values of secret-named variables (KEY, SECRET, TOKEN, PASSWORD; 6+ characters), for redaction only.
    Production code passes these to StepCache(secret_values=...). Never printed, never kept in Settings."""
    root = Path(root) if root is not None else REPO_ROOT
    source = _merged_env(root) if env is None else env
    return tuple(sorted({v.strip() for k, v in source.items()
                         if _SECRET_NAME.search(k) and v and len(v.strip()) >= 6}))
