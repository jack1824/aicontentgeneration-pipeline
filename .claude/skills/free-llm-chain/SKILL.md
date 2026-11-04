---
name: free-llm-chain
description: How every LLM call in this project runs on the existing free API keys only — the provider chain, config/llm.yaml, retry and backoff, caching, separate quotas for planner and judge, the daily canary — and what to do when a free tier rate-limits or retires a model. Load before touching workers/llm/.
---
# Free-tier LLM chain (locked constraint: no paid LLM, ever, until the owner says otherwise)

## Chain (config/llm.yaml, ordered; ids live here, never in code)
1. Gemini free tier (`GEMINI_API_KEY`): primary for all roles; vision-capable Flash model for the QC judge and the compiler (it reads reference images).
2. Groq free (`GROQ_API_KEY`): text roles (hooks, beats, shots, localizer, compliance).
3. NVIDIA NIM free (`NVIDIA_API_KEY`): text and a vision model if alive.
4. OpenRouter free models (`OPENROUTER_API_KEY`): last resort.

Roles and temperatures: hooks 0.8; beats/shots 0.3; compiler, localizer, judge, compliance 0.1; Director's Cut assistant 0.3.

## Rules
- Separate API keys (or at least separate quota buckets and rate limiters) for `planner` and `judge` roles, so planning traffic never starves QC (a v1 wall).
- On 429: honour `Retry-After`, else exponential backoff with jitter (1, 2, 4, 8 s), then fall to the next provider. On 5xx/timeout: next provider. On malformed JSON: one retry with "return only JSON", then next provider.
- Validate every response against its JSON schema in packages/contracts/brain/. Store the raw response for audit.
- Cache by sha256(role, prompt_version, inputs): a retry or a re-run never re-spends quota. Hook generation per brief is cached for 24 h.
- QC judge: batch 8 frames + 3 references into one call per take; never one call per frame.
- Daily canary (`scripts/llm_canary.py`): one tiny call per configured model id; a dead id is removed from the active chain and logged; remaining daily quota is reported so the UI can say "planning is slower today" instead of failing.
- Never log prompts with client photos' URLs to third parties; never send a face image to a provider that is not in the chain.

## When quota runs out
The UI queues the ad with "we'll start in a few minutes"; the worker retries after the reset. Never silently downgrade quality. Never add a paid provider; tell the owner.
