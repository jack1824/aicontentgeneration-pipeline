# Kickoff prompt for Claude Code (paste this as the first message)

```
Read CLAUDE.md, then docs/plan/00-plan.md in full, then PHASES/phase-0-foundations-and-proofs.md and PROGRESS.md.

We are building SOCIALADZGEN STUDIO v2 exactly as the locked plan describes. The constraints are not negotiable:
testing first and hosting last (Phase 4 only after G3), free-tier LLM keys only, no money shown anywhere on the
website (Simple or Advanced), TypeScript app/API with Python workers. The approved UI is the v5 mockup in
mockup/; its rules are in docs/design/DESIGN_SYSTEM.md. Follow the skill routing rule in CLAUDE.md (superpowers for
planning and TDD; ui-system first for any UI work).

Start Phase 0. Before writing code for each task, tell me in five lines what you will build, which files, and how
you will verify it with a real API call. Then build it. When a task is done, run the phase-summary skill: write the
SUMMARIES file, update PROGRESS.md, and give me the plain-language summary under 200 words. Do not start the next
task until the summary is printed. Use the sub-agents in .claude/agents as CLAUDE.md describes; use qc-reviewer
before marking anything done.

Today's first job: task 0.1 (repo skeleton) and then the Higgsfield adapter (0.2). Ask me only for the decisions
listed in docs/plan/00-plan.md (D1–D12) when you reach them, and for anything that costs more than a few dollars
of provider credit in one go.
```

## Prompts you will use later

- **Resume a session:** `Read CLAUDE.md and PROGRESS.md, then the latest file in SUMMARIES/. Continue with the next
  pending task; summarise when it is done.`
- **End of a phase:** `Run the phase-summary skill at phase level: write SUMMARIES/<phase>-PHASE-SUMMARY.md, state
  which gate criteria were met with numbers, list what changed in the routing table, and tell me plainly whether the
  next phase may start.`
- **Pilot (Phase 3.5):** `Start the local stack per the local-testing skill, open a temporary quick tunnel, and walk
  me through making one ad in Simple mode. Log every confusion in SUMMARIES/pilot-notes.md. Close the tunnel after.`
- **Only after G3 is recorded:** `G3 is done (see PROGRESS.md). Start Phase 4.1 hosting per
  PHASES/phase-4-hosting-and-launch.md. Set HOSTING_PHASE_UNLOCKED=true in .env and remove the hosting CLI denies in
  .claude/settings.json first, and tell me in chat what each hosted service will cost per month before creating anything (that
  report stays in chat and SUMMARIES/, never on the website). Billing (4.3) waits for decision D12.`
