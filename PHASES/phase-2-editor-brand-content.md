# Phase 2 — Editor, brand kit, content system, compliance (about 3 weeks, local)

Gate G2: Director's Cut, Brand Kit, 8 templates, campaign packs to March, compliance gate and exports complete;
five pilot businesses onboarded on the dev machine (their photos, a face, a voice, a first ad each).

## 2.1 Director's Cut (Advanced)
Beat-level timeline (beats, shots, voice, captions, music, end card lanes), takes drawer with QC verdicts, swap take,
re-roll with a note (judge hint appended), change hook (re-renders beat 1 only), re-voice a beat (re-measure, re-cut
that beat only), trim, caption style, end card editor. Advanced shows the time each action takes and which model runs; no price, cost or credits, ever.

## 2.2 Brand Kit
Faces: AI actor flow (4 candidates → approve → 20 views → Soul ID) and consented real-person flow (upload photos,
consent checkbox and record, own-voice clone via ElevenLabs IVC). Products: upload → background removal (Qwen Image
3 edit) → approved reference. Rooms: shop photos or Soul 2 sets. Voice: Voice Library search (`language=hi`,
`use_cases=advertisement`), audition with a real ad line including a number and a date (no price on screen). Colours, fonts, number, address,
caption script system.

## 2.3 Content system v1 (`content/`)
`templates/*.json` (8 of the 19 from `docs/plan/02-templates-and-hooks.md`: default DR, unboxing (in place of price anchor, parked until D11), three reasons,
festive gifting, WhatsApp-us, store visit, presenter explainer, owner-led), `hooks.json` (16 types with examples),
`calendar.json` (packs Nov 2026 → Mar 2027), `playbooks.json` (17 verticals: angles, must-show, CTA, blocked
claims, switched-off templates), `cta.json`, `platforms.json` (export profiles, safe boxes). Admin-editable; versioned.

## 2.4 Compliance gate
Prompt 6b before any spend and on the final cut: blocks (no override), flags (rewrite or remove), notes. AI label
("Video created using AI" / "यह वीडियो AI से बनाया गया है"): 4 s super + persistent small label in the safe box,
default on for any synthetic presenter or voice. Disclaimer rule: ≤ 2 lines, ≥ 4 s, same language, under the CTA.
Vertical switches from playbooks (clinics, coaching, jewellers, real estate, food).

## 2.5 Exports
Profiles: Reels/Shorts/Status 9:16, feed 1:1, YouTube 16:9, bumper 6 s cut; burned captions + SRT; cover; hook A/B
second opening; two static creatives (Ads Studio, QC-checked). "Send to WhatsApp" (share sheet / file under 16 MB)
and "Save all sizes".

## 2.6 My ads, Moments, Settings, accounts
Local auth (email OTP via console log in dev). No balance, credits or money in Settings or anywhere else on the website; the monthly cap is enforced
server-side and shown, if at all, as a count of ads ("8 of 10 ads this month"). Moments = campaign packs
and formats; picking one pre-fills the brief.

## 2.7 Pilot onboarding → G2
Five real businesses (owner's network), each with a Brand Kit and one ad made in Simple mode by the owner
themselves with you watching. Log every confusion as a UI issue.

## Summaries
After 2.1, 2.3, 2.4, 2.7 and at G2: `phase-summary`. Restate: hosting last; free LLMs; no money on the website.
