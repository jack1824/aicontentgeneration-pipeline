PAID CALLS: none (no Higgsfield or ElevenLabs call in this topic; network use was free: PyPI packages, the ffmpeg download, GitHub)

# Phase 0 · 0.1a Python engine — 6 Nov 2026

## What was built
- A uv workspace at the repo root, pinned to Python 3.12, with `workers/` as its one member, so `uv run …` works from
  the root. The only third-party runtime dependency is python-dotenv.
- `engine.config`: where assets (`assets/`), the step cache (`.cache/steps.sqlite3`) and proof outputs
  (`proofs/out/`) live, and which ffmpeg to use (`FFMPEG_BIN`, with ffprobe from the same folder). Settings hold
  paths only, never a key. `secret_values()` provides key values for redaction only.
- `engine.ffmpeg`: a fail-closed capability check, `uv run python -m engine.ffmpeg`. It needs the subtitles, ass,
  drawtext, loudnorm and sidechaincompress filters and the libass, libfreetype and libharfbuzz libraries, plus a
  working ffprobe next to ffmpeg.
- `engine.storage`: a content-addressed local asset store, swapped for MinIO in 1.1. It reads the source once, so the
  stored bytes always match their hash. It writes atomically with full fsync, repairs a corrupted copy, and refuses
  empty files.
- `engine.step_cache`: the SQLite step cache that protects money.
  - A paid request is recorded as "submitted" and resumed after a crash, never paid twice.
  - A done step counts only while its file exists; a missing file reads as "stale" and is never re-paid
    automatically.
  - A report on a step must name the request in flight.
  - A paid request that cannot be recorded raises with its request id.
  - Commits survive a power loss.
- `engine.redact`: removes secrets from stored error text, and later from the 0.2 request log.
- The `.env.example` Phase 0 block (with a test that it never holds a secret). ffmpeg 9.0.2 is in `~/tools/ffmpeg`:
  the signed martin-riedl.de release, outside the repo.

## How it was verified
- Tests: 181 pass with the network blocked (macOS sandbox) and with warnings treated as errors. The concurrency test
  (8 threads plus 2 processes writing 300 rows) passed 30 of 30 runs.
- Planted bugs: 53 were planted on purpose and all were caught. Two were missed at first, and their tests were
  strengthened.
- ffmpeg check:
  - On the signed 9.0.2 build it exits 0: all 5 filters and all 3 libraries found.
  - On stock Homebrew 9.0.1 it exits 1, naming the 6 gaps.
- Binary provenance: both zips match the site's SHA256 (ffmpeg c8ed4c4e…d924, ffprobe fcbe8395…7ea6). codesign
  --verify --strict passes on both (Developer ID Application: Martin Riedl, KU3N25YGLU, hardened runtime). The
  minimum macOS is 12.0.
- Reviews: three adversarial rounds, each with the qc-reviewer brief plus a money-safety reviewer and a
  security/fail-closed reviewer. All findings were fixed. The final qc-reviewer gate returned PASS, and its low
  findings were fixed too.
- Git: the history scan found 0 Higgsfield values. The remote `main` is untouched, and `v2-rebuild` holds the first
  commit.

## What changed in the plan
- 0.1 is split into 0.1a and 0.1b. Moved out:
  - `llm.yaml` model ids → 0.4
  - the request log → 0.2
  - `llm_cache` → 0.4
  - the proof manifest → 0.5
  - Next.js → 1.7
  - the API framework → 1.6
  - the schemas → 0.4 and 1.1
- FFMPEG_BIN points at the signed martin-riedl.de build, because Homebrew has no ffmpeg-full for macOS 14.
- The step-key format is frozen: NFC text, whole-number floats written as ints, and only the Python engine computes
  keys.
- The step-cache contract:
  - reports name their request;
  - `AssetNotStored` and `RequestNotRecorded` are raised instead of plain errors;
  - `reset` needs force for a request in flight;
  - `secret_values` is passed explicitly.
- The package is 17 files, two over the ~15 line: `redact.py` (a security finding) and the PHASES note (your ffmpeg
  decision).

## What is next
- 0.1b, the pnpm workspace: waits for your go.
- The 0.2 plan carries these rules from the step-cache docstring:
  - each adapter passes `engine.config.secret_values()` to the step cache, and the request log uses `engine.redact`;
  - mark failed only on a terminal provider status (a timeout leaves the row "submitted");
  - the Higgsfield Idempotency-Key is the step key plus attempts, so the higgsfield-api skill line saying "= our step
    hash" changes in 0.2;
  - ElevenLabs has no idempotency key, so a crash between its reply and recording re-pays one TTS call (accepted
    risk);
  - the model canary: free estimates for every slug, real renders for Soul 2 and Wan 3.0 only.
- The 0.3 entry gate (the ffmpeg check exits 0) is already met.

## Open questions for the owner
- None blocking. Notes:
  - This libass build lacks Unicode line wrapping, which matters for caption wrapping in 0.9.
  - The ffmpeg check reads capabilities but doesn't render; a one-frame Devanagari render probe could join the 0.3
    gate.
  - The ffmpeg build is GPL. It runs as a local subprocess now; review the licence before Phase 4 packaging.
  - Two processes submitting the same step at the same moment would both pay. Phase 0 runs one script per proof.

Standing lines: Hosting remains the last phase (after G3). LLM calls stay on the free keys. The website shows no money, in any mode.
