"""Tests for engine.config (Phase 0 settings) and the .env.example guards.

None of these tests reads the repo's .env, needs the network, a key or a container.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest
from dotenv import dotenv_values

import engine
from engine.config import load_settings, secret_values
from engine.redact import redact

REPO_ROOT = Path(engine.__file__).resolve().parents[2]
PHASE0_VARS = ("ASSETS_DIR", "STEP_CACHE_PATH", "PROOFS_OUT_DIR", "FFMPEG_BIN")


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch, tmp_path):
    for name in PHASE0_VARS:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("HOME", str(tmp_path / "home"))


def test_defaults_when_env_is_empty(tmp_path):
    s = load_settings(env={}, root=tmp_path)
    assert s.root == tmp_path
    assert s.assets_dir == tmp_path / "assets"
    assert s.step_cache_path == tmp_path / ".cache" / "steps.sqlite3"
    assert s.proofs_out_dir == tmp_path / "proofs" / "out"
    assert s.ffmpeg_bin == tmp_path / "home" / "tools" / "ffmpeg" / "ffmpeg"
    assert s.ffprobe_bin == tmp_path / "home" / "tools" / "ffmpeg" / "ffprobe"


def test_relative_paths_resolve_against_root_not_cwd(tmp_path, monkeypatch):
    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir()
    monkeypatch.chdir(elsewhere)
    s = load_settings(env={"ASSETS_DIR": "./data/a"}, root=tmp_path / "repo")
    assert s.assets_dir == tmp_path / "repo" / "data" / "a"


def test_absolute_paths_are_kept(tmp_path):
    s = load_settings(env={"PROOFS_OUT_DIR": "/abs/out"}, root=tmp_path)
    assert s.proofs_out_dir == Path("/abs/out")


def test_empty_values_count_as_unset(tmp_path):
    s = load_settings(env={"ASSETS_DIR": "", "FFMPEG_BIN": "   "}, root=tmp_path)
    assert s.assets_dir == tmp_path / "assets"
    assert s.ffmpeg_bin == tmp_path / "home" / "tools" / "ffmpeg" / "ffmpeg"


def test_ffprobe_comes_from_the_ffmpeg_bin_folder_never_from_path(tmp_path, monkeypatch):
    on_path = tmp_path / "pathbin"
    on_path.mkdir()
    (on_path / "ffprobe").write_text("#!/bin/sh\n")
    monkeypatch.setenv("PATH", str(on_path))
    s = load_settings(env={"FFMPEG_BIN": "/x/bin/ffmpeg"}, root=tmp_path)
    assert s.ffmpeg_bin == Path("/x/bin/ffmpeg")
    assert s.ffprobe_bin == Path("/x/bin/ffprobe")


def test_dotenv_is_read_from_root_only_and_process_env_wins(tmp_path, monkeypatch):
    root = tmp_path / "repo"
    root.mkdir()
    (root / ".env").write_text("ASSETS_DIR=./from-dotenv\nPROOFS_OUT_DIR=./p-dotenv\n")
    cwd = tmp_path / "cwd"
    cwd.mkdir()
    (cwd / ".env").write_text("ASSETS_DIR=./wrong-cwd-dotenv\n")
    monkeypatch.chdir(cwd)
    monkeypatch.setenv("PROOFS_OUT_DIR", "./p-process")
    s = load_settings(root=root)
    assert s.assets_dir == root / "from-dotenv"
    assert s.proofs_out_dir == root / "p-process"


def test_settings_never_hold_keys(tmp_path):
    env = {
        "HIGGSFIELD_KEY_SECRET": "hf-test-secret-1234567890",
        "GEMINI_API_KEY": "gemini-test-key-0987654321",
        "ASSETS_DIR": "./a",
    }
    s = load_settings(env=env, root=tmp_path)
    dump = repr(s) + repr(vars(s))
    assert "hf-test-secret" not in dump
    assert "gemini-test-key" not in dump



def test_an_empty_exported_variable_does_not_hide_the_dotenv_value(tmp_path, monkeypatch):
    root = tmp_path / "repo"
    root.mkdir()
    (root / ".env").write_text("ASSETS_DIR=./custom-assets\n")
    monkeypatch.setenv("ASSETS_DIR", "")
    assert load_settings(root=root).assets_dir == root / "custom-assets"


def test_secret_values_come_from_the_dotenv_file_and_the_environment(tmp_path, monkeypatch):
    root = tmp_path / "repo"
    root.mkdir()
    (root / ".env").write_text("HIGGSFIELD_KEY_SECRET=plainFAKEsecret77\nASSETS_DIR=./a\nSHORT_KEY=abc\n")
    monkeypatch.setenv("OTHER_API_TOKEN", "envtokenvalue9")
    values = set(secret_values(root=root))
    assert {"plainFAKEsecret77", "envtokenvalue9"} <= values
    assert "./a" not in values and "abc" not in values


def test_secret_values_with_an_explicit_env_read_nothing_else(tmp_path):
    assert secret_values(env={"X_API_KEY": "explicit123", "ASSETS_DIR": "./a"}, root=tmp_path) == ("explicit123",)

def test_default_root_is_the_repo_root():
    s = load_settings(env={})
    assert s.root == REPO_ROOT
    assert (s.root / "pyproject.toml").is_file()


# --- .env.example guards (the template is committed; it must never carry a secret) ---

SECRET_NAME = re.compile(r"(KEY|SECRET|TOKEN|PASSWORD)", re.IGNORECASE)


def test_env_example_holds_no_secret_values():
    values = dotenv_values(REPO_ROOT / ".env.example")
    filled = sorted(k for k, v in values.items() if SECRET_NAME.search(k) and v)
    assert filled == [], f".env.example has values for secret-named keys: {filled}"


def test_env_example_matches_the_code_defaults(tmp_path):
    values = dotenv_values(REPO_ROOT / ".env.example")
    missing = [k for k in PHASE0_VARS if k not in values]
    assert missing == [], f".env.example lacks the Phase 0 settings: {missing}"
    from_template = load_settings(env={k: values[k] or "" for k in PHASE0_VARS}, root=tmp_path)
    assert from_template == load_settings(env={}, root=tmp_path)


# --- engine.ffmpeg: the FFMPEG_BIN capability check (fails closed) ---
# Fixtures are verbatim excerpts of real output captured on 6 Nov 2026 from
#   /opt/homebrew/bin/ffmpeg 9.0.1 (stock Homebrew: no libass/freetype/harfbuzz) and
#   ~/tools/ffmpeg/ffmpeg 9.0.2 (martin-riedl.de signed release).

import subprocess  # noqa: E402

from engine.ffmpeg import RunResult, check, main  # noqa: E402

FILTERS_HEADER = """Filters:
  T.. = Timeline support
  .S. = Slice threading
  A = Audio input/output
  V = Video input/output
  N = Dynamic number and/or type of input/output
  | = Source or sink filter
  ------
"""

HOMEBREW_901_FILTERS = FILTERS_HEADER + """\
 TS allpass           A->A       Apply a two-pole all-pass filter.
 .. amix              N->A       Audio mixing.
 TS asuperpass        A->A       Apply high order Butterworth band-pass filter.
 TS bandpass          A->A       Apply a two-pole Butterworth band-pass filter.
 TS bass              A->A       Boost or cut lower frequencies.
 TS highpass          A->A       Apply a high-pass filter with 3dB point frequency.
 .. loudnorm          A->A       EBU R128 loudness normalization
 TS lowpass           A->A       Apply a low-pass filter with 3dB point frequency.
 .. sidechaincompress AA->A      Sidechain compressor.
 T. virtualbass       A->A       Audio Virtual Bass.
 .. anullsink         A->|       Do absolutely nothing with the input audio.
 TS overlay           VV->V      Overlay a video source on top of the input.
 .. nullsrc           |->V       Null video source, return unprocessed video frames.
"""

HOMEBREW_901_BUILDCONF = """
  configuration:
    --prefix=/opt/homebrew/Cellar/ffmpeg/9.0.1_1
    --enable-shared
    --enable-pthreads
    --enable-version3
    --cc=clang
    --host-cflags=
    --host-ldflags=
    --enable-ffplay
    --enable-gpl
    --enable-libsvtav1
    --enable-libopus
    --enable-libx264
    --enable-libmp3lame
    --enable-libdav1d
    --enable-libvmaf
    --enable-libvpx
    --enable-libx265
    --enable-openssl
    --enable-videotoolbox
    --enable-audiotoolbox
    --enable-neon
"""

MR_902_FILTERS = FILTERS_HEADER + """\
 TS bass              A->A       Boost or cut lower frequencies.
 TS highpass          A->A       Apply a high-pass filter with 3dB point frequency.
 .. loudnorm          A->A       EBU R128 loudness normalization
 .. sidechaincompress AA->A      Sidechain compressor.
 .. anullsink         A->|       Do absolutely nothing with the input audio.
 .. ass               V->V       Render ASS subtitles onto input video using the libass library.
 T. drawtext          V->V       Draw text on top of video frames using libfreetype library.
 .. subtitles         V->V       Render text subtitles onto input video using the libass library.
 .. nullsrc           |->V       Null video source, return unprocessed video frames.
"""

MR_902_BUILDCONF = """
  configuration:
    --prefix=/Volumes/ffmpeg_arm64/out
    --pkg-config-flags=--static
    --extra-version='https://www.martin-riedl.de'
    --enable-gray
    --enable-libxml2
    --enable-version3
    --enable-gpl
    --enable-openssl
    --enable-libfreetype
    --enable-fontconfig
    --enable-libharfbuzz
    --enable-libbluray
    --enable-libass
    --enable-libx264
    --enable-libmp3lame
"""


def make_bins(tmp_path, ffprobe=True):
    d = tmp_path / "bin"
    d.mkdir()
    names = ["ffmpeg", "ffprobe"] if ffprobe else ["ffmpeg"]
    for n in names:
        (d / n).write_text("#!/bin/sh\n")
        (d / n).chmod(0o755)
    return d / "ffmpeg", d / "ffprobe"


def fake_runner(filters, buildconf, probe_rc=0, calls=None, crash=None, timeout=False):
    def run(argv):
        if calls is not None:
            calls.append(list(argv))
        exe, args = Path(argv[0]).name, argv[1:]
        if timeout:
            raise subprocess.TimeoutExpired(argv, 20)
        if crash and exe == "ffmpeg":
            return RunResult(crash[0], "", crash[1])
        if exe == "ffprobe":
            return RunResult(probe_rc, "ffprobe version 9.0.2-test\n", "" if probe_rc == 0 else "boom\n")
        if "-filters" in args:
            return RunResult(0, filters, "")
        if "-buildconf" in args:
            return RunResult(0, buildconf, "Exiting with exit code 0\n")
        if "-version" in args:
            return RunResult(0, "ffmpeg version 9.0.2-test\n", "")
        raise AssertionError(f"unexpected call: {argv}")
    return run


def test_stock_homebrew_build_is_rejected_naming_every_gap(tmp_path):
    ff, fp = make_bins(tmp_path)
    r = check(ff, fp, run=fake_runner(HOMEBREW_901_FILTERS, HOMEBREW_901_BUILDCONF))
    assert r.missing_filters == {"subtitles", "ass", "drawtext"}
    assert r.missing_libs == {"libass", "libfreetype", "libharfbuzz"}
    assert r.problems, "a build without libass must not pass"


def test_bass_highpass_and_friends_never_count_as_ass(tmp_path):
    ff, fp = make_bins(tmp_path)
    listing = MR_902_FILTERS.replace(
        " .. ass               V->V       Render ASS subtitles onto input video using the libass library.\n", ""
    ) + " T. virtualbass       A->A       Audio Virtual Bass.\n TS allpass           A->A       Apply a two-pole all-pass filter.\n"
    r = check(ff, fp, run=fake_runner(listing, MR_902_BUILDCONF))
    assert r.missing_filters == {"ass"}



def test_an_older_three_flag_filter_listing_is_parsed_too(tmp_path):
    # ffmpeg 7 and earlier print three flag characters per filter ("TSC").
    ff, fp = make_bins(tmp_path)
    older = """Filters:
  T.. = Timeline support
  .S. = Slice threading
  ..C = Command support
 TSC bass              A->A       Boost or cut lower frequencies.
 ... ass               V->V       Render ASS subtitles onto input video using the libass library.
 T.C drawtext          V->V       Draw text on top of video frames using libfreetype library.
 ... subtitles         V->V       Render text subtitles onto input video using the libass library.
 ... loudnorm          A->A       EBU R128 loudness normalization
 ... sidechaincompress AA->A      Sidechain compressor.
"""
    r = check(ff, fp, run=fake_runner(older, MR_902_BUILDCONF))
    assert r.problems == []

def test_signed_9_0_2_build_passes(tmp_path):
    ff, fp = make_bins(tmp_path)
    r = check(ff, fp, run=fake_runner(MR_902_FILTERS, MR_902_BUILDCONF))
    assert r.problems == []
    assert {"subtitles", "ass", "drawtext", "loudnorm", "sidechaincompress"} <= r.found_filters
    assert {"libass", "libfreetype", "libharfbuzz"} <= r.found_libs


def test_missing_ffmpeg_fails_closed_without_running_anything(tmp_path):
    calls = []
    r = check(tmp_path / "nope" / "ffmpeg", tmp_path / "nope" / "ffprobe",
              run=fake_runner(MR_902_FILTERS, MR_902_BUILDCONF, calls=calls))
    assert any("not found" in p for p in r.problems)
    assert calls == []


def test_crashing_ffmpeg_is_a_problem_with_its_exit_code_and_stderr(tmp_path):
    ff, fp = make_bins(tmp_path)
    r = check(ff, fp, run=fake_runner("", "", crash=(-6, "dyld[1]: Library not loaded: libvpx.11.dylib\n")))
    joined = " ".join(r.problems)
    assert "-6" in joined and "libvpx.11.dylib" in joined


def test_ffmpeg_that_times_out_is_a_problem(tmp_path):
    ff, fp = make_bins(tmp_path)
    r = check(ff, fp, run=fake_runner("", "", timeout=True))
    assert any("timed out" in p for p in r.problems)


def test_missing_ffprobe_next_to_ffmpeg_is_a_problem(tmp_path):
    ff, fp = make_bins(tmp_path, ffprobe=False)
    r = check(ff, fp, run=fake_runner(MR_902_FILTERS, MR_902_BUILDCONF))
    assert any("ffprobe" in p and "not found" in p for p in r.problems)


def test_ffprobe_that_fails_is_a_problem(tmp_path):
    ff, fp = make_bins(tmp_path)
    r = check(ff, fp, run=fake_runner(MR_902_FILTERS, MR_902_BUILDCONF, probe_rc=1))
    assert any("ffprobe" in p for p in r.problems)


def test_main_exits_1_when_ffmpeg_is_missing(tmp_path, capsys):
    rc = main(env={"FFMPEG_BIN": str(tmp_path / "nope" / "ffmpeg")}, root=tmp_path)
    assert rc == 1
    assert "not found" in capsys.readouterr().err


def test_main_exits_0_and_lists_what_it_found_on_a_capable_build(tmp_path, capsys):
    ff, fp = make_bins(tmp_path)
    rc = main(env={"FFMPEG_BIN": str(ff)}, root=tmp_path, run=fake_runner(MR_902_FILTERS, MR_902_BUILDCONF))
    out = capsys.readouterr().out
    assert rc == 0
    for word in ("subtitles", "ass", "drawtext", "libass", "libfreetype", "libharfbuzz", str(fp)):
        assert word in out



def test_ffmpeg_that_cannot_be_executed_is_a_problem(tmp_path):
    ff, fp = make_bins(tmp_path)

    def run(argv):
        raise PermissionError(13, "Permission denied")

    r = check(ff, fp, run=run)
    assert any("could not run" in p for p in r.problems)


def test_buildconf_failing_while_filters_work_is_a_problem(tmp_path):
    ff, fp = make_bins(tmp_path)
    base = fake_runner(MR_902_FILTERS, MR_902_BUILDCONF)

    def run(argv):
        if "-buildconf" in argv:
            return RunResult(1, "", "Unrecognized option 'buildconf'.\n")
        return base(argv)

    r = check(ff, fp, run=run)
    assert r.missing_libs == {"libass", "libfreetype", "libharfbuzz"}
    assert any("-buildconf" in p for p in r.problems)



def test_ffmpeg_that_prints_invalid_utf8_is_reported_not_a_crash(tmp_path):
    d = tmp_path / "bin"
    d.mkdir()
    for name in ("ffmpeg", "ffprobe"):
        (d / name).write_text("#!/bin/sh\nprintf '\\377\\376 not utf-8'\nexit 0\n")
        (d / name).chmod(0o755)
    r = check(d / "ffmpeg", d / "ffprobe")
    assert r.missing_filters == {"subtitles", "ass", "drawtext", "loudnorm", "sidechaincompress"}

# The template guard also reads comments and URLs: a filled-in commented line or a password in a URL is still a
# secret in a committed file.
SECRET_ASSIGNMENT_LINE = re.compile(
    r"^\s*(?:#+\s*)?(?:export\s+)?[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*\s*[=:]\s*\S", re.IGNORECASE
)
URL_CREDENTIALS = re.compile(r"[a-z][a-z0-9+.-]*://[^/\s@]*:[^/\s@]+@", re.IGNORECASE)
QUERY_SECRET = re.compile(r"[?&](password|passwd|pwd|secret|token|key)=[^&\s]+", re.IGNORECASE)



def carries_a_secret(line: str) -> bool:
    return bool(SECRET_ASSIGNMENT_LINE.match(line) or URL_CREDENTIALS.search(line) or QUERY_SECRET.search(line)
                or redact(line) != line)


@pytest.mark.parametrize("line", [
    "REDIS_URL=redis://:hunter2pass@localhost:6379/0",
    "DATABASE_URL=postgresql://u:p@localhost/db",
    "## GEMINI_API_KEY=AIzaFAKE",
    "# export GEMINI_API_KEY=AIzaFAKE",
    "export HIGGSFIELD_KEY_SECRET=abc",
    "S3_ENDPOINT=http://localhost:9000/?password=pw",
    "# gemini_api_key=AIzaSyFAKEFAKEFAKEFAKE12345",
    "# example: AIzaSyFAKEFAKEFAKEFAKE12345",
    "ELEVENLABS_VOICE_ID_DEFAULT=sk_" + "a" * 48,
    "GEMINI_API_KEY_JUDGE: AIzaSyFAKEFAKEFAKEFAKE12345",
    "NEXT_PUBLIC_API_URL=http://localhost:4000/?api_key=realkeyvalue123",
])
def test_the_template_guard_flags_secret_lines(line):
    assert carries_a_secret(line)


@pytest.mark.parametrize("line", [
    "HIGGSFIELD_KEY_ID=",
    "# S3_ACCESS_KEY=",
    "NEXT_PUBLIC_API_URL=http://localhost:4000",
    "REDIS_URL=redis://localhost:6379/0",
    "# Optional second Gemini key so QC never starves behind planning.",
])
def test_the_template_guard_passes_safe_lines(line):
    assert not carries_a_secret(line)

def test_env_example_has_no_secret_even_in_comments_or_urls():
    lines = (REPO_ROOT / ".env.example").read_text(encoding="utf-8").splitlines()
    bad = [n for n, line in enumerate(lines, 1) if carries_a_secret(line)]
    assert bad == [], f".env.example lines carrying a secret value or URL credentials: {bad}"
