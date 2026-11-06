# Phase 1 — Core pipeline, local (about 4 weeks)

Goal: brief → opening → making → your ad works end to end on the dev machine, in Simple mode, for the sample
business and four more verticals. Gate G1: 10 ads across 5 verticals blind-rated ≥ 7/10 by three raters; cost per
ad within the plan's cost table (`docs/plan/00-plan.md` → Cost and time per ad).

## 1.1 Local services + data model (`docker-compose.yml`; `apps/api` migrations; Pydantic mirrors in `packages/contracts`)
1. Containers, which Phase 0 did without (owner decision, 4 Nov 2026): `docker-compose.yml` with postgres:16, redis:7
   and minio (bucket `assets`, console on :9001), local only (hosting stays Phase 4). `.env.example` gets the
   `DATABASE_URL`, `REDIS_URL`, `S3_*` block back (uncommented).
2. Tables from `docs/plan/03-contracts.md`: workspaces, users, brand_kits, references (kind, lineage, approval),
   ads (mode, brief JSON, versions), hooks, beats (measured start/end), shots, takes (QC JSON, provenance), voice_tracks
   (alignment JSON), jobs (input_hash, status), ledger, renders, content_* (versioned JSON).
3. The Phase 0 plain-file stores move behind the same interfaces: assets from `assets/` to MinIO; the step and LLM
   caches from `.cache/steps.sqlite3` to worker-side cache tables outside the shared contract (Phase 0 proof steps
   belong to no ad, so they do not go into `jobs`); a one-off import keeps the Phase 0 entries so finished proofs stay
   cached. The exact cache tables are part of the 1.1 plan, which needs the owner's yes because it touches the data model.

Acceptance: `docker compose up -d postgres redis minio` is healthy; migrations create every table above; the Phase 0
entries are imported; `uv run pytest` passes on the new stores.

## 1.2 Job graph (`workers/engine/graph.py`)
Steps: `voice` → `stills` (parallel) → `approve` (auto in Simple/Draft/Standard; human in Master) → `video`
(parallel) → `qc` (per take) → `assemble` → `reframe` → `export`. Each step idempotent by `sha256(step, inputs)`;
one re-roll on QC fail/unknown, then "needs attention" and the ad still assembles with the best take.
Generation retries (owner answers, 6 Nov 2026; these supersede the blanket "one automatic retry on a provider error"
in `docs/plan/03-contracts.md` and `docs/plan/00-plan.md`):
- Higgsfield: no automatic retry of a generation. A terminal `failed` or `nsfw` stops and asks the owner (a later
  retry uses a new key, step key + attempts). An ambiguous submit (timeout or 5xx, no request id recorded) is resent
  only with the SAME key and body, and only once 0.2b has proven the live idempotency replay. A 429 queue-full
  (nothing created, nothing charged) waits for Retry-After and resends with the same key.
- ElevenLabs (voice, SFX, music): never resent automatically after an ambiguous outcome. It goes through the 0.3
  history match, otherwise the step needs attention, and only `--allow-repay` resends. A clear, uncharged rejection
  (a 429 concurrency limit) backs off and resends. Concurrency = account tier − 2. Webhook receiver on the API (local URL; ngrok/quick
tunnel only when testing webhooks); polling fallback every 10 s.

## 1.3 Script Brain (`workers/brain/`)
Prompts 1 (hooks/beats/shots), 3 (compiler + score gate ≥ 40), 4 (localizer), 2 (script mode) from
`docs/plan/04-system-instructions.md`, run on the free chain with JSON schemas in `packages/contracts/brain/`.
Hooks stream first. Changing a hook re-runs beats → shots → compile only.

## 1.4 Shot Engine (`workers/engine/`)
Router from `config/router.yaml` (Draft: Wan 3.0; Standard: Kling 3.0 Pro; Master: Kling 4.0; multi-ref: Kling O3 /
Seedance 2.5; first-last: Kling O3). Ordered references: face, product, room. Approved still is the first frame.
QC judge (prompt 5) on 8 frames + references; tri-state; provenance stored.
Model readiness (owner rule, 6 Nov 2026): a model is ready only when it has a payload builder, a unit test for that builder, and one passing real render recorded in `proofs/out/`. The
router routes only to slugs with `status: ready` in `config/router.yaml`; an `unproven` slug is never chosen, by a
preset or by Auto. Kling O3, Kling 4.0, Seedance 2.5 and Cinema Studio 4.0 get their first real renders in 1.8,
before the eval ads.

## 1.5 Compositor v1 (`workers/compositor/`)
Cut each shot to its beat words + 0.3 s tail; captions from alignment (2–4 words per card, Devanagari or Latin,
inside the safe box x 65–1015 / y 270–1250 on 1080×1920); music ducked −12 dB; SFX at hits; end card 2–3 s; two-pass
loudnorm I=-14 TP=-1 LRA=11; outputs 9:16 master, 1:1 and 16:9 reframes, SRT, cover.

## 1.6 API (`apps/api`)
Routes from `docs/plan/03-contracts.md` (brands, references, ads, hooks, plan, voice, storyboard, render, retake,
export, events SSE, estimate, ledger, webhooks, content). Estimate and ledger are always computed but never
rendered in the UI: the web app receives time and model detail only (no money fields), per the no-money rule.

## 1.7 Web app (`apps/web`) from `mockup/studio-ui` (v5)
Follow `docs/design/FRONTEND_STACK.md` and `docs/design/DESIGN_SYSTEM.md`. Port the mockup's components to real data: landing page, Create (brief with product and free-text offer, no price field, photos, voice picker fed by the ElevenLabs Voice
Library, video-model picker fed by `config/router.yaml`, chips, live reel), Opening (hook cards),
Making (frame strip fed by SSE), Your ad (player, four quick actions, send to WhatsApp, save all sizes). Advanced
switch reveals: quality preset, the Production table (step, model, time), beat editor, storyboard approval, Director's Cut (Phase 2),
scorecard, per-model resolution, shot length and time per shot in the model picker. No money anywhere, in either mode. A model chosen for the whole ad overrides the preset's video
slug; a per-shot override (Director's Cut) wins over both. The picker lists only `ready` models; an `unproven` one
stays hidden until it has a payload builder, a unit test for that builder, and one passing real render recorded in `proofs/out/` (model readiness rule, CLAUDE.md); all seven picker
models stay in the product. Keep the design tokens and GSAP moments from the mockup
(skill `ui-system`). Done = the DESIGN_SYSTEM.md checklist, including the no-money DOM search in Playwright.

## 1.8 Eval set → G1
First, model readiness for the four models the router cannot reach yet (Kling O3, Kling 4.0, Seedance 2.5, Cinema
Studio 4.0): for each, a payload builder with a unit test and one passing direct adapter test render, under a PAID CALLS line
in a plan the owner has said go to, recorded in `proofs/out/`. Only then does `config/router.yaml` mark it ready, and
only then do the eval ads run.
Ten ads: sweets, kirana, salon, fashion, electronics (two each: one 15 s, one 30 s). Blind rating form (7 items
from the checklist). Record costs from the ledger into the G1 summary (an owner report, never the website). Write the G1 summary.

## Summaries
After 1.2, 1.3, 1.5, 1.7 and at G1: `phase-summary`. Each restates: hosting remains last; LLMs on free keys only;
the website shows no money, in any mode.
