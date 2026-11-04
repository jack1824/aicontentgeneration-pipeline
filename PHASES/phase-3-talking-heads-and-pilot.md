# Phase 3 — Talking heads, re-shoot masters, pilot test (about 4 weeks, local + quick tunnel)

Gate G3 (the pilot passes): five businesses post real ads made in the tool; hook rate ≥ 30 % on at least three of
them (Meta or YouTube analytics); ASCI checklist audit clean on all; owners can make a second ad without help.
Only after G3 does Phase 4 (hosting) begin.

## 3.1 Lip-sync bake-off (one adapter, outside Higgsfield)
Ten Hindi lines (Eleven v4) on a Soul ID face. Candidates: Sync Labs `lipsync-2-pro` (video + audio), Higgsfield
Speak v2 as hosted on Segmind (image + WAV, 5/10/15 s), Kling lip-sync via its own API. Score: sync accuracy on
Devanagari sounds, identity hold, artefacts, time, price. Pick one; implement `workers/adapters/lipsync_<vendor>.py`
behind the same adapter interface. Until it passes, presenters stay voice-over-led.

## 3.2 Talking-head templates
Unlock "Presenter explainer (speaking)" and "Two-person conversation" when the adapter is on. The compliance gate
still forbids testimonials and claims of personal use by an AI presenter.

## 3.3 Five re-shoot master templates (Genjutsu lane)
Render one master per template at Master quality with placeholder face and product; judge; store with reference
slots. New ads on those templates run Genjutsu motion transfer with the client's references, then voice, captions,
end card.

## 3.4 Variants, WhatsApp, second language
Hook A/B (second opening, beat 1 only). WhatsApp send flow tested on real phones. Second language (owner decides:
Marathi, Tamil or Gujarati): voice, localizer rules, captions font, one template.

## 3.5 Pilot test → G3
Expose the local stack to the five pilot owners through a Cloudflare quick tunnel (temporary, only during sessions).
Each owner makes and posts at least one ad. Collect hook rate, hold rate, comments, confusions. Fix the top five UI
issues. Run the ASCI checklist on every posted ad. Write the G3 summary with the numbers.

## Summaries
After 3.1, 3.3, 3.5 and at G3: `phase-summary`. The G3 summary explicitly says whether Phase 4 (hosting) may start.
