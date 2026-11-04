# Model catalog

Every model v2 calls, what it is for, and what it costs. The Plan tab's routing table picks from this list.

## Higgsfield API catalog (as of 2 Nov 2026)

Twenty-two models are worth knowing on the REST API; v2 uses eleven of them in production and keeps the rest as fallbacks or experiments. Prices are per second of video or per image, list price with the current time-limited discount in brackets; always call `POST /estimate/<slug>` for the live figure ([pricing](https://open.higgsfield.ai/pricing), [docs](https://docs.higgsfield.ai/docs)).

**Platform facts.** Base URL `https://api.higgsfield.ai`; header `Authorization: Key <id>:<secret>`; `POST /<slug>` returns `request_id` and `status_url`; statuses `queued → in_progress → completed | failed | nsfw | canceled` (`nsfw` is terminal and refunded); `?hf_webhook=` for signed webhooks; `Idempotency-Key` header; uploads via `POST /files/generate-upload-url` (JPEG, PNG, WebP, GIF, WAV, MP4); outputs expire after 7 days; prepaid USD, $5 minimum, funds expire in a year; concurrency 2 / 10 / 20 / 40 at $0 / $25 / $100 / $1,000 funded in 28 days; SDKs `higgsfield-client` (Python) and `@higgsfield/client` (TypeScript) ([requests](https://docs.higgsfield.ai/docs/concepts/requests.md), [rate limits](https://docs.higgsfield.ai/docs/concepts/rate-limits.md), [uploads](https://docs.higgsfield.ai/docs/concepts/file-uploads.md)).

**Higgsfield's own models**

| Model | Slug | Type | Inputs and references | Output | Price | v2 job |
| --- | --- | --- | --- | --- | --- | --- |
| [Soul 2](https://docs.higgsfield.ai/docs/models/soul-2/generate.md) | `higgsfield-ai/soul/v2/standard` | text→image, image→image | `custom_reference_id` + strength 0–1, `style_id`, `seed`, `batch_size` 1 or 4; 7 aspect ratios incl. 9:16 | 720p or 1080p | $0.0032–0.0057 per image | Storyboard stills for people and scenes; AI-actor views; room sets |
| [Soul Standard](https://docs.higgsfield.ai/docs/openapi.json) | `higgsfield-ai/soul/standard` | text→image | `custom_reference_id` (Soul ID v1), 10 aspect ratios | 2K or 4K | $0.094–0.19 per image | Hero still at 4K in Master |
| [Soul Cinema](https://docs.higgsfield.ai/docs/models/soul-cinema.md) | `higgsfield-ai/soul/cinema` | text→image | film-look stills, Soul ID `cinema` version | image | \~$0.0032 per image | Brand-film stills |
| [Soul ID](https://docs.higgsfield.ai/docs/models/soul-id/create-character.md) | `POST /v1/custom-references` | character training | `name`, `model_version` v1 / v2 / cinema, `input_images` 1–100 URLs; poll `GET /v1/custom-references/{id}` | reference id | $2.50 per training | Brand Faces |
| [Marketing Studio Image 2.0](https://docs.higgsfield.ai/docs/models/marketing-studio-image/generate-and-edit.md) | `marketing-studio/image` | product photo → ad still, edit | `image_urls` (product first, person second with `enhance_prompt`), `preset_id` from `GET /marketing-studio/image/presets`, `quality`, `resolution` 1k / 2k / 4k, 9 aspect ratios, `moderation` auto / low | image | $0.014–0.61 per image | Product hero stills |
| [Marketing Studio Image 2.5 Flare / Sunburst](https://docs.higgsfield.ai/docs/models/marketing-studio-image/flare.md) | `marketing-studio/image/flare`, `/sunburst` | same | adds `quality` xhigh / max | image | $0.011–0.61 per image | Master product stills |
| [Ads Studio](https://docs.higgsfield.ai/docs/models/ads-studio/generate.md) | `higgsfield/ads-studio/v1.0` | brief → static ad concepts | `prompt`, `niche`, `language`, `target_audience`, `batch_size` 1–8, `image_urls` ≤10 products; no logo field; text fidelity not guaranteed | 2K PNG | \~$0.084 per image | Two static companion creatives per ad |
| [AI Influencer](https://open.higgsfield.ai/models/higgsfield/ai-influencer/playground) | `higgsfield/ai-influencer` | character sheet | `brief`, `image_url`, `item_image_urls`, `trait_variants` | sheet | $0.05 | Not used (sheets leak layout) |
| [Cinema Studio 4.0](https://docs.higgsfield.ai/docs/models/cinema-studio-4/generate.md) | `higgsfield/cinema-studio/4.0` | text / reference → video | `<<<image_n>>>` tokens, `image_urls` ≤30, `video_urls` ≤10, `audio_urls` ≤10, 33 `camera_movement` presets, 50 `color_palette`, era, genre, light, pacing, lens, aperture; 4–30 s; 480p / 720p; 6 aspect ratios | MP4 with native audio | $0.21–0.46 per s | Brand film, Master only |
| [Genjutsu motion transfer](https://docs.higgsfield.ai/docs/models/genjutsu/motion-transfer.md) | `higgsfield/genjutsu/motion-transfer/v1.0` | video + images → video | `video_url` ≥4 s (≤30 s), `image_urls` 1–8, `prompt`, 480p / 720p / 1080p | MP4, source length | $0.318 ($0.159) per s | Template re-shoot |
| Genjutsu object swap / restyle | `higgsfield/genjutsu/object-swap/v1.0`, `/restyle/v1.0` | video → video | swap one object; restyle look | MP4 | $0.318 ($0.159) per s | Product swap in a template |
| [Genjutsu Light](https://open.higgsfield.ai/explore/video) | `higgsfield/genjutsu-light/motion-transfer/v1.0` | video + images → video | first 15 s of the source; audio preserved | MP4 | $0.05 ($0.025) per s | Draft re-shoots |
| Higgsfield DoP (motion presets) | not in the Nov catalog | image → video with camera presets | listed at launch at $0.125 per generation, absent now | — | — | Not relied on |

**Third-party video models**

| Model | Slug | Inputs and references | Durations, resolution | Audio | Price per s | v2 job |
| --- | --- | --- | --- | --- | --- | --- |
| [Wan 3.0](https://docs.higgsfield.ai/docs/models/wan-3/reference-to-video.md) | `alibaba/wan-3.0/text-to-video`, `/image-to-video`, `/reference-to-video` | `image_urls` ≤10, `video_urls` ≤5, `audio_urls` ≤5 (WAV / MP3), `seed`, aspect incl. 9:16 and adaptive | 2–30 s; 480p / 720p / 1080p | native, `generate_audio` | $0.05 / 0.10 / 0.20 by resolution ($0.02–0.08) | Draft video; multi-reference shots; cheapest 30 s |
| Wan 3.0 Prime | `alibaba/wan-3.0-prime/…` | same, faster | 2–30 s | native | $0.068 ($0.027) | Draft when Wan 3.0 queues |
| Wan 2.7 / 2.6 | `wan/v2.7/…`, `wan/v2.6/…` | consistent characters, multi-shot | 2–15 s | native | $0.05–0.075 | Fallback |
| [Kling 3.0 Std / Pro / Turbo / 4K](https://docs.higgsfield.ai/docs/models/kling-3/pro-image-to-video.md) | `kling-video/v3.0/{std,pro,4k}/image-to-video`, `/text-to-video`, `kling-video/v3.0-turbo/…` | `image_url`, `last_image_url`, `sound` on / off, `multi_shots` with ≤6 `multi_prompt`, `elements[]`, `cfg_scale`, prompt ≤2500 | 3–15 s; Turbo 720p / 1080p; 4K tier | native when `sound on` | Std $0.084 ($0.042); Pro $0.112–0.168 ($0.056–0.084); Turbo $0.07; 4K $0.42 ($0.21) | Standard video (Pro, `sound off`) |
| [Kling O3](https://docs.higgsfield.ai/docs/models/kling-o3/image-reference.md) | `kling-video/o3/image-reference`, `/first-last-frame`, `/video-edit`, `/video-reference` | ordered `image_urls[]` + `elements[]`; `first_frame_url` / `last_frame_url`; `mode` std / pro / 4k; `sound`; multi-shot | 3–15 s | native | $0.042–0.084 | Multi-reference shots; before/after; transitions |
| Kling O1 / Omni | `kling-video/omni/…` | earlier O-series | 3–15 s | native | $0.042–0.084 | Fallback |
| [Kling 4.0](https://open.higgsfield.ai/models/kling-video/v4.0/reference-to-video/playground) | `kling-video/v4.0/text-to-video`, `/image-to-video`, `/reference-to-video`, `/video-edit` | images, videos, elements, keyframes (schema not yet published) | 3–30 s; 720p / 1080p | not stated | $0.157 at 720p, $0.235 at 1080p ($0.11–0.16) | Master video |
| [Kling 2.6 Pro](https://docs.higgsfield.ai/docs/models/kling-2-6/pro-image-to-video.md) | `kling-video/v2.6/pro/image-to-video`, `/text-to-video` | `image_url`, `sound`, `cfg_scale`, 16:9 / 9:16 / 1:1 | 5 or 10 s only | native | $0.07 ($0.035) | Fallback (fixed lengths waste seconds) |
| Kling 2.5 Turbo | `kling-video/v2.5-turbo/{standard,pro}/image-to-video` | `image_url`, `negative_prompt` | 5 or 10 s; up to 1080p | none | $0.042 ($0.021) | Fallback |
| [Seedance 2.5](https://docs.higgsfield.ai/docs/models/seedance-2-5/reference-to-video.md) | `bytedance/seedance-2.5/text-to-video`, `/image-to-video`, `/reference-to-video`, `/video-edit`, `/video-extend` | `image_urls` ≤30, `video_urls` ≤10, `audio_urls` ≤10; `end_image_url` on I2V; `bitrate_mode` | 4–30 s; 480p / 720p / 1080p | native | token-metered, \~$0.21 at 480p to \~$1.14 at 1080p ($0.14–0.96) | Master multi-reference shots; extension |
| [Seedance 2.0](https://docs.higgsfield.ai/docs/models/seedance-2/reference-to-video.md) | `bytedance/seedance-2.0/…` | `image_urls` ≤9, `video_urls` ≤3, `audio_urls` ≤3 | 4–15 s; up to 4K | native | $0.14–1.31 ($0.10–0.99) | Fallback |
| [MiniMax H3](https://docs.higgsfield.ai/docs/models/minimax-h3/reference-to-video.md) | `minimax/h3/text-to-video`, `/image-to-video`, `/reference-to-video` | `image_urls` ≤9, `video_urls` ≤3, `audio_urls` ≤3, `aigc_watermark` flag | 5–15 s; 2K only | via audio refs | $0.13 ($0.065) | Experiment |
| Hailuo 2.3 Standard | `minimax/hailuo-2.3/standard/image-to-video`, `/text-to-video` | `image_url`, `prompt_optimizer` | 6 or 10 s | none | $0.047 ($0.012) | Cheapest silent B-roll in Draft |
| [HappyHorse 1.1](https://docs.higgsfield.ai/docs/models/happy-horse-1-1/reference-to-video.md) | `alibaba/happy-horse/v1.1/reference-to-video` | `image_urls` 1–9 | 2–15 s; 720p / 1080p | not documented | $0.07–0.09 | Fallback |
| LTX 2.5 Fast / Pro | `lightricks/ltx-2.5/text-to-video/{fast,pro}` | camera motion control | Fast up to 4K; Pro 1080p | native | $0.09 / $0.12 | Not used |
| PixVerse V6 | `pixverse/v6/image-to-video` | first / last frame | — | optional | $0.115 ($0.098) | Not used |
| [Grok Imagine Video 1.5](https://docs.higgsfield.ai/docs/models/grok-video-1-5/reference-to-video.md) | `xai/grok-imagine-video/v1.5/reference-to-video` | `image_urls` ≤7 + one `audio_url` | 1–15 s; up to 1080p (720p with refs) | native | from $0.08 | Experiment: guided speech |

**Third-party image models**

| Model | Slug | Notes | Price | v2 job |
| --- | --- | --- | --- | --- |
| Qwen Image 3 | `alibaba/qwen-image-3/text-to-image`, `/edit` | edit with 1–3 refs; up to 2K | $0.04–0.075 | Background removal, product clean-up |
| Grok Imagine Image 2.0 | `xai/grok-imagine-image-2.0` | text→image and edit with ≤10 refs | $0.04 | Fallback edit |
| Ideogram 4.0 | `ideogram/v4.0` | strong on text in images | $0.03 | Optional: text-bearing feed stills, QC-checked |
| Recraft V4.1 | `recraft/v4.1/text-to-image` | palette and background controls | $0.035 | Not used |
| Z-Image Turbo | `z-image/turbo` | cheap 1K / 2K | $0.015 | Not used |

**Not on the REST API** (web app or MCP only, so not in any v2 path): Veo 3.1 and Veo 3 Fast, Sora 2 (retired), Nano Banana family, GPT Image, FLUX, Seedream, Popcorn storyboards, Upscale, every Lipsync Studio model (Higgsfield Speak 2.0, Kling Lipsync, Kling Avatars, Wan 2.5 Speak, Infinite Talk, Sync Lipsync 3), Higgsfield Audio voices ([catalog](https://open.higgsfield.ai/explore), [MCP guide](https://claudefa.st/blog/tools/mcp-extensions/higgsfield-mcp)).

## ElevenLabs models and endpoints

Seven endpoints cover voice, alignment, music, SFX and verification; v2 calls them from one adapter with `language_code: "hi"` on every speech request ([API reference](https://elevenlabs.io/docs/api-reference/introduction), [pricing](https://elevenlabs.io/pricing/api)).

| Endpoint | Model | v2 use | Limits and notes | Price |
| --- | --- | --- | --- | --- |
| `POST /v1/text-to-speech/{voice_id}` | `eleven_v4` | Final VO per beat | 10k characters per request; audio tags; no `speed`; IPA pronunciation on v4; `previous_text` / `next_text`; `seed` best-effort; `audio_effects` (reverb, phone, café) at no cost | $0.08 per 1k characters |
| same | `eleven_v4_turbo` | Beat previews in the editor | \~100 ms latency, same tags | $0.04 per 1k |
| same | `eleven_multilingual_v2` | Number-heavy lines, when a beat needs `speed` 0.7–1.2 | Best number normalisation; `style` slider; no `language_code` | $0.08 per 1k |
| same | `eleven_flash_v2_5` | Bulk drafts only | Weak on numbers | $0.04 per 1k |
| `POST /v1/text-to-speech/{voice_id}/with-timestamps` | any | Fallback alignment | Character-level `alignment` and `normalized_alignment`; words rebuilt by grapheme cluster for Devanagari | TTS price |
| `POST /v1/forced-alignment` | — | Word times for captions and cut points | Audio under 1 GB + the script → `words[]` with start, end, loss; Hindi support and price not stated on the page, to be confirmed in Phase 0 | not published |
| `POST /v1/text-to-dialogue` | `eleven_v4` | Two-person conversation template | Up to 10 voices, 2,000 characters total; separate concurrency pool | TTS price |
| `GET /v1/shared-voices` | — | Voice Library search for the Brand Kit | Filters `language=hi`, `use_cases=advertisement`, `accent`, sort by usage; `verified_languages[]`, `rate`, notice period in the response; not available on the Free plan | free |
| `POST /v1/text-to-voice/design` | `eleven_ttv_v3` | Design a new brand voice | Description 20–1,000 characters naming language and region first; preview text 100–1,000 | preview characters |
| `POST /v1/voices/add` | — | Instant Voice Clone of the owner | 1–2 minutes of audio, consent checkbox, `labels` | plan slots |
| Professional Voice Clone (dashboard) | v4 family | Owner's broadcast-grade clone | Own voice only, 30–180 minutes, captcha verification, 3–24 h; Creator plan and above | plan slots |
| `POST /v1/speech-to-text` | `scribe_v2` | Verify any experiment where a video model spoke; SRT export | Hindi in the high-accuracy tier, word timestamps, `keyterms` | $0.22 per hour |
| `POST /v1/sound-generation` | `eleven_text_to_sound_v3` | Cut hits, price ting, WhatsApp pop | 0.5–30 s, `loop`, `prompt_influence` | $0.12 per minute |
| `POST /v1/music` | `music_v2_5` | Instrumental bed per ad | 3 s to 10 min, `force_instrumental`; no Hindi vocals; paid plans only; Music Terms allow all online commercial use from Starter (TV and radio need Enterprise) | $0.15 per minute |
| `POST /v1/speech-to-speech/{voice_id}` | `eleven_multilingual_sts_v2` | "Act it yourself" experiment: owner's recording → brand voice, timing kept | Hindi supported | $0.12 per minute |
| Dubbing API | v2 | Not used | Hindi supported but no lip-sync | $2.20 per minute |

**Plan.** Creator ($22 a month, 275k v4 characters, 192 kbps MP3, library voices via API, 1 professional clone, concurrency 5) for the build and pilot; Pro ($99, 44.1 kHz PCM, concurrency 10) at launch. Commercial rights start at Starter; the Free plan has none. PAYG top-ups in INR from ₹500 ([usage billing](https://elevenlabs.io/docs/overview/pricing/usage-based-billing)).

**Dates to watch.** Premade voices retire on 31 Dec 2026; `eleven_text_to_sound_v2` retires 1 Mar 2027; Turbo v2.5 is deprecated in favour of Flash.

## Planner, QC and vision models

Free tiers only for now, by decision on 3 Nov: Gemini's free tier (a vision-capable Flash model) does every LLM job in v2 (planner, compiler, localizer, judge, compliance, Director's Cut assistant), with Groq, NVIDIA NIM and OpenRouter free models as fallbacks in config order. The v1 walls on free tiers (429 rate limits, silently retired ids, a dead NVIDIA vision model) are handled by rules: separate keys and quotas for planner and judge, Retry-After honoured with jittered backoff, a daily canary per model id that drops a dead one, results cached per brief so retries never re-spend quota, QC batched to 8 frames per call. A paid primary becomes one config line when budget exists.

| Role | Needs | Settings | Volume per ad | Cost per ad |
| --- | --- | --- | --- | --- |
| Script Brain: brief intake, hooks, beats, shots | Strong Hindi and Hinglish, JSON schema output, streaming | temp 0.2 / 0.8 / 0.3 / 0.3 | 4–6 calls, \~15k tokens | \~$0.03 |
| Prompt compiler and score gate | Instruction following, vision (reads the reference images to describe them) | temp 0.1 | 6–9 calls | \~$0.02 |
| Localizer and compliance pre-check | Hindi number spelling, claim detection | temp 0.1 | 2 calls | \~$0.01 |
| QC judge | Vision over 8 frames + 3 references per take, strict JSON | temp 0.1, fixed prompt version | 6–12 calls | \~$0.03–0.06 |
| Director's Cut assistant | Chat with the ad's JSON as context, tool calls into the API | temp 0.3 | on demand | cents |

**Selection rule.** Run the 20-item Hindi eval (hook naturalness, Devanagari correctness, number spelling, claim detection, judge agreement with a human on 20 takes) across the free-tier candidates in Phase 0 and order the chain by score; vendor and model ids live in config, never in code (v1's Gemini ids were fixed in code and had to be edited to change). Keep the judge on its own API key and quota so planner traffic never starves QC (a v1 wall). Free-tier daily caps set the ad throughput ceiling, so the canary also reports remaining quota and the UI shows "planning slower today" instead of failing. The per-ad costs in the table are what a paid primary would cost; on free tiers they are ₹0.
