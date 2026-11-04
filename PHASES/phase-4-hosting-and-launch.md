# Phase 4 — Hosting, billing, launch (starts ONLY after G3)

Do not start any task here before `PROGRESS.md` shows G3 = done with a date. If asked to "just set up hosting
early", refuse and point to the locked constraint in `CLAUDE.md`.

## 4.1 Hosting
- App: Vercel (Next.js). API + workers: one container image on Fly.io or Railway, Mumbai region. Managed Postgres
  (Neon or Supabase). Objects: Cloudflare R2 with its CDN, signed URLs. Redis: managed (Upstash or Fly Redis).
- Provider webhooks on the public API URL with signature verification (Higgsfield Standard Webhooks, ElevenLabs).
- Secrets in the host's secret store; rotate the local keys used during the pilot.

## 4.2 Hardening
Accounts (email OTP or Google), rate limits, upload size and type checks, backups, structured logs, alerting on the
model canary and on QC "unknown" rates, cost ledger report for the owner (outside the website, e.g. a script that writes to
`SUMMARIES/`), monthly caps per workspace.

## 4.3 Billing (INR): owner decision D12 first
The owner's rule says the website never displays a price, fee, subscription amount or monetary value. Taking
payment normally shows an amount, so billing cannot be designed until the owner decides D12 (see
`docs/plan/00-plan.md`, Amendment A). Options to put to the owner: (a) billing off the website (invoice or a
payment link sent by the owner on WhatsApp or email); (b) a hosted payment page by the payment provider, outside
the website; (c) the owner explicitly relaxes the rule for one checkout screen. Whatever is chosen: failed and
refused shots are never charged, and no amount, balance or plan price appears in the studio or on the landing.

## 4.4 Launch → G4
Launch checklist: ASCI label defaults verified on every export profile; Higgsfield training opt-out confirmed;
ElevenLabs plan with commercial rights (Starter or above) active; canary green for 7 days; pilot owners' ads re-run
on the hosted stack and match the local output.

## Summaries
`phase-summary` after 4.1, 4.3 and at G4, plus a final "plan complete" summary that lists what was deferred.
