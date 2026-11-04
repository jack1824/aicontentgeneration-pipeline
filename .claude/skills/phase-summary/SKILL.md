---
name: phase-summary
description: The mandatory summary protocol — after every finished topic (work package, proof, screen) and at the end of every phase, write SUMMARIES/<phase>-<topic>.md from the template, update PROGRESS.md, and give the owner a plain-language summary under 200 words that restates the locked constraints. Load whenever a task is being marked done.
---
# Phase summary protocol

Trigger: a PROGRESS.md task moves to `done`, a gate is attempted, or a phase ends.

## 1. Write `SUMMARIES/<phase>-<topic>.md`
```
PAID CALLS: none | <provider> <model> × <count>, est. <amount>   (the paid calls this topic actually made)

# <Phase N> · <Topic> — <date>

## What was built
- <files / modules, 3–6 bullets>

## How it was verified
- <the real call(s): ids, durations, sizes, test counts>

## What changed in the plan
- <routing table, contracts, config; or "nothing">

## What is next
- <the next PROGRESS task, who decides what>

## Open questions for the owner
- <only real ones; "none" is fine>

Standing lines: Hosting remains the last phase (after G3). LLM calls stay on the free keys. The website shows no money, in any mode.
```

## 2. Update `PROGRESS.md`
Set the task status, link the summary file, update the gate row if a gate was attempted (criteria met / not met, with the number).

## 3. Chat summary for the owner (under 200 words)
Plain language, no code, no file paths unless asked. First line: the PAID CALLS line (owner's standing rule).
Structure: done → verified → changed → next → decision needed. End with the three standing lines.

## 4. End of phase
Also write `SUMMARIES/<phase>-PHASE-SUMMARY.md`: gates passed, the whole plan's state in five lines, what moved in the routing table, what is deferred, the owner's open decisions (D1–D12 in docs/plan/00-plan.md, D11–D12 under Amendment A), and an explicit yes/no: may the next phase start.
