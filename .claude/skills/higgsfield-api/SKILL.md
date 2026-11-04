---
name: higgsfield-api
description: How to call the Higgsfield REST API correctly for this project — auth, async job pattern, estimate, uploads, webhooks, the model slugs we route to (Soul 2, Soul ID, Marketing Studio Image, Wan 3.0, Kling 3.0 Pro / O3 / 4.0, Seedance 2.5, Genjutsu, Cinema Studio 4.0) and the pitfalls. Load before writing or changing workers/adapters/higgsfield.py or config/router.yaml.
---
# Higgsfield API (verified 2 Nov 2026; re-verify slugs monthly — the catalog churns)

Base URL `https://api.higgsfield.ai`. Docs `https://docs.higgsfield.ai/docs` (`/docs/llms.txt` lists every model page).
Console `https://open.higgsfield.ai` (keys, balance, webhook secret, **training opt-out: turn it ON**).

## Calling pattern
- Header `Authorization: Key <HF_KEY_ID>:<HF_KEY_SECRET>` (not Bearer). Add `Idempotency-Key: <uuid>` = our step hash.
- `POST /estimate/<slug>` with the same body → `{"usd": "0.094"}`. Call it before every paid call; store the figure.
- `POST /<slug>` → `{status:"queued", request_id, status_url, cancel_url}`.
- Poll `GET /requests/{id}/status` (2 s → back off to 10 s, jitter) or pass `?hf_webhook=<https url>` (from 1.2; Phase 0 polls only, it has no public URL).
- Terminal statuses: `completed | failed | nsfw | canceled`. **`nsfw` is terminal and refunded** — handle it or the job hangs.
- Outputs: `images[{url}]`, `video{url}`, `audio{url}`. URLs expire in 7 days: download to object storage immediately (Phase 0: the local `assets/` folder; MinIO from task 1.1).
- Uploads: `POST /files/generate-upload-url` → PUT the bytes with the given headers → use `public_url`. JPEG/PNG/WebP/GIF, WAV, MP4.
- Errors: 403 insufficient balance, 404 model not on account, 422 validation, 423 model temporarily blocked, 429 `account_queue_full` (+ `Retry-After`), 503 model disabled. Step one tier down after two failures or a 423/503.
- Webhooks: Standard Webhooks signature (`webhook-id`, `webhook-timestamp`, `webhook-signature`; secret `whsec_…`), retried 2 h on 5xx, dedupe on `webhook-id`.
- Concurrency: 2 / 10 / 20 / 40 at $0 / $25 / $100 / $1,000 funded in the last 28 days. Run the graph at tier − 2.
- Pricing is USD prepaid, per second of video (varies by resolution/audio), per image; discounts are time-limited — budget at list.

## Slugs we route to (see config/router.yaml)
| Job | Slug | Key fields |
| --- | --- | --- |
| Stills (people, scenes) | `higgsfield-ai/soul/v2/standard` | `prompt`, `aspect_ratio` 9:16, `resolution` 720p/1080p, `custom_reference_id`, `custom_reference_strength`, `style_id`, `seed`, `batch_size` 1/4 |
| Brand Face training | `POST /v1/custom-references` | `name`, `model_version` v2, `input_images[]` (public URLs); poll `GET /v1/custom-references/{id}`; $2.50 |
| Hero still, film look (optional, Master) | `higgsfield-ai/soul/cinema` | needs a Soul ID trained with `model_version: cinema`; otherwise use Soul 2 1080p |
| Product stills (Master) | `marketing-studio/image/flare`, `/sunburst` | same fields as below plus `quality` xhigh/max |
| Product stills | `marketing-studio/image` | `image_urls` [product, person], `preset_id` (from `GET /marketing-studio/image/presets`), `enhance_prompt`, `quality`, `resolution` 1k/2k/4k, `moderation` auto/low |
| Draft video | `alibaba/wan-3.0/image-to-video`, `/reference-to-video` | `image_urls` ≤10, `audio_urls` ≤5, `resolution` 480p/720p/1080p, `aspect_ratio` 9:16, `generate_audio: false`, duration 2–30 s |
| Standard video | `kling-video/v3.0/pro/image-to-video` | `image_url`, `prompt` ≤2500, `duration` 3–15, `sound: "off"`, `last_image_url` (transitions), `cfg_scale` |
| Multi-reference | `kling-video/o3/image-reference` | ordered `image_urls[]`, `mode` std/pro/4k, `sound`, aspect 9:16 |
| First + last frame | `kling-video/o3/first-last-frame` | `first_frame_url`, `last_frame_url`, 3–15 s |
| Master video | `kling-video/v4.0/reference-to-video` (schema partly unpublished; verify) or `bytedance/seedance-2.5/reference-to-video` (`image_urls` ≤30, token-metered, expensive at 1080p) |
| Extend | `bytedance/seedance-2.5/video-extend` | `video_url` + prompt, 4–30 s |
| Template re-shoot | `higgsfield/genjutsu/motion-transfer/v1.0` (`video_url` ≥4 s, `image_urls` 1–8, 480p–1080p); `higgsfield/genjutsu-light/motion-transfer/v1.0` for drafts |
| Brand film | `higgsfield/cinema-studio/4.0` | `prompt` with `<<<image_n>>>` tokens, `image_urls` ≤30, `duration` 4–30, `camera_movement`, `color_palette`, `generate_audio: false` |
| Static creatives | `higgsfield/ads-studio/v1.0` | `prompt`, `niche`, `language`, `target_audience`, `image_urls` ≤10, `batch_size` |
| Edits (bg removal) | `alibaba/qwen-image-3/edit` | 1–3 refs |

## Not on the API (do not plan around them)
Veo 3.x, Sora 2, Nano Banana, GPT Image, FLUX, Seedream, Popcorn, Upscale, **every lip-sync model** (Speak 2.0, Kling Lipsync, Sync). Lip-sync is a separate vendor adapter in Phase 3.

## Prompt rules for pixel calls
No text, logo, price or caption in any prompt. One person per shot. Ordered references: face (1), product (2), room (3). "Exactly as in image 2, label unchanged" whenever the product is visible. Native audio off. Negatives: text, watermark, logo, subtitles, extra fingers, duplicate person, warped product, flicker.

## Checklist before relying on a slug
1. `GET https://docs.higgsfield.ai/docs/models/<family>.md` still lists it. 2. `POST /estimate/<slug>` returns a price. 3. It rendered for real in the last 7 days: the canary renders only Soul 2 and Wan 3.0 (owner decision 4 Nov 2026), so other slugs need a proof render or a test render in a plan the owner has said go to.
