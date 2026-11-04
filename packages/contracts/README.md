# packages/contracts

JSON Schemas shared by the TypeScript app/API and the Python workers. Phase 0 (0.1) and Phase 1 (1.1) create:

- `brief.schema.json`, `hook.schema.json`, `beat.schema.json`, `shot.schema.json`, `take.schema.json`,
  `qc_verdict.schema.json`, `job.schema.json`, `render.schema.json`
- `brain/` — the output schemas for prompts 1–6 (validate every LLM response)
- `content/` — schemas for the content JSON

Pydantic models are generated into `workers/contracts/` (`pnpm --filter contracts gen`). Never hand-edit the generated side.
