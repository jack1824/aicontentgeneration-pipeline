---
name: elevenlabs-hindi
description: How this project uses ElevenLabs for Hindi/Hinglish ads — Eleven v4 settings, Devanagari script rules, the localizer, forced alignment for captions and cut points, SFX and music, loudness. Load before touching workers/adapters/elevenlabs.py, the localizer, or caption code.
---
# ElevenLabs for Hindi ads (verified 3 Nov 2026)

## Models
- Final VO: `eleven_v4` ($0.08/1k chars; 10k chars/request; audio tags; IPA pronunciation for non-English; no `speed`).
- Previews in the editor: `eleven_v4_turbo` ($0.04/1k, ~100 ms).
- Fallback for number-heavy lines needing pacing: `eleven_multilingual_v2` (has `speed` 0.7–1.2, no `language_code`).
- Premade default voices retire 31 Dec 2026 — the Brand Kit stores a chosen library voice id or a clone; never hard-code a premade voice.

## The text we send (localizer, prompt 4 in docs/plan/04-system-instructions.md)
- Devanagari matrix. English words a Hindi speaker says in English stay Latin (WhatsApp, offer, free, delivery). Brand names Latin unless the glossary gives a Devanagari respelling.
- Numbers, %, dates, phone numbers (and ₹, kept for when owner decision D11 allows a shop's own price) spelled out in Devanagari words (no Hindi normaliser exists on ElevenLabs): ₹499 → चार सौ निन्यानवे रुपये; ₹1,20,000 → एक लाख बीस हज़ार रुपये; phone numbers digit by digit with `[short pause]` every 5 digits.
- One leading energy tag per beat: punchy/excited → `[excited]`, steady → `[calm]`, warm → `[warm]`, question → `[curious]`; pauses with `[short pause]` / `[long pause]`; no `speed` on v4, so pacing by punctuation.
- `language_code: "hi"`, `voice_settings: {stability: 0.35–0.45, similarity_boost: 0.75}`, fixed `seed` per ad, `previous_text` / `next_text` across beats, `output_format: mp3_44100_192` (Creator+) or `pcm_44100` (Pro+), `apply_text_normalization: "off"`.
- Three takes for the hook beat, one for the others.

## Alignment → captions and cut points
- `POST /v1/forced-alignment` (audio + the exact text) → `words[]{text,start,end,loss}`. Store on the beat. Fallback: `/text-to-speech/{voice}/with-timestamps` (character-level; group Devanagari by grapheme cluster).
- Cut each shot to its beat words + 0.3 s tail. Caption cards: 2–4 words, from word times.
- `scribe_v2` STT (Hindi high-accuracy tier) only to verify experiments where a video model spoke.

## Music and SFX
- Bed: `POST /v1/music`, `music_v2_5`, `force_instrumental: true`, `music_length_ms` = ad length + 2 s; prompt from the campaign pack ("festive dhol-light, 100 bpm, no vocals"). Commercial use for online/social ads allowed from the Starter plan; TV/radio needs Enterprise.
- Hits: `POST /v1/sound-generation`, `eleven_text_to_sound_v3`, 0.5–2 s (whoosh on cut 1, soft ting on the offer, WhatsApp pop on the CTA).

## Voices
- Library search: `GET /v1/shared-voices?language=hi&use_cases=advertisement&sort=usage_character_count_1y`; check `verified_languages`, `rate`, notice period. Audition with a real ad line including a number, a date and a phone number.
- Owner's voice: Instant Voice Clone (`POST /v1/voices/add`, 1–2 min, consent checkbox). Professional clone: own voice only, Creator plan and above.

## Loudness and mix
Mix at real levels (`amix normalize=0`), music −12 dB under speech with 150 ms attack, two-pass `loudnorm I=-14:TP=-1:LRA=11` on the final mix. Silence map: a gap over 0.4 s inside a beat is a warning.

## Plans
Creator ($22) for build and pilot (192 kbps MP3, library voices via API, 1 PVC, concurrency 5); commercial rights start at Starter; the Free tier has none. PAYG top-ups in INR from ₹500.
