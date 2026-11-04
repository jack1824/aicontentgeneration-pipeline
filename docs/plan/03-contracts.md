# Contracts — job graph, data model, API

Exported from the plan's "Backend, data and API" section (locked 3 Nov 2026). This is the only surface shared
between the TypeScript app/API and the Python workers. JSON schemas for Brief, Hook, Beat, Shot, Take, QC verdict
and the job envelope live in `packages/contracts/` and are generated into Pydantic models for the workers;
changing a schema is a plan change and needs a summary.

Phase note: `lipsync` is a Phase 3 step (bake-off first); until then presenters are voice-over-led and the step is a no-op.
Hosting-related lines (signed URLs on a CDN, managed Postgres) apply from Phase 4; locally the same contract runs on
Docker Postgres and MinIO from task 1.1. Phase 0 runs the adapters on plain files (`assets/`, `.cache/steps.sqlite3`,
`proofs/out/<date>/`) and polls providers instead of using webhooks (owner decision 4 Nov 2026, Amendment A).

One TypeScript monorepo for the app and API (Next.js, shared types for Brief / Beat / Shot JSON) and Python for the workers (Shot Engine, provider adapters, compositor), decided 3 Nov. Postgres, object storage and a Redis-backed queue sit between the two sides, and the job contract (step name, input hash, JSON payload, result reference) is the only shared surface: the API enqueues, the Python workers execute. The Higgsfield and ElevenLabs Python SDKs and ffmpeg live on the worker side, Celery or arq runs the queue, and Pydantic models generated from the TypeScript JSON schemas keep both sides in step.

**Core tables**

| Table | Holds | Notes |
| --- | --- | --- |
| `workspaces`, `users` | The business and its people | Email OTP or Google login; one workspace per brand to start |
| `brand_kits` | Logo, colours, fonts, address, phone, WhatsApp number, default voice, caption style, on-screen script (Latin / Devanagari) | Drives the compositor and the end card |
| `references` | Approved images: `kind` face / product / room / style, source (upload or generated), model, prompt, hash, `parent_id` lineage, `approved_by`, `approved_at` | The spine of Consistency v3; a reference is immutable once approved |
| `ads` | Mode (auto / script / campaign), `brief` JSON, language, register, durations, aspects, preset, status, version | Everything Script Brain produced is versioned under the ad |
| `hooks` | The 6 candidates with scores, the chosen one | Kept for A/B variants |
| `beats` | Index, type, VO text (Devanagari), display text, on-screen text, energy, measured `start_ms` / `end_ms` | Timing is written only after the voice is measured |
| `shots` | Beat, index, type, reference ids, compiled prompt JSON, model, target and measured duration, chosen `take_id` | One row per shot; re-renders add takes, never rows |
| `takes` | Provider job id, model, params, cost, URL, QC verdict JSON, provenance (judge, frames, temperature) | A take is never deleted; the Director's Cut swaps between them |
| `voice_tracks` | Voice id, model, text sent, audio URL, word alignment JSON, measured duration, cost | One per beat so a beat can be re-voiced alone |
| `jobs` | Ad, step, status, attempts, `input_hash`, output ref, error, timings | The job graph; idempotent by `input_hash` |
| `ledger` | Provider, model, units, cost in INR, job id | Per-call; owner reports only, never rendered in the UI (Amendment A) |
| `renders` | Variant (hook A/B), aspect, duration, master URL, SRT, cover, scorecard JSON | What the user downloads |
| `content_*` | Templates, hook library, calendar, trend feed, campaign packs | Versioned JSON, admin-editable |

**API (REST + server-sent events)**

- Brand: `POST /brands`, `PUT /brands/:id/kit`, `POST /brands/:id/references` (upload or generate), `POST /references/:id/approve`
- Ad: `POST /ads` (brief or script) → `POST /ads/:id/hooks` → `PUT /ads/:id/hook` → `POST /ads/:id/plan` (beats + shots) → `PUT /ads/:id/beats/:n` → `POST /ads/:id/voice` → `POST /ads/:id/storyboard` (stills) → `POST /ads/:id/render` → `POST /shots/:id/retake` → `POST /ads/:id/export`
- Live: `GET /ads/:id/events` streams job state, ETA and QC verdicts (no money fields)
- Estimate: `GET /ads/:id/estimate` before render returns models and time only to the web app; the money estimate
  and `GET /ads/:id/ledger` are internal (owner role, scripts and reports), never called by apps/web
- Providers: `POST /webhooks/higgsfield`, `POST /webhooks/elevenlabs` (signed), polling fallback every 10 s when a webhook is late
- Content: `GET /content/{templates,hooks,calendar,trends}`; admin `PUT` behind a role

**Job orchestration rules**

1. One job graph per ad: `voice` → `stills` (parallel per shot) → `approve` (human gate in Master, auto in Draft) → `video` (parallel) → `lipsync` (only once the v2.1 adapter exists) → `qc` (per take) → `assemble` → `reframe` → `export`.
2. Every step is keyed by `sha256(step, inputs)`; a repeat with the same inputs returns the cached output and spends nothing.
3. Retries: one automatic retry on a provider error, one automatic re-roll on a QC fail, then the shot is marked "needs attention" and the ad still assembles with the best available take.
4. Per-provider concurrency caps and per-model timeouts; webhooks first, polling as fallback; a dead-letter list the admin can see.
5. Budget: the estimate is computed before every render; the web app sees its time and models only, the money part stays internal (Amendment A); a hard cap per ad per preset and a monthly cap per workspace; a render that would exceed the cap asks first.
6. Provider keys live only on the server; assets are served by signed URLs; uploads are size- and type-checked.

**Provider adapters** are the only code that knows a provider's wire format: `estimate(slug, payload)`, `submit(slug, payload, idempotency_key, webhook_url=None) → job`, `status(job)`, `result(job)`, plus `upload(path)`, `cancel(job)`, `delete(job)` where the provider offers them (the signature Phase 0.2 implements). Adding or swapping a model is a router entry plus an adapter mapping, never a pipeline change.
