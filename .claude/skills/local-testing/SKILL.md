---
name: local-testing
description: How to run and test the whole stack on the dev machine with no hosting — docker compose services, env keys, worker and app commands, the Phase 0 proof scripts, webhook testing, pilot sessions over a temporary quick tunnel, and what "tested" means before a task is done. Load before running anything.
---
# Local testing (hosting is Phase 4; nothing is deployed before G3)

## Services
- **Phase 0: none.** No Docker, Postgres, Redis or MinIO (owner decision, 4 Nov 2026). Plain files only: assets in
  `assets/`, step and LLM cache in `.cache/steps.sqlite3`, proof outputs and request logs in `proofs/out/<date>/`.
- **From task 1.1:** `docker compose up -d postgres redis minio` (minio console on :9001, bucket `assets`, local S3 endpoint in `.env`).

## Keys (`.env`, gitignored; copy from `.env.example`)
Higgsfield key id + secret (console: fund ≥ $25 for 10 concurrent; **training opt-out ON**); ElevenLabs key (Creator plan for commercial rights and 192 kbps); the existing free LLM keys (Gemini, Groq, NVIDIA, OpenRouter). Never commit keys; never print them in logs.

## Run
- Phase 0 has no worker process and no API: proofs and canaries run as plain `uv run python` scripts from the repo root.
- Workers (from 1.2; Redis from 1.1): `uv sync && uv run celery -A engine worker -l info -c 4` (or arq) from the repo root (one uv workspace; `workers` is a member).
- API and web (Phase 1): `pnpm --filter api dev` (:4000). Web: `pnpm --filter web dev` (:3000).
- Proofs (Phase 0): `uv run python proofs/a_face.py` … `e_assemble.py`; outputs under `proofs/out/<date>/`: a contact sheet, the proof's `manifest.json` (assets, request ids, human picks) and `requests.jsonl` (one line per provider call).
- Canaries: `uv run python scripts/model_canary.py` (Higgsfield slugs), `uv run python scripts/llm_canary.py` (free LLM ids).

## Webhooks locally
Phase 0: poll only (there is no public URL and no API); webhook signatures are checked by offline unit tests.
From 1.2 (the API's webhook receiver): prefer polling in dev. To test webhooks, run `cloudflared tunnel --url http://localhost:4000` for the session only and pass the tunnel URL as `hf_webhook`; stop it afterwards. Never leave a tunnel up.

## What "tested" means
1. Unit tests pass (`pnpm test`, `uv run pytest`). 2. The one real provider call named in the plan succeeded and its evidence is saved under `workers/tests/fixtures/` or `proofs/out/`. 3. For UI work, screenshots at 1366 and 400 px are in `SUMMARIES/shots/`. 4. The qc-reviewer agent returned PASS.

## Pilot sessions (Phase 3)
Start the stack, open a quick tunnel, sit with the owner, watch them make an ad in Simple mode, log every confusion in `SUMMARIES/pilot-notes.md`, close the tunnel. Posting is done from the owner's phone.
