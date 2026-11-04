# Higgsfield AI — platform and developer API research report

**Research date:** 2026-11-03 (all facts verified against live pages on 2026-11-02/03 unless a page date is given).
**Purpose:** inputs for a team building an India-centric 15–30 s Hindi short-video ad generator on top of the Higgsfield API + ElevenLabs.
**Method:** WebSearch + WebFetch of ~70 distinct pages (official docs at docs.higgsfield.ai, the developer console/pricing at open.higgsfield.ai, higgsfield.ai help center and blog, status page, GitHub/PyPI, and third-party reviews). Every fact cites its URL. Items that could not be verified are flagged explicitly in §7.

---

## 0. Headline findings (read this first)

1. **The API is real, self-serve, USD pay-as-you-go, and separate from the consumer app.** Base URL `https://api.higgsfield.ai`, console at `https://open.higgsfield.ai` (formerly `console.higgsfield.ai`; `platform.higgsfield.ai` is deprecated as an endpoint as of Oct 31 2026), docs at `https://docs.higgsfield.ai`. Auth is `Authorization: Key <id>:<secret>`. Minimum top-up is **$5**; funds expire after one year; failed/NSFW requests are auto-refunded. [docs index](https://docs.higgsfield.ai/docs), [FAQ](https://docs.higgsfield.ai/docs/help/faq), [help center](https://higgsfield.ai/creator-hub/help-center/integrations/what-is-the-higgsfield-api), [status page](https://status.higgsfield.ai/)
2. **The API catalog is a curated subset of the web app and does NOT include the models most people associate with Higgsfield's web product.** As of Nov 2 2026 there is **no Veo 3.1, no Sora 2 (retired Sep 24 2026), no Nano Banana, no GPT Image, no FLUX, no Seedream, no Luma, no Runway, no Pika, no Vidu, no Hedra/OmniHuman, no Topaz, no ElevenLabs** on the REST API. Veo 3.1 is reachable only via the **MCP server** (which bills plan credits, not USD). [explore catalog](https://open.higgsfield.ai/explore), [Sora migration post](https://higgsfield.ai/blog/sora-api-migration-guide), [MCP guide](https://claudefa.st/blog/tools/mcp-extensions/higgsfield-mcp)
3. **There is no lip-sync / talking-avatar endpoint on the API.** Lipsync Studio (Higgsfield Speak 2.0, Kling 2.6 Lipsync, Kling Avatars 2.0, Wan 2.5 Speak, Infinite Talk, Sync Lipsync 3, Kling Lipsync V2V) is **web-app only**. The only audio-input routes on the API are *audio reference arrays* on Seedance 2.0/2.5, Wan 3.0, MiniMax H3, Cinema Studio 4.0 and Grok Imagine Video 1.5, which "guide" generated speech rather than guaranteeing verbatim lip-sync to your file. [lipsync help](https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-lipsync-voiceover-and-aspect-ratios), [Seedance 2.5 ref schema](https://docs.higgsfield.ai/docs/models/seedance-2-5/reference-to-video.md), [Wireflow test](https://www.wireflow.ai/blog/real-voice-seedance-2-5)
4. **Best API candidates for "character + product in one shot":** Seedance 2.5 reference-to-video (≤30 images + ≤10 videos + ≤10 audio, 4–30 s, native audio), Wan 3.0 reference-to-video (≤10 images + ≤5 audio WAV/MP3, 2–30 s, native audio, cheapest at $0.02–0.08/s), Kling O3 / Kling 4.0 image-reference (+ account-owned `elements`), Cinema Studio 4.0 (≤30 images/≤10 video/≤10 audio, camera presets, 4–30 s), MiniMax H3 (≤9 images + ≤3 audio, 2K). [see §4]
5. **Hindi:** No API page mentions any language. Higgsfield's web Translate tool lists Hindi among 10 languages (Mar 2026). No independent evidence of Hindi lip-sync quality on any Higgsfield API model was found. Treat as **unverified — must test**. [Higgsfield Audio post](https://higgsfield.ai/blog/higgsfield-audio-ai-voice-tools)
6. **Higgsfield-exclusive ad-oriented API endpoints exist:** Ads Studio (`higgsfield/ads-studio/v1.0`, brief → 1–8 static ad images, ≤10 product refs, ~$0.084/img), Marketing Studio Image (`marketing-studio/image`, product + person refs with presets, from ~$0.014/img), Soul 2 / Soul ID (`/v1/custom-references`, $2.50 per training), Cinema Studio 4.0, Genjutsu motion transfer/object swap (reshoot an existing ad with a new product/person). [Ads Studio schema](https://docs.higgsfield.ai/docs/models/ads-studio/generate.md), [MSI schema](https://docs.higgsfield.ai/docs/models/marketing-studio-image/generate-and-edit.md), [Cinema Studio playground](https://open.higgsfield.ai/models/higgsfield/cinema-studio/4.0/playground)

---

## 1. The API itself

### 1.1 Identity and URLs

| Item | Value | Source |
|---|---|---|
| Product name | "Higgsfield API" (marketing also says "Open Higgsfield"); older material says "Higgsfield Cloud" | [blog](https://higgsfield.ai/blog/higgsfield-api), [help center](https://higgsfield.ai/creator-hub/help-center/integrations/what-is-the-higgsfield-api) |
| Public launch | Sept 15–16 2026 (15% launch discount on all models) | [product changelog](https://higgsfield.ai/creator-hub/changelog), [launch blog](https://higgsfield.ai/blog/higgsfield-api) |
| Base URL | `https://api.higgsfield.ai` (`platform.higgsfield.ai` deprecated; migrate by Oct 31 2026) | [docs](https://docs.higgsfield.ai/docs), [status](https://status.higgsfield.ai/) |
| Console | `https://open.higgsfield.ai` (API keys, balance, usage, webhook secret, training opt-out). Docs still link `console.higgsfield.ai`. | [help center](https://higgsfield.ai/creator-hub/help-center/integrations/what-is-the-higgsfield-api), [docs](https://docs.higgsfield.ai/docs) |
| Docs | `https://docs.higgsfield.ai` (Mintlify); machine index `docs/llms.txt`; supplementary `docs/openapi.json` (only 9 paths — not the catalog) | [llms.txt](https://docs.higgsfield.ai/docs/llms.txt), [openapi](https://docs.higgsfield.ai/docs/openapi.json) |
| Pricing page | `https://open.higgsfield.ai/pricing` (33 models, 4 pages) | [pricing](https://open.higgsfield.ai/pricing) |
| Status page | `https://status.higgsfield.ai` (Developer Console, Models API, Webhooks; 100% 90-day uptime shown on Nov 2 2026, no incidents listed) | [status](https://status.higgsfield.ai/) |
| Support | support@higgsfield.ai (billing/enterprise), Discord (technical), account manager (capacity) | [reliability page](https://docs.higgsfield.ai/docs/enterprise/reliability-and-support.md) |

### 1.2 Authentication

- Header: `Authorization: Key <HF_API_KEY_ID>:<HF_API_KEY_SECRET>` — **not** Bearer. Legacy `hf-api-key` / `hf-secret` headers still accepted. Keys are created in the console and the full key is shown only once; named keys with expiration exist for enterprise. Server-side only; the TypeScript v2 client refuses to run in browsers. [headers](https://docs.higgsfield.ai/docs/api-reference/headers.md), [quickstart](https://docs.higgsfield.ai/docs/quickstart), [SDK page](https://docs.higgsfield.ai/docs/how-to/sdk.md), [enterprise overview](https://docs.higgsfield.ai/docs/enterprise/overview.md)
- Other request headers: `Content-Type: application/json`; `Idempotency-Key` (1–255 ASCII, UUID recommended; reuse returns the original request); `Hf-Expires-After` (seconds, min 3600, max = account retention; only shortens). Response headers: `X-Correlation-ID` on every response; `Retry-After` on 429. [headers](https://docs.higgsfield.ai/docs/api-reference/headers.md)

### 1.3 Async job pattern

1. `POST https://api.higgsfield.ai/<model-slug>` with JSON body → immediate `{status:"queued", request_id, status_url, cancel_url, expires_after}`.
2. Poll `GET /requests/{request_id}/status` (docs recommend backoff; a third party suggests start 2 s, back off to 10 s with jitter) **or** pass `?hf_webhook=<url-encoded https URL>` on the submit.
3. Statuses: `queued` → `in_progress` → terminal `completed` | `failed` | `nsfw` | `canceled`. `nsfw` is terminal and **not** an HTTP error — clients that only handle completed/failed will hang.
4. Output shapes: images → `images[{url}]`; video → `video{url}`; audio → `audio{url}` + `audios[]`; some ops also return `zip/mov/jsx/fbx/ply`.
5. Cancel: `POST /requests/{id}/cancel` only while every job is still `queued` (202; 400 if started). Delete: `DELETE /requests/{id}` (200; 409 if running) wipes files/prompt/params immediately, keeps billing records.
[requests](https://docs.higgsfield.ai/docs/concepts/requests.md), [quickstart](https://docs.higgsfield.ai/docs/quickstart), [novoads analysis](https://novoads.ai/en/blog/higgsfield-api)

### 1.4 Webhooks

- Configured per request via `hf_webhook` query param (HTTPS, must answer within 10 s with 2xx). POST on terminal status with envelope `{request_id, status, error, payload, expires_at}`; `payload.images[{url,content_type}]` / `payload.video{url,content_type}` / `payload.audio`.
- Signed per **Standard Webhooks** spec (`webhook-id`, `webhook-timestamp`, `webhook-signature: v1,<base64>`); secret `whsec_…` revealed/rotated in console Settings (old secret valid 24 h after rotation). Legacy `X-Webhook-Secret-Key` header being retired.
- Retries: network errors/5xx retried up to 2 h; 4xx not retried; duplicates possible → dedupe on `webhook-id`. No deliveries after data deletion/expiry.
[webhooks](https://docs.higgsfield.ai/docs/how-to/webhooks.md), [changelog Oct 24](https://docs.higgsfield.ai/docs/changelog)

### 1.5 SDKs

| Language | Package | Notes | Source |
|---|---|---|---|
| Python ≥3.8 | `pip install higgsfield-client` | env `HF_KEY="id:secret"` (or `HF_API_KEY`+`HF_API_SECRET`); `subscribe/subscribe_async`, `submit/submit_async` (request controller with `poll_request_status`, `get`, `status`, `cancel`), `upload/upload_file/upload_image`, optional `webhook_url`, `on_enqueue/on_queue_update` callbacks. Apache-2.0, 77 stars, 2 commits, no tagged releases. | [SDK page](https://docs.higgsfield.ai/docs/how-to/sdk.md), [GitHub](https://github.com/higgsfield-ai/higgsfield-client) |
| Node/TS | `npm install @higgsfield/client`, import `@higgsfield/client/v2` | env `HF_CREDENTIALS="id:secret"`; `higgsfield.subscribe(slug,{input, withPolling:true})`; typed, auto-polling, retries, server-side only. | [SDK page](https://docs.higgsfield.ai/docs/how-to/sdk.md) |
| Other | Plain REST; setup prompts for Claude Code / Cursor / Codex on each model page; a community CLI (`rk-research/HiggsfieldAPI-CLI`) | [blog](https://higgsfield.ai/blog/higgsfield-api) |

### 1.6 Rate limits and concurrency

- Primary limit is **concurrency** (account-wide, plus per-model caps). Over-limit requests are **queued, not rejected**; queue cap = an undisclosed multiple of concurrency (each batch output counts). Queue full → `429 account_queue_full` + `Retry-After` (nothing charged). `503 admission_control_unavailable` → retry with backoff. No rate-limit headers on success responses.
- Tiers shown on pricing page: **2 concurrent** included with every new account; **10** at ≥$25 funded; **20** at ≥$100; **40** at ≥$1,000 (only funds added in the last 28 days count). The Sept launch blog says "creating an API key unlocks 20 concurrent requests" — the pricing page is the more recent/authoritative source. Enterprise: dedicated capacity on request.
- Soul ID training has its own cap on concurrent trainings (rejected with 429, example limit 2).
[rate limits](https://docs.higgsfield.ai/docs/concepts/rate-limits.md), [capacity](https://docs.higgsfield.ai/docs/enterprise/capacity.md), [pricing](https://open.higgsfield.ai/pricing), [launch blog](https://higgsfield.ai/blog/higgsfield-api)

### 1.7 Pricing model

- **USD, prepaid balance, no credits, no subscription.** Video priced per second of output (varies by resolution/audio/input-video); images per image; Soul ID per training; some models token-metered (Seedance 2.5, Cinema Studio 4.0, Ads Studio). Balance cannot go negative; requests wait when empty; auto top-up available. **Minimum top-up $5.** Funds expire 1 year after being added. Failed/NSFW/cancelled-while-queued → not charged / auto-refund. Invoice billing only on committed-use contracts.
- **Cost estimate endpoint:** `POST /estimate/<model-slug>` with the same body → `{"usd":"0.094"}`. Use this as authoritative per-account price.
- Launch/ongoing discounts: catalog shows 15–75% "off" vs list (e.g., Kling 3.0 50% off, Wan 3.0 60% off until Oct 31, Hailuo 2.3 75% off). Sept–Oct API cashback promos ($15 bonus). These are time-limited — budget on list prices.
[billing](https://docs.higgsfield.ai/docs/concepts/billing-and-retention), [FAQ](https://docs.higgsfield.ai/docs/help/faq), [help center](https://higgsfield.ai/creator-hub/help-center/integrations/what-is-the-higgsfield-api), [pricing](https://open.higgsfield.ai/pricing), [product changelog](https://higgsfield.ai/creator-hub/changelog)

### 1.8 Enterprise

- Same endpoints for everyone; enterprise adds dedicated capacity, higher concurrency, invoice billing, SAML SSO (Okta/Microsoft/custom), Admin/Member roles, named keys with expiry, uptime commitments and support SLAs "through an enterprise agreement", IP indemnification (Enterprise plan only), and contractual exclusion of content from training. No SOC 2 / data-residency statements found in docs. [enterprise overview](https://docs.higgsfield.ai/docs/enterprise/overview.md), [reliability](https://docs.higgsfield.ai/docs/enterprise/reliability-and-support.md), [ownership help](https://higgsfield.ai/creator-hub/help-center/account/who-owns-my-generations-and-can-i-use-them-commercially)

### 1.9 Commercial use, content policy, training, retention

| Topic | Finding | Source |
|---|---|---|
| Ownership / commercial use | Terms §4.4: Higgsfield claims no ownership of inputs/outputs; commercial use (ads, client work, resale) allowed on all paid tiers, no attribution. API blog: outputs usable "in commercial products, ads, and client work." Outputs not exclusive. | [help center](https://higgsfield.ai/creator-hub/help-center/account/who-owns-my-generations-and-can-i-use-them-commercially), [API blog](https://higgsfield.ai/blog/higgsfield-api) |
| License retained | Non-exclusive, worldwide, royalty-free license to host/process, limited to operating the service; ends on deletion (except backups/public content). July 2026 ToS controversy over a "perpetual, sublicensable" training license led to a revision (Terms updated Oct 23 2026). | [help center](https://higgsfield.ai/creator-hub/help-center/account/who-owns-my-generations-and-can-i-use-them-commercially), [X thread](https://x.com/EugenioFierro3/status/2080744406672412838), [Startup Fortune](https://startupfortune.com/higgsfield-ai-tells-creators-they-own-their-videos-but-quietly-claims-a-perpetual-worldwide-license-to-train-on-them/) |
| Training on your data | **Outputs are used for training by default**; opt-out toggle in console Settings per account/org (API). Enterprise agreements exclude content. You may not train models on Higgsfield outputs. | [model training](https://docs.higgsfield.ai/docs/enterprise/model-training.md) |
| Real faces / likeness | ToS §5.3: no uploading another person's image without permission; user responsible for likeness/trademark rights. Web app blocks "May contain protected content" for real faces/IP. Face/voice data used only for the requested feature (per company statement). No explicit celebrity/minor/logo policy page found. | [help center](https://higgsfield.ai/creator-hub/help-center/account/who-owns-my-generations-and-can-i-use-them-commercially), [Cinema Studio help](https://higgsfield.ai/creator-hub/help-center/tools/how-do-i-use-cinema-studio), [X thread](https://x.com/EugenioFierro3/status/2080744406672412838) |
| Moderation | `nsfw` terminal status when input **or** output fails moderation; rules vary by model; not charged. Marketing Studio has `moderation: auto|low`. MiniMax H3 has an `aigc_watermark` flag. | [FAQ](https://docs.higgsfield.ai/docs/help/faq), [MSI schema](https://docs.higgsfield.ai/docs/models/marketing-studio-image/generate-and-edit.md), [H3 schema](https://docs.higgsfield.ai/docs/models/minimax-h3/reference-to-video.md) |
| Retention | Default 7 days after terminal status (`expires_after`=604800); configurable 1 h–7 d per account; `Hf-Expires-After` per request; `DELETE /requests/{id}` immediate. Uploaded files deleted within 7 days. Third-party model providers' own data policies also apply. No zero-retention. | [data retention](https://docs.higgsfield.ai/docs/enterprise/data-retention.md), [billing & retention](https://docs.higgsfield.ai/docs/concepts/billing-and-retention.md) |
| Watermark | Web: free plan visible watermark; paid plans none; invisible C2PA-style markers "may" be embedded on any plan. **API outputs: not stated anywhere** (no watermark seen in docs; verify empirically). | [Aliteq](https://aliteq.com/higgsfield-watermark), [help center](https://higgsfield.ai/creator-hub/help-center/account/who-owns-my-generations-and-can-i-use-them-commercially) |
| Regions / latency | No region or data-location statements in docs. Company HQ San Francisco; engineering partly in Kazakhstan. Peak traffic 01:00–08:00 UTC (web app). | [enterprise overview](https://docs.higgsfield.ai/docs/enterprise/overview.md), [Wikipedia](https://en.wikipedia.org/wiki/Higgsfield_AI), [gen-time blog](https://higgsfield.ai/blog/how-long-ai-video-generation-takes) |

### 1.10 File uploads

`POST /files/generate-upload-url` → `{upload_url (presigned, 1 h), upload_headers, public_url}`; PUT the file with the given headers (do not send Higgsfield creds). Accepted: JPEG/PNG/WebP/GIF, WAV (`audio/wav`), MP4. **No max file size or resolution documented.** All model endpoints also accept any public HTTPS URL; `asset://` refs are rejected. [file uploads](https://docs.higgsfield.ai/docs/concepts/file-uploads.md)

---

## 2. Full model catalog exposed via the API (as of Nov 2 2026)

**Sources for the catalog:** docs category pages (22 video families / 67 workflows; 14 image families / 17 workflows) [video](https://docs.higgsfield.ai/docs/models/video-generation.md), [image](https://docs.higgsfield.ai/docs/models/image-generation.md); console explore pages (24 video cards, 9 image cards, 4 workflows) [explore](https://open.higgsfield.ai/explore), [explore/video](https://open.higgsfield.ai/explore/video); per-model playground/pricing pages (cited per row). Prices are **discounted "from" rates** on Nov 2 2026 with list price in parentheses where known; pricing varies by resolution/duration/audio — always call `/estimate`.

### 2.1 Higgsfield's own models — API

| Model | API slug(s) | Type | Inputs / constraints | Output | Audio | Price (USD) | Released | Source |
|---|---|---|---|---|---|---|---|---|
| Soul (Standard) | `higgsfield-ai/soul/standard` | T2I | `prompt`, `num_images` 1–4, `resolution` 2K/4K, 10 aspect ratios (1:1,4:3,3:4,3:2,2:3,5:4,4:5,16:9,9:16,21:9); `custom_reference_id` (Soul ID v1) | images | – | $0.0938–0.1875/img | 06/2025 | [openapi](https://docs.higgsfield.ai/docs/openapi.json), [CS playground table](https://open.higgsfield.ai/models/higgsfield/cinema-studio/4.0/playground) |
| Soul 2 (V2) | `higgsfield-ai/soul/v2/standard` | T2I (+ image-to-image listed in console) | `prompt`, `aspect_ratio` 9:16/16:9/4:3/3:4/1:1/2:3/3:2, `resolution` 720p/1080p, `enhance_prompt`, `custom_reference_id` + `custom_reference_strength` 0–1, `style_id` (list via `GET /v1/text2image/soul-styles/v2`), `style_strength` (no effect), `seed`, `batch_size` 1 or 4 | images | – | $0.0032–0.0057/img | 02/2026 | [schema](https://docs.higgsfield.ai/docs/models/soul-2/generate.md) |
| Soul Cinema | `higgsfield-ai/soul/cinema` | T2I | film-look stills; `custom_reference_id` (model_version `cinema`) | images | – | ~$0.0032/img (blog) | – | [index](https://docs.higgsfield.ai/docs/models/soul-cinema.md), [API blog](https://higgsfield.ai/blog/higgsfield-api) |
| Soul ID (character lock) | `POST /v1/custom-references`; `GET /v1/custom-references/{id}` | Training | `name` ≤100, `model_version` v1/v2/cinema, `input_images` 1–100 public URLs; statuses not_ready/queued/in_progress/completed/failed; then pass `id` as `custom_reference_id` in matching Soul endpoint; account-scoped; concurrent-training cap (429) | reference id | – | **$2.50 per training** | – | [schema](https://docs.higgsfield.ai/docs/models/soul-id/create-character.md), [CS playground table](https://open.higgsfield.ai/models/higgsfield/cinema-studio/4.0/playground) |
| Marketing Studio Image 2.0 Alpha | `marketing-studio/image` | T2I + image edit + preset "enhance" | `prompt` ≤5000; `image_urls` 0–16 (edit) or 1–2 when `enhance_prompt=true` (1st = product, 2nd = person/model); `preset_id` (list `GET /marketing-studio/image/presets?search=&size=&cursor=`); `quality` low/medium/high; `resolution` 1k/2k/4k; 9 aspect ratios incl. 9:16; `moderation` auto/low | images (JPEG/PNG/WebP in) | – | $0.0138–0.6136/img (1k low → 4k high) | 09/01/2026 | [schema](https://docs.higgsfield.ai/docs/models/marketing-studio-image/generate-and-edit.md), [product-shots playground](https://open.higgsfield.ai/models/workflows/product-shots/playground) |
| Marketing Studio Image 2.5 Flare | `marketing-studio/image/flare` | same | adds `quality` xhigh/max | images | – | $0.0107–0.6136/img | 09/01/2026 | [schema](https://docs.higgsfield.ai/docs/models/marketing-studio-image/flare.md) |
| Marketing Studio Image 2.5 Sunburst | `marketing-studio/image/sunburst` | same | (index only) | images | – | $0.0107–0.6136/img | 09/01/2026 | [index](https://docs.higgsfield.ai/docs/models/marketing-studio-image.md) |
| Workflows: Product shots / Graphic ads / Marketplace design | call `marketing-studio/image` with a `preset_id` | preset-driven | product photo + prompt; the enhancer writes the campaign prompt | images | – | $0.0138–0.6136/img | – | [product shots](https://open.higgsfield.ai/models/workflows/product-shots/playground), [graphic ads](https://open.higgsfield.ai/models/workflows/graphic-ads/playground) |
| Ads Studio | `higgsfield/ads-studio/v1.0` | brief → static ad concepts (rendered by GPT Image 2.5 Flare) | `prompt` 1–8000, `niche`, `language` (free text, ≤80), `target_audience`, `batch_size` 1–8, `image_urls` 0–10 product refs, 14 aspect ratios; **no brand/logo/text fields** (put in prompt); "exact preservation of product/label/text not guaranteed" | PNG, fixed 2K, `images[{index,url}]` + `errors[]` | – | ~$0.084/img illustrative; token-metered (text in $5/M, image out $30/M) | 10/07/2026 | [schema](https://docs.higgsfield.ai/docs/models/ads-studio/generate.md) |
| AI Influencer | `higgsfield/ai-influencer` | character sheet (human/animal) | `brief`, `tier`, `image_url`, `item_image_urls[]`, `trait_variants`, `variation_index`, `seed` | image sheet | – | $0.05/sheet | 10/05/2026 | [playground](https://open.higgsfield.ai/models/higgsfield/ai-influencer/playground) |
| Cinema Studio 4.0 | `higgsfield/cinema-studio/4.0` | T2V and reference→V (auto-switch if any media array given) | `prompt` (tokens `<<<image_1>>>`, `<<<video_1>>>`, `<<<audio_1>>>`), `duration` 4–30, `resolution` 480p/720p, 6 aspect ratios incl. 9:16, `generate_audio` (default true), `image_urls` ≤30, `video_urls` ≤10, `audio_urls` ≤10 (50 total; 30 s budget per media type), `era`, `genre`, `light`, `pacing`, `camera_model`, `camera_lens`, `camera_aperture`, `camera_movement` (33 presets), `color_palette` (50 presets) | MP4 | **native audio** | $0.2057–0.4623/s (token-metered: 1k video tokens = $0.0214) | 09/18/2026 | [schema](https://docs.higgsfield.ai/docs/models/cinema-studio-4/generate.md), [playground](https://open.higgsfield.ai/models/higgsfield/cinema-studio/4.0/playground) |
| Genjutsu — motion transfer | `higgsfield/genjutsu/motion-transfer/v1.0` | V2V with image refs (swap character/product/clothes into an existing video) | `video_url` (≥4 s, trimmed to 30 s), `image_urls` 1–8, `prompt` ≤10000, `resolution` 480p/720p/1080p | MP4 (length = source) | source audio handling not stated | $0.159–0.816/s (list $0.318) | 09/17/2026 | [schema](https://docs.higgsfield.ai/docs/models/genjutsu/motion-transfer.md) |
| Genjutsu — object swap | `higgsfield/genjutsu/object-swap/v1.0` | V2V | (index only) | MP4 | – | $0.159–0.816/s | 09/17/2026 | [index](https://docs.higgsfield.ai/docs/models/genjutsu.md) |
| Genjutsu — restyle | `higgsfield/genjutsu/restyle/v1.0` | V2V | (index only) | MP4 | – | not listed | 09/30/2026 | [index](https://docs.higgsfield.ai/docs/models/genjutsu.md) |
| Genjutsu Light (motion transfer / object swap) | `higgsfield/genjutsu-light/motion-transfer/v1.0` | V2V | uses first 15 s of source; **audio preserved** | MP4 | preserved | $0.025–0.10/s | 10/20/2026 | [explore/video](https://open.higgsfield.ai/explore/video) |
| **DoP (Higgsfield DoP / motion presets)** | (slug not found) | I2V with camera presets | Listed in the Sept 16 launch blog at $0.125/generation and in third-party wrappers (`imageUrl`,`prompt`,`duration`); **absent from the Nov 2 docs catalog and console explore pages** → status unclear | – | – | $0.125/gen (Sept) | – | [API blog](https://higgsfield.ai/blog/higgsfield-api), [mindcloud wrapper](https://mindcloud.co/docs/universal/rest/higgsfield-ai/latest/actions/generate-video-with-dop-standard) |

### 2.2 Third-party video models — API

| Model | API slug(s) | Type | Inputs / constraints | Durations / resolutions / AR | Native audio | Price (USD/s, discounted → list) | Released | Source |
|---|---|---|---|---|---|---|---|---|
| **Seedance 2.5** (ByteDance) | `bytedance/seedance-2.5/text-to-video`, `/image-to-video`, `/reference-to-video`, `/video-edit`, `/video-extend` | T2V, I2V (+`end_image_url` last frame), multimodal ref→V, V edit, V extend | ref: `image_urls` 1–30, `video_urls` 1–10, `audio_urls` 1–10 (50 total; 30 s budget per type); `bitrate_mode` standard/high; extend: `video_url` + refs | 4–30 s; 480p/720p/1080p; 16:9,4:3,1:1,3:4,9:16,21:9 | yes (`generate_audio`, default true) | T2V/I2V $0.144–0.7961; ref/edit/extend $0.1728–0.9553 (token-metered; list 480p ≈ $0.2056, 1080p ≈ $1.137 at 16:9) | 07/01/2026 | [ref schema](https://docs.higgsfield.ai/docs/models/seedance-2-5/reference-to-video.md), [I2V](https://docs.higgsfield.ai/docs/models/seedance-2-5/image-to-video.md), [extend](https://docs.higgsfield.ai/docs/models/seedance-2-5/video-extend.md), [playground](https://open.higgsfield.ai/models/bytedance/seedance-2.5/text-to-video/playground) |
| **Seedance 2.0** | `bytedance/seedance-2.0/text-to-video`, `/image-to-video`, `/reference-to-video` | T2V, I2V, ref→V | ref: `image_urls` 1–9, `video_urls` 1–3 (each ≤15 s), `audio_urls` 1–3 (2–15 s each, 15 s total; needs image or video ref) | 4–15 s; 480p/720p/1080p/4k; 6 ARs | yes | $0.0985–1.0887; ref $0.1182–1.3064 | 02/01/2026 | [ref schema](https://docs.higgsfield.ai/docs/models/seedance-2/reference-to-video.md) |
| **Kling 4.0** | `kling-video/v4.0/text-to-video`, `/image-to-video`, `/reference-to-video`, `/video-edit` | T2V, I2V, ref→V (images/videos/elements), V edit, keyframes | fields partly documented (`prompt`,`duration`,`resolution`,`aspect_ratio` incl. `adaptive`); docs page not yet published | 3–30 s; 720p/1080p | not stated | $0.1099–0.1645 (list $0.157 @720p, $0.235 @1080p; with input video $0.094/$0.141) | **10/23/2026** | [playground](https://open.higgsfield.ai/models/kling-video/v4.0/reference-to-video/playground), [T2V playground](https://open.higgsfield.ai/models/kling-video/v4.0/text-to-video/playground) |
| **Kling 3.0** (Std / Pro / 4K / Turbo) | `kling-video/v3.0/{std,pro,4k}/text-to-video`, `/image-to-video`; `kling-video/v3.0-turbo/text-to-video`, `/image-to-video` | T2V, I2V (+`last_image_url`), multi-shot | `prompt` ≤2500 (truncated), `duration` 3–15, `sound` on/off (default on), `multi_shots` + `multi_prompt` ≤6 × (`prompt` ≤512, `duration` 1–15), `elements[]` (account-owned Kling element IDs), `cfg_scale` 0–1; no aspect_ratio field on Pro I2V | 3–15 s; Turbo 720p/1080p; 4K tier | yes (`sound`) | Std $0.042–0.063 (list $0.084–0.126); Pro $0.056–0.084 (list $0.112–0.168); Turbo $0.056–0.07; 4K $0.21 (list $0.42) | 02/01/2026 (Turbo 06/2026) | [Pro I2V schema](https://docs.higgsfield.ai/docs/models/kling-3/pro-image-to-video.md), [index](https://docs.higgsfield.ai/docs/models/kling-3.md), [playground](https://open.higgsfield.ai/models/kling-video/v3.0/pro/image-to-video/playground) |
| **Kling O3** | `kling-video/o3/first-last-frame`, `/image-reference`, `/video-edit`, `/video-reference` | first+last frame, image-reference (multi), V edit, V reference | `image_urls[]` (ordered, no max stated) + `elements[]`; `first_frame_url`/`last_frame_url`; `mode` std/pro/4k; `sound` on/off; `multi_shots`/`multi_prompt` ≤6; `shot_type` customize/intelligent; AR 16:9/9:16/1:1; prompt ≤2500 | 3–15 s | yes | $0.042–0.084 | – | [image-ref schema](https://docs.higgsfield.ai/docs/models/kling-o3/image-reference.md), [FLF schema](https://docs.higgsfield.ai/docs/models/kling-o3/first-last-frame.md) |
| Kling O1 / Omni | `kling-video/omni/first-last-frame`, `/image-reference`, `/video-edit`, `/video-reference` | same family, earlier | (index only) | – | – | $0.042–0.084 | – | [index](https://docs.higgsfield.ai/docs/models/kling-omni.md) |
| Kling 2.6 Pro | `kling-video/v2.6/pro/text-to-video`, `/image-to-video` | T2V, I2V | `prompt`, `image_url`, `duration` 5/10, `aspect_ratio` 16:9/9:16/1:1, `sound` on/off (default on), `cfg_scale` | 5 or 10 s | yes ("dialogue, SFX, ambience") | $0.035–0.07 | 12/01/2025 | [schema](https://docs.higgsfield.ai/docs/models/kling-2-6/pro-image-to-video.md) |
| Kling 2.6 Motion Control (Std/Pro) | `/docs/models/kling-2-6-motion-control` | V motion → image | (index only) | – | – | – | – | [video index](https://docs.higgsfield.ai/docs/models/video-generation.md) |
| Kling 3.0 Motion Control (Std/Pro) | `/docs/models/kling-3-motion-control` | V motion → image | (index only) | – | – | – | – | [video index](https://docs.higgsfield.ai/docs/models/video-generation.md) |
| Kling 2.5 Turbo (Std/Pro) | `kling-video/v2.5-turbo/{standard,pro}/image-to-video`, `/pro/text-to-video` | T2V, I2V | `prompt`, `image_url`, `duration` 5/10, `cfg_scale`, `negative_prompt` | 5/10 s; up to 1080p | **no** | $0.021–0.042 | 09/2025 | [openapi](https://docs.higgsfield.ai/docs/openapi.json) |
| **Wan 3.0** (Alibaba) | `alibaba/wan-3.0/text-to-video`, `/image-to-video`, `/reference-to-video` | T2V, I2V, multimodal ref→V | `image_urls` ≤10, `video_urls` ≤5 (30 s total), `audio_urls` ≤5 (WAV/MP3, 30 s total), `file_url`/`link_url` (doc/web brief → "deep thinking"), `enable_thinking`, `seed`, `resolution` 480p/720p/1080p, AR 16:9/4:3/1:1/3:4/9:16/adaptive | 2–30 s | yes (`generate_audio` default true) | $0.02–0.08 (list $0.05/0.10/0.20 per res; input video seconds billed too) | 08/24/2026 | [ref schema](https://docs.higgsfield.ai/docs/models/wan-3/reference-to-video.md), [playground](https://open.higgsfield.ai/models/alibaba/wan-3.0/reference-to-video/playground) |
| Wan 3.0 Prime | `alibaba/wan-3.0-prime/{t2v,i2v,ref2v}` | same, "fast processing" | – | 2–30 s; 480p–1080p | yes | $0.0272–0.112 | 08/24/2026 | [playground table](https://open.higgsfield.ai/models/alibaba/wan-3.0/reference-to-video/playground) |
| Wan 2.7 | `wan/v2.7/{text-to-video,image-to-video,reference-to-video}` | T2V, I2V, ref→V ("consistent characters") | – | 2–15 s (ref 2–10 s); 720p–1080p | yes | $0.05–0.075 | 04–07/2026 | [explore/video](https://open.higgsfield.ai/explore/video) |
| Wan 2.6 | `wan/v2.6/{t2v,i2v,ref2v}` | multi-shot, video reference | – | 5–15 s; 480p–1080p | yes | $0.05–0.075 | 12/01/2025 | [explore/video](https://open.higgsfield.ai/explore/video) |
| HappyHorse 1.1 (Alibaba) | `alibaba/happy-horse/v1.1/{text-to-video,image-to-video,reference-to-video}` | T2V, I2V, image-ref→V | ref: `image_urls` 1–9, `prompt`, `duration` 2–15, `resolution` 720p/1080p, `seed`; no audio or AR fields; no video refs | 2–15 s | not documented | $0.07–0.09 | 06/01/2026 | [ref schema](https://docs.higgsfield.ai/docs/models/happy-horse-1-1/reference-to-video.md) |
| Happy Horse 1.0 | `alibaba/happy-horse/{t2v,i2v,ref2v}` | same | – | 2–15 s | – | $0.07–0.14 | 04/01/2026 | [explore/video](https://open.higgsfield.ai/explore/video) |
| **MiniMax H3** | `minimax/h3/text-to-video`, `/image-to-video`, `/reference-to-video` | T2V, I2V, multimodal ref→V | ref: `image_urls` 1–9, `video_urls` 1–3, `audio_urls` 0–3 (needs image/video ref; 15 s combined budget), `resolution` "2K" only, AR auto/adaptive/21:9/16:9/4:3/1:1/3:4/9:16, `aigc_watermark` bool, prompt serialized to 7000 chars | 5–15 s; 2K | via audio refs only (no sound toggle) | $0.065 (list $0.13) | – | [ref schema](https://docs.higgsfield.ai/docs/models/minimax-h3/reference-to-video.md) |
| Hailuo 2.3 Standard (MiniMax) | `minimax/hailuo-2.3/standard/text-to-video`, `/image-to-video` | T2V, I2V | `prompt`, `image_url`, `duration` 6/10, `prompt_optimizer` | 6/10 s | no | $0.012 (list $0.047) | – | [openapi](https://docs.higgsfield.ai/docs/openapi.json) |
| LTX 2.5 Fast / Pro (Lightricks) | `lightricks/ltx-2.5/text-to-video/{fast,pro}` (+ image-to-video per docs: 4 workflows) | T2V, I2V | camera motion control | Fast up to 4K; Pro 1080p | yes | Fast from $0.09; Pro from $0.12 | – | [explore/video](https://open.higgsfield.ai/explore/video) |
| PixVerse V6 | `pixverse/v6/{text-to-video,image-to-video}` | T2V, I2V, first/last frame | – | – | yes (optional) | $0.098 (list $0.115) | – | [explore/video](https://open.higgsfield.ai/explore/video) |
| Grok Imagine Video 1.5 (xAI) | `xai/grok-imagine-video/v1.5/reference-to-video` | T2V / I2V (`image_url`) / ref→V (`image_urls` ≤7 + **`audio_url`** single audio reference) | `duration` 1–15, `resolution` 480p/720p/1080p (ref mode ≤720p), AR auto/1:1/16:9/9:16/4:3/3:4/3:2/2:3; JPEG/PNG/WebP/GIF only | 1–15 s | yes ("video with sound") | from $0.08 (Sept blog said $0.25) | 10/01/2026 | [schema](https://docs.higgsfield.ai/docs/models/grok-video-1-5/reference-to-video.md) |

### 2.3 Third-party image models — API

| Model | API slug | Type | Inputs | Price | Source |
|---|---|---|---|---|---|
| Grok Imagine Image 2.0 | `xai/grok-imagine-image-2.0` | T2I + edit | up to 10 image refs | $0.04/img | [image index](https://docs.higgsfield.ai/docs/models/image-generation.md), [explore](https://open.higgsfield.ai/explore) |
| Recraft V4.1 / Pro / Utility / Utility Pro | `recraft/v4.1/text-to-image` (+ variants) | T2I | 1K (base/utility) or 2K (pro); RGB palette & background controls | $0.035/img | [image index](https://docs.higgsfield.ai/docs/models/image-generation.md) |
| Qwen Image 3 | `alibaba/qwen-image-3/text-to-image`, `/edit` | T2I + edit | edit 1–3 refs; optional prompt reasoning; up to 2K | $0.04–0.075/img | [image index](https://docs.higgsfield.ai/docs/models/image-generation.md) |
| Ideogram 4.0 | `ideogram/v4.0` | T2I (optional image ref; speed setting) | – | $0.03/img | [explore](https://open.higgsfield.ai/explore) |
| Z-Image Turbo | `z-image/turbo` | T2I | 1K/2K PNG; prompt enhancement | $0.015/img | [explore](https://open.higgsfield.ai/explore) |

### 2.4 Models/features in the WEB APP or MCP but NOT on the REST API (Nov 2 2026)

| Category | Web-app / MCP items | Evidence |
|---|---|---|
| Video | **Google Veo 3.1 / Veo 3 Fast** (web + MCP), **Sora 2 / Sora 2 Pro** (retired Sep 2026), Gemini Omni Flash, Hailuo 3.0, FLUX 3 Video Upscaler, Sora 2 Upscale, Kling 2.1/2.5/O1 (MCP), DoP presets (status unclear) | [which-model help](https://higgsfield.ai/creator-hub/help-center/ai-models/which-ai-model-should-i-use), [MCP guide](https://claudefa.st/blog/tools/mcp-extensions/higgsfield-mcp), [Sora post](https://higgsfield.ai/blog/sora-api-migration-guide), [novoads latency](https://novoads.ai/en/blog/how-long-does-ai-video-generation-take) |
| Image | Nano Banana / 2 / 2.1 / Pro, GPT Image 2 / 2.5, FLUX.2 Pro/Max, FLUX 3, Seedream 4.5 / 5.0 Lite/Flash/Pro, Kling O1 Image, Ideogram 4.5, Ideogram Vector 1.0, Popcorn (storyboards), Inpaint/Edit (Nano Banana Pro), Upscale | [pricing blog](https://higgsfield.ai/blog/higgsfield-pricing-explained), [product changelog](https://higgsfield.ai/creator-hub/changelog) |
| Lip-sync / talking | Lipsync Studio: Higgsfield Speak 2.0, Kling 2.6 Lipsync, Kling Avatars 2.0, Wan 2.5 Speak, Infinite Talk, Veo 3.1 (I2V), Sync Lipsync 3 (V2V), Kling Lipsync (V2V) | [lipsync help](https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-lipsync-voiceover-and-aspect-ratios) |
| Audio / TTS | Higgsfield Audio: Eleven v4 (ElevenLabs), Qwen Audio 3.0 TTS, MiniMax Speech 2.8 HD, VibeVoice, Seed Audio/Seed Speech; voice cloning (3 custom voices, ≤2 min sample); Translate (10 languages incl. **Hindi**); Change Voice ("70+ languages") | [talking avatar page](https://higgsfield.ai/ai-talking-avatar), [Audio post](https://higgsfield.ai/blog/higgsfield-audio-ai-voice-tools) |
| Ad workflows | Ads Studio chat UI with brand kit + website import, Ad Multiplier, UGC Factory, Content Factory, Marketing Studio video, Supercomputer agent, Katana skill, ChatGPT extension | [Ads Studio post](https://higgsfield.ai/blog/higgsfield-ads-studio), [Ad Multiplier](https://higgsfield.ai/blog/ad-multiplier-ads-studio), [Content Factory](https://higgsfield.ai/blog/higgsfield-introduces-content-factory) |

**Not found anywhere on Higgsfield (web or API):** Luma Ray, Runway Gen-4/Aleph, Pika, Vidu, Hedra, OmniHuman, Topaz, GPT Image 1.5, Flux Kontext, Seedream 4 (API).

### 2.5 Pricing-page snapshot (open.higgsfield.ai/pricing, Nov 2 2026, page 1 of 4) and Higgsfield-vs-Fal table (Sep 16 2026)

| Model | Modes | Max res | Duration | List $/s | Discounted $/s |
|---|---|---|---|---|---|
| Genjutsu | 2 | 1080p | – | 0.318 | 0.159 (50%) |
| Genjutsu Light | 2 | 1080p | – | 0.050 | 0.025 (50%) |
| Seedance 2.5 | 5 | 1080p | 4–30 s | 0.206 | 0.144 (30%) |
| Seedance 2.0 | 3 | 4K | 4–15 s | 0.141 | 0.099 (30%) |
| Wan 3.0 Prime | 3 | 1080p | 2–30 s | 0.068 | 0.027 (60%) |
| Wan 3.0 | 3 | 1080p | 2–30 s | 0.050 | 0.020 (60%) |
| Kling 4.0 | 4 | 1080p | 3–30 s | 0.094* | 0.066 (30%) |
| Kling 3.0 | 10 | 1080p | 3–15 s | 0.084 | 0.042 (50%) |
| Kling 2.6 | 4 | – | 5/10 s | 0.070 | 0.035 (50%) |
| Kling 2.5 | 3 | 1080p | 5/10 s | 0.042 | 0.021 (50%) |

\*Kling 4.0 "from" rates differ between the pricing table ($0.094) and the model page ($0.157 list / $0.110 discounted at 720p); the lower figure is the with-input-video rate. Source: [pricing](https://open.higgsfield.ai/pricing), [Kling 4.0 playground](https://open.higgsfield.ai/models/kling-video/v4.0/reference-to-video/playground).

Higgsfield vs Fal (Sep 16 2026, $/s): Kling 3.0 4K 0.210 vs 0.420; Kling 3.0 Pro 0.084 vs 0.168; Kling 3.0 Std I2V 0.063 vs 0.126; Kling 3.0 Turbo 1080p 0.070 vs 0.140; Happy Horse 1.1 1080p 0.090 vs 0.180; Seedance 2.5 T2V/I2V 480p 0.145 vs 0.207; Seedance 2.5 ref/edit/extend 480p 0.174 vs 0.248; Seedance 2.0 480p 0.099 vs 0.141; Seedance 2.0 ref 0.118 vs 0.168; MiniMax H3 2K 0.065 vs 0.130. [pricing](https://open.higgsfield.ai/pricing)

**Discrepancies to be aware of:** the Sept 16 launch blog printed Kling 3.0 at $0.112/s, Wan 3.0 at $0.20/s, Seedance 2.5 at $0.0738/s and Seedance 2.0 at $0.9332/s — these are inconsistent with the live pricing page (Kling 3.0 $0.084 list; Wan 3.0 $0.05–0.20 by resolution). Always use `/estimate`. [launch blog](https://higgsfield.ai/blog/higgsfield-api), [pricing](https://open.higgsfield.ai/pricing)

### 2.6 Worked cost examples (list price, before discounts) for a 20 s 9:16 1080p ad shot

| Route | Calc | Approx. list cost |
|---|---|---|
| Wan 3.0 ref→V 1080p | 20 s × $0.20 | $4.00 ($0.80 at 60% off) |
| Wan 3.0 ref→V 720p | 20 s × $0.10 | $2.00 |
| Kling 3.0 Pro I2V (two 10 s shots) | 20 s × $0.168 | $3.36 ($1.68 at 50% off) |
| Kling 4.0 ref→V 1080p | 20 s × $0.235 | $4.70 |
| Seedance 2.5 ref→V 480p draft | 20 s × ~$0.248 | ~$5 (token-metered; 1080p ≈ $20+) |
| Cinema Studio 4.0 720p | 20 s × ~$0.46 | ~$9 |
| MiniMax H3 2K (15 s max) | 15 s × $0.13 | $1.95 |
| Soul 2 keyframes ×4 | 4 × $0.0057 | $0.02 |
| Soul ID training | 1 | $2.50 |
Sources: per-model playground pages cited in §2.1–2.2.

---

## 3. How the Higgsfield product does ads (UX study)

### 3.1 Ads Studio (static ads; web, Oct 1 2026)
Flow: (1) create a **brand kit** by pasting a website URL (imports name, logo, colors, fonts, tone, audience, selling points, socials) or manual entry → (2) select/add **products** from the imported catalog or by link/upload → (3) choose **number of ads per product (≤20)**, total credit cost shown before run → (4) generate copy + designs, pick keepers → (5) iterate in chat with "Mention a product" → (6) download/export. Static only; 4 credits/ad (~$0.20). Models not disclosed to the user; logo from brand kit reused on every ad; ad copy generated with visuals. Sep 30 2026 added "website link → static ads". [Ads Studio post](https://higgsfield.ai/blog/higgsfield-ads-studio), [product changelog](https://higgsfield.ai/creator-hub/changelog). API equivalent: `higgsfield/ads-studio/v1.0` takes `prompt`+`niche`+`language`+`target_audience`+≤10 product refs but **no brand-kit/logo fields** — the web brand kit is a web-only layer. [schema](https://docs.higgsfield.ai/docs/models/ads-studio/generate.md)

### 3.2 Ad Multiplier (video; Oct 6 2026)
Flow: open Ads Studio → Explore tools → Ad multiplier → upload a **reference video ad (4–30 s)** → add **≤20 images** of characters/products/clothing → prompt referencing files with `@` (e.g., "@lipstick as the product") → pick 480p/720p/1080p → credit cost shown on the Generate button → review in History (check product look, on-screen text, claims). Keeps original motion/framing/cuts/timing; swaps cast/product/location/hook/CTA. Cost: up to 140 credits (720p) / 240 (1080p) for hook+CTA change; 35/60 for CTA only. Underlying model not named (functionally matches Genjutsu motion-transfer/object-swap, which is on the API). [Ad Multiplier post](https://higgsfield.ai/blog/ad-multiplier-ads-studio), [Genjutsu schema](https://docs.higgsfield.ai/docs/models/genjutsu/motion-transfer.md)

### 3.3 UGC Factory (Sep 2025 post; still live)
Flow: pick one of 40+ **templates** (motion + scene presets) → upload **product image** (PNG/JPG) → generate **4 keyframes** (Nano Banana places the avatar with the product; claims it keeps text/logos/shape) → describe the action → enter **script** → set **voice type/tone/language/accent** ("70+ languages with lip sync") → optional background sound → generate (Veo 3 / Seedance / MiniMax). Suggests training a Soul ID avatar first. [UGC Factory post](https://higgsfield.ai/blog/Higgsfield-UGC-Factory-Explained)

### 3.4 Content Factory (Oct 22 2026)
"What if…" topic → 50+ format presets (or custom preset from a TikTok/IG link) → 1–4 episodes → Higgsfield writes script scene-by-scene, picks characters, generates visuals + per-scene voiceover, edits. 15 s–5 min, 9:16. Cost 15.75 credits per 15 s episode (~$0.79). Caveat printed by Higgsfield: **"Languages other than English and Russian may have an accent."** Also exposed via MCP `/content-factory` and Supercomputer. [Content Factory post](https://higgsfield.ai/blog/higgsfield-introduces-content-factory)

### 3.5 Lipsync Studio / AI Talking Avatar (web)
Upload character image or video → type **Audio text** (or generate/upload audio) → pick scene template (General, Selfie, Podcast, Car Talking…) → pick model (Veo 3.1, Kling 2.6 Lipsync, Wan 2.5 Speak, Kling Avatars 2.0, Higgsfield Speak 2.0, Infinite Talk; V2V: Kling Lipsync, Sync Lipsync 3) → generate. Talking-avatar page: script typed or **audio track uploaded**; voice from Higgsfield Audio or a clone; dubbing into "18 languages" with re-synced lips. Aspect 9:16/1:1/16:9; upscale to 4K. Credits: Wan 2.5 Speak ≈6 (480p)/≈20 (1080p) per 5 s; Higgsfield Speak 2.0 ≈14 per 5 s 720p. [lipsync help](https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-lipsync-voiceover-and-aspect-ratios), [talking avatar](https://higgsfield.ai/ai-talking-avatar), [pricing blog](https://higgsfield.ai/blog/higgsfield-pricing-explained)

### 3.6 Soul / Soul ID / Soul Cast (character consistency)
Web: upload 20+ (up to 80) well-lit photos ≥960 px → train 3–5 min → 25 credits (~$1.25) → character usable in Soul 2.0 / Soul Cinema and auto-appears in **Elements**; call with `@` in Seedance prompts; use a Soul portrait as the I2V start frame; chain last frame → next clip (recommend ≤2–3 chained clips before re-anchoring). Video models named as accepting Soul ID: Seedance 2.0, Veo 3.1, Kling 3.0, Wan 2.6 (Cinema Studio). Cinema Studio 2.5 "Soul Cast" = up to 3 saved actors with color grading. [Soul ID post](https://higgsfield.ai/blog/keep-ai-character-consistent), [Cinema Studio help](https://higgsfield.ai/creator-hub/help-center/tools/how-do-i-use-cinema-studio)

### 3.7 Cinema Studio (2.5 → 4.0)
4.0 UI: **Film Setup** (genre, era 60s–2020s, tempo Single Shot→Chaotic) → **Camera** (body: Modern/35mm/8mm/DV; 5 lenses; aperture; 30+ moves incl. POV, Robot Arm, Helicopter) → **Color palette** (50+) → **Lighting** (6 presets or custom) → **References** (≤50 images/videos/Soul Cast; emotion slider) → mode: References (new clip) / Forward–Backward Extend (≤30 s upload) / Edit Video (regional). 3.5 added a **Claude chat panel** that splits a script into shots with pre-filled camera params (Claude never clicks Generate). Native audio in all versions. Blocks real faces/IP ("May contain protected content"). Web credits: 25/50 per 5 s (720p/1080p). The 4.0 engine is exposed on the API as `higgsfield/cinema-studio/4.0` with the same enums. [Cinema Studio help](https://higgsfield.ai/creator-hub/help-center/tools/how-do-i-use-cinema-studio), [CS 4.0 post](https://higgsfield.ai/blog/cinema-studio-4-0), [Krea pricing](https://www.krea.ai/blog/higgsfield-pricing-explained-2026-unlimited-credits-and-real-monthly-costs)

### 3.8 Popcorn (multi-frame storyboards; web only)
Image → Popcorn → Manual / Auto (1 prompt → ≤8 frames) / Instadump (style pack ≤15 photos + your photo) → ≤4 image refs addressed by number in the prompt → aspect ratio → cost on Generate button. Frames share face/body/lighting/clothing; edit one frame and regenerate; send frames to Kling/Veo as start frames and chain last→first. [Popcorn help](https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-popcorn)

### 3.9 Cross-cutting UX patterns worth noting
- **Cost is always shown on the Generate button before confirmation**; model names are shown in model pickers but hidden inside "Studio" workflows (Ads Studio, Content Factory). No time estimates are documented in help pages. [Popcorn help](https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-popcorn), [Ads Studio post](https://higgsfield.ai/blog/higgsfield-ads-studio)
- **Draft tier:** Seedance 2.5 Draft Mode (Sep 22 2026) renders 480p previews then 1080p finals. [product changelog](https://higgsfield.ai/creator-hub/changelog)
- **Text/logo:** Ads Studio relies on GPT Image-class rendering with brand-kit logo; Higgsfield's own help says GPT Image is strongest for readable text. The API Ads Studio page warns exact text/label preservation is not guaranteed; third-party testers add captions/titles in post. [which-model help](https://higgsfield.ai/creator-hub/help-center/ai-models/which-ai-model-should-i-use), [Ads Studio schema](https://docs.higgsfield.ai/docs/models/ads-studio/generate.md), [Wireflow](https://www.wireflow.ai/blog/real-voice-seedance-2-5)
- **Unlimited mode:** per-plan model sets that cost 0 credits for 365 days or 7 days; **applies only on higgsfield.ai**, never to MCP/CLI/API. [pricing blog](https://higgsfield.ai/blog/higgsfield-pricing-explained)
- **"Director's Cut", "Click-to-Ad", "Vibe Motion", "Remix", "Mini-app"** — no such named features found on Higgsfield in 2026 (closest: Cinema Studio AI Director / Director's panel; Ad Multiplier; Katana Claude skill; ChatGPT extension).

---

## 4. Consistency and lip-sync specifics (API)

### 4.1 Character reference + product reference in the same generation

| Model (API) | Images | Videos | Audio | Explicit identity mechanism | Hindi/language statement | Source |
|---|---|---|---|---|---|---|
| Seedance 2.5 ref→V | ≤30 | ≤10 | ≤10 | prompt + ordered refs (token syntax not documented on API page; web uses `@`) | none | [schema](https://docs.higgsfield.ai/docs/models/seedance-2-5/reference-to-video.md) |
| Seedance 2.0 ref→V | ≤9 | ≤3 | ≤3 | ordered refs | none | [schema](https://docs.higgsfield.ai/docs/models/seedance-2/reference-to-video.md) |
| Wan 3.0 ref→V | ≤10 | ≤5 | ≤5 (WAV/MP3) | ordered refs; `file_url` brief doc | none | [schema](https://docs.higgsfield.ai/docs/models/wan-3/reference-to-video.md) |
| Cinema Studio 4.0 | ≤30 | ≤10 | ≤10 | `<<<image_n>>>` / `<<<video_n>>>` / `<<<audio_n>>>` tokens | none | [schema](https://docs.higgsfield.ai/docs/models/cinema-studio-4/generate.md) |
| Kling O3 image-reference | unlimited stated | – | – | `image_urls[]` + `elements[]` (account-owned Kling element IDs; **no API documented for creating elements**) + first/last frame | none | [schema](https://docs.higgsfield.ai/docs/models/kling-o3/image-reference.md) |
| Kling 4.0 ref→V | yes (fields undocumented) | yes | ? | images/videos/elements | none | [playground](https://open.higgsfield.ai/models/kling-video/v4.0/reference-to-video/playground) |
| Kling 3.0 I2V | 1 (+`last_image_url`) | – | – | `elements[]` + multi-shot prompts | none | [schema](https://docs.higgsfield.ai/docs/models/kling-3/pro-image-to-video.md) |
| MiniMax H3 ref→V | ≤9 | ≤3 | ≤3 | ordered refs | none | [schema](https://docs.higgsfield.ai/docs/models/minimax-h3/reference-to-video.md) |
| HappyHorse 1.1 ref→V | 1–9 | – | – | ordered refs | none | [schema](https://docs.higgsfield.ai/docs/models/happy-horse-1-1/reference-to-video.md) |
| Grok Imagine Video 1.5 | ≤7 | – | 1 (`audio_url`) | ordered refs | none | [schema](https://docs.higgsfield.ai/docs/models/grok-video-1-5/reference-to-video.md) |
| Genjutsu motion transfer | 1–8 | 1 source | – | swaps refs into an existing performance video (keeps motion/timing) | none | [schema](https://docs.higgsfield.ai/docs/models/genjutsu/motion-transfer.md) |
| Soul 2 + Soul ID | trained ID (1–100 photos) | – | – | `custom_reference_id` + strength → consistent **keyframes**, then I2V | none | [Soul ID](https://docs.higgsfield.ai/docs/models/soul-id/create-character.md) |
| Marketing Studio Image | 1 product + 1 person (enhance) or ≤16 (edit) | – | – | preset-guided product shot | none | [schema](https://docs.higgsfield.ai/docs/models/marketing-studio-image/generate-and-edit.md) |

Veo 3.1 "ingredients"/reference images are **not available on the API** (MCP/web only).

### 4.2 Lip-sync / driving with uploaded (ElevenLabs Hindi) audio

- **No dedicated lip-sync endpoint on the API.** Lipsync Studio models (Speak 2.0, Kling Lipsync, Sync Lipsync 3, Infinite Talk, Wan 2.5 Speak, Kling Avatars 2.0) are web-only. Higgsfield Speak v2 is hosted by third parties (e.g., Segmind "Speech 2 Video": image + WAV/MP3 → 5/10/15 s) if needed outside Higgsfield. [lipsync help](https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-lipsync-voiceover-and-aspect-ratios), [Segmind](https://www.segmind.com/models/higgsfield-speech2video)
- **Audio-reference routes (API):** Seedance 2.5 (`audio_urls` ≤10, 30 s total), Seedance 2.0 (`audio_urls` ≤3, 2–15 s each, 15 s total, needs image/video ref), Wan 3.0 (`audio_urls` ≤5 WAV/MP3, 30 s total), MiniMax H3 (`audio_urls` ≤3), Cinema Studio 4.0 (`audio_urls` ≤10, `<<<audio_1>>>` token), Grok Imagine Video 1.5 (`audio_url`). The docs say nothing about whether the audio is reproduced verbatim. An independent Aug 2026 test of Seedance 2.5 found the model "regenerates a new voice" guided by the reference — reproducing lines near-verbatim in close-up, low-action shots (3/3) but recomposing them in wide/noisy action shots (0/3). **Treat as "guided dialogue", not deterministic lip-sync; expect to need a separate lip-sync pass (outside Higgsfield's API) for guaranteed ElevenLabs-audio fidelity.** [Wireflow](https://www.wireflow.ai/blog/real-voice-seedance-2-5)
- **Native dialogue generation:** Kling 3.0 (`sound: on`, "dialogue, SFX, ambience"), Kling 2.6, Kling O3/4.0, Seedance 2.0/2.5, Wan 2.6/2.7/3.0, LTX 2.5, PixVerse 6, Grok 1.5, Cinema Studio 4.0 all generate audio; **no language list is published for any of them on Higgsfield.** Veo 3.1 native audio is MCP/web only. [explore/video](https://open.higgsfield.ai/explore/video)
- **Hindi evidence:** Higgsfield Translate lists Hindi (Mar 2026); Content Factory warns of accents outside English/Russian; no Hindi lip-sync demos or benchmarks found. [Audio post](https://higgsfield.ai/blog/higgsfield-audio-ai-voice-tools), [Content Factory](https://higgsfield.ai/blog/higgsfield-introduces-content-factory)

### 4.3 First/last frame and extension

| Capability | Models (API) | Source |
|---|---|---|
| First + last frame | Kling O3 `/first-last-frame` (`first_frame_url`, `last_frame_url`, 3–15 s, std/pro/4k, sound); Kling Omni `/first-last-frame`; Kling 3.0 I2V `last_image_url`; Seedance 2.5 I2V `end_image_url`; PixVerse 6 (first/last); Wan (web help: "precise first- and last-frame control") | [O3 FLF](https://docs.higgsfield.ai/docs/models/kling-o3/first-last-frame.md), [Kling 3.0](https://docs.higgsfield.ai/docs/models/kling-3/pro-image-to-video.md), [Seedance 2.5 I2V](https://docs.higgsfield.ai/docs/models/seedance-2-5/image-to-video.md) |
| Video extension (>10–15 s) | Seedance 2.5 `/video-extend` (`video_url` + prompt, 4–30 s, refs allowed); Cinema Studio 4.0 web Forward/Backward Extend (API: "editing and extension use the separate Seedance 2.5 endpoints"); Kling 4.0 video-edit | [extend](https://docs.higgsfield.ai/docs/models/seedance-2-5/video-extend.md), [CS schema](https://docs.higgsfield.ai/docs/models/cinema-studio-4/generate.md) |
| Single-call long shots | Seedance 2.5 / Wan 3.0 / Cinema Studio 4.0 / Kling 4.0: up to 30 s; Kling 3.0/O3/Seedance 2.0/H3: 15 s; Kling 3.0/O3 multi-shot: ≤6 prompted shots whose durations sum ≤15 s | §2.2 |

---

## 5. Operational

| Topic | Finding | Source |
|---|---|---|
| Generation times (official, web app, 30-day medians, 8 s clip, Jul 2026) | Kling 720p ≈ 1.5 min (10 s queue + 77 s); WAN ≈ 1.5 min; Veo 1080p ≈ 2 min; Seedance 720p ≈ 3.5–4 min (206 s gen). Kling 720p: 5 s ≈ 60 s, 15 s ≈ 130 s; Kling 8 s 1080p ≈ 191 s. 720p→1080p ≈ 2.5× slower on Kling. Peak 01:00–08:00 UTC. | [gen-time blog](https://higgsfield.ai/blog/how-long-ai-video-generation-takes) |
| Generation times (independent) | Novoads (60 days to Aug 10 2026, p50/p90 s): Seedance 2.0 291/457 (n=792); Seedance 2.5 234/326 (n=34); Veo 3.1 122/208; Sora 2 Pro 435/830; Nano Banana Pro 45/62. Hack'celeration: 5 s T2V 2–4 min; Veo 3.1 15 s with sound 8–12 min; lipsync 30 s ≈ 4 min; peak hours 30–40% slower. **No per-model API latency published by Higgsfield.** | [novoads](https://novoads.ai/en/blog/how-long-does-ai-video-generation-take), [hackceleration](https://hackceleration.com/labs/review/higgsfield) |
| Timeouts | Each model has an undisclosed timeout; timed-out requests → `failed`, not charged. | [FAQ](https://docs.higgsfield.ai/docs/help/faq) |
| Error codes | 400 invalid, 401 creds, 403 insufficient balance, 404 model not on account, 409 still running, 422 validation/idempotency mismatch, 423 model temporarily blocked, 429 queue full/endpoint limit, 500, 503 model disabled/admission unavailable. Body `{detail:…}`. | [errors](https://docs.higgsfield.ai/docs/concepts/errors.md) |
| Moderation false positives | `nsfw` is terminal, applies to input or output, varies by model, refunded. Web app blocks real faces/protected IP. No published FP rates; Marketing Studio exposes `moderation: low`. | [FAQ](https://docs.higgsfield.ai/docs/help/faq), [Cinema Studio help](https://higgsfield.ai/creator-hub/help-center/tools/how-do-i-use-cinema-studio) |
| Concurrency | 2 → 10 → 20 → 40 by 28-day funding ($0/$25/$100/$1,000); enterprise dedicated. | [pricing](https://open.higgsfield.ai/pricing) |
| URL persistence | 7 days default (1 h–7 d configurable); `expires_at` in status/webhook; download to own storage. | [data retention](https://docs.higgsfield.ai/docs/enterprise/data-retention.md) |
| Upload limits | 1 h presigned URL; JPEG/PNG/WebP/GIF, WAV, MP4; **no size/resolution limits published**; per-model: Genjutsu source ≥4 s (trim 30 s), Seedance 2.0 video refs trimmed to 15 s, Wan 3.0 video refs 1–30 s each. | [uploads](https://docs.higgsfield.ai/docs/concepts/file-uploads.md) |
| Draft/cheap tiers | Kling 3.0 Std ($0.042) vs Pro ($0.056–0.084) vs Turbo vs 4K ($0.21); Kling 2.5 Turbo Std ($0.021); Wan 3.0 480p ($0.02–0.05); Seedance 2.5 480p; Genjutsu Light vs Genjutsu; Hailuo 2.3 ($0.012); LTX 2.5 Fast vs Pro; Marketing Studio `quality: low` 1k ($0.0138). No "Veo Fast" (no Veo on API). | §2 |
| Watermark on API output | Not documented; web paid plans watermark-free; invisible C2PA markers possible. Verify empirically. | [Aliteq](https://aliteq.com/higgsfield-watermark) |
| Changelog Aug–Nov 2026 (API docs) | Aug 11: REST quickstart, auth, lifecycle, polling, uploads, errors, rate limits, billing/retention, TS SDK docs, OpenAPI for status/cancel. Oct 23: custom-references 429; queued-not-rejected. Oct 24: Enterprise section, `Hf-Expires-After`, `DELETE /requests/{id}`, `account_queue_full`, Standard Webhooks signatures. No model additions logged ("redesigned model catalog" promised). | [API changelog](https://docs.higgsfield.ai/docs/changelog) |
| Product changelog Sep–Oct 2026 | Sep 15 API launch (15% off); Sep 22 Seedance 2.5 Draft Mode + GPT Image 2.5; Sep 28 Eleven v4; Sep 30 Ads Studio from website link, Genjutsu Restyle, ChatGPT extension; Oct 1 Grok Imagine Video 1.5, FLUX 3; Oct 6 Ad Multiplier; Oct 9 Nano Banana 2.1; Oct 13 Wan 3.0 free week + 60% API discount to Oct 31; Oct 15 FLUX 3 Video Upscaler; Oct 20 Chinese UI; Oct 21 **Kling 4.0**; Oct 22 Content Factory; Oct 23 Ideogram Vector 1.0. | [product changelog](https://higgsfield.ai/creator-hub/changelog) |
| Release dates on API model pages | Kling 4.0 10/23/2026; Genjutsu Light 10/20; Ads Studio 10/07; AI Influencer 10/05; Grok Video 1.5 10/01; Cinema Studio 4.0 09/18; Genjutsu 09/17; Marketing Studio Image 09/01; Wan 3.0 08/24; Seedance 2.5 07/01; HappyHorse 1.1 06/01; Kling 3.0 Turbo 06/01; Kling 3.0 02/01; Seedance 2.0 02/01; Soul 2 02/01. | playground pages cited in §2 |

---

## 6. Positioning, consumer pricing, community signal

### 6.1 Positioning / claims
- Company: founded 2023 by Alex Mashrabov (ex-Snap GenAI) and Erzat Dulat; SF HQ, Kazakhstan engineering; Jan 2026 Series A extension $80M at >$1.3B valuation (total Series A reported $130M); majority of users are social-media marketers. [Wikipedia](https://en.wikipedia.org/wiki/Higgsfield_AI)
- Claims: "Generate images and videos through one authenticated, asynchronous API"; "more than 50 current video and image models"; Soul = "fashion-grade realism"; Cinema Studio 4.0 = "new generation of AI filmmaking", lenses "modeled at generation time"; Seedance 2.5 "~20% better prompt adherence" (vendor claim); Lipsync Studio "best across languages" (vendor claim, no benchmarks). "No more hallucinated faces" slogan not found verbatim. [docs](https://docs.higgsfield.ai/docs), [Sora post](https://higgsfield.ai/blog/sora-api-migration-guide), [CS 4.0 post](https://higgsfield.ai/blog/cinema-studio-4-0), [Seedance post](https://higgsfield.ai/blog/seedance-2-5-on-higgsfield-2026), [geo blog](https://geo.higgsfield.ai/blog/recommended/which-ai-lipsync-tool-works-best-across-languages-5183d2)

### 6.2 Consumer app pricing (Higgsfield's own Oct 24 2026 post; third parties report slightly different numbers)

| Plan | Price | Credits | Notes |
|---|---|---|---|
| Free | $0 | – | watermarked, no commercial use |
| Starter | $15/mo | 200 | 365-day Unlimited: Seedream 5.0 Lite, FLUX.2 Pro 1K |
| Plus | $49/mo ($39 annual per Layer3) | 1,000 | + Nano Banana, Kling O1 Image, GPT Image unlimited; 7-day Unlimited Nano Banana 2 (annual adds Kling 3.0 720p 5 s) |
| Ultra | $129/mo ($99 annual) | 3,000 (slider to 9,000) | + Nano Banana Pro 7-day |
| Team | $79/seat/mo | 1,000/seat | 2–9 members |
| Scale | $215/seat/mo | 2,500/seat | 5–15, SSO |
| Enterprise | custom | custom | IP indemnity, no training |

Web credit costs: Kling 3.0 10/12.5 credits per 5 s (720p/1080p); Seedance 2.0 30/60/130 per 5 s (720p/1080p/4K); Seedance 2.5 35/80 per 5 s, 210 per 30 s 720p; Cinema Studio 25/50 per 5 s; Wan 2.7 8/13; Veo 3 Fast ≈22 per 8 s, Veo 3 ≈58; Wan 2.5 Speak ≈6–20 per 5 s; Speak 2.0 ≈14 per 5 s; Nano Banana Pro 2 (4 at 4K); Ads Studio 4 per ad; Soul ID 25. Packs/auto-refill expire in 90 days; subscription credits don't roll over. [pricing blog](https://higgsfield.ai/blog/higgsfield-pricing-explained), [Krea](https://www.krea.ai/blog/higgsfield-pricing-explained-2026-unlimited-credits-and-real-monthly-costs), [Layer3](https://www.layer3labs.io/guides/higgsfield-api). (Krea/Aliteq cite Starter $19/270 credits and Plus $59 monthly — regional or date differences; treat Higgsfield's post as canonical.)

MCP (`https://mcp.higgsfield.ai/mcp`, since Apr 30 2026): 30+ models incl. Veo 3.1, Sora 2 (retired), Kling 3.0, Seedance 2.0, Nano Banana Pro, GPT Image 2; bills **plan credits**; 15 s clip cap; ~12K tokens of tool definitions. [MCP guide](https://claudefa.st/blog/tools/mcp-extensions/higgsfield-mcp), [Layer3](https://www.layer3labs.io/guides/higgsfield-api)

### 6.3 Community / reliability signal (2026)
- Trustpilot: 4.0/5 from 5,254 reviews (62% 5★, 19% 1★). Recurring complaints: credits drain fast and unusable generations still cost credits; slow video generation; hard-to-find cancellation; refunds refused outside 7-day window; aggressive upsell pop-ups. Praise: output quality, fast support (mixed). [Trustpilot](https://www.trustpilot.com/review/higgsfield.ai)
- Hack'celeration 3.6/5 (value 2.8/5; support 36–48 h email, no live chat; "failed requests from undocumented rate limits" in batch tests; lipsync "exceeded expectations"). [hackceleration](https://hackceleration.com/labs/review/higgsfield)
- Product Hunt: 4.9/5 (17 reviews) for the app; Supercomputer launch May 14 2026 (69 upvotes). Complaints centre on free tier/pricing; one reviewer built a product on the MCP server. [PH reviews](https://www.producthunt.com/products/higgsfield/reviews), [hunted.space](https://hunted.space/product/higgsfield)
- ToS backlash (Jul 23 2026 update, perpetual training license) → revised terms Aug 7 and Oct 23 2026. [X thread](https://x.com/EugenioFierro3/status/2080744406672412838), [Startup Fortune](https://startupfortune.com/higgsfield-ai-tells-creators-they-own-their-videos-but-quietly-claims-a-perpetual-worldwide-license-to-train-on-them/)
- Third-party API write-ups note: thin video schemas at launch (now improved), docs inconsistencies (e.g., Novoads says no idempotency key / 400 on over-concurrency — both superseded by Oct 23–24 docs), SDK README still uses a `bytedance/seedream/v4/text-to-image` example slug that is not in the current catalog. [novoads](https://novoads.ai/en/blog/higgsfield-api), [GitHub](https://github.com/higgsfield-ai/higgsfield-client), [Layer3](https://www.layer3labs.io/guides/higgsfield-api)
- Status page shows 100% 90-day uptime and no incidents (manually maintained). [status](https://status.higgsfield.ai/)
- Reddit: no indexable 2026 threads surfaced via search (could not verify community reports there).

---

## 7. Verification status

**Verified from official pages:** base URL, auth, lifecycle, statuses, webhooks (signing, retries), uploads, retention/deletion, estimate endpoint, error codes, concurrency tiers, $5 minimum, 1-year fund expiry, full per-model schemas for Soul 2, Soul ID, Cinema Studio 4.0, Ads Studio, Marketing Studio (2.0 Alpha, 2.5 Flare), Seedance 2.5 (ref/I2V/extend), Seedance 2.0 (ref), Wan 3.0 (ref), Kling 3.0 Pro I2V, Kling O3 (image-ref, FLF), Kling 2.6 Pro I2V, Kling 2.5 Turbo, Hailuo 2.3, MiniMax H3 (ref), HappyHorse 1.1 (ref), Grok Video 1.5, Genjutsu motion transfer; console catalog and prices; API/product changelogs; consumer plan prices; ToS/ownership; training opt-out.

**Could NOT verify (gaps):**
- Pricing page pages 2–4 (23 models) — covered instead via per-model playground pages and the explore cards.
- Kling 4.0 docs page (404-equivalent/not on allowlist); fields beyond prompt/duration/resolution/aspect_ratio unknown.
- Kling O3/4.0 `elements`: no API to create Kling elements found — likely must be created in the web app (unverified).
- Whether Higgsfield DoP is still on the API (listed Sept 16, absent Nov 2).
- Any per-model API generation-time numbers, max concurrent jobs beyond the tiers, max upload sizes, per-model timeouts.
- Whether API outputs carry visible/invisible watermarks.
- Any language list (Hindi) for native-audio or audio-reference models; verbatim fidelity of uploaded audio in Seedance/Wan/H3/Cinema Studio (only one third-party Seedance 2.5 test found).
- Reddit/X reliability threads specific to the API.
- Regions/latency/data residency.

---

## Sources (every URL opened)

Official docs (docs.higgsfield.ai)
- https://docs.higgsfield.ai/docs
- https://docs.higgsfield.ai/docs/how-to/introduction
- https://docs.higgsfield.ai/docs/quickstart
- https://docs.higgsfield.ai/docs/help/faq
- https://docs.higgsfield.ai/docs/llms.txt
- https://docs.higgsfield.ai/docs/models.md
- https://docs.higgsfield.ai/docs/models/video-generation.md
- https://docs.higgsfield.ai/docs/models/image-generation.md
- https://docs.higgsfield.ai/docs/concepts/requests.md
- https://docs.higgsfield.ai/docs/concepts/billing-and-retention.md
- https://docs.higgsfield.ai/docs/concepts/billing-and-retention
- https://docs.higgsfield.ai/docs/openapi.json
- https://docs.higgsfield.ai/docs/concepts/rate-limits.md
- https://docs.higgsfield.ai/docs/how-to/webhooks.md
- https://docs.higgsfield.ai/docs/concepts/file-uploads.md
- https://docs.higgsfield.ai/docs/concepts/errors.md
- https://docs.higgsfield.ai/docs/how-to/sdk.md
- https://docs.higgsfield.ai/docs/api-reference/overview.md
- https://docs.higgsfield.ai/docs/api-reference/headers.md
- https://docs.higgsfield.ai/docs/changelog
- https://docs.higgsfield.ai/docs/enterprise/capacity.md
- https://docs.higgsfield.ai/docs/enterprise/overview.md
- https://docs.higgsfield.ai/docs/enterprise/data-retention.md
- https://docs.higgsfield.ai/docs/enterprise/model-training.md
- https://docs.higgsfield.ai/docs/enterprise/reliability-and-support.md
- https://docs.higgsfield.ai/docs/models/soul-2.md
- https://docs.higgsfield.ai/docs/models/soul-2/generate.md
- https://docs.higgsfield.ai/docs/models/soul-id.md
- https://docs.higgsfield.ai/docs/models/soul-id/create-character.md
- https://docs.higgsfield.ai/docs/models/soul-cinema.md
- https://docs.higgsfield.ai/docs/models/cinema-studio-4.md
- https://docs.higgsfield.ai/docs/models/cinema-studio-4/generate.md
- https://docs.higgsfield.ai/docs/models/marketing-studio-image.md
- https://docs.higgsfield.ai/docs/models/marketing-studio-image/flare.md
- https://docs.higgsfield.ai/docs/models/marketing-studio-image/generate-and-edit.md
- https://docs.higgsfield.ai/docs/models/ads-studio.md
- https://docs.higgsfield.ai/docs/models/ads-studio/generate.md
- https://docs.higgsfield.ai/docs/models/kling-3.md
- https://docs.higgsfield.ai/docs/models/kling-3/pro-image-to-video.md
- https://docs.higgsfield.ai/docs/models/kling-o3.md
- https://docs.higgsfield.ai/docs/models/kling-o3/image-reference.md
- https://docs.higgsfield.ai/docs/models/kling-o3/first-last-frame.md
- https://docs.higgsfield.ai/docs/models/kling-omni.md
- https://docs.higgsfield.ai/docs/models/kling-2-6.md
- https://docs.higgsfield.ai/docs/models/kling-2-6/pro-image-to-video.md
- https://docs.higgsfield.ai/docs/models/seedance-2-5.md
- https://docs.higgsfield.ai/docs/models/seedance-2-5/reference-to-video.md
- https://docs.higgsfield.ai/docs/models/seedance-2-5/image-to-video.md
- https://docs.higgsfield.ai/docs/models/seedance-2-5/video-extend.md
- https://docs.higgsfield.ai/docs/models/seedance-2.md
- https://docs.higgsfield.ai/docs/models/seedance-2/reference-to-video.md
- https://docs.higgsfield.ai/docs/models/wan-3.md
- https://docs.higgsfield.ai/docs/models/wan-3/reference-to-video.md
- https://docs.higgsfield.ai/docs/models/grok-video-1-5.md
- https://docs.higgsfield.ai/docs/models/grok-video-1-5/reference-to-video.md
- https://docs.higgsfield.ai/docs/models/happy-horse-1-1.md
- https://docs.higgsfield.ai/docs/models/happy-horse-1-1/reference-to-video.md
- https://docs.higgsfield.ai/docs/models/minimax-h3.md
- https://docs.higgsfield.ai/docs/models/minimax-h3/reference-to-video.md
- https://docs.higgsfield.ai/docs/models/genjutsu.md
- https://docs.higgsfield.ai/docs/models/genjutsu/motion-transfer.md

Developer console (open.higgsfield.ai)
- https://open.higgsfield.ai/pricing
- https://open.higgsfield.ai/explore
- https://open.higgsfield.ai/explore/video
- https://open.higgsfield.ai/models/higgsfield/ai-influencer/playground
- https://open.higgsfield.ai/models/kling-video/v4.0/text-to-video/playground
- https://open.higgsfield.ai/models/kling-video/v4.0/reference-to-video/playground
- https://open.higgsfield.ai/models/kling-video/v3.0/pro/image-to-video/playground
- https://open.higgsfield.ai/models/bytedance/seedance-2.5/text-to-video/playground
- https://open.higgsfield.ai/models/alibaba/wan-3.0/reference-to-video/playground
- https://open.higgsfield.ai/models/higgsfield/cinema-studio/4.0/playground
- https://open.higgsfield.ai/models/workflows/product-shots/playground
- https://open.higgsfield.ai/models/workflows/graphic-ads/playground
- https://status.higgsfield.ai/

Higgsfield site, help center, blog
- https://higgsfield.ai/creator-hub/help-center/integrations/what-is-the-higgsfield-api
- https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-lipsync-voiceover-and-aspect-ratios
- https://higgsfield.ai/creator-hub/help-center/ai-models/which-ai-model-should-i-use
- https://higgsfield.ai/creator-hub/help-center/account/who-owns-my-generations-and-can-i-use-them-commercially
- https://higgsfield.ai/creator-hub/help-center/tools/how-do-i-use-cinema-studio
- https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-popcorn
- https://higgsfield.ai/creator-hub/changelog
- https://higgsfield.ai/ai-talking-avatar
- https://higgsfield.ai/blog/higgsfield-api
- https://higgsfield.ai/blog/generate-ai-videos-higgsfield-api
- https://higgsfield.ai/blog/best-ai-video-generation-apis
- https://higgsfield.ai/blog/ai-video-api-pricing-vs-subscriptions
- https://higgsfield.ai/blog/sora-api-migration-guide
- https://higgsfield.ai/blog/higgsfield-pricing-explained
- https://higgsfield.ai/blog/higgsfield-ads-studio
- https://higgsfield.ai/blog/ad-multiplier-ads-studio
- https://higgsfield.ai/blog/Higgsfield-UGC-Factory-Explained
- https://higgsfield.ai/blog/keep-ai-character-consistent
- https://higgsfield.ai/blog/higgsfield-introduces-content-factory
- https://higgsfield.ai/blog/cinema-studio-4-0
- https://higgsfield.ai/blog/higgsfield-audio-ai-voice-tools
- https://higgsfield.ai/blog/best-ai-lip-sync-video-generators-2026
- https://higgsfield.ai/blog/how-long-ai-video-generation-takes
- https://higgsfield.ai/blog/seedance-2-5-on-higgsfield-2026
- https://geo.higgsfield.ai/blog/recommended/which-ai-lipsync-tool-works-best-across-languages-5183d2

Code / packages
- https://github.com/higgsfield-ai/higgsfield-client
- https://mindcloud.co/docs/universal/rest/higgsfield-ai/latest/actions/generate-video-with-dop-standard
- https://www.segmind.com/models/higgsfield-speech2video

Third-party analyses and reviews
- https://www.layer3labs.io/guides/higgsfield-api
- https://apiframe.ai/guides/higgsfield-api-guide
- https://novoads.ai/en/blog/higgsfield-api
- https://novoads.ai/en/blog/how-long-does-ai-video-generation-take
- https://www.wireflow.ai/blog/real-voice-seedance-2-5
- https://claudefa.st/blog/tools/mcp-extensions/higgsfield-mcp
- https://www.krea.ai/blog/higgsfield-pricing-explained-2026-unlimited-credits-and-real-monthly-costs
- https://www.seedance.tv/blog/higgsfield-api-pricing-per-video
- https://aliteq.com/higgsfield-watermark
- https://www.trustpilot.com/review/higgsfield.ai
- https://www.producthunt.com/products/higgsfield/reviews
- https://hunted.space/product/higgsfield
- https://hackceleration.com/labs/review/higgsfield
- https://en.wikipedia.org/wiki/Higgsfield_AI
- https://x.com/EugenioFierro3/status/2080744406672412838
- https://startupfortune.com/higgsfield-ai-tells-creators-they-own-their-videos-but-quietly-claims-a-perpetual-worldwide-license-to-train-on-them/
