# PROGRESS — SOCIALADZGEN STUDIO v2

Plan locked 3 Nov 2026. Update this file whenever a task changes state. Status words: `todo`, `doing`, `done`, `blocked`, `skipped (why)`.

Hosting, CDN, billing and public launch are Phase 4 and start only after gate G3 passes.

UI: v5 mockup approved 4 Nov 2026 (`mockup/`, rules in `docs/design/DESIGN_SYSTEM.md`). No money is shown anywhere on the website (Amendment A in `docs/plan/00-plan.md`). Open owner decisions added: D11 (prices inside a shop's own ad), D12 (how billing works without amounts on the website).

Phase 0 runs on plain files (assets folder, SQLite step cache, `proofs/out/<date>/`); Docker, Postgres, Redis and MinIO arrive in task 1.1 (owner decision 4 Nov 2026, Amendment A).

## Gates

| Gate | Criteria | Status | Date |
| --- | --- | --- | --- |
| G0 | One 15 s Hindi ad assembled from real API calls only, passes the "feels like an ad" checklist | todo | |
| G1 | 10 ads across 5 verticals, blind-rated 7/10 or better by 3 raters; cost per ad within the plan's table | todo | |
| G2 | Editor, brand kit, templates and compliance gate complete; 5 pilot businesses onboarded locally | todo | |
| G3 | Pilot test passes: 5 businesses post real ads; hook rate ≥ 30 % on at least 3; ASCI checklist audit clean | todo | |
| G4 | Hosted, billed, launched (only after G3) | todo | |

## Phase 0 — Foundations and proofs

| # | Task | Status | Summary file |
| --- | --- | --- | --- |
| 0.1 | Repo skeleton (pnpm + uv workspaces), `.env.example`, config/llm.yaml; plain files only: `assets/`, SQLite step cache, `proofs/out/<date>/` (no containers, owner decision 4 Nov 2026) | todo | |
| 0.2 | Higgsfield adapter (auth, submit, status, estimate, upload, webhook verify) + canary | todo | |
| 0.3 | ElevenLabs adapter (TTS v4, forced alignment, SFX, music) + Hindi localizer | todo | |
| 0.4 | Free-LLM chain (Gemini → Groq → NVIDIA → OpenRouter) with retry, cache, canary | todo | |
| 0.5 | Proof A: Soul ID face holds across 10 Soul 2 stills | todo | |
| 0.6 | Proof B: Kling 3.0 Pro I2V from approved stills, 6 shots, face + product hold | todo | |
| 0.7 | Proof C: Eleven v4 Devanagari ad script with numbers; forced alignment word times usable | todo | |
| 0.8 | Proof D: Genjutsu re-shoot of a 15 s clip keeps cuts; product and face swapped | todo | |
| 0.9 | Hand-assembled 15 s ad from the proofs (compositor v0) → G0 | todo | |

## Phase 1 — Core pipeline (local)

| # | Task | Status | Summary file |
| --- | --- | --- | --- |
| 1.1 | Docker compose (postgres, redis, minio; local only) + data model + migrations (brands, references, ads, beats, shots, takes, voice_tracks, jobs, ledger, renders); Phase 0 files move onto them | todo | |
| 1.2 | Job graph + queue (voice → stills → approve → video → qc → assemble → reframe → export), idempotent steps | todo | |
| 1.3 | Script Brain service: prompts 1, 3, 4 (planner, compiler, localizer) on the free chain, JSON schemas | todo | |
| 1.4 | Shot Engine: router, reference binding, parallel video, QC judge (prompt 5), one re-roll | todo | |
| 1.5 | Compositor v1: cut to voice, captions from alignment, music duck, SFX, end card, loudnorm, 9:16/1:1/16:9 | todo | |
| 1.6 | API + SSE events + estimate (time and models to the web app; money internal only) | todo | |
| 1.7 | Web app: landing + Create, Openings, Making, Your ad ported from the v5 mockup (Next.js, FRONTEND_STACK.md); Advanced panels wired; no-money check green | todo | |
| 1.8 | 10-ad eval set across 5 verticals; blind rating → G1 | todo | |

## Phase 2 — Editor, brand, content (local)

| # | Task | Status | Summary file |
| --- | --- | --- | --- |
| 2.1 | Director's Cut: swap take, re-roll with note, change hook (beat 1 only), re-voice a beat, trim | todo | |
| 2.2 | Brand Kit: faces (Soul ID), products (bg removed), rooms, voice audition, colours, number | todo | |
| 2.3 | Content system v1: 8 templates, 16 hook types, Nov–Mar campaign packs, 17 playbooks (JSON) | todo | |
| 2.4 | Compliance checker (prompt 6b) as a gate; AI label; disclaimers; vertical switches | todo | |
| 2.5 | Exports: profiles, SRT, cover, A/B second hook, two static creatives | todo | |
| 2.6 | My ads, Moments, Settings (no money shown anywhere); accounts (local auth) | todo | |
| 2.7 | Onboard 5 pilot businesses locally (their photos, faces, voices) → G2 | todo | |

## Phase 3 — Talking heads and pilot test (local + tunnel)

| # | Task | Status | Summary file |
| --- | --- | --- | --- |
| 3.1 | Lip-sync bake-off on 10 Hindi lines (Sync Labs, Segmind Speak v2, Kling lip-sync); pick one adapter | todo | |
| 3.2 | Talking-head templates unlocked behind the adapter | todo | |
| 3.3 | Five re-shoot master templates (Genjutsu lane) | todo | |
| 3.4 | Hook A/B variants; WhatsApp send; second language (Marathi or Tamil, owner decides) | todo | |
| 3.5 | Pilot: 5 businesses post real ads via quick tunnel; measure hook rate; ASCI audit → G3 | todo | |

## Phase 4 — Hosting and launch (only after G3)

| # | Task | Status | Summary file |
| --- | --- | --- | --- |
| 4.1 | Vercel app, Mumbai container host for API + workers, managed Postgres, R2 + CDN | todo | |
| 4.2 | Public webhooks, accounts hardening, rate limits, backups | todo | |
| 4.3 | Billing, only after owner decision D12 (the website shows no amounts) | todo | |
| 4.4 | Launch checklist, monitoring, model canary in CI → G4 | todo | |
