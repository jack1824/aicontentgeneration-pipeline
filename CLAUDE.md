# SOCIALADZGEN STUDIO v2 — project memory for Claude Code

You are building SOCIALADZGEN STUDIO v2 from scratch: a tool that turns a brief (or a pasted script) plus
product photos into a 15–30 second Hindi/Hinglish social video ad for Indian small businesses, built on the
Higgsfield API (pixels), ElevenLabs (voice, captions, music) and free-tier LLMs (planning, QC).
The plan is locked (3 Nov 2026). Read `docs/plan/00-plan.md` once at the start of every session; it is the spec.

## Non-negotiables (locked constraints — never trade these away)

1. **Testing first, hosting last.** Nothing is hosted, no CDN, no billing, no public deployment until the pilot
   test passes (Phase 3 gate G3). Everything runs on the dev machine: Next.js dev server, Python workers, Postgres in
   Docker (from task 1.1; Phase 0 runs on plain files), local object folder. Hosting is Phase 4 and starts only after
   G3. Every phase summary restates this.
2. **Free-tier LLMs only.** Every LLM call goes through the existing free API keys in `.env`
   (`GEMINI_API_KEY` first, then `GROQ_API_KEY`, `NVIDIA_API_KEY`, `OPENROUTER_API_KEY`). Never add a paid LLM
   provider, never hard-code a model id; ids live in `config/llm.yaml`. See skill `free-llm-chain`.
3. **No money on the website, ever; Simple by default.** Owner rule (4 Nov 2026, verbatim in
   `docs/design/DESIGN_SYSTEM.md`): never display a cost, price, pricing, fee, subscription amount or monetary value
   anywhere on the website, in any mode, component, tooltip, card, modal, footer, CTA or generated content. The
   studio runs brief → openings → making → your ad, one primary action per screen. The user picks the **voice** and
   the **video model** in Simple mode (name, what it is good for, speed and detail; Auto is the default); time shows
   as one coarse line ("about 5 min"). Advanced adds model detail, resolution, shot length, per-shot time, the
   Production table, hook scores, QC, takes and the Director's Cut — time and model detail only, never money.
   Cost data (`/estimate`, `ledger`) stays internal for the owner's reports. See skill `ui-system`.
4. **Stack.** TypeScript for the Next.js app and API (`apps/`), Python for the workers (`workers/`): Shot Engine,
   provider adapters, ffmpeg compositor. The job contract (`docs/plan/03-contracts.md`) is the only shared surface.
5. **Doctrine (from v1, kept):** approved pixels are the truth, not prompts or seeds; one subject per reference
   image; the voice is generated and measured first, the picture is cut to it; QC never fails open ("unknown" is
   never a pass); text and logos come from the compositor, never from a video prompt; small, flagged,
   tested changes; verify with a real call before saying something works.
6. **Compliance is a gate, not a note.** No fabricated testimonials, no AI doctors or experts, no celebrity
   likeness, no clinic before/after, no "100 %" or "No. 1" claims; the AI label defaults on. See skill
   `indian-ad-craft` and `docs/plan/02-templates-and-hooks.md`.

## Where things are

- `docs/plan/` — the locked plan, exported from the design doc: 00 plan (all sections), 01 model catalog,
  02 templates and hooks, 03 contracts (job graph, data model, API), 04 system instructions (the LLM prompts),
  05 sources.
- `docs/research/` — the research reports (Higgsfield API, ElevenLabs, Indian ad craft, competitor UX), the
  Vercel Web Interface Guidelines, and `skills-and-tooling.md` (why each skill is here, which were left out).
  Facts there carry URLs; prefer them over memory. Higgsfield's catalog changes monthly: re-verify slugs with the
  `higgsfield-api` skill's checklist before relying on one.
- `PHASES/` — one file per phase with tasks, acceptance criteria and the gate. Work them in order.
- `PROGRESS.md` — the live tracker. Update it as tasks finish. `SUMMARIES/` — the end-of-topic summaries.
- `docs/design/` — `DESIGN_SYSTEM.md` (the v5 authority: palette roles, type, landing, studio, motion, the
  no-money rule, the done checklist), `FRONTEND_STACK.md` (Next.js plan for apps/web), `DESIGN_HISTORY.md`
  (v2 → v5 and what was rejected), the owner's palette reference image, old taste direction sheets (history).
- `mockup/` — the approved v5 UI: `socialadz-studio.html` (open in a browser) and `studio-ui/` (Vite + React 19 +
  Tailwind v4 + GSAP source). `apps/web` grows out of it.
- `content/` — the content system JSON (templates, hooks, calendar packs, playbooks). Data, not code.
- `.claude/skills/` — 33 skills: our 9 domain skills plus 24 bundled third-party skills (GSAP, taste, Vercel,
  antfu, Playwright, Anthropic); licences in `THIRD_PARTY.md`. `.claude/agents/` — specialised sub-agents.

## How to work

- **One work package at a time.** Before code: write a short plan (what, files, tests, how it is verified) in the
  task; get a yes from the owner when a package exceeds ~15 files or touches billing, the data model or licences.
- **Proof before product.** Phase 0 is four scripts that prove the stack with real API calls. If a proof fails,
  the routing table changes before Phase 1 — never paper over it.
- **Tests pin the working path first**, then behaviour changes behind config, not flags-per-fix.
- **Every provider call** goes through an adapter in `workers/adapters/` with `estimate()`, `submit()`,
  `status()`, `result()`; outputs are downloaded to local object storage before a step is marked done (Higgsfield
  URLs expire in 7 days).
- **Idempotent steps.** Each pipeline step is keyed by `sha256(step, inputs)`; a repeat returns the cache.
- **PAID CALLS line (owner's standing rule, 4 Nov 2026).** Every plan and every summary starts with one line:
  `PAID CALLS: none` or `PAID CALLS: <provider> <model> × <count>, est. <amount>`. Never send a generation request to
  Higgsfield or ElevenLabs unless that line covers it in a plan the owner has said go to. (Owner-facing only; amounts
  never reach the website.)
- **Git.** `main` holds approved work. Every work package gets its own branch off `main`
  (`wp/<task>-<slug>`, e.g. `wp/0.1-repo-skeleton`).
- **Secrets** live in `.env` (gitignored). Never print keys. Higgsfield training opt-out must be ON in the console.
- **Run everything locally**: see skill `local-testing` for the commands.
- Use the sub-agents: `planner-architect` to plan a package, `app-dev` / `shot-engine-dev` to build,
  `content-system` for JSON content, `qc-reviewer` for a fresh-eyes review before marking done,
  `compliance-checker` for any script or template, `ui-designer` for screens, `phase-summarizer` for summaries.

## Which skill when (routing rule)

- Planning a work package → superpowers (plugin) brainstorm and plan, then `planner-architect`.
- Writing code → superpowers test-driven development: failing test first.
- Any UI work → load in this order: `ui-system` → `design-taste-frontend` → `frontend-design` → the `gsap-*` skill
  for the motion in hand (`gsap-react` always) → `vercel-react-best-practices` / `vercel-composition-patterns` →
  review with `web-design-guidelines`; copy with `writing-guidelines`. Run the taste `lint.mjs` and `inspect.mjs`.
- Tests → `vitest` for units and components; `playwright-best-practices` and `webapp-testing` for the browser.
- Tooling → `vite`, `pnpm`, `antfu`; `antfu-simplify` for a cleanup pass.
- Before a gate → `/code-review` and `/security-review`, then the `qc-reviewer` agent.
- Domain work → our skills first: `higgsfield-api`, `elevenlabs-hindi`, `free-llm-chain`, `compositor-ffmpeg`,
  `script-brain`, `indian-ad-craft`, `local-testing`, `phase-summary`.
- Not for this project: Vue/Nuxt/Pinia/UnoCSS/VitePress/Nitro, React Native, and the Vercel deploy skills (Phase 4).

## Summary protocol (mandatory)

After finishing a topic (a work package, a proof, a screen, a phase), run the `phase-summary` skill:
1. Write `SUMMARIES/<phase>-<topic>.md` using the template in the skill (what was built, how it was verified,
   what changed in the plan, what is next, open questions, and the line "Hosting remains the last phase").
2. Update `PROGRESS.md` (status per task, gate status).
3. Print the summary to the owner in chat, under 200 words, plain language, no code.
At the end of each phase also write `SUMMARIES/<phase>-PHASE-SUMMARY.md` restating the whole plan's state.

## Commands (task 0.1 creates the workspaces; Phase 1 adds the running app and API, the containers (1.1) and the queue worker (1.2))

- App: `pnpm --filter web dev` (Next.js on :3000) · API: `pnpm --filter api dev` (:4000)
- Python: one uv workspace at the repo root (`pyproject.toml` with `workers` as a member), so `uv run …` works from the root.
- Phase 0 storage, plain files only (owner decision 4 Nov 2026; no Docker, Postgres, Redis or MinIO until task 1.1):
  assets in `assets/`, step and LLM cache in `.cache/steps.sqlite3`, proof outputs and request logs in
  `proofs/out/<date>/`, all gitignored. Do not start containers in Phase 0.
- Workers (from 1.2): `uv run celery -A engine worker -l info` (or `arq engine.WorkerSettings`)
- DB (from 1.1): `docker compose up -d postgres redis minio` · migrations: `pnpm --filter api db:migrate`
- Proofs: `uv run python proofs/<name>.py` (Phase 0) · canaries: `uv run python scripts/model_canary.py`, `uv run python scripts/llm_canary.py`
- Tests: `pnpm test` · `uv run pytest`
- Mockup: `cd mockup/studio-ui && pnpm i && pnpm dev` (preview) · `./build.sh` (typecheck, lint, build, bundle)

## Never

- Never host, deploy, buy a domain, or set up a CDN or Stripe/Razorpay before Phase 4.
- Never add a paid LLM provider, in any phase, unless the owner lifts constraint 2 explicitly.
- Never display money on the website: no cost, price, credits, balance, fee, plan amount or pricing section, in
  Simple or Advanced, in any component or generated content. No price field in the brief.
- Never send cost fields from the API to the web app; the ledger is for owner reports only.
- Never put text, a logo, a price or a caption inside a video or image prompt.
- Never ship a shot whose QC verdict is "unknown" in Master; never treat "unknown" as pass anywhere.
- Never generate a testimonial, a doctor, a celebrity, a child presenter, or a clinic before/after.
- Never rely on model-generated speech for a deliverable; ElevenLabs is the only voice.
