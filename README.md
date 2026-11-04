# SOCIALADZGEN STUDIO v2: Claude Code build package (v5 UI, 4 Nov 2026)

A tool that turns a brief (or a pasted script) plus product photos into a 15–30 second Hindi/Hinglish social
video ad for Indian small businesses. It is built on the Higgsfield API (pixels), ElevenLabs (voice, captions,
music) and free-tier LLMs (planning, QC). The plan was locked on 3 Nov 2026 and amended on 4 Nov 2026 for UI v5 and
the no-money rule.

## What is in this folder

| Path | What it is |
| --- | --- |
| `CLAUDE.md` | Project memory Claude Code reads every session: the six locked constraints, where things are, the skill routing rule, how to work, the summary protocol, the Never list. |
| `KICKOFF.md` | The first prompt to paste, plus prompts for resuming, ending a phase, the pilot and Phase 4. |
| `PROGRESS.md` | The live tracker: gates G0–G4 and every task per phase. |
| `PHASES/` | Five phase files with tasks, acceptance criteria and the gate. Hosting is Phase 4 and starts only after G3. |
| `docs/plan/` | The locked plan: `00-plan.md` (every section, plus Amendment A at the end), `01-model-catalog.md`, `02-templates-and-hooks.md`, `03-contracts.md`, `04-system-instructions.md` (the LLM prompts), `05-sources.md`. |
| `docs/research/` | Research with URLs: Higgsfield API, ElevenLabs, Indian ad craft, competitor UX, the Vercel Web Interface Guidelines, and skills and tooling (what is bundled, what was left out and why). |
| `docs/design/` | `DESIGN_SYSTEM.md` (v5 authority: palette roles, type, landing and studio, motion, the no-money rule, done checklist), `FRONTEND_STACK.md` (Next.js plan for `apps/web`), `DESIGN_HISTORY.md` (v2 → v5), the owner's palette reference image, old taste direction sheets. |
| `mockup/` | The approved v5 UI: `socialadz-studio.html` (one self-contained file, open it in a browser) and `studio-ui/` (Vite + React 19 + TypeScript + Tailwind v4 + GSAP + Lenis source, with `build.sh`). |
| `.claude/skills/` | 33 skills. Our 9: `higgsfield-api`, `elevenlabs-hindi`, `free-llm-chain`, `compositor-ffmpeg`, `script-brain`, `indian-ad-craft`, `ui-system`, `phase-summary`, `local-testing`. Bundled 24: eight `gsap-*`, `design-taste-frontend`, `frontend-design`, `web-design-guidelines`, `vercel-react-best-practices`, `vercel-composition-patterns`, `vercel-react-view-transitions`, `writing-guidelines`, `antfu`, `antfu-simplify`, `antfu-create-pr`, `vite`, `vitest`, `pnpm`, `playwright-best-practices`, `webapp-testing`, `skill-creator`. |
| `.claude/agents/` | Eight sub-agents: `planner-architect`, `app-dev`, `shot-engine-dev`, `content-system`, `qc-reviewer`, `compliance-checker`, `ui-designer`, `phase-summarizer`. |
| `.claude/settings.json` | Permissions: build and test commands allowed; hosting CLIs (vercel, fly, railway, wrangler, terraform, aws, gcloud) denied until Phase 4; `.env` blocked for Read and for the common shell readers (cat, head, tail, grep, sed, printenv). Shell rules are pattern-based, so treat this as a guard rail, not a vault: keep keys out of chat and logs. |
| `THIRD_PARTY.md` | Sources and licences of the bundled skills and fonts. |
| `config/` | `llm.yaml` (the free-tier chain) and `router.yaml` (model routing per preset). |
| `content/` | The content system JSON lands here in Phase 2; a sample brief and script are included (no prices). |
| `packages/contracts/`, `proofs/`, `scripts/` | Readmes and placeholders that the phases fill. |
| `apps/`, `workers/`, `SUMMARIES/` | Empty; created by Phase 0 and the summary protocol. |

## How to start (owner)

1. If you extracted an older version of this package, delete that folder first, then unzip this one into an empty
   folder and open it in Claude Code.
2. The skills are bundled in `.claude/skills`, so there is no need to run `npx skills add` again. Skills you
   installed globally with `npx skills` can stay; the project copies take precedence, and CLAUDE.md says which ones
   to ignore (Vue/Nuxt family, React Native, Vercel deploy). Keep the **superpowers** plugin installed.
3. Copy `.env.example` to `.env` and fill the keys you have (Higgsfield, ElevenLabs, the free LLM keys). Turn the
   training opt-out ON in the Higgsfield console.
4. Open `mockup/socialadz-studio.html` in a browser to see the approved look.
5. Paste the kickoff prompt from `KICKOFF.md`.
6. After every finished topic you get a plain-language summary (under 200 words) in chat and a file in
   `SUMMARIES/`. Read `PROGRESS.md` whenever you want the state of the whole plan.
7. Decisions only you can make are D1–D12 at the end of `docs/plan/00-plan.md`; Claude Code asks when a phase
   reaches one.

## The locked constraints (restated in every summary)

1. Testing first: nothing is hosted, no CDN, no billing, no public deployment until the pilot passes (G3).
2. Every LLM call runs on the existing free API keys; no paid LLM provider is added.
3. No money on the website, in any mode or component. Simple mode by default: brief → openings → making → your ad,
   one action per screen; the user picks the voice and the video model; Advanced adds time and model detail only.
4. TypeScript app and API, Python workers.
