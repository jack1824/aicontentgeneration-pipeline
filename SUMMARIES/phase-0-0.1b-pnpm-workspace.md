PAID CALLS: none (no Higgsfield or ElevenLabs call; network use was free: TypeScript 5.8.3, the mockup's npm packages for the clean-copy proof, the ElevenLabs docs pages, GitHub)

# Phase 0 · 0.1b pnpm workspace — 6 Nov 2026

## What was built
- A pnpm workspace at the repo root, pinned to pnpm 10.34.9 (`packageManager`), Node 22 or later. Members are
  `apps/*` and `packages/*` only.
- `tsconfig.base.json`, strict: strict mode, noUncheckedIndexedAccess, exactOptionalPropertyTypes, NodeNext and
  verbatimModuleSyntax. TypeScript 5.8.3 comes from a pnpm catalog, the same version as the mockup.
- `packages/contracts`: a skeleton that really builds (it emits `dist/`, and `prepare` builds it on install). Its
  typecheck refreshes `dist/`, so a stale build cannot hide an error. The README matches the 0.1 split.
- `apps/api`: a skeleton that compiles against contracts, and its built file runs. The framework is chosen in 1.6.
- `apps/web`: a placeholder until 1.7.
- Three typecheck tests (node:test, no new dependency):
  - a deliberate strict-only type error is rejected (TS7006, TS2322);
  - correct code passes;
  - every package's resolved tsconfig (`tsc --showConfig`) keeps every strict flag on.
- `mockup/studio-ui/pnpm-workspace.yaml` (`packages: []`, owner answer 1): the mockup is its own pnpm project again,
  and its lockfile is untouched.
- Owner notes in the same commit:
  - (a) 0.3, no silent ElevenLabs re-pay. The voice row is written before the request. On resume a unique history
    match (text, voice, model, settings, seed, not already claimed) is downloaded; anything else needs attention and
    is resent only with `--allow-repay`.
  - (b) the model readiness rule, in CLAUDE.md, the higgsfield-api and ui-system skills, and PHASES 0 (0.2) and
    1 (1.4, 1.7, 1.8).
  - The Git/GitHub rules are in CLAUDE.md, and the retry rules are in 1.2 and the shot-engine-dev agent.

## How it was verified
- Tests first:
  - with apps/api but no contracts, install failed (ERR_PNPM_WORKSPACE_PKG_NOT_FOUND) and so did the build;
  - the typecheck test failed before TypeScript existed;
  - then all of it went green.
- `pnpm --version` reports 10.34.9 from /tmp and in the project. `pnpm install`, `pnpm -r build` (contracts before
  api), `pnpm -r typecheck` and `pnpm test` (3/3) all pass; `uv run pytest` still passes 181.
- Planted failures were all caught:
  - a type error in apps/api broke build and typecheck;
  - strict off in the base, or any strict flag off in one package or in an extra tsconfig, failed the test;
  - a renamed contracts export failed typecheck (before the fix it wrongly passed on a stale dist);
  - on a fresh clone, install rebuilt dist.
- Mockup proof on clean copies:
  - with the new file, `./build.sh` exits 0 (its own 354 packages, typecheck, lint, build, bundle) and the lockfile
    hash is unchanged (ac8510cf…);
  - without the file it exits 1: `pnpm install` climbed to the root and `tsc` was not found.
- Reviews:
  - qc-reviewer, four passes: three FAILs on how the notes were recorded (a gap in note (a) for synchronous TTS, the
    short readiness wording, the 0.2 mapping, the blanket retry in 1.2), all fixed; the fourth pass was PASS. Its
    should-fix (retry wording) is fixed too.
  - Workspace-robustness reviewer: PASS twice.

## What changed in the plan
- 0.3: the voice row is written before the call, and a history match must be unique. This supersedes the 0.1a
  "accepted risk" (the step-cache docstring is updated in 0.3).
- 1.2 retries (owner answer 5): no automatic retry of a generation. Ambiguous Higgsfield submits are resent with the
  same key only after 0.2b proves idempotency live. ElevenLabs is never resent after an ambiguous outcome.
- Model readiness: builder + unit test + one passing real render recorded in proofs/out. Proofs 0.5, 0.6 and 0.8 add
  their models' builders. 1.8 gives the four Phase 1 models direct test renders first.
- File count: the 0.1b package is 15 files, including the mockup file. The owner's notes add 7 doc files, plus this
  summary.

## What is next
- Fast-forward `v2-rebuild` to 0.1b (owner answer 2). Then 0.2a, the Higgsfield adapter with no provider calls,
  opening with a docs commit for owner answers 4, 6, 16 and 17.
- Known for Phase 4: contracts' `prepare` needs TypeScript at install time, so production installs (`--prod`, image
  builds) will need care.

## Open questions for the owner
- 8 and 9 still hold template placeholders: the training opt-out state and the balance. Both are needed before
  "go 0.2b".

Standing lines: Hosting remains the last phase (after G3). LLM calls stay on the free keys. The website shows no money, in any mode.
