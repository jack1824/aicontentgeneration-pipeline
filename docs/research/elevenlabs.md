# ElevenLabs API research — state as of 3 November 2026

**Purpose:** decision input for an India-centric short-video ad generator (15–30 s Hindi / Hinglish ads with voice-over, captions, music, lip-synced AI actors).

**Method:** every fact below was read from a live page on 2–3 Nov 2026 (ElevenLabs docs, pricing, blog, changelog, help center, plus a handful of third-party write-ups that are clearly labelled as such). ~80 pages opened; the full list is in the Sources section. Where the docs were silent or contradictory I say so explicitly. Nothing is from memory.

**Headline changes since mid-2025 that affect the plan**

| Change | Date | Why it matters |
|---|---|---|
| **Eleven v4 and v4 Turbo launched** (`eleven_v4`, `eleven_v4_turbo`), 90+ languages incl. Hindi, better audio-tag adherence, PVC supported again, IPA pronunciations for non-English | 28 Sep 2026 ([changelog](https://elevenlabs.io/docs/changelog/2026/9/28), [blog](https://elevenlabs.io/blog/eleven-v4)) | v4 is now the default recommendation for produced VO; v3 is officially "previous generation" ([models](https://elevenlabs.io/docs/overview/models)) |
| **Style and Speed sliders removed in v4** (and never existed for v3) | Sep 2026 ([v4 page](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/eleven-v4)) | pacing must be done through script, punctuation and audio tags, not a `speed` param |
| **`audio_effects` param** (filter presets, reverb, background noise, pan) on TTS and TDD, no extra cost | 12 Oct 2026 ([changelog](https://elevenlabs.io/docs/changelog)) | phone/radio/"café" ad scenes without post-production |
| **API pricing restructured**: flat per-1k-character usage rates across all self-serve tiers (v4/v3/MV2 $0.08, Turbo/Flash $0.04), PAYG with USD **and INR** top-ups | May 2026 onward ([blog](https://elevenlabs.io/blog/weve-lowered-api-agents-pricing-and-introduced-pay-as-you-go), [API pricing](https://elevenlabs.io/pricing/api), [PAYG](https://elevenlabs.io/docs/overview/administration/pay-as-you-go)) | per-ad VO cost is ~$0.02–0.05 |
| **Default (premade) voices expire 31 Dec 2026** | [voices overview](https://elevenlabs.io/docs/overview/capabilities/voices) | do not hard-code "Rachel/Adam"-style default voice IDs; pick Library / PVC / designed voices |
| **Turbo v2.5 effectively deprecated** ("use Flash in all use cases"); `music_v1` removed 31 Jan 2027; `eleven_text_to_sound_v2` removed 1 Mar 2027 | [models](https://elevenlabs.io/docs/overview/models) | pin `eleven_flash_v2_5`, `music_v2_5`, `eleven_text_to_sound_v3` |
| **Requests priced below one credit are now charged one credit** | 26 Oct 2026 ([changelog](https://elevenlabs.io/docs/changelog)) | irrelevant for 500-char ads, relevant for tiny SFX/test calls |
| **Dubbing has no lip-sync**; lip-sync exists only via third-party models inside ElevenCreative "Image & Video" (Sync 3, Creatify Aurora, etc.), with API only for Creatify Aurora | [help center](https://help.elevenlabs.io/hc/en-us/articles/23793433149073-Do-you-offer-lip-sync-in-Dubbing), [Image & Video](https://elevenlabs.io/docs/eleven-creative/playground/image-video) | ElevenLabs is the audio layer, not the lip-sync engine |

---

## 1. Models

### 1.1 Current TTS model line-up (from [docs/overview/models](https://elevenlabs.io/docs/overview/models), 2–3 Nov 2026)

| Model | `model_id` | Status / positioning | Languages | Hindi | Latency (median, excl. network) | Char limit / request | API usage rate (per 1k chars) | Best use |
|---|---|---|---|---|---|---|---|---|
| **Eleven v4** | `eleven_v4` | Flagship, "most emotive, highest-quality"; "net upgrade over Eleven v3" | 90+ | **yes** (`hi`), plus as, bn, gu, kn, ml, mr, ne, or, pa, sd, ta, te, ur | not real-time (no figure published) | **10,000** (~10 min) | **$0.08** | produced VO, dialogue, character reads — **recommended for final ad VO** |
| **Eleven v4 Turbo** | `eleven_v4_turbo` | "most expressive real-time" | 90+ | yes | ~100 ms (TTFS ~150 ms over WS per [blog](https://elevenlabs.io/blog/eleven-v4)) | not published (streaming-oriented) | **$0.04** | drafts/previews, agents; Artificial Analysis Elo 1334 vs v4 1321 per [eesel](https://www.eesel.ai/blog/eleven-v4) (third-party summary) |
| **Eleven v3** | `eleven_v3` | "**previous generation**" per models page (no "alpha" wording anywhere now); still under "Flagship" heading | 70+ | yes (hi, ur, bn, ta, te, mr, gu, pa, kn, ml listed) | not real-time | **5,000** (~5 min) | $0.08 | expressive narration, multi-speaker; superseded by v4 |
| **Eleven v3 Conversational** | `eleven_v3_conversational` | previous-gen real-time | 70+ | yes | ~165 ms (docs) / ~280 ms ([haass](https://haass.io/blog/elevenlabs-v4-vs-v3-vs-flash)) | not published | $0.04 | legacy realtime |
| **Multilingual v2** | `eleven_multilingual_v2` | "stable, lifelike"; "most stable on long-form"; best **number normalization** | 29 | yes | higher than Flash (no figure) | 10,000 | $0.08 | safe/predictable reads, number-heavy copy; still supports `speed`, `<break>` |
| **Flash v2.5** | `eleven_flash_v2_5` | fast + cheapest | 32 | yes | ~75–100 ms | **40,000** | $0.04 | bulk drafts, cost-sensitive; weaker number reading |
| Flash v2 | `eleven_flash_v2` | English-only | 1 | no | ~135 ms | 30,000 | $0.04 | n/a for Hindi |
| Turbo v2.5 / v2 | `eleven_turbo_v2_5`, `eleven_turbo_v2` | "functionally equivalent to Flash… latency on Flash is lower on average. We recommend using the Flash models over Turbo models in all use cases." | 32 / 1 | yes / no | slower than Flash | 40,000 | $0.04 | **avoid** |

Sources: [models](https://elevenlabs.io/docs/overview/models), [TTS capability page](https://elevenlabs.io/docs/overview/capabilities/text-to-speech), [API pricing](https://elevenlabs.io/pricing/api). No "v3.5" or "v5" exists; the newest family is **v4** (checked changelog Sept–Oct 2026 at [changelog](https://elevenlabs.io/docs/changelog)).

Language-list caveat: the v3 and v4 lists on the models page are introduced with "including", so they are not necessarily exhaustive. Hindi is explicitly listed for v4, v4 Turbo, v3, v3 Conversational, Multilingual v2, Flash v2.5, Multilingual STS v2 and TTV v2 ([models](https://elevenlabs.io/docs/overview/models)).

### 1.2 Which model gives the best Hindi/Hinglish ad VO in 2026, and why

**Recommendation: `eleven_v4` for the final render; `eleven_v4_turbo` for previews; `eleven_multilingual_v2` as the "safe" fallback for number-heavy or deliberately flat reads.**

Evidence:
- ElevenLabs calls v4 "a net upgrade over Eleven v3" improving "output quality, voice accuracy, consistency, emotion, delivery, audio tags, and language coverage" ([v4 page](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/eleven-v4)) and recommends switching after testing ([best practices](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices)).
- v4 pronunciation benchmark 91.7% vs 85.6% for v3 (vendor-run, language unspecified) — reported by [the-decoder](https://the-decoder.com/elevenlabs-new-v4-speech-model-makes-ai-voices-more-expressive-and-consistent/).
- v4 is the only family where **IPA/CMU pronunciations for non-English languages** work (dictionaries) and inline `/IPA/` works ([pronunciation dictionaries guide](https://elevenlabs.io/docs/eleven-api/guides/how-to/text-to-speech/pronunciation-dictionaries), [best practices](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices)) — this is the only robust lever for brand-name pronunciation in Hindi.
- v4 supports Professional Voice Clones fully; v3 PVCs are "not fully optimized" ([best practices](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices)).
- Audio tags are followed more reliably on v4 than on v3 (docs) — needed for "hook" energy.
- Third-party Hindi review (Sept 2026, pre-v4): "v2 for a predictable voice, Flash for speed, v3 for expressiveness"; v3 "can over-act on flat product explainers, though it suits narrated stories and ads" ([bundledseo](https://bundledseo.com/blog/elevenlabs-review/)).
- The ElevenLabs Hindi landing page itself showcases Devanagari sample text with bracket tags (`[whispers]`, `[giggles]`) and names reel/ad-style Hindi voices ("Bunty – punchy, crisp, reel-focused") ([Hindi TTS page](https://elevenlabs.io/text-to-speech/hindi)).

Caveats on v4 for Hindi:
- v4's cross-language behaviour changed: a cloned voice **keeps its accent only when the output language matches the voice's language**; otherwise v4 switches to a native accent of the target language, and a toggle to keep the source accent "is under research, with no timeline" ([v4 page](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/eleven-v4)). For Hindi ads this is usually *desirable* (an English-trained voice will speak Hindi with a native-sounding accent), but it means you can't use an "Indian-English accent" voice to get a Hinglish accent automatically.
- Voice Design voices "may not be as performative or sound as good" on v4 as on v3 ([v4 page](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/eleven-v4)).
- Users report v4 speaks faster and there is no speed control ([eesel](https://www.eesel.ai/blog/eleven-v4), third-party).
- No independent Hindi benchmark for v4 was found. Competitor-run comparisons (VoisLabs, May 2026, pre-v4) say ElevenLabs "handles Hinglish cleanly, switching phonetic models mid-sentence" but "Indian-language voices sound noticeably less natural than Indian-first tools" and there are "no emotion presets tuned for Indian content" ([voislabs](https://www.voislabs.com/best/hindi-text-to-speech) — competitor page, treat as biased).

### 1.3 Known Hindi weaknesses (what the docs and community say)

| Issue | Evidence | Mitigation |
|---|---|---|
| **Latin-script Hinglish is mispronounced** — "the text-to-speech model applies English vowel rules, so… 'karenge' is mispronounced" | [bundledseo review, 21 Sep 2026](https://bundledseo.com/blog/elevenlabs-review/) | write Hindi in **Devanagari**; transliterate Hinglish first (LLM), then human-check spellings |
| **English loanwords inside Devanagari**: "A native-script sentence with one Latin-script English word generally reads acceptably on v3. An English sentence with one Devanagari word is less reliable." | same source | keep the *matrix* language Devanagari; leave brand names / short English words in Latin; test exact mix |
| Website product guide: "Avoid mixing languages in one prompt… you can't specify a language there"; via API `language_code` "helps with short or ambiguous text, such as text that is only numbers" | [ElevenCreative TTS guide](https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech) | always pass `language_code: "hi"` on models that accept it (not Multilingual v2) |
| **Numbers / currency**: Flash v2.5 reads "$1,000,000" as "one thousand thousand dollars"; Multilingual v2 reads it correctly; the guide "recommends writing numbers out yourself, especially for multilingual use" | [best practices](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices), [TTS guide](https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech) | pre-normalize: `₹499` → `चार सौ निन्यानवे रुपये`; `1,00,000` → `एक लाख`; `50%` → `पचास प्रतिशत`; dates → words |
| **Indian digit grouping** (1,00,000 lakh / 1,00,00,000 crore) differs from Western grouping; "test large figures before publishing" | [ondalabs](https://ondalabs.app/blog/hindi-text-to-speech) (generic, not ElevenLabs-specific) | normalize in your own pipeline; never send raw "₹1,25,000" |
| `apply_language_text_normalization` is **Japanese-only**; `apply_text_normalization` has `auto/on/off` with no language-specific Hindi rules documented | [TTS convert API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert) | treat ElevenLabs normalization as English-centric; do Hindi normalization yourself |
| Schwa deletion and nukta letters (क़ ख़ ग़ ज़ फ़) are script-level ambiguities for any Hindi TTS | [ondalabs](https://ondalabs.app/blog/hindi-text-to-speech) | write nukta explicitly (ज़रूर, फ़ोन); for stubborn words use `/IPA/` on v4 |
| Code-switching reliability "is a known caveat and needs specific testing"; India-native platforms "tend to handle rapid mid-sentence code-switching more reliably" | [haass, 3 Sep 2026](https://haass.io/blog/elevenlabs-for-indian-businesses) | A/B test each ad's language mix; keep switches at phrase boundaries |
| No ElevenLabs doc gives *any* official guidance on Devanagari vs Roman input | checked [Hindi page](https://elevenlabs.io/text-to-speech/hindi), [Indian accent blog](https://elevenlabs.io/blog/generate-high-quality-indian-accent-text-to-speech), [best practices](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices) | the only first-party signal is that ElevenLabs' own Hindi demo text is Devanagari |

### 1.4 Script-format recommendation (Devanagari vs Latin Hinglish vs mixed)

1. **Send Hindi in Devanagari.** Both the only first-party Hindi sample (ElevenLabs' Hindi page) and the only detailed third-party Hindi test (bundledseo) point the same way; Latin-script Hinglish triggers English vowel rules.
2. **Mixed is fine when the matrix is Devanagari**: brand names, product names and short English phrases ("sale", "offer", "download now") can stay in Latin letters inside a Devanagari sentence; this is the pattern reported to "read acceptably".
3. **Avoid English-matrix sentences with isolated Devanagari words.**
4. **Keep audio tags in English** (`[excited]`, not `[उत्साहित]`) — community guidance for v3 ([dev.to guide](https://dev.to/yigit-konur/the-complete-guide-to-elevenlabs-v3-master-interactive-voice-experiences-with-audio-tags-3bn2)); ElevenLabs' Hindi page also shows English tags inside Devanagari text.
5. **Pre-normalize numbers, currency, %, dates, phone numbers into Devanagari words** before the API call (see §7).
6. For brand names that still come out wrong on v4: inline `/IPA/` in slashes (v4 only) or a pronunciation dictionary with IPA/CMU (non-English IPA only honoured on `eleven_v4` / `eleven_v4_turbo`).
7. Pass `language_code: "hi"` on v4/v4 Turbo/Flash v2.5 (ignored where unsupported; **not accepted for `multilingual_v2`**).

---

## 2. Expressiveness control

### 2.1 Audio tags (v3 and v4; v4 Turbo also supports them)

Documented behaviour ([best practices](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices), [v4 page](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/eleven-v4), [TTS product guide](https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech)):
- Syntax: square-bracket instruction placed where delivery should change: `[whispers] यह offer सिर्फ आज के लिए है।`
- "Eleven v4 follows tags more reliably than earlier models, but results are not perfect."
- A vague tag can be read as a **sound effect** rather than a delivery instruction; "describing the voice quality clearly reduces this" (e.g., `[low, gravelly voice]` rather than `[gravel]`).
- Tags work best when the delivery exists in the voice's training data; whispering/shouting on a voice never recorded that way "may not be optimal".
- Tags can be combined: `[lower, thoughtful]`, `[British accent][exasperated]`.
- Enhance button (UI) auto-inserts tags via an LLM; its system prompt (published in full on the best-practices page) says: do not alter the text, use only voice-related tags, avoid `[standing]`, `[grinning]`, `[pacing]`, `[music]`.

Official tag list as published on the best-practices page (ElevenLabs says it is non-exhaustive):

| Category | Tags |
|---|---|
| Voice-related | `[laughs]`, `[laughs harder]`, `[starts laughing]`, `[wheezing]`, `[whispers]`, `[sighs]`, `[exhales]`, `[sarcastic]`, `[curious]`, `[excited]`, `[crying]`, `[snorts]`, `[mischievously]` |
| Emotions (enhance prompt) | `[happy]`, `[sad]`, `[angry]`, `[annoyed]`, `[appalled]`, `[thoughtful]`, `[surprised]` |
| Non-verbal | `[chuckles]`, `[clears throat]`, `[exhales sharply]`, `[inhales deeply]`, `[frustrated sigh]`, `[happy gasp]` |
| Pauses | `[short pause]`, `[long pause]` (the generic `[pause]` is not in the official list but is widely used; dashes/ellipses are the documented alternative) |
| Sound effects | `[gunshot]`, `[applause]`, `[clapping]`, `[explosion]`, `[swallows]`, `[gulps]`; blog adds `[light rain]`, `[phone buzzing]`, `[door slams]` |
| Unique/experimental | `[strong X accent]` (e.g. `[strong Indian accent]`), `[sings]`, `[woo]`, `[fart]` |
| Accents (blog) | `[Indian English]`, `[British accent]`, `[French accent]`, `[Southern US accent]`, `[thick Irish accent]`, etc. — "The source voice you use will impact on the quality of the accent" ([accent blog](https://elevenlabs.io/blog/eleven-v3-audio-tags-emulating-accents-with-precision)) |
| Showcase examples | `[sigh]`, `[giggle]`, `[soft chuckle]`, `[under his breath]`, `[dismissive]`, `[Pause, dry amusement]`, `[low, gravelly voice]`, `[whispering]`, `[shouting]`, `[laughing]` |

Community-extended list (dev.to, unofficial, works because tags are free-text): `[quietly]`, `[loudly]`, `[gasp]`, `[tired]`, `[calm]`, `[dramatic]`, `[playfully]`, `[deadpan]`, `[slowly]`, `[quickly]`, `[rushed]`, `[rapid-fire]`, `[emphasized]`, `[beat]`, `[brief pause]`, `[trailing off]`, intensity modifiers like `[slightly nervous]`; suggested density 3–8 tags per 100 words; avoid contradictory tags ([dev.to](https://dev.to/yigit-konur/the-complete-guide-to-elevenlabs-v3-master-interactive-voice-experiences-with-audio-tags-3bn2)).

Billing note: tags count as characters (they are part of `text`); the Enhance prompt and the Hindi page both show tags inline, no separate field.

### 2.2 Text to Dialogue (multi-speaker)

- `POST https://api.elevenlabs.io/v1/text-to-dialogue` — body `inputs: [{text, voice_id}, …]`, `model_id` (default `eleven_v3`; page recommends v4; v4 supported per capability page), `settings` (3 collapsed properties — the docs page did not expose them; the Sept 28 changelog says `settings.similarity` 0–1 default 0.75 was added, implying `stability`/`similarity`/`use_speaker_boost`-style fields), `language_code`, `seed`, `apply_text_normalization`, `pronunciation_dictionary_locators` (max 3), `previous_text`/`future_text` (**max 100 chars each**), `previous_request_ids`/`next_request_ids` (max 3 each), `audio_effects`, `use_pvc_as_ivc` (deprecated). **Max 10 unique voice IDs; keep total `inputs[].text` ≤ 2,000 characters per request.** ([TDD convert](https://elevenlabs.io/docs/api-reference/text-to-dialogue/convert), [capability page](https://elevenlabs.io/docs/overview/capabilities/text-to-dialogue), [changelog 28 Sep](https://elevenlabs.io/docs/changelog/2026/9/28))
- `POST /v1/text-to-dialogue/with-timestamps` returns `audio_base64`, `voice_segments[]` (`voice_id`, `start_time_seconds`, `end_time_seconds`, `character_start_index`, `character_end_index`, `dialogue_input_index`), `alignment` and `normalized_alignment` ([TDD timestamps](https://elevenlabs.io/docs/api-reference/text-to-dialogue/convert-with-timestamps)).
- WebSocket `wss://api.elevenlabs.io/v1/text-to-dialogue/stream-input?model_id=…&output_format=…&sync_alignment=true` — v3/v4 dialogue models only; `eleven_v4_turbo` allows one registered voice per connection, `eleven_v4` up to 10; server buffers ~40 chars / 8 words before first audio; `new_turn: true` resets prosody; `keep_alive` needed every <20 s; sessions come from a **separate concurrency pool** (Free 14, Starter 21, Creator 35, Pro 70, Scale/Business 105) ([realtime TDD guide](https://elevenlabs.io/docs/eleven-api/guides/how-to/websockets/realtime-tdd), [models](https://elevenlabs.io/docs/overview/models)).
- Use for two-voice ad formats (customer + brand voice, "friend recommending"). Emotion comes from tags and "textual cues such as 'she said excitedly' or exclamation marks"; punctuation shows interruptions, ellipses show trailing speech ([capability page](https://elevenlabs.io/docs/overview/capabilities/text-to-dialogue)).

### 2.3 Voice settings by model

| Setting | Range / default | Multilingual v2 / Flash v2.5 | Eleven v3 | Eleven v4 / v4 Turbo | Notes |
|---|---|---|---|---|---|
| `stability` | 0–1, default 0.5 | yes | yes | yes | lower = broader emotional range, risk of erratic/rushed; higher = consistent/monotone ([get-default](https://elevenlabs.io/docs/api-reference/voices/settings/get-default)) |
| `similarity_boost` | 0–1, default 0.75 | yes | **"Not available for Eleven v3"** (UI guide) | yes ("Similarity") | high values can reproduce source-audio artefacts |
| `style` | default 0 | yes (keep 0) | not available | **"Style and Speed sliders are not available in Eleven v4"** | non-zero adds latency/instability |
| `use_speaker_boost` | bool, default true | yes | not available (UI guide) | not documented | small latency cost |
| `speed` | **0.7–1.2**, default 1.0 | yes | **not available** | **not available** | "Extreme values may affect quality" |
| `clone_strength` | 0–1, recommended 0 | no | no | **PVC on v4 only** | higher = closer to training recordings, helps distinctive accents ([v4 page](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/eleven-v4), [changelog 26 Oct](https://elevenlabs.io/docs/changelog)) |

Sources: [voice settings default](https://elevenlabs.io/docs/api-reference/voices/settings/get-default), [TTS product guide](https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech), [v4 page](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/eleven-v4), [best practices (Pace)](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices).

**Recommended starting values for energetic ad reads (synthesised from the docs' directional guidance; ElevenLabs publishes no "ad preset"):**
- v4: `stability` 0.35–0.45 (the guide: "For livelier delivery, go lower and generate a few times"; common start 0.5), `similarity_boost` 0.75, `clone_strength` 0 (PVC), no style/speed; drive energy with `[excited]`, `[upbeat]`-style tags, exclamation marks and CAPITALS for emphasis.
- Multilingual v2 fallback: `stability` 0.4–0.5, `similarity_boost` 0.75, `style` 0, `use_speaker_boost` true, `speed` 1.05–1.1 for a brisk read (max 1.2).
- The older "Creative / Natural / Robust" discrete stability labels for v3 appear in 2025 third-party guides but are **not in the current ElevenLabs docs pages opened** (best practices, product guide, v4 page) — treat as unverified for Nov 2026.

### 2.4 Pauses, SSML, phonemes, pronunciation dictionaries

| Mechanism | Multilingual v2 | Flash v2.5 | Flash v2 (EN) | Eleven v3 | Eleven v4 / Turbo | Source |
|---|---|---|---|---|---|---|
| `<break time="1.5s" />` (≤3 s) | yes | yes | yes | **no** | **no** | "Eleven v4 and Eleven v3 do not support SSML break tags" ([best practices](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices)) |
| Dashes / ellipses for pauses | yes (less consistent) | yes | yes | yes | yes | same |
| `[short pause]` / `[long pause]` tags | no | no | no | yes | yes | same |
| Inline SSML `<phoneme>` (IPA/CMU) | **no** | no | yes (single words) | no | no — "SSML is not supported" | [best practices](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices), [v4 page](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/eleven-v4) |
| Inline IPA in slashes `/ˌbaɪoʊˈkemɪstri/` | no | no | no | "native IPA support" (UI guide) | **yes** (documented for v4) | [best practices](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices), [TTS guide](https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech) |
| Pronunciation dictionary — **phoneme** rules (IPA or CMU) | ignored (alias only) | ignored | yes | yes | yes | "Phoneme tags work only with `eleven_v4`, `eleven_v4_turbo`, `eleven_flash_v2`, and `eleven_v3`" ([dictionaries guide](https://elevenlabs.io/docs/eleven-api/guides/how-to/text-to-speech/pronunciation-dictionaries)) |
| Dictionary phoneme rules in **non-English** languages | — | — | — | no | **yes, only v4 / v4 Turbo** | "For IPA or CMU pronunciations in languages other than English, you must use `eleven_v4` or `eleven_v4_turbo`" (same) |
| Dictionary **alias** rules (`<lexeme><grapheme>` → alias text) | yes | yes | yes | yes | yes | works everywhere; case-sensitive; first match wins; max **3 locators per request** ([TTS convert](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)) |

Hindi/Devanagari in dictionaries: no page states whether Devanagari graphemes are accepted; the PLS example uses `xml:lang="en-US"` only. Expect alias rules (Devanagari → Devanagari respelling, or Latin brand → Devanagari) to work since they are plain string substitution; IPA phoneme rules for Hindi words are documented to require v4. **Test before relying.**

### 2.5 `speed`, `language_code`, seed, continuity, stitching

- **`speed`**: 0.7–1.2, default 1.0; "the speed setting is available in Text to Speech via the website and API"; not on v3/v4 ([best practices](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices), [TTS guide](https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech)).
- **`language_code`** (ISO 639-1): "Enforces language for the model and normalization. Ignored if the model doesn't support it. **Not supported for `multilingual_v2`.**" ([TTS convert](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)). Flash v2.5 and v3/v4 accept it (ignored where unsupported; the docs don't enumerate).
- **`seed`**: 0–4,294,967,295; "best-effort determinism, not guaranteed"; "Output is nondeterministic… subtle differences can still occur" ([TTS convert](https://elevenlabs.io/docs/api-reference/text-to-speech/convert), [TTS capability](https://elevenlabs.io/docs/overview/capabilities/text-to-speech)).
- **`previous_text` / `next_text`**: free text before/after the chunk for prosodic continuity; ignored if the corresponding `*_request_ids` is also sent. TDD variant is `previous_text`/`future_text` with a **100-character cap** ([TTS convert llms.txt](https://elevenlabs.io/docs/api-reference/text-to-speech/convert/llms.txt), [TDD convert](https://elevenlabs.io/docs/api-reference/text-to-dialogue/convert)).
- **Request stitching**: `previous_request_ids` / `next_request_ids`, up to 3 each, "results are best when the same model is used throughout"; `next_request_ids` lets you regenerate a bad middle clip consistent with its neighbours. Requires history, so **not available in zero-retention mode** (`enable_logging=false`, enterprise only). v4 launch notes say long-form stitching is "more reliable" ([eesel](https://www.eesel.ai/blog/eleven-v4), third-party).
- **Free regenerations**: up to 2 per generation, identical content and parameters, **dashboard only** (not API) ([TTS capability](https://elevenlabs.io/docs/overview/capabilities/text-to-speech)).
- **`audio_effects`** (new 12 Oct 2026): `filter_preset_id` (e.g. `phone`, `old_radio`), `distance` 0–1, `environment_id` (e.g. `small_room`, `hall`), `background_noise_id` (e.g. `cafe`, `keyboard`), `send_level` 0–1, `pan` −1…1. Catalogue at `GET /v1/audio-effects/catalog`. Reverb or non-zero pan yields **stereo**, which returns 400 with `pcm_*`, `ulaw_*`, `alaw_*` formats. "Effects don't change request cost." ([TTS convert llms.txt](https://elevenlabs.io/docs/api-reference/text-to-speech/convert/llms.txt))

---

## 3. Voices

### 3.1 Finding Hindi / Indian voices in the Voice Library

- UI filters: **Language** (voices trained on that language; multilingual performers also appear), **Accent** (appears after choosing a language), **Category/use case**: Conversational, Narration, Characters, Social Media, Educational, **Advertisement**, Entertainment; Gender; Age (Young / Middle Aged / Old); Notice period; Live Moderation; Quality ("Studio Quality") ([Voice Library docs](https://elevenlabs.io/docs/eleven-creative/voices/voice-library)).
- API: `GET https://api.elevenlabs.io/v1/shared-voices` with `language`, `accent`, `locale`, `gender`, `age`, `use_cases[]`, `descriptives[]`, `category` (`professional` | `famous` | `high_quality`), `search`, `featured`, `min_notice_period_days`, `include_live_moderated`, `sort` (`created_date` | `usage_character_count_1y` | `trending` | `cloned_by_count`), `page_size` ≤ 100. Response voices carry `accent`, `language`, `use_case`, `descriptive`, `free_users_allowed`, `live_moderation_enabled`, `rate`, `verified_languages[] {language, model_id, accent, locale, preview_url}` ([get-shared](https://elevenlabs.io/docs/api-reference/voices/voice-library/get-shared)). The exact `language` value format is not documented on the page (test `"hi"` vs `"Hindi"`).
- Suggested query for this product: `language=hi&use_cases=advertisement&sort=usage_character_count_1y&category=professional`, then also `use_cases=social media`; check `verified_languages` contains `hi` with `model_id` `eleven_v4`/`eleven_multilingual_v2`.
- **Hindi voices ElevenLabs itself promotes** (names from the [Hindi TTS page](https://elevenlabs.io/text-to-speech/hindi), no voice IDs on the page): Niraj ("romantic and smooth"), **Bunty ("punchy, crisp, reel-focused")**, Monika Sogam ("calm and natural"), Devi ("encouraging and motivating"), Raju ("clear, natural, warm"), Aakash (narration), Vikram & Vikrant (educational), Krishna Gupta (social media), Kali Devi (narration) — tagged "Desi"; the page also mentions "Mumbai to Delhi accents" and "Bollywood-style narration".
- ElevenLabs says "160 Indian accents, from North Indian English to South Indian variations" are covered ([Indian accent blog](https://elevenlabs.io/blog/generate-high-quality-indian-accent-text-to-speech)); third-party says the Indian library includes Bihari-accented voices etc. ([haass](https://haass.io/blog/elevenlabs-for-indian-businesses)).
- **Library voices are not available via API to Free-tier users**; some voices are paid-only by owner choice or because of a legacy credit multiplier ([Voice Library docs](https://elevenlabs.io/docs/eleven-creative/voices/voice-library), [voices overview](https://elevenlabs.io/docs/overview/capabilities/voices)).
- **Notice period**: how long you keep access if the owner withdraws the voice (min 30 days, max 2 years; without one access ends immediately). For a product shipping ads, filter `min_notice_period_days` ≥ 30 or prefer PVC/designed voices you own.
- **Custom rates / credit multipliers**: legacy; voices with a 2x multiplier cost twice the credits; "no longer available for newly shared voices".
- **Live Moderation** (shield icon): generated text is screened against prohibited categories; may add latency — exclude with `include_live_moderated=false` if latency matters.
- Saving a Library voice **does not** consume a custom-voice slot; only Voice Design and cloned voices do.
- Commercial use of Library voices: docs point to the Voice Library Addendum and Terms; no page opened states an ad-specific restriction. PVCs can be shared to the library; IVCs and designed voices cannot.
- **Default voices expire 31 Dec 2026** ([voices overview](https://elevenlabs.io/docs/overview/capabilities/voices)).

### 3.2 Voice Design (text → new voice)

- Endpoint `POST https://api.elevenlabs.io/v1/text-to-voice/design`: `voice_description` (20–1000 chars, required), `model_id` ∈ {`eleven_multilingual_ttv_v2` (default), `eleven_ttv_v3`} — **no v4 TTV model is listed**; `text` (100–1000 chars) or `auto_generate_text`, `loudness` −1…1 (default 0.5; 0 ≈ −24 LUFS), `quality` −1…1, `guidance_scale` 0–100 (default 5; high values can sound robotic), `seed`, `should_enhance`, `reference_audio_base64` + `prompt_strength` (v3 only), `stream_previews`. Returns 3 previews with `generated_voice_id`, `audio_base_64`, `duration_secs`, `language`; save with `POST /v1/text-to-voice` ([design API](https://elevenlabs.io/docs/api-reference/text-to-voice/design), [voices overview](https://elevenlabs.io/docs/overview/capabilities/voices)).
- Billing: charged for the characters of the preview text once per generation (3 samples), not per sample ([Voice Design guide](https://elevenlabs.io/docs/eleven-creative/voices/voice-design), [blog](https://elevenlabs.io/blog/voice-design-v3)).
- Prompt recipe (official guide): first line = language, gender, age range, quality level; then persona (2–5 words) and 2–3 emotion adjectives; then timbre/pacing/delivery. "State the language and regional variant in the first sentence to prevent drift." Use "thick" rather than "strong" for accents; don't say "accent" when you mean intonation; avoid FX words (reverb, phone). Examples are "Native Spanish, español europeo…", "Native Arabic… Gulf (UAE)". No Hindi example exists in the docs; the only India example is the blog's "An Indian woman with a soft, calm delivery" ([Voice Design guide](https://elevenlabs.io/docs/eleven-creative/voices/voice-design), [blog](https://elevenlabs.io/blog/voice-design-v3)).
- Suggested Hindi ad prompt: "Native Hindi (India), female, late 20s, studio-quality recording. Upbeat Mumbai reel presenter, energetic, warm, confident. Bright, slightly husky timbre, fast but clear pacing, punchy ad delivery." with preview `text` written in Devanagari ad copy and `guidance_scale` ~20–40 (guide: examples use roughly 20–40%).
- Designed voices work with v4 and v3 and support audio tags, but "may be less performative" on v4; ElevenLabs says PVC is the production-grade option ([voices overview](https://elevenlabs.io/docs/overview/capabilities/voices)).

### 3.3 Instant vs Professional Voice Cloning

| | Instant Voice Clone (IVC) | Professional Voice Clone (PVC) |
|---|---|---|
| Audio needed | 1–2 min recommended (max ~3 min); each file ≥ 5 s, total ≥ 10 s; v4 blog claims ~10 s is enough | 30 min minimum, 2–3 h recommended (FAQ: 30–180 min); split into ~30-min files |
| Format | MP3 ≥ 192 kbps recommended; WAV adds nothing; −23…−18 dB RMS, −3 dB true peak | same |
| Consent / verification | checkbox "you have the right and consent to clone the voice"; API returns `requires_verification` | **own voice only** — "Even with their consent, you cannot clone someone else's voice"; voice-captcha: read lines aloud with the same mic; after failures wait 24 h |
| Training time | seconds | 3–6 h typical; status docs say 6–24 h; queue can extend |
| Languages | any language of Flash v2.5 / Multilingual v2 (Hindi included); cross-language into unsupported languages not recommended | "all languages available in the Eleven v4 model family — 90+", **Hindi (hi) listed**; samples must be in a supported language |
| Models trained | all | auto on Flash v2.5, Turbo v2.5, Multilingual v2 (+Flash v2/Turbo v2 for English); v4 fine-tune via "+ next to Eleven v4" in My Voices; v3 "not fully optimized" |
| Plan | "most plans" (pricing page lists IVC from Starter) | **Creator or above**; slots: Creator/Pro 1, Scale 3, Business 10, Enterprise custom; extra slots earned when a shared PVC is marked Studio Quality |
| Sharing | cannot be shared to Library | can be shared to Library / private link; earns rewards |
| Export | clones cannot be downloaded as model files; usable only via account/API | same |
| API | `POST /v1/voices/add` (multipart): `name`, `files[]`, `remove_background_noise` (default false), `description`, `labels` (`language`, `accent`, `gender`, `age`) | UI flow (+ PVC API endpoints exist in reference, not opened) |

Sources: [voice cloning overview](https://elevenlabs.io/docs/eleven-creative/voices/voice-cloning), [IVC](https://elevenlabs.io/docs/eleven-creative/voices/voice-cloning/instant-voice-cloning), [PVC](https://elevenlabs.io/docs/eleven-creative/voices/voice-cloning/professional-voice-cloning), [IVC API](https://elevenlabs.io/docs/api-reference/voices/ivc/create), [v4 page](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/eleven-v4), [v4 blog](https://elevenlabs.io/blog/eleven-v4). ElevenLabs demonstrated cloning in **12 Indian languages** (Hindi, Assamese, Bengali, Gujarati, Kannada, Malayalam, Marathi, Nepali, Punjabi, Sindhi, Tamil, Telugu) at IIT Delhi ([blog, Oct 2025](https://elevenlabs.io/blog/voice-cloning-in-12-indian-languages-demonstrated-live-at-iit-delhi)).

Implication for an ad product: because PVC is own-voice-only, you cannot PVC-clone hired Hindi voice actors on your account; the actor must create and share the PVC themselves (Library sharing with terms), or you use IVC with documented consent, Voice Design, or Library voices. v4's `use_pvc_as_ivc` lets you use the IVC version of a PVC for lower latency.

### 3.4 Custom voice slots per plan (UI "custom voices", from [pricing](https://elevenlabs.io/pricing) / [IT pricing](https://elevenlabs.io/it/pricing))

| Plan | Custom voice slots | PVC slots |
|---|---|---|
| Free | 3 | 0 |
| Starter | 10 | 0 |
| Creator | 30 | 1 |
| Pro | 160 | 1 |
| Scale | 660 | 3 |
| Business | 2,200 | 10 |
| Enterprise | custom | custom |

---

## 4. Sync & captions

### 4.1 TTS with timestamps

- `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps` (same body as `convert`: `text`, `model_id`, `language_code`, `voice_settings`, `seed`, `previous_text`…, `audio_effects`; query `output_format`). Streaming variant: `/v1/text-to-speech/{voice_id}/stream/with-timestamps` (docs page "Stream speech with timing"). Response: `audio_base64`, `alignment {characters[], character_start_times_seconds[], character_end_times_seconds[]}`, `normalized_alignment` (same arrays for the *normalized* text, i.e. after number expansion) ([with-timestamps](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps)).
- **Character-level only** — there is no word array; build words by grouping characters between whitespace. For Devanagari, group by **grapheme cluster** (base consonant + matras/virama) before grouping into words, since combining marks are separate code points.
- The docs do not state which models support timestamps; the endpoint accepts any `model_id`. The Oct 12 2026 changelog notes the TTS and TDD *timestamp endpoints* gained `audio_effects`, so they are live for current models ([changelog](https://elevenlabs.io/docs/changelog)). Test with `eleven_v4` early; if alignment is null, fall back to Forced Alignment.
- WebSocket TDD: `sync_alignment=true` returns `alignment` objects per chunk; SDK `onAudioAlignmentPlayback` (Oct 19) ([realtime TDD](https://elevenlabs.io/docs/eleven-api/guides/how-to/websockets/realtime-tdd), [changelog](https://elevenlabs.io/docs/changelog)).
- Dialogue timestamps: `voice_segments[]` with `character_start_index`/`character_end_index` + `dialogue_input_index` let you slice the global alignment per speaker ([TDD with-timestamps](https://elevenlabs.io/docs/api-reference/text-to-dialogue/convert-with-timestamps)).

### 4.2 Forced Alignment API

- `POST https://api.elevenlabs.io/v1/forced-alignment` (multipart): `file` (any major audio format, **< 1 GB**), `text` (transcript, any format; no diarization). Response: `characters[] {text, start, end}`, `words[] {text, start, end, loss}`, overall `loss` ([forced alignment](https://elevenlabs.io/docs/api-reference/forced-alignment/create)).
- Gives **word-level** timings directly — the cleanest path to karaoke captions when you already have the script. Languages are not listed on the page; Hindi is not confirmed there, although Scribe (its STT family) lists Hindi. Pricing not stated on the page (the API pricing page has no forced-alignment row either). **Verify Hindi + price with a test call.**

### 4.3 Speech to Text (Scribe v2) for alignment / Hindi

- Models: `scribe_v2` (batch), `scribe_v2_realtime` (~150 ms), `scribe_v2_medical`; `scribe_v1` listed as deprecated-replace-with-v2 ([models](https://elevenlabs.io/docs/overview/models)).
- **Hindi: "High Accuracy" tier, WER > 5 % and ≤ 10 %** (not the top "Excellent" tier) ([STT capability](https://elevenlabs.io/docs/overview/capabilities/speech-to-text)).
- `POST /v1/speech-to-text`: `model_id`, `file` or `source_url`, `language_code` (ISO 639-1/-3, e.g. `hi`/`hin`), `timestamps_granularity` ∈ {`none`, `word` (default), `character`}, `diarize`, `num_speakers` 1–32, `tag_audio_events`, `keyterms` (≤ 1,000 terms, ≤ 50 chars, ≤ 5 words; +20 % price), `transcript_edit` (natural-language edit, +30 %), `entity_detection`, `seed`, `webhook`, `additional_formats` ∈ {`docx`, `html`, `pdf`, `srt`, `txt`, `segmented_json`} (`vtt` not in the skills reference; the API page mentions SRT/VTT/DOCX examples — **confirm VTT**). Response `words[] {text, start, end, type (word|spacing|audio_event), speaker_id, logprob}`. Upload < 5 GB, URL < 2 GB; capability page says 10 h max ([STT API](https://elevenlabs.io/docs/api-reference/speech-to-text/convert), [transcription options](https://github.com/elevenlabs/skills/blob/main/speech-to-text/references/transcription-options.md)).
- Price: $0.22/hour (self-serve API), surcharges for keyterms/edit ([API pricing](https://elevenlabs.io/pricing/api?price.section=speech_to_text)).
- Use Scribe only when you *don't* have the script (user-uploaded VO); when you generated the VO, prefer TTS timestamps or Forced Alignment (no ASR error).

### 4.4 Recipe: karaoke-style Devanagari word highlighting

1. Pre-normalize the script (numbers → words) so the text you align equals what is spoken; keep a map from original tokens to normalized tokens for display.
2. Call `/with-timestamps` with `eleven_v4`, `output_format=mp3_44100_192` (Creator+) or `pcm_44100` (Pro+). Use `normalized_alignment` if present (it matches spoken expansions); else `alignment`.
3. Segment `characters[]` into grapheme clusters (Unicode UAX-29; e.g. Python `regex` `\X`), then into words on spaces/danda (।); a word's start = first cluster's `character_start_times_seconds`, end = last cluster's end. Strip audio tags `[…]` from the display text but keep their character offsets in mind (they are present in `characters[]` as text — verify whether tags appear in `alignment` or only in `normalized_alignment`; untested).
4. Emit ASS/SRT with per-word `{\k}` or per-word cue times; for two-speaker ads use `voice_segments` from the TDD timestamps endpoint to colour by speaker.
5. If v4 returns no alignment, run Forced Alignment on the rendered audio with the normalized script and use `words[]` directly.

---

## 5. Other audio APIs

### 5.1 Sound Effects

- `POST https://api.elevenlabs.io/v1/sound-generation`: `text`, `model_id` ∈ {`eleven_text_to_sound_v2` (default, removed 1 Mar 2027), **`eleven_text_to_sound_v3`**}, `duration_seconds` 0.5–30 (null = inferred), `prompt_influence` 0–1 default 0.3, `loop` bool (seamless loops), query `output_format` (MP3 all; WAV 48 kHz for non-looping; 192 kbps MP3 needs Creator+, PCM/WAV 44.1 k needs Pro+). Header `character-cost` returns billed characters ([SFX API](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert), [SFX capability](https://elevenlabs.io/docs/overview/capabilities/sound-effects), [models](https://elevenlabs.io/docs/overview/models)).
- SFX v3: follows multi-part prompts ("describe action, setting, atmosphere, performance"), handles musical/vocal prompts, looping; "limited access… may not be available in every region"; unknown-model error if not enabled ([SFX capability](https://elevenlabs.io/docs/overview/capabilities/sound-effects)).
- Price: UI "40 credits per second" when a duration is set; API pricing page: **$0.12/min**, "royalty-free"; included generations per tier: Free 8, Starter 150, Creator 605, Pro 3,000, Scale 9,000, Business 30,000 ([API pricing](https://elevenlabs.io/pricing/api)). Zero Retention Mode and WAV added 19 Oct 2026 ([changelog](https://elevenlabs.io/docs/changelog)).

### 5.2 Eleven Music API

- `POST https://api.elevenlabs.io/v1/music` (also `/v1/music/detailed` → audio + plan + metadata, and composition-plan creation): `prompt` (≤ 4,100 chars) **or** `composition_plan`, `music_length_ms` **3,000–600,000** (3 s–10 min; UI capability page says 5 min max for some contexts), `model_id` ∈ {`music_v1` (API default, removed 31 Jan 2027), `music_v2`, **`music_v2_5`**}, `force_instrumental` (prompt only), `seed` (plan only), `finetune_id`, `sign_with_c2pa`, query `output_format` default `auto` (mp3_48000_192 for v2 models). Header `song-id`. Prompts naming an artist/band or containing copyrighted lyrics return `bad_prompt` with a `prompt_suggestion` ([music compose API](https://elevenlabs.io/docs/api-reference/music/compose), [music quickstart](https://elevenlabs.io/docs/eleven-api/guides/cookbooks/music)).
- Vocals: English, Spanish, German, Japanese "and more" — **Hindi vocals not listed**; use `force_instrumental=true` for ad beds ([Music product docs](https://elevenlabs.io/docs/eleven-creative/products/music)).
- Audio Reference (≤ ~30 s upload, copyright-screened; guides style, does not copy), inpainting, Video-to-Music API (19 Oct 2026) ([Music product docs](https://elevenlabs.io/docs/eleven-creative/products/music), [changelog](https://elevenlabs.io/docs/changelog)).
- **API access only on paid plans** ([Music capability](https://elevenlabs.io/docs/overview/capabilities/music), [help center](https://help.elevenlabs.io/hc/en-us/articles/37780368848785-What-is-Eleven-Music)).
- Price: **$0.15/min** API; included minutes Free 3, Starter 40, Creator 147, Pro 660, Scale 1,993, Business 6,600; $1.50 per finetune; "Commercial use licensing on Starter+ plans" ([API pricing](https://elevenlabs.io/pricing/api)). Standard-quality exports on Free/Starter/Creator; high-fidelity on Pro+ ([Music product docs](https://elevenlabs.io/docs/eleven-creative/products/music)).
- **Licensing — is API music cleared for ads?** Per the [Music Terms](https://elevenlabs.io/music-terms) (Exhibit A, read 3 Nov 2026):

| Plan | Eligibility | Media rights | Attribution | Streaming distribution |
|---|---|---|---|---|
| Free | individual use only | "All online and offline commercial use permitted, **except film, TV, radio, and Studio Games**"; download not permitted | **required** | prohibited |
| Starter | individual use only | same restricted rights | not required | prohibited |
| Creator / Pro | individual use only | same | not required | permitted |
| Scale | organisations **under 10 employees** | same | not required | permitted |
| Business | organisations **under 50 employees** | same | not required | permitted |
| Enterprise Music Lite | custom | same restricted rights | — | permitted |
| Enterprise Music | custom | **unrestricted** (film/TV/radio/games included) | — | permitted |

  So: **online/social/digital ads are permitted from Starter upward** (Free technically too, but with attribution and no downloads); **TV and radio spots are excluded on every self-serve plan** and need Enterprise Music. Note the eligibility column: a company with ≥ 10 employees generating ads at scale is outside Scale eligibility, ≥ 50 outside Business — read the terms with counsel. You "retain any and all rights in and to your Input and Output" (§2.2) and are "responsible for reviewing Output for clearance" (§3.1). No India-specific clause. Music libraries/reselling prohibited.

### 5.3 Dubbing

- Video/audio → dubbed in 90+ languages; **Hindi supported (`hi`)** in v1 and v2; keeps background audio; detects up to 32 speakers; source up to 4K; output "a high-quality preview, not a production master" (usually 1080p); 3 concurrent jobs on self-serve, 10 Enterprise. v2 (default, "Alpha", dialect tags like `en-GB`, 3 GB/file via API, stereo max, cloning strength 0–10 default 7, no watermark toggle — free tier watermarked automatically); v1 legacy required for Dubbing Studio (transcript editing, per-clip regeneration), 45 min, mono ([Dubbing capability](https://elevenlabs.io/docs/overview/capabilities/dubbing)).
- **"At the moment, ElevenLabs does not offer lip syncing as part of Dubbing."** Lip sync "is available in other parts of the product, through outside models" ([help center](https://help.elevenlabs.io/hc/en-us/articles/23793433149073-Do-you-offer-lip-sync-in-Dubbing)).
- Price: v1 $0.33/min watermarked, $0.50/min clean; **v2 $2.20/min** ([API pricing](https://elevenlabs.io/pricing/api)). Oct 2026: WebVTT subtitles timed to source, transcript JSON downloads, legacy `/v1/dubbing` endpoints deprecated ([changelog](https://elevenlabs.io/docs/changelog)).
- Relevance: only if you dub an existing (e.g., English) ad into Hindi; for generated ads, TTS is cheaper and more controllable.

### 5.4 Lip-sync / AI actors (not an audio API, but decision-relevant)

- ElevenCreative "Image & Video" hosts third-party video and lip-sync models: **Sync 3**, Sync Lipsync 2 Pro, **Creatify Aurora (the only lip-sync model with an API reference)**, Veed Fabric/Lipsync 2.0, HeyGen Avatar 4, OmniHuman 1.5, MiniMax H3 Max Lip Sync (speech clips 5–14.8 s), plus Veo 3.1, Kling 3.0, Seedance 2.x, Runway etc. Video requires a paid plan; many models are **restricted in the US**; pricing "varies by settings and duration"; ByteDance models disabled for API by default ([Image & Video docs](https://elevenlabs.io/docs/eleven-creative/playground/image-video)). Sync 3 page claims 95+ languages, 4K; no API/pricing details ([Sync 3](https://elevenlabs.io/video/sync-3)).
- Takeaway: plan on a separate lip-sync vendor (or Creatify Aurora via ElevenLabs API) and feed it the ElevenLabs VO.

### 5.5 Audio Isolation, Voice Changer, Studio, Audio Native, Agents

- **Voice Isolator**: `/v1/audio-isolation` (reference at `/docs/api-reference/audio-isolation/convert`); audio+video inputs; 500 MB / 1 h; "1,000 characters per minute of audio" in credits; **$0.12/min** API ([voice isolator](https://elevenlabs.io/docs/overview/capabilities/voice-isolator), [API pricing](https://elevenlabs.io/pricing/api)).
- **Voice Changer (speech-to-speech)**: `eleven_multilingual_sts_v2` (29 langs incl. Hindi; recommended even for English) / `eleven_english_sts_v2`; `remove_background_noise`; 5-min segment max; 1,000 chars per minute; **$0.12/min** API. Useful to let a human actor's Hindi performance be re-voiced into a licensed voice while keeping timing/emotion ([voice changer](https://elevenlabs.io/docs/overview/capabilities/voice-changer)).
- **Studio API**: `POST /v1/studio/projects` (multipart): `default_model_id`, `default_paragraph_voice_id`, `from_url/from_document/from_content_json`, `quality_preset` (`standard`…`ultra_lossless`, default = highest your tier allows), `apply_text_normalization` (`auto/on/off/apply_english`), `pronunciation_dictionary_locators`, `volume_normalization` (audiobook/ACX spec, **not −14 LUFS**), `language`, `callback_url`, convert/snapshot/stream endpoints — long-form oriented, not needed for 30-s ads ([Studio add-project](https://elevenlabs.io/docs/api-reference/studio/add-project)).
- **Audio Native**: not found on the capability sidebar opened; it is an embeddable web player product, not relevant.
- **Agents**: Eleven Realtime v1 Mini/Max (launched 19 Oct 2026, $0.08/min connected audio + tokens), TTS default `eleven_v4_turbo` since 5 Oct 2026 — out of scope ([changelog](https://elevenlabs.io/docs/changelog), [API pricing](https://elevenlabs.io/pricing/api)).

---

## 6. Plans, pricing, limits

### 6.1 Two price lists now exist

ElevenLabs now presents **ElevenCreative** (app, credits) and **ElevenAPI** (per-character usage) pricing separately; the same subscription tiers and prices apply, but the API page shows *included characters per model* and a flat usage rate, while the Creative page shows *credits*.

**ElevenCreative (app) tiers** — [pricing](https://elevenlabs.io/pricing), cross-checked with [IT pricing](https://elevenlabs.io/it/pricing) (prices in USD, ex-tax, monthly billing; annual toggle exists but figures were not exposed in the fetched HTML):

| Plan | Price / mo | Credits / mo (≈ min of TTS) | Extra minute (≈) | Commercial licence | IVC | PVC | Concurrency (TTS) | Audio quality |
|---|---|---|---|---|---|---|---|---|
| Free | $0 | 10k (~10) | $0.36 | **no** (attribution required) | — (3 custom voice slots) | 0 | 2 | 128 kbps / 44.1 kHz |
| Starter | $6 ($1 first month promo) | 30k (~30) | $0.20 | **yes — "Commercial License" first appears here** | yes | 0 | 3 | 128 kbps |
| Creator | $22 ($11 first month) | 121k (~121) | $0.18 | yes | yes | 1 | 5 | 128 & **192 kbps** |
| Pro | $99 | 600k (~600) | $0.17 | yes | yes | 1 | 10 | + **44.1 kHz PCM via API** |
| Scale | $299 | 1.8M (~1,800) | $0.17 | yes | yes | 3 | 15 | same |
| Business | $990 | 6M (~6,000) | $0.17 | yes | yes | 10 | 25 (IT page) / 15 (models-page table) | "low-latency TTS as low as 5c/min" |
| Enterprise | custom | custom | — | custom DPA/SLA, SSO, BAA | custom | custom | elevated | — |

Credit multipliers in the app: Multilingual v2 / v3 = 1 credit per character; Flash / Turbo = 0.5 credits per character ([help center models article](https://help.elevenlabs.io/hc/en-us/articles/17883183930129-What-models-do-you-offer-and-what-is-the-difference-between-them)); v4 "uses the same credit pricing as our other Text to Speech models" (≈1 credit/char) per [eesel](https://www.eesel.ai/blog/eleven-v4-pricing) quoting the v4 landing page (third-party). "Credits were previously referred to as characters"; up to two months of unused credits roll over on self-serve plans ([What are credits](https://help.elevenlabs.io/hc/en-us/articles/27562020846481-What-are-credits)).

**ElevenAPI tiers** — [API pricing](https://elevenlabs.io/pricing/api):

| Plan | Price / mo | v4 / v3 / MV2 chars included | v4 Turbo / v3 Conv / Flash chars included | Usage rate per 1k chars (all tiers) |
|---|---|---|---|---|
| Free / PAYG | $0 | 10,000 | 20,000 | v4/v3/MV2 **$0.08**; Turbo/Flash **$0.04** |
| Starter | $6 | 75,000 | 150,000 | same |
| Creator | $22 | 275,000 | 550,000 | same |
| Pro | $99 | 1,238,000 | 2,475,000 | same |
| Scale | $299 | 3,738,000 | 7,475,000 | same |
| Business | $990 | 12,375,000 | 24,750,000 | same |
| Enterprise | custom | custom | custom | custom |

Observations: the API page's included characters are exactly price ÷ $0.08 (e.g., Creator $22 → 275k), i.e. subscription credits are worth the same as PAYG on the API — the subscription mainly buys concurrency, priority, PVC slots and the commercial licence. Other API rates on the same page: Scribe v2 $0.22/h; Music $0.15/min; SFX $0.12/min; Voice Changer $0.12/min; Voice Isolator $0.12/min; Dubbing v1 $0.33 (wm) / $0.50; Dubbing v2 $2.20/min; Realtime agents $0.08/min. Launch promo on v4 (72 % off until 12 Oct 2026) has ended ([eesel](https://www.eesel.ai/blog/eleven-v4), [the-decoder](https://the-decoder.com/elevenlabs-new-v4-speech-model-makes-ai-voices-more-expressive-and-consistent/)).

**Pay-as-you-go** ([PAYG docs](https://elevenlabs.io/docs/overview/administration/pay-as-you-go)): all self-serve plans incl. Free; subscription credits used first; manual or Auto Top Up ($20 default, $10 threshold, $5 floor); **minimum top-up $5 or ₹500; currencies USD and INR**; credits expire after 12 months; non-refundable; service pauses at $0 (no postpaid debt); monthly caps without 2FA (Free/Starter/Creator $100 / ₹8,800; Pro $200; Scale $600; Business $2,000); Free+PAYG gets concurrency 3 and Starter priority.

### 6.2 Concurrency (from [models](https://elevenlabs.io/docs/overview/models))

| Plan | Multilingual v2 | Flash | STT | Realtime STT | Music | Priority | TDD WebSocket sessions |
|---|---|---|---|---|---|---|---|
| Free | 2 | 4 | 8 | 6 | 0 | 3 | 14 |
| Starter | 3 | 6 | 12 | 9 | 2 | 4 | 21 |
| Creator | 5 | 10 | 20 | 15 | 2 | 5 | 35 |
| Pro | 10 | 20 | 40 | 30 | 2 | 5 | 70 |
| Scale / Business | 15 | 30 | 60 | 45 | 5 | 5 | 105 |
| Enterprise | elevated | elevated | elevated | elevated | highest | 6 | elevated |

Headers `current-concurrent-requests` / `maximum-concurrent-requests` are returned. **The table has no explicit v3/v4 column** — unverified which column v4 uses (assume the Multilingual v2 column until tested). Dubbing: 3 concurrent jobs self-serve. Exceeding → `too_many_concurrent_requests`. Group and service-account concurrency limits (Enterprise) enforced since Oct 2026 ([changelog](https://elevenlabs.io/docs/changelog)).

### 6.3 Commercial licence for ads

- Pricing page lists **"Commercial License" starting at Starter**; Free has no commercial rights and requires attribution (pricing page; [licenseorg guide](https://www.licenseorg.com/blog/elevenlabs-licensing-guide-ai-voices), third-party: "Yes, on any paid plan" for ads; output "belongs to you"; downgrading keeps rights on content made while subscribed).
- Text-to-Dialogue page: "You own the generated audio. Commercial use requires a paid plan." ([TDD capability](https://elevenlabs.io/docs/overview/capabilities/text-to-dialogue)).
- Music: Starter+ for commercial, but **film/TV/radio excluded** on all self-serve plans (see §5.2). Sound effects: "royalty-free" on API pricing page.
- Voice Library voices: subject to Voice Library Addendum; notice periods apply.

### 6.4 API key scoping

- Workspace **service-account API keys**: `POST /v1/service-accounts/{id}/api-keys` with `name`, `permissions` (list of scopes such as `text_to_speech`, or `"all"`), `character_limit` (monthly cap, charged requests fail past it), `allowed_ips` (CIDR), `expires_at_unix` (15 min–90 days; expiry added 26 Oct 2026), `tts_concurrency_limit` / `dubbing_concurrency_limit` / `music_concurrency_limit` (Enterprise only) ([create API key](https://elevenlabs.io/docs/api-reference/service-accounts/api-keys/create), [changelog](https://elevenlabs.io/docs/changelog)). The TDD WebSocket needs the `Text to Speech` permission ([realtime TDD](https://elevenlabs.io/docs/eleven-api/guides/how-to/websockets/realtime-tdd)). `enable_logging=false` (zero retention) is Enterprise-only and disables request stitching.
- Data residency: Enterprise can use dedicated **India** environments; `x-region` header shows serving region; `api.us.elevenlabs.io` forces US ([latency guide](https://elevenlabs.io/docs/eleven-api/guides/how-to/best-practices/latency-optimization)).

### 6.5 Cost per 30-second Hindi ad VO

Assumptions: 70–90 Hindi words ≈ **450–600 billable characters** (Devanagari combining marks are separate code points, so this is realistic; Latin-script Hinglish runs ~10–15 % longer; audio tags add ~10–40 chars each). API usage rates from [API pricing](https://elevenlabs.io/pricing/api). ElevenLabs bills per generation request, so multiply by takes.

| Model | Rate / 1k chars | 450 chars | 600 chars | 3 takes @ 600 | Included ads/mo on Creator ($22) | on Pro ($99) |
|---|---|---|---|---|---|---|
| Eleven v4 | $0.08 | $0.036 | $0.048 | $0.144 | ~458 (275k/600) | ~2,063 |
| Eleven v3 | $0.08 | $0.036 | $0.048 | $0.144 | ~458 | ~2,063 |
| Multilingual v2 | $0.08 | $0.036 | $0.048 | $0.144 | ~458 | ~2,063 |
| Eleven v4 Turbo | $0.04 | $0.018 | $0.024 | $0.072 | ~917 | ~4,125 |
| v3 Conversational | $0.04 | $0.018 | $0.024 | $0.072 | ~917 | ~4,125 |
| Flash v2.5 | $0.04 | $0.018 | $0.024 | $0.072 | ~917 | ~4,125 |

Add-ons per ad: Music 30 s @ $0.15/min = **$0.075** (per generation); SFX 2–3 stingers ≈ $0.01–0.02 (0.5–5 s each at $0.12/min; "requests priced below one credit are charged one credit"); Scribe alignment of 30 s ≈ $0.002 (if used instead of timestamps). A full v4 ad (1 VO take + 1 music + 2 SFX) lands near **$0.13–0.15**; with 3 VO takes and 2 music variants ≈ **$0.30**. Timestamp endpoints are not documented to cost extra.

In the app (credits): 450–600 credits per take on v4/MV2 (225–300 on Flash) → Creator 121k credits ≈ 200–270 v4 ads/month, Pro 600k ≈ 1,000–1,330.

---

## 7. Best practices for ad VO

### 7.1 Hook delivery and energy
- Put the hook in its own short sentence with an energy tag at the start: `[excited] सिर्फ़ ₹४९९ में…` → after normalization `[excited] सिर्फ़ चार सौ निन्यानवे रुपये में!`. Capitalisation (for Latin words) and exclamation marks increase emphasis; ellipses add weight/pause ([best practices](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices)).
- Describe the delivery explicitly when a tag might be misread as SFX: `[upbeat, fast-talking Mumbai ad announcer]` rather than `[ad]`.
- Keep stability lowish (0.35–0.45) on v4 and generate 2–3 takes; ElevenLabs recommends "generating several takes and letting users choose" ([TDD capability](https://elevenlabs.io/docs/overview/capabilities/text-to-dialogue)).
- Choose voices whose Library tags include Advertisement/Social Media and whose samples already sound energetic — "tags work better when the delivery is in the voice's training data".

### 7.2 Pacing
- v3/v4: no `speed`; control pace by sentence length, commas, `[short pause]`/`[long pause]`, dashes and line breaks; users report v4 runs fast, so write slightly longer phrases rather than trying to slow it. If a fixed duration is critical, time-stretch ±5 % in post (ffmpeg `atempo`) rather than regenerating.
- Multilingual v2/Flash: `speed` 0.7–1.2 and `<break time="0.4s"/>` (≤3 s; too many breaks cause speed-ups/artefacts).
- Avoid "robotic ends of sentence": end lines with proper punctuation (। or .), avoid trailing tags, keep `previous_text`/`next_text` populated when chunking so the model knows the sentence is not the end of the ad, and don't end a chunk mid-clause.

### 7.3 Splitting long scripts
- 30-s ads fit in one request on every model (v3 5k, v4/MV2 10k, Flash 40k). For TDD keep ≤ 2,000 chars total. If you must chunk (multi-scene ads), send `previous_text`/`next_text` or `previous_request_ids` (same model throughout), and keep chunks at clause boundaries ([TTS capability](https://elevenlabs.io/docs/overview/capabilities/text-to-speech)).

### 7.4 Normalising numbers, currency, dates in Hindi
- Do it in your pipeline before the call (ElevenLabs' normalizer is documented with English examples only; `apply_language_text_normalization` is Japanese-only; Flash reads large numbers poorly). Rules to implement: `₹`/`Rs.`/`INR` → "रुपये" after the number (`₹499` → "चार सौ निन्यानवे रुपये"; `₹1,999` → "एक हज़ार नौ सौ निन्यानवे रुपये"); lakh/crore grouping (`1,00,000` → "एक लाख", `2.5 crore` → "ढाई करोड़"); percentages (`50%` → "पचास प्रतिशत" or colloquial "पचास परसेंट" if the brand voice is Hinglish); dates (`15/8` → "पंद्रह अगस्त"); times (`7 PM` → "शाम सात बजे"); phone numbers digit-by-digit with spaces; "EMI", "UPI", "OTP" keep as Latin uppercase (read as letters) or spell phonetically ("ई-एम-आई") and A/B test.
- Pass `language_code: "hi"` so short numeric strings are read in Hindi.
- The product guide: "write numbers out yourself, especially for multilingual use"; emojis and unusual symbols confuse the model — strip them ([TTS guide](https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech)).

### 7.5 Brand-name pronunciation
- Try plain spelling → Devanagari respelling (e.g., "Zomato" → "ज़ोमैटो") → inline IPA in slashes on v4 (`/zoʊˈmɑːtoʊ/`) → pronunciation dictionary (alias rule for all models; IPA/CMU phoneme rule honoured on v4/v4 Turbo for non-English). Dictionary matching is case-sensitive, first match wins, max 3 dictionaries per request. Keep a per-brand dictionary version and pass `pronunciation_dictionary_locators` on every call ([dictionaries guide](https://elevenlabs.io/docs/eleven-api/guides/how-to/text-to-speech/pronunciation-dictionaries), [best practices](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices)).

### 7.6 Consistency across generations
- Fix `voice_id`, `model_id`, `voice_settings`, and a stored `seed` per campaign; seed is best-effort only. Use `previous_request_ids` to stitch scenes; use a PVC or a saved designed voice (IVCs "sound slightly different each time you re-create them, even from the same audio" — keep the source samples). Higher `stability` and `similarity_boost`, `clone_strength` > 0 on PVC/v4, trade expressiveness for consistency.
- Re-test periodically: "the model is under continuous development, so behavior may shift" ([v4 page](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/eleven-v4)).

### 7.7 Output formats and loudness
- Formats: `mp3_22050_32 … mp3_44100_192` (192 kbps needs Creator+), `pcm_8000…pcm_48000` and `wav_8000…wav_48000` (44.1 kHz PCM/WAV needs Pro+), `opus_48000_32…192`, `ulaw_8000`, `alaw_8000`. Default `mp3_44100_128` ([TTS convert llms.txt](https://elevenlabs.io/docs/api-reference/text-to-speech/convert/llms.txt)). For an ad mix use `pcm_44100`/`wav_44100` (Pro+) or `mp3_44100_192` (Creator+); `audio_effects` reverb/pan force stereo and are rejected on PCM/μ-law — request MP3/Opus/WAV if you use them (WAV not listed in the 400 rule).
- **Loudness**: ElevenLabs does not expose an output LUFS target for TTS (Studio's `volume_normalization` targets audiobook specs; Voice Design `loudness` 0 ≈ −24 LUFS is for the *voice*, not the mix). Normalise in post with two-pass ffmpeg `loudnorm` to **−14 LUFS integrated, −1 dBTP, LRA ~11** for YouTube/Instagram/TikTok-style delivery (YouTube and Spotify −14 LUFS documented; Instagram/TikTok not formally documented — −14 is the common practice) ([ffmpeg loudnorm guide](https://dev.to/javidjamae/ffmpeg-loudnorm-filter-ebu-r128-loudness-normalization-guide-15d4)):
  - pass 1: `ffmpeg -i vo.wav -af loudnorm=I=-14:TP=-1:LRA=11:print_format=json -f null -`
  - pass 2: `ffmpeg -i vo.wav -af loudnorm=I=-14:TP=-1:LRA=11:measured_I=…:measured_TP=…:measured_LRA=…:measured_thresh=…:offset=…:linear=true out.wav`
  - Normalise the VO stem to about −16 LUFS and the music bed 12–18 LU under the VO, then normalise the final mix to −14 LUFS.

---

## 8. What could and could not be verified

**Verified on first-party pages:** model IDs, language lists (Hindi on all current multilingual models), character limits, per-1k API rates, plan prices and included characters, concurrency table, output formats and tier gates, timestamps/forced-alignment/STT schemas, audio tag list and behaviour, voice-settings availability per model, SSML/IPA/dictionary rules per model, IVC/PVC requirements and slot counts, Voice Design parameters, Music/SFX/Dubbing parameters and prices, Music Terms, PAYG rules incl. INR, API key scoping, no-lip-sync statement, default-voice expiry.

**Not verifiable / contradictory:**
- Which concurrency column applies to `eleven_v4` / `eleven_v3` (table lists only Multilingual v2 and Flash).
- `eleven_v4_turbo` per-request character limit (not published).
- Whether `/with-timestamps` returns alignment for v4/v3 (not stated; believed yes since the Oct 12 changelog updated those endpoints).
- Forced Alignment language list and price (page silent).
- The exact fields inside Text-to-Dialogue `settings` (collapsed in docs; `similarity` confirmed via changelog).
- Business plan concurrency: 25 (pricing page) vs 15 (models page).
- Music max length: 10 min (API, product docs) vs 5 min (capability page / API pricing).
- Whether `vtt` is an accepted `additional_formats` value for STT (API page example says SRT/VTT/DOCX; skills reference lists srt but not vtt).
- v4 app-credit multiplier (third-party says 1 credit/char; help-center article predates v4).
- Any official ElevenLabs statement on Devanagari vs Roman input — none exists; recommendation rests on ElevenLabs' own Hindi sample text plus one third-party test.
- Independent Hindi quality benchmarks for v4 — none found; the two reviews found (bundledseo, VoisLabs) predate v4 and the latter is a competitor.
- The "Creative/Natural/Robust" stability presets for v3 are no longer visible in current docs.

---

## Sources (every URL opened)

ElevenLabs docs
- https://elevenlabs.io/docs/overview/models
- https://elevenlabs.io/docs/changelog
- https://elevenlabs.io/docs/changelog/2026/10/5
- https://elevenlabs.io/docs/changelog/2026/9/28
- https://elevenlabs.io/docs/overview/capabilities/text-to-speech
- https://elevenlabs.io/docs/overview/capabilities/text-to-speech/eleven-v4
- https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices (and #pauses anchor)
- https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech
- https://elevenlabs.io/docs/api-reference/text-to-speech/convert
- https://elevenlabs.io/docs/api-reference/text-to-speech/convert/llms.txt
- https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps
- https://elevenlabs.io/docs/overview/capabilities/text-to-dialogue
- https://elevenlabs.io/docs/api-reference/text-to-dialogue/convert
- https://elevenlabs.io/docs/api-reference/text-to-dialogue/convert-with-timestamps
- https://elevenlabs.io/docs/eleven-api/guides/how-to/websockets/realtime-tdd
- https://elevenlabs.io/docs/api-reference/voices/settings/get-default
- https://elevenlabs.io/docs/eleven-api/guides/how-to/text-to-speech/pronunciation-dictionaries
- https://elevenlabs.io/docs/eleven-api/guides/how-to/best-practices/latency-optimization
- https://elevenlabs.io/docs/overview/capabilities/voices
- https://elevenlabs.io/docs/eleven-creative/voices/voice-cloning
- https://elevenlabs.io/docs/eleven-creative/voices/voice-cloning/instant-voice-cloning
- https://elevenlabs.io/docs/eleven-creative/voices/voice-cloning/professional-voice-cloning
- https://elevenlabs.io/docs/api-reference/voices/ivc/create
- https://elevenlabs.io/docs/eleven-creative/voices/voice-design
- https://elevenlabs.io/docs/api-reference/text-to-voice/design
- https://elevenlabs.io/docs/eleven-creative/voices/voice-library
- https://elevenlabs.io/docs/api-reference/voices/voice-library/get-shared
- https://elevenlabs.io/docs/api-reference/forced-alignment/create
- https://elevenlabs.io/docs/overview/capabilities/speech-to-text
- https://elevenlabs.io/docs/api-reference/speech-to-text/convert
- https://elevenlabs.io/docs/overview/capabilities/sound-effects
- https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert
- https://elevenlabs.io/docs/overview/capabilities/music
- https://elevenlabs.io/docs/eleven-creative/products/music
- https://elevenlabs.io/docs/eleven-api/guides/cookbooks/music
- https://elevenlabs.io/docs/api-reference/music/compose
- https://elevenlabs.io/docs/overview/capabilities/dubbing
- https://elevenlabs.io/docs/eleven-creative/playground/image-video
- https://elevenlabs.io/docs/overview/capabilities/voice-isolator
- https://elevenlabs.io/docs/overview/capabilities/voice-changer
- https://elevenlabs.io/docs/api-reference/studio/add-project
- https://elevenlabs.io/docs/overview/administration/pay-as-you-go
- https://elevenlabs.io/docs/api-reference/service-accounts/api-keys/create

ElevenLabs pricing, terms, product and blog pages
- https://elevenlabs.io/pricing
- https://elevenlabs.io/pricing/api
- https://elevenlabs.io/pricing/api?price.section=speech_to_text
- https://elevenlabs.io/it/pricing
- https://elevenlabs.io/music-terms
- https://elevenlabs.io/text-to-speech/hindi
- https://elevenlabs.io/voice-library
- https://elevenlabs.io/video/sync-3
- https://elevenlabs.io/blog/eleven-v4
- https://elevenlabs.io/blog/weve-lowered-api-agents-pricing-and-introduced-pay-as-you-go
- https://elevenlabs.io/blog/voice-design-v3
- https://elevenlabs.io/blog/eleven-v3-audio-tags-emulating-accents-with-precision
- https://elevenlabs.io/blog/generate-high-quality-indian-accent-text-to-speech
- https://elevenlabs.io/blog/voice-ai-for-india-scale
- https://elevenlabs.io/blog/voice-cloning-in-12-indian-languages-demonstrated-live-at-iit-delhi
- https://elevenlabs.io/blog/hoichoi-scales-multilingual-audio-series
- https://elevenlabs.io/blog/introducing-scribe-v2
- https://elevenlabs.io/webinars/designing-human-sounding-ai-voices-for-india

ElevenLabs help center
- https://help.elevenlabs.io/hc/en-us/articles/27562020846481-What-are-credits
- https://help.elevenlabs.io/hc/en-us/articles/17883183930129-What-models-do-you-offer-and-what-is-the-difference-between-them
- https://help.elevenlabs.io/hc/en-us/articles/37780368848785-What-is-Eleven-Music
- https://help.elevenlabs.io/hc/en-us/articles/23793433149073-Do-you-offer-lip-sync-in-Dubbing

ElevenLabs GitHub
- https://github.com/elevenlabs/skills/blob/main/speech-to-text/references/transcription-options.md

Third-party (clearly labelled where used)
- https://www.eesel.ai/blog/eleven-v4
- https://www.eesel.ai/blog/eleven-v4-pricing
- https://the-decoder.com/elevenlabs-new-v4-speech-model-makes-ai-voices-more-expressive-and-consistent/
- https://texttolab.com/blog/elevenlabs-pricing
- https://haass.io/blog/elevenlabs-v4-vs-v3-vs-flash
- https://haass.io/blog/elevenlabs-for-indian-businesses
- https://bundledseo.com/blog/elevenlabs-review/
- https://www.voislabs.com/best/hindi-text-to-speech (competitor-authored)
- https://ondalabs.app/blog/hindi-text-to-speech
- https://www.callmissed.com/blog/elevenlabs-alternatives-india-2026-indian-voice-guide (no ElevenLabs data; competitor-authored)
- https://www.licenseorg.com/blog/elevenlabs-licensing-guide-ai-voices
- https://dev.to/yigit-konur/the-complete-guide-to-elevenlabs-v3-master-interactive-voice-experiences-with-audio-tags-3bn2
- https://dev.to/javidjamae/ffmpeg-loudnorm-filter-ebu-r128-loudness-normalization-guide-15d4
