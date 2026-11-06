# packages/contracts

The shared surface between the TypeScript app/API and the Python workers (`docs/plan/03-contracts.md`).

Today (0.1b) it is a TypeScript skeleton: `src/index.ts` builds to `dist/` (`pnpm --filter contracts build`; the
`prepare` script builds it on `pnpm install`) and proves the workspace link and build order. `test/typecheck.test.mjs`
guards the strict TypeScript settings for the whole workspace (`pnpm test`).

The JSON Schemas arrive later, per the 0.1 split (PHASES/phase-0, task 0.1):
- 0.4: `brain/`, the output schemas for prompts 1–6 (every LLM response is validated against them)
- 1.1: `brief`, `hook`, `beat`, `shot`, `take`, `qc_verdict`, `job` and `render` schemas, plus `content/` for the
  content JSON. The Pydantic models for the workers are generated from them into `workers/contracts/` (a `gen`
  script arrives with them). Never hand-edit the generated side.

Step keys are computed only by the Python engine; the API sends inputs, never a hash.
