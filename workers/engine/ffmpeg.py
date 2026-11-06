"""Check that FFMPEG_BIN can do what the compositor needs. It fails closed: anything it cannot confirm is a problem.

Needed: the filters subtitles and ass (libass captions), drawtext (freetype), loudnorm and sidechaincompress
(audio); the libraries libass, libfreetype and libharfbuzz (harfbuzz shapes Devanagari conjuncts and matras);
and an ffprobe that runs, in the same folder as ffmpeg.

Run: uv run python -m engine.ffmpeg   (exit 0 = capable, exit 1 = not; the reasons go to stderr)
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Mapping, Sequence

from engine.config import load_settings

REQUIRED_FILTERS = ("subtitles", "ass", "drawtext", "loudnorm", "sidechaincompress")
REQUIRED_LIBS = ("libass", "libfreetype", "libharfbuzz")
TIMEOUT_S = 20

# One filter per line: 2 or 3 flag characters (ffmpeg 9 prints "TS", older builds "TSC"), the exact name, then the
# in->out column. Matching the name column exactly is what stops "bass" or "highpass" from passing as "ass".
_FILTER_LINE = re.compile(r"^\s*[T.][S.][C.]?\s+(\S+)\s+\S+->\S+(?:\s|$)")
_ENABLED_LIB = re.compile(r"--enable-(lib[A-Za-z0-9_]+)\b")


@dataclass(frozen=True)
class RunResult:
    returncode: int
    stdout: str
    stderr: str


Runner = Callable[[Sequence[str]], RunResult]


def run_command(argv: Sequence[str]) -> RunResult:
    # errors="replace": a binary that prints invalid UTF-8 is reported as a problem, never a crash.
    p = subprocess.run(list(argv), capture_output=True, text=True, errors="replace", stdin=subprocess.DEVNULL,
                       timeout=TIMEOUT_S)
    return RunResult(p.returncode, p.stdout, p.stderr)


@dataclass
class Report:
    ffmpeg_bin: Path
    ffprobe_bin: Path
    version: str = ""
    problems: list[str] = field(default_factory=list)
    found_filters: set[str] = field(default_factory=set)
    found_libs: set[str] = field(default_factory=set)
    missing_filters: set[str] = field(default_factory=set)
    missing_libs: set[str] = field(default_factory=set)


def parse_filter_names(text: str) -> set[str]:
    return {m.group(1) for line in text.splitlines() if (m := _FILTER_LINE.match(line))}


def parse_enabled_libs(text: str) -> set[str]:
    return set(_ENABLED_LIB.findall(text))


def _executable(p: Path) -> bool:
    return p.is_file() and os.access(p, os.X_OK)


def _call(run: Runner, argv: list[str], label: str, report: Report) -> RunResult | None:
    try:
        r = run(argv)
    except subprocess.TimeoutExpired:
        report.problems.append(f"{label} timed out after {TIMEOUT_S} s")
        return None
    except OSError as e:
        report.problems.append(f"{label} could not run: {e}")
        return None
    if r.returncode != 0:
        tail = (r.stderr or r.stdout).strip()[-300:]
        report.problems.append(f"{label} exited with code {r.returncode}: {tail}")
        return None
    return r


def check(ffmpeg_bin: Path, ffprobe_bin: Path, run: Runner = run_command) -> Report:
    rep = Report(Path(ffmpeg_bin), Path(ffprobe_bin))
    rep.missing_filters, rep.missing_libs = set(REQUIRED_FILTERS), set(REQUIRED_LIBS)

    if not _executable(rep.ffmpeg_bin):
        rep.problems.append(f"ffmpeg not found (or not executable) at {rep.ffmpeg_bin}; set FFMPEG_BIN in .env")
    else:
        ff = str(rep.ffmpeg_bin)
        v = _call(run, [ff, "-hide_banner", "-version"], "ffmpeg -version", rep)
        if v is not None:
            rep.version = (v.stdout.splitlines() or [""])[0].strip()
            f = _call(run, [ff, "-hide_banner", "-filters"], "ffmpeg -filters", rep)
            b = _call(run, [ff, "-hide_banner", "-buildconf"], "ffmpeg -buildconf", rep)
            if f is not None:
                rep.found_filters = parse_filter_names(f.stdout)
            if b is not None:
                rep.found_libs = parse_enabled_libs(b.stdout + "\n" + b.stderr)
            rep.missing_filters = set(REQUIRED_FILTERS) - rep.found_filters
            rep.missing_libs = set(REQUIRED_LIBS) - rep.found_libs
            rep.problems += [f"missing filter: {name}" for name in REQUIRED_FILTERS if name in rep.missing_filters]
            rep.problems += [f"not built with {name}" for name in REQUIRED_LIBS if name in rep.missing_libs]

    if not _executable(rep.ffprobe_bin):
        rep.problems.append(f"ffprobe not found (or not executable) next to ffmpeg at {rep.ffprobe_bin}")
    else:
        _call(run, [str(rep.ffprobe_bin), "-hide_banner", "-version"], "ffprobe -version", rep)
    return rep


def main(env: Mapping[str, str] | None = None, root: Path | None = None, run: Runner = run_command) -> int:
    s = load_settings(env=env, root=root)
    rep = check(s.ffmpeg_bin, s.ffprobe_bin, run=run)
    print(f"ffmpeg:  {s.ffmpeg_bin}" + (f"  ({rep.version})" if rep.version else ""))
    print(f"ffprobe: {s.ffprobe_bin}")
    print("filters found:   " + (", ".join(n for n in REQUIRED_FILTERS if n in rep.found_filters) or "none"))
    print("libraries found: " + (", ".join(n for n in REQUIRED_LIBS if n in rep.found_libs) or "none"))
    if rep.problems:
        print("FFMPEG CHECK FAILED:", file=sys.stderr)
        for p in rep.problems:
            print(f"  - {p}", file=sys.stderr)
        return 1
    print("ffmpeg check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
