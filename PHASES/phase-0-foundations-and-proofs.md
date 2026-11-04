# Phase 0 — Foundations and proofs (about 2 weeks)

Goal: prove the four things the plan rests on with real API calls, and lay the repo skeleton. No product UI yet.
Gate G0: one 15-second Hindi ad assembled from API outputs only, passing the "feels like an ad" checklist
(`docs/plan/00-plan.md`, section "Anatomy of a 15 s and a 30 s ad").

Everything runs locally. No hosting. LLM calls only through the free keys.

**No containers in Phase 0 (owner decision, 4 Nov 2026).** No Docker, Postgres, Redis or MinIO until Phase 1, task 1.1.
Phase 0 runs on plain files only, all gitignored:
- **Assets** (downloaded provider outputs, uploaded references): the local folder `assets/`, behind a small storage
  interface (`workers/engine/storage.py`, a local-folder store) so 1.1 can swap in MinIO without changing callers.
- **Step cache** (`sha256(step, inputs)` → result reference) and the **LLM cache**: one local SQLite file,
  `.cache/steps.sqlite3` (Python's built-in `sqlite3`, tables `steps` and `llm_cache`; SQLite rather than JSON because
  parallel proof jobs write to it at the same time: WAL mode, a busy timeout, one connection per thread).
  A `steps` row is written as `submitted` (provider, request id) as soon as `submit()` returns, so a stopped script
  resumes polling that request on the next run instead of paying again. Only `done` rows (output already in
  `assets/`) are cache hits; `failed` and `nsfw` rows are not.
- **Proof outputs and request logs**: `proofs/out/<YYYY-MM-DD>/`. Every provider call appends one line to
  `requests.jsonl` there (provider, slug, request id, status, timings, estimate; never a key or a secret).
- **Approvals and hand-offs**: there is no `references` table yet, so each proof writes
  `proofs/out/<date>/<proof>/manifest.json` (asset paths, sha256, request ids, and the human picks with `approved_by`
  and `approved_at`) and updates `proofs/out/latest/<proof>.json`. A later proof reads the latest manifest, never a
  dated folder by glob, so approved pixels stay the truth.
- **Provider inputs**: a local asset reaches Higgsfield only through `upload(path)` → `public_url`. The step cache
  stores the local `assets/` path, never a provider URL (those expire); a file is uploaded again when its URL is stale
  or rejected.
- **No webhooks**: Phase 0 has no public URL, so adapters poll. Webhook signature checks are unit-tested offline.

## 0.1 Repo skeleton
- Monorepo: `apps/web` (Next.js, TS), `apps/api` (TS; Fastify or Hono), `workers/` (Python 3.12), `content/`, `packages/contracts` (JSON schemas shared by both sides; Pydantic models generated from them). Python is one uv workspace rooted at the repo (`pyproject.toml` at the root with `workers` as a member; `proofs/` and `scripts/` import `engine`), so every `uv run` in this package works from the repo root.
- No `docker-compose.yml` yet (it arrives in 1.1). Instead: the plain-file layout above (`assets/`, `.cache/`,
  `proofs/out/`), created on first use, all three gitignored (`/assets/` and `/.cache/` are anchored to the repo root
  so other folders named `assets` stay tracked).
- `.env.example` keeps its existing keys (`HIGGSFIELD_KEY_ID`, `HIGGSFIELD_KEY_SECRET`, `HIGGSFIELD_WEBHOOK_SECRET`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID_DEFAULT`, `GEMINI_API_KEY`, `GEMINI_API_KEY_JUDGE`, `GROQ_API_KEY`, `NVIDIA_API_KEY`, `OPENROUTER_API_KEY`, `NEXT_PUBLIC_API_URL`, `HOSTING_PHASE_UNLOCKED`) and adds the Phase 0 paths `ASSETS_DIR=./assets`, `STEP_CACHE_PATH=./.cache/steps.sqlite3`, `PROOFS_OUT_DIR=./proofs/out`, plus `FFMPEG_BIN=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg` (owner decision 4 Nov 2026: Homebrew's default ffmpeg has no libass, freetype or harfbuzz, so it cannot burn Devanagari captions; the engine config reads `FFMPEG_BIN` and takes ffprobe from the same folder, never whatever `ffmpeg` is first on PATH). `DATABASE_URL`, `REDIS_URL` and `S3_*` move to a commented-out "Phase 1.1" block.
- `config/llm.yaml`: ordered chain with model ids, per-role temperature, per-provider rate limits. `config/router.yaml`: model routing per shot type and preset (from `docs/plan/00-plan.md` → Model routing).
- Acceptance: `uv run python -c "import engine"` works; `pnpm -r build` works; `uv run pytest` passes a smoke test that writes and reads back one asset and one step-cache entry in a temp folder; a check confirms `$FFMPEG_BIN` has the `subtitles`, `ass`, `drawtext`, `loudnorm` and `sidechaincompress` filters; nothing needs or starts a container.

## 0.2 Higgsfield adapter (`workers/adapters/higgsfield.py`)
- `estimate(slug, payload)`, `submit(slug, payload, idempotency_key, webhook_url=None)`, `status(request_id)`, `result(request_id)`, `upload(path)`, `cancel`, `delete`.
- Handles `queued → in_progress → completed | failed | nsfw | canceled`; `nsfw` is terminal and refunded; 429 `account_queue_full` honours `Retry-After`; downloads outputs to the local `assets/` folder before returning and logs each call to `proofs/out/<date>/requests.jsonl`. Phase 0 polls (`webhook_url` stays `None`).
- Canary: `scripts/model_canary.py` calls `POST /estimate/<slug>` (free) for every slug in `config/router.yaml` and makes real renders only for Soul 2 (one image) and Wan 3.0 (one 3 s clip), then reports which slugs are alive (owner decision 4 Nov 2026).
- Acceptance: a real Soul 2 image lands in `assets/` and its request id is in the request log; `estimate` returns a USD figure for Kling 3.0 Pro (logged for the owner, never shown on the website).

## 0.3 ElevenLabs adapter (`workers/adapters/elevenlabs.py`) + localizer
- `tts(text_dev, voice_id, model='eleven_v4', language_code='hi', settings, previous_text, next_text, seed)` → mp3 + duration.
- `align(audio_path, text)` → words with start/end (Forced Alignment); fallback `tts_with_timestamps`.
- `sfx(prompt, seconds)`, `music(prompt, ms, instrumental=True)`.
- Localizer, rule-based part only (owner decision 4 Nov 2026): the deterministic rules of prompt 4 in `docs/plan/04-system-instructions.md`, unit-tested: numbers, ₹, %, dates and phone numbers → Devanagari words (phone digit by digit, `[short pause]` every 5 digits); energy → one audio tag from the fixed map; pause tags; emojis, hashtags and markdown stripped; brand names Latin or the glossary respelling. The LLM part of prompt 4 (pacing rewrites, register forms, pronunciation overrides for names not in the glossary) is wired on the free chain after 0.4.
- Acceptance: the sample Diwali script (5 beats) is voiced, measured, and aligned; a JSON of word times is written.

## 0.4 Free LLM chain (`workers/llm/chain.py`)
- Providers in order from `config/llm.yaml`; each call: JSON-schema validation, one retry on malformed output, `Retry-After` + jittered backoff on 429, fall to the next provider on 429/5xx/timeout.
- Separate keys/quotas for planner and judge roles. Results cached by content hash in the local SQLite file (`.cache/steps.sqlite3`, table `llm_cache`).
- Daily canary that drops a dead model id from the chain and logs remaining quota.
- Acceptance: prompt 1 (hooks) returns 6 valid hooks for the sample brief from the first provider. Fallback is tested against the retry rules in `config/llm.yaml` with an injected test transport and a fake clock (no quota spent): a 5xx from provider 1 goes straight to provider 2; a 429 with `Retry-After` waits that long; a 429 without it backs off 1, 2, 4, 8 s with jitter, then falls to provider 2 (owner decision 4 Nov 2026).

## 0.5 Proof A — face consistency
`proofs/a_face.py`: make 4 AI-actor candidates with Soul 2 → pick one → generate 20 views → train Soul ID (v2) → render 10 Soul 2 stills in different scenes with `custom_reference_id`. Output a contact sheet. Pass: a human says the same person in ≥ 9/10.

## 0.6 Proof B — video from approved stills
`proofs/b_video.py`: from Proof A's stills plus a product reference (Marketing Studio Image), render 6 shots of 3 s with Kling 3.0 Pro image-to-video (`sound: off`), one with Wan 3.0 for comparison. QC judge (prompt 5) on each. Pass: face and product hold in ≥ 5/6 by human check and judge agreement ≥ 80 %.
Input: the product photo is the owner's call; ask before using any photo (owner decision 4 Nov 2026).

## 0.7 Proof C — Hindi voice
`proofs/c_voice.py`: Eleven v4 reads a Devanagari script with ₹499, a date, a phone number and the brand name; three stability settings; forced alignment. Pass: a Hindi speaker rates pronunciation ≥ 4/5 and word times line up within 60 ms on spot checks.

## 0.8 Proof D — template re-shoot
`proofs/d_reshoot.py`: Genjutsu motion transfer over a 15 s clip with a new product and face. Pass: cuts and timing preserved; product recognisable; face consistent.
Input: the 15 s source clip and the product photo are the owner's call (licence); ask before using any (owner decision 4 Nov 2026).

## 0.9 Hand-assembled ad (compositor v0) → G0
`proofs/e_assemble.py`: cut the Proof B shots to the Proof C voice, burn captions from alignment, duck a music bed, add an end card, loudnorm, export 9:16. Run the checklist by hand. This is G0.

## Summaries
After each of 0.2, 0.4, each proof, and at G0: run the `phase-summary` skill. The phase summary must say which proofs passed, what the routing table changed, and that hosting remains the last phase.
