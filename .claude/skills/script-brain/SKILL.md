---
name: script-brain
description: How to run Script Brain — the seven LLM steps from brief to compiled prompts, the five-beat anatomy, JSON schemas, the score gate, script mode for pasted scripts, and the Hinglish rules. Load before touching workers/brain/ or the prompts in docs/plan/04-system-instructions.md.
---
# Script Brain

The ad is decided here; pixels only execute it. Prompts are in `docs/plan/04-system-instructions.md` (1 planner, 2 script mode, 3 compiler, 4 localizer, 5 QC judge, 6 assistant + compliance). Copy them verbatim into `workers/brain/prompts/` with a version string; changes bump the version and invalidate the cache.

## Steps (all on the free chain, all JSON-schema validated)
1. Brief intake → `Brief` (temp 0.2). Product photos are described by the vision model and kept as facts.
2. Hooks: 6 candidates across ≥ 3 hook types, ≤ 8 spoken words, product or face in the first frame (temp 0.8, streamed).
3. Hook scoring: clarity, specificity, curiosity, naturalness, category fit, length (temp 0.1). Simple mode auto-picks the top one and shows three.
4. Beat sheet: hook, setup, proof, offer, CTA with budgets (15 s: 2.5/3.5/5/2/2; 30 s: 3/6/11/5/5), VO in Devanagari + Latin display, on-screen text, energy (temp 0.3). 30–38 words for 15 s, 65–80 for 30 s.
5. Shot list: 4–5 or 7–9 shots; type, references (face/product/room ids), camera preset, target seconds, tier hint; one person per shot (temp 0.3).
6. Compiler: model-specific payload per shot + 0–100 score; < 40 → one auto-fix, then refuse (temp 0.1). Never text/logo/price in a prompt.
7. Localizer + compliance pre-check (temp 0.1).

Changing a hook re-runs 4–7; editing one beat's words re-runs 6 for that beat's shots.

## Script mode
Voice the pasted sentences first (measured seconds), assign to beats, add at most one hook line (declinable) and a CTA if missing, propose cuts if over budget — never rewrite the user's words.

## Hinglish rules
Devanagari for speech; Latin brand names inside it; `aap` by default (`tum` for youth brands when the brief says); ~60/40 Hindi/English for metros, 80/20 for tier-2/3; on-screen text Latin by default; numbers (sizes, dates) as digits on screen, words in voice; no prices or discount % until owner decision D11 (the website shows no money); one number per ad; one CTA.

## Never
Invent product facts; write a claim the compliance checker blocks; describe text in a pixel prompt; spend a Higgsfield credit from this module.
