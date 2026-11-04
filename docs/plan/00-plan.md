# SOCIALADZGEN STUDIO v2 — Build Plan on Higgsfield + ElevenLabs

Nov 3, 2026 · @UdayInnovation

v2 replaces the RunPod/ComfyUI render farm and every open-weight video model with the Higgsfield API, keeps ElevenLabs for Hindi voice, and narrows the product to one job: 15–30 second Hindi/Hinglish social ads with a real hook, built from a brief or a pasted script, for Indian small businesses. Everything below is a from-scratch build; the v1 doctrine, audio assembly rules and the Director console are carried over, the GPU pod stack, the Episodes thesis and Remix-style features are not.

**Locked on 3 Nov 2026.** This plan is the build spec. Four constraints were added at lock time and override anything older in the sections below: (1) testing first, so there is no hosting, CDN, billing or public deployment until the pilot test passes; hosting is the last phase and the whole stack runs on the dev machine until then; (2) every LLM call goes through the existing free API keys (Gemini free tier first, Groq / NVIDIA NIM / OpenRouter free as fallbacks), never a paid LLM; (3) the UI is simple by default, like Higgsfield: a user sees brief → opening → making → your ad with one action per screen and no costs; models, ETAs, costs, the beat editor, storyboard approval and the Director's Cut live under an Advanced switch; (4) the stack is a TypeScript app and API with Python workers. **Amendment A (4 Nov 2026, end of this file) overrides constraint (3) and every UI line below: no money is displayed anywhere on the website, in either mode, and the voice and video model are chosen in Simple mode (model names, speed and detail are visible there; Advanced adds resolution, shot length and timing).**

## Decision summary

Move every pixel to the Higgsfield API, keep ElevenLabs for voice, keep the v1 doctrine, and rebuild the app around one 5-beat ad anatomy (Hook, Setup, Proof, Offer, CTA) instead of around a render farm.

The prototype never felt like an ad for three reasons, and only one of them was the GPU:

1. **Infrastructure ate the calendar.** 14 of the 33 walls in the v1 doc were pods, tunnels, disks or deployment. Every week spent on `pod.sh` was a week not spent on hooks.
2. **Open-weight models could not hold identity past one take.** Wan S2V redraws the whole frame each take, I2V conditions only the first frame, and seeds never were identity. Consistency v2 was a correct diagnosis (pixels over prompts) applied to models that cannot accept pixels as references.
3. **The planner wrote scripts, not ads.** Three "treatments" with no hook taxonomy, no beat timing, no offer line, no CTA rule. Voice was fitted after the picture instead of the picture being cut to the voice. Text was banned from frames and added later, so the first 2 seconds had nothing to stop a thumb.

What changes:

| Area | v1 prototype | v2 |
| --- | --- | --- |
| Picture generation | ComfyUI on one RunPod L40S, 204 GB of models, one job at a time, tunnel to a Mac | Higgsfield API: Soul for stills, reference-aware video models for shots, parallel jobs, zero GPU ops |
| Consistency | Composite keyframes, pinned seeds, Gemini identity check, 25 flags | Approved reference images passed natively to the models (character, product, room), same strict QC gate, no seeds |
| Scope | Ads + weekly animated shows + two-speaker dialogue + avatars | One job: 15–30 s Hindi/Hinglish social ads. Episodes thesis dropped |
| Script | Idea → three treatments | Brief → hook options → timed beat sheet → shot list → compiled prompts. Pasted scripts are fitted, never rewritten |
| Voice | `eleven_multilingual_v2`, fitted after render | Eleven v4 voice generated first from Devanagari; forced-alignment word times drive cut points and captions |
| Editing | Chat-first Director on a frame timeline | Director's Cut kept: beat-level timeline, swap take, re-voice, captions, end card; no Remix, no Episodes |
| Hosting | FastAPI on a Mac, in-memory jobs, no login | Hosted backend, durable job queue with webhooks, accounts, per-ad cost ledger |

What stays, unchanged: pixels over prompts; one subject per reference image; measure voice durations, never estimate; QC never fails open; hold the last frame until the voice finishes; silence map and sync report on every job; the prompt-craft chokepoint with a refuse-before-spend gate; small, flagged, tested changes.

## Keep, port or throw

Of the v1 surfaces, 3 are kept, 4 are ported into a different shape and 3 are thrown; of the 33 walls, 19 disappear with the GPU stack and 6 stay real on the new one.

**Surfaces and features**

| v1 item | Verdict | In v2 |
| --- | --- | --- |
| Create (brief, three treatments, aspect, preset) | Port | The New Ad wizard. Presets become Draft / Standard / Master, each mapped to a model tier, and the planner returns hooks before treatments |
| Director console on the Timeline page | Keep | Director's Cut: a beat-level timeline with swap take, re-voice, captions, end card, fit audio, export |
| Sequence (mix engines per segment) | Port | Folded into Director's Cut; the model per shot is chosen by the router, overridable per shot |
| Dialogue (shot / reverse-shot, one voice each) | Port | A template ("Two-person testimonial"), not a surface; one speaker per beat, same models |
| Episodes, Show Templates, weekly show thesis | Throw | Out of scope. Only the "locked cast" idea survives as Brand Faces in the Brand Kit |
| Avatars (saved face + voice) | Port | Brand Faces: a Soul ID character paired with an ElevenLabs voice, approved once, reused across ads |
| Library (enhance, revoice, re-dub, sync check, cover) | Keep | Ads library with versions; revoice and re-caption stay, enhance moves to Higgsfield upscale |
| Brand Lock (LTX IC-LoRA ingredients) | Throw | Replaced by product reference images passed to reference-aware models |
| Re-dub (LTX LipDub) | Replace | Re-voice a beat in the Director's Cut; true lip-sync waits for the v2.1 adapter (see the talking-actor decision in Model routing) |
| "The Journey" cinematic format | Port | The "Brand film 30 s" template |
| End card | Keep | Compositor renders logo, offer, CTA, QR/WhatsApp number as a final 2–3 s card |
| Remix-style regeneration of a finished ad | Throw | Replaced by per-shot "Swap take" and "Change hook"; no whole-ad remix |

**Pipeline and doctrine**

| v1 item | Verdict | In v2 |
| --- | --- | --- |
| Prompt-craft chokepoint, vagueness gate (<40/100 refused before spend) | Keep | One compiler turns a shot into model-specific prompts and reference bindings; a score gate runs before any paid call |
| Reference registry with lineage and approval API | Keep | The spine of Consistency v3; approval stays mandatory in Master |
| Composite keyframes via Qwen-Image-Edit, scene master, turnaround crop | Replace | Soul / Soul ID stills become the approved references; the room plate, face and product are three separate references, never a composite sheet |
| Pinned seeds as a consistency tool | Throw | Seeds are logged for reproducibility only |
| Identity QC with tri-state verdicts, strict QC, honest provenance | Keep | One vision judge on the free-tier chain (locked 3 Nov 2026: no paid LLM), temperature 0.1, "could not judge" = unknown; Master blocks on unknown, Draft warns |
| Audio assembly: measure voice, fit ≤1.12x, real mix levels, lanes pinned, hold last frame, silence map, sync report | Keep, inverted | Voice is generated first; shot durations are cut to the voice, not the other way round |
| Devanagari for all spoken Hindi | Keep | Script Brain stores Devanagari for voice and Latin Hinglish for on-screen text separately |
| No text in video prompts; text added by the compositor | Keep for video | Hero stills may carry product text when the image model renders text reliably; all captions, prices and offers stay in the compositor |
| Async planner with job id and polling | Keep | Every step is an async job with a webhook; the UI subscribes |
| Feature flags, characterization tests, small diffs | Keep | Fewer flags (per-model routing, not per-fix) |
| Checkpoint / resume | Keep | Each pipeline step is idempotent and cached by content hash |

**Infrastructure and models**

| v1 item | Verdict | In v2 |
| --- | --- | --- |
| RunPod pods, `pod.sh`, network volume, fp8 backends, 204 GB of weights | Throw | Gone entirely |
| Wan 2.2 T2V / I2V / S2V, LTX-2.3, LongCat, FLF2V | Throw | Higgsfield-hosted models per the routing table |
| CodeFormer, SeedVR2, RIFE polish chain | Throw | Higgsfield upscale / enhance only when the delivery needs 1080p+ |
| Gemini planner with NVIDIA and Groq free-tier fallbacks | Keep, hardened | One paid primary LLM and one paid fallback come later as a config change, when budget allows. For now, free tiers only (no LLM budget): Gemini's free tier as primary, Groq and NVIDIA NIM free tiers and OpenRouter free models as fallbacks, with v1's fixes made mandatory: retry delays honoured, model ids in config, the judge on its own key and quota, a daily canary that drops a dead id |
| FastAPI on a Mac behind a Cloudflare quick tunnel | Throw | Hosted API with a durable queue |
| SQLite, jobs in memory | Replace | Postgres + object storage; jobs persisted |
| Next.js studio on Vercel | Keep | Rebuilt from scratch, same hosting |
| Open decisions H-1 (CodeFormer licence), H-2 (LTX licence), H-4 (FAST vs QUALITY shows) | Closed | Moot without the open-weight stack |
| Open decision H-3 (does QC block when the judge cannot decide) | Decide now | Master: block and re-roll once. Standard and Draft: warn in the Director's Cut |

**Walls that stay real on the new stack**

| Wall | Why it survives | v2 answer |
| --- | --- | --- |
| Dead air when the script is shorter than the video | Any fixed-length clip can outlast its line | Cut every shot to its voice segment plus a tail; never pad with silence |
| Characters drift between shots | Reference-aware models reduce it, they do not remove it | Approved references on every call, identity QC per shot, one re-roll, then the Director's Cut flags it |
| Garbled on-screen text | Video models still cannot be trusted with Devanagari | Compositor owns all text |
| Two people talking in one frame | Still the hardest shot | Shot / reverse-shot template by default; single-frame two-speaker only where a model proves it |
| Planner latency | LLM calls take tens of seconds | Async everywhere, streamed hook options first |
| Content moderation false positives | Hosted APIs reject some prompts | Prompt compiler avoids trigger words; one automatic rephrase, then surface the refusal |

## Product definition

SOCIALADZGEN STUDIO v2 does one job: from product photos and a brief (or a pasted script), it makes a 15 or 30 second vertical ad in Hindi/Hinglish that opens with a real hook and ends with an Indian CTA, in about 10 minutes. Simple mode shows the chosen voice and model and one coarse time; Advanced mode also shows which model is working on each shot and how long it will take. It never shows what anything costs (Amendment A).

**Who it is for.** Indian small businesses and the freelancers who run their social pages: kirana and grocery, D2C beauty and fashion, salons, clinics, coaching institutes, jewellers, gyms, restaurants and cloud kitchens, mobile and electronics shops, real estate. They post to Instagram Reels, YouTube Shorts, WhatsApp status and Meta ads, and they compare the tool with hiring an agency, not with Higgsfield (internal context; never a figure on the website). The tool does not make ads for them as a service; it makes them able to.

**Three ways in.**

1. **Auto** — a brief (what you sell, who buys it, the offer, the vibe) and 1–5 product or shop photos. Script Brain proposes 3 hooks, the user picks one, the ad is made.
2. **Script** — the user pastes their own script in Hindi, Hinglish or English. The words are kept; Script Brain fits them to the beat anatomy, proposes a hook line only if the script has none, and times the shots to the voice.
3. **Campaign** — pick a festival or a moment (Diwali, IPL, wedding season, end-of-season sale, a trend from the feed). The brief arrives pre-filled with the angle, palette and CTA for that moment.

**Three pillars.**

| Pillar | What it owns | Why it is separate |
| --- | --- | --- |
| Script Brain | Hooks, beat sheet, Hinglish copy, CTA, campaign and trend awareness, shot list, compiled prompts | The ad is decided here; pixels only execute it. It runs on an LLM, costs cents, and can be iterated without a paid render |
| Shot Engine | Reference lock (face, product, room), model routing, parallel Higgsfield calls, ElevenLabs voice, QC, assembly, reframes | It is the only part that spends money; every call is budgeted, cached and logged |
| Director's Cut | Approve references, swap a take, change the hook, re-voice, captions, end card, export variants | Humans fix the last 10% in minutes; the tool never silently ships a weak shot |

**Outputs per ad.** A 9:16 master; 1:1 and 16:9 reframes; a 15 s and a 30 s cut when both were asked; 2–3 hook variants for A/B; burned-in and sidecar (SRT) captions in Devanagari or Latin Hinglish; a cover frame; an end card; the voice-over as a separate file; a cost and model ledger.

**Languages.** Hindi and Hinglish first, English second, then Marathi, Tamil, Telugu, Bengali, Gujarati, Kannada through the same voice and caption path once the Hindi path is proven.

**Non-goals.** Long-form, episodic shows, cloning a real person's face or voice without recorded consent, celebrity likeness, political or health-claim ads, and any whole-ad "remix" that regenerates everything at once.

## Anatomy of a 15 s and a 30 s ad

Every template, every pasted script and every render in v2 resolves to the same five beats, and the first beat is the one the prototype never had.

| Beat | 15 s cut | 30 s cut | What happens | Shots |
| --- | --- | --- | --- | --- |
| 1. Hook | 0–2.5 s | 0–3 s | A line that is a question, a pain, a number or a dare; a text card on screen from frame 1; the product or the face already visible | 1 |
| 2. Setup | 2.5–6 s | 3–9 s | The buyer's problem or wish, in the buyer's words ("Shaadi mein 10 din bache hain…") | 1–2 |
| 3. Proof | 6–11 s | 9–20 s | The product in use: demo, before/after, testimonial, unboxing, the shop itself | 2–3 |
| 4. Offer | 11–13 s | 20–25 s | The number: price, % off, buy-1-get-1, no-cost EMI, COD, festival deal, and the deadline | 1 |
| 5. CTA + end card | 13–15 s | 25–30 s | "WhatsApp karo", "Abhi order karein", "Visit karo"; number, address or QR; logo; brand sting | 1 + end card |

**Budgets Script Brain plans to** (planning numbers; the real durations always come from the measured voice file):

- Hindi ad voice-over runs about 2.5 words per second. A 15 s ad carries 30–38 spoken words, a 30 s ad 65–80. The hook line is at most 8 words.
- 15 s = 4–5 shots; 30 s = 7–9 shots. No shot longer than 5 s except the end card, so every shot fits one generation and the cut rate stays at one every 2–4 s.
- Beat 1 is generated at the highest tier the preset allows and gets the first QC pass, because the thumb decides there.
- The product appears by second 3 and in at least half of the shots. One person per frame; the same person in every people shot.

**The "it feels like an ad" checklist.** Script Brain plans to it, QC scores against it, and the Director's Cut shows it as a scorecard before export:

- [ ] A text hook is on screen within 0.5 s and the spoken hook ends by 2.5 s
- [ ] The hook is one of the library types (question, pain, number, dare, before/after, POV, festival), not a product description
- [ ] Product or shop visible in the first frame and in ≥ 50 % of shots
- [ ] The same face in every people shot; identity QC passed or the shot is flagged
- [ ] Voice energy follows the beats: hook punchy, setup conversational, proof steady, offer excited, CTA warm
- [ ] The offer is one concrete fact (a size, a date, delivery, COD; no price or % until D11) with a deadline or a scarcity line
- [ ] A CTA Indians use (WhatsApp, call, visit, order link) and the end card holds it for ≥ 2 s with a readable number
- [ ] Captions on, one script system throughout (Devanagari or Latin Hinglish), inside the platform safe zone
- [ ] Music bed ducked under the voice; a sound hit on the first cut and on the offer
- [ ] A cut every 2–4 s; no dead air, no silent mouths, no held frame longer than 1 s
- [ ] Brand colours on captions and end card; logo in the last 3 s
- [ ] No garbled text, extra fingers, warped product, or face drift in any kept shot
- [ ] Campaign cue present when in Campaign mode (festival object, colour, greeting)
- [ ] AI-generated label applied where the platform or ASCI requires it

## Architecture

Three services behind one API: Script Brain decides the ad with an LLM, the Shot Engine is the only component that spends money on Higgsfield and ElevenLabs, and the Compositor assembles the final file with ffmpeg.

```
                 ┌──────────────────────────── SOCIALADZGEN STUDIO v2 ────────────────────────────┐
                 │                                                                                  │
   Owner ──► Web app (Next.js, TS) ──► API (TS) ──► Job queue (Redis) ──► Python workers            │
                 │   Simple / Advanced          │                          ├─ Script Brain (free LLM chain)
                 │   SSE progress               │                          ├─ Shot Engine (router, adapters, QC judge)
                 │                              │                          └─ Compositor (ffmpeg)
                 │                              ▼                                   │
                 │                     Postgres (ads, beats, shots, takes,          ▼
                 │                     jobs, ledger, content_*)            Object store (MinIO local; R2 in Phase 4)
                 └──────────────────────────────────────────────────────────────────────────────────┘
   Outside systems: Higgsfield API (pixels) · ElevenLabs (voice, alignment, music, SFX) · free LLM tiers (Gemini / Groq / NVIDIA / OpenRouter) · platforms (Meta, YouTube, WhatsApp) via the owner's phone
```

The web app never calls a provider directly. Every provider call goes through the Shot Engine so it can be budgeted, cached by content hash, retried once, logged with its model and cost (internal ledger), and shown in the UI as "Kling 3.0 Pro, about 2 min" (Advanced) or "about 2 min" (Simple). Cost never reaches the UI (Amendment A). Provider webhooks land on the API, which pushes live job updates to the browser.

**Screens (designed before the lock; the Simple/Advanced rules below override the "always visible" column: in Simple mode no per-shot ETA is shown; in no mode is a cost, credit, balance or price shown; model and voice are picked in Simple, per Amendment A)**

**Service boundaries**

- **Script Brain** is stateless and cheap. It can be re-run on a brief as many times as the user likes before a single rupee is spent on pixels. Its outputs are plain JSON (hooks, beats, shots, compiled prompts) stored on the ad.
- **Shot Engine** owns the per-ad job graph. Each node (voice, still, video, QC, assemble, reframe) is an idempotent step keyed by a content hash of its inputs, so changing one shot re-renders one shot.
- **Compositor** is deterministic: the same shots, voice file, captions and brand kit always produce the same master. It runs on CPU and never calls a provider.
- **Content system** is data, not code: templates, the hook library, the festive calendar and the trend feed are JSON documents an admin can edit without a deploy.

**Hosting (recommended).** nothing is hosted until the pilot test passes; until then everything runs on the dev machine: the Next.js dev server, the Python workers, Postgres in Docker, a local folder (MinIO when needed) for objects, and a Cloudflare quick tunnel only when a pilot tester needs to try it. Then: Next.js on Vercel; the API and workers as one containerised service on Fly.io or Railway (Mumbai region for latency to Indian users; providers are US-hosted either way); Postgres (Neon or Supabase); Cloudflare R2 for objects with its CDN; a Redis-backed queue (Celery or arq on the Python workers, enqueued by the TypeScript API). One repository, one deploy, no tunnels, no Mac.

## Render pipeline

Ten stages run for every ad, and money is spent only from stage 6 on: everything before the video call is free or costs rupees, and everything after it is deterministic.

```
 1 Brief / script ─► 2 Hooks (6, scored) ─► 3 Beat sheet + shot list ─► 4 Compile prompts (score ≥ 40)
 ─► 5 Voice (Eleven v4) + forced alignment: beats get measured start/end
 ─► 6 Stills (Soul 2 / Marketing Studio)  ══ GATE 1: approve stills (auto in Simple, Draft, Standard; human in Master) ══
 ─► 7 Video per shot (Wan 3.0 / Kling 3.0 Pro / Kling O3 / Kling 4.0 / Seedance 2.5), approved still = first frame
 ─► 8 QC judge (8 frames + refs; pass / fail / unknown)  ══ GATE 2: fail or unknown → one re-roll with the judge's hint → else "needs attention" ══
 ─► 9 Assemble (cut to voice, captions, music duck, SFX, end card, loudnorm)
 ─► 10 Reframe + export (9:16 master, 1:1, 16:9, bumper, SRT, cover, static creatives)
 Money is spent from stage 6 on; everything after stage 8 is deterministic.
```

The two gates are deliberate. Stills before video means a bad face or a wrong product is caught for a few rupees, not a few hundred; the QC gate re-rolls once with the judge's own hint and then flags the shot instead of hiding it. The first cut is playable as soon as beat 1 has a passing take, so the user watches the ad assemble beat by beat. Every stage writes its model, duration and cost to the job, which is what the status bar in the UI reads.

## Model routing

Every pixel job maps to a model that is on the Higgsfield REST API as of 2 Nov 2026 (Soul 2, Soul ID, Marketing Studio Image, Wan 3.0, Kling 3.0 / O3 / 4.0, Seedance 2.5, Genjutsu, Cinema Studio 4.0); the one job the API does not offer, lip-syncing an actor to ElevenLabs audio, is handled by a voice-over-led default and an optional third-party adapter.

Two facts from the research shape this table. The API is a curated subset of the web app: no Veo, no Nano Banana, no Popcorn, no upscale, and none of the Lipsync Studio models (Speak 2.0, Kling Lipsync, Sync) are exposed ([catalog](https://open.higgsfield.ai/explore), [lipsync help](https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-lipsync-voiceover-and-aspect-ratios)). And pricing is a prepaid USD balance, per second of video, with `POST /estimate/<slug>` returning the exact price before a call ([billing](https://docs.higgsfield.ai/docs/concepts/billing-and-retention)).

| Job | Draft | Standard | Master | Rule |
| --- | --- | --- | --- | --- |
| Brand Face identity | [Soul ID](https://docs.higgsfield.ai/docs/models/soul-id/create-character.md) training, v2, $2.50 once | same | same | 10–30 consented photos; the id goes into every Soul call as `custom_reference_id` |
| Storyboard stills, people and scenes | [Soul 2](https://docs.higgsfield.ai/docs/models/soul-2/generate.md) 720p, batch 4, $0.0057/img | Soul 2 1080p, batch 4 | Soul 2 1080p + Soul Cinema for the hero still | 4 candidates per shot cost 2 cents; the approved one becomes the video's first frame |
| Product stills | [Marketing Studio Image](https://docs.higgsfield.ai/docs/models/marketing-studio-image/generate-and-edit.md) preset, 1k, $0.014 | same, 2k high, \~$0.15 | same, 4k, $0.61 | Product photo is image 1, Brand Face image 2; presets list from `GET /marketing-studio/image/presets` |
| Product hero and B-roll video | [Wan 3.0](https://docs.higgsfield.ai/docs/models/wan-3/reference-to-video.md) I2V 480p, $0.05/s list ($0.02 discounted), 2–30 s | [Kling 3.0 Pro](https://docs.higgsfield.ai/docs/models/kling-3/pro-image-to-video.md) I2V 1080p, $0.112/s list ($0.056), 3–15 s, `sound off` | [Kling 4.0](https://open.higgsfield.ai/models/kling-video/v4.0/reference-to-video/playground) ref→V 1080p, $0.235/s list ($0.11) | Shot durations are exact (Wan 2–30 s, Kling 3–15 s), so billed seconds ≈ used seconds + 1 s tail |
| Shot with face + product + room together | Wan 3.0 ref→V, ≤10 image refs | [Kling O3](https://docs.higgsfield.ai/docs/models/kling-o3/image-reference.md) image-reference, $0.042–0.084/s | [Seedance 2.5](https://docs.higgsfield.ai/docs/models/seedance-2-5/reference-to-video.md) ref→V 720p, ≤30 refs, \~$0.5/s, or [Cinema Studio 4.0](https://docs.higgsfield.ai/docs/models/cinema-studio-4/generate.md) with `<<<image_n>>>` binding | Ordered references: face first, product second, room third; one subject per reference image |
| Talking actor (hook, CTA) | VO-led: Soul still → Wan 3.0, actor reacts, no mouthing | VO-led: Soul still → Kling 3.0 Pro, `sound off` | VO-led, plus an external lip-sync pass once the adapter passes the Hindi bake-off | See "The talking-actor decision" below |
| Before / after, seamless cut | Kling O3 [first-last-frame](https://docs.higgsfield.ai/docs/models/kling-o3/first-last-frame.md) std | same, pro | same, 4k | Both stills approved first; also Kling 3.0 `last_image_url` and Seedance 2.5 `end_image_url` |
| Template re-shoot | [Genjutsu Light](https://open.higgsfield.ai/explore/video) motion transfer, $0.05/s list | [Genjutsu](https://docs.higgsfield.ai/docs/models/genjutsu/motion-transfer.md) motion transfer 720p, $0.318/s list | Genjutsu 1080p | A proven template video re-shot with the client's product and Brand Face (1–8 refs); this is what Higgsfield's own Ad Multiplier runs on |
| Brand film, one 15–30 s take | — | — | Cinema Studio 4.0 720p, $0.21–0.46/s, 33 camera moves, 50 palettes | Master only; cut into beats afterwards by the compositor |
| Static companion creatives | [Ads Studio](https://docs.higgsfield.ai/docs/models/ads-studio/generate.md) \~$0.084/img | same | same | Every video ad can ship with 2 feed images from the same brief; text on them is checked by QC, not trusted |
| Longer than 15 s in one shot | Wan 3.0 up to 30 s | Seedance 2.5 [video-extend](https://docs.higgsfield.ai/docs/models/seedance-2-5/video-extend.md) | same | Rare; the anatomy cuts every 2–4 s anyway |
| Upscale | none | none | none | Not on the API; render at 1080p natively instead |
| Voice, captions, SFX, music | ElevenLabs (next section) | same | same | Voice first; word timestamps drive cut points |
| Planner and QC judge | Gemini free tier (vision-capable Flash) + Groq, NVIDIA NIM and OpenRouter free fallbacks | same | same | Free tiers for now by decision; temperature 0.1 for the judge and the compiler; judge on its own key; paid primary later as a config change |

**The talking-actor decision.** No endpoint on the API lip-syncs a face to an uploaded file; the audio-reference arrays on Wan 3.0, Seedance 2.5 and Cinema Studio 4.0 guide a model to re-voice the line, and the only independent test found it verbatim in close-ups and recomposed in wide shots ([Wireflow test](https://www.wireflow.ai/blog/real-voice-seedance-2-5)). So:

1. **v2.0 ships VO-led presenters.** The Brand Face is on screen reacting, holding, pointing, smiling; the Hindi voice is narration. Most Indian SMB ads already work this way, and it removes the hardest failure mode of v1.
2. **v2.1 adds one lip-sync adapter** after a bake-off on 10 Hindi lines: Sync Labs `lipsync-2-pro`, Higgsfield Speak v2 as hosted on Segmind (image + WAV, 5/10/15 s), and Kling lip-sync via its own API. The winner unlocks the "Talking head" templates. This is the one place a third provider enters.
3. **Experiment, not promise:** Wan 3.0 or Seedance 2.5 with the ElevenLabs file as `audio_urls`, accepted only when ElevenLabs speech-to-text of the output matches the script; Draft tier only.
4. **Experiment:** "Act it yourself": the owner records the line on a phone, Genjutsu swaps in the Brand Face and scene, ElevenLabs speech-to-speech swaps the voice while keeping the timing. If Genjutsu preserves mouth motion, this gives lip-sync with no lip-sync model.

**Fallback and operations rules**

- A model that returns `failed` twice, `423` or `503` steps down one tier for that shot and says so in the Director's Cut. A terminal `nsfw` status (input or output) triggers one compiler rephrase, then surfaces the refusal in plain words.
- `POST /estimate/<slug>` runs before every paid call; the sum is the estimate on the Render button; the ledger stores the actual.
- Outputs expire in 7 days ([retention](https://docs.higgsfield.ai/docs/enterprise/data-retention.md)); the worker downloads every result to object storage before marking the step done.
- Concurrency is 2 until the account holds $25, 10 at $25, 20 at $100, 40 at $1,000 funded in 28 days ([pricing](https://open.higgsfield.ai/pricing)); keep $100+ funded and run the job graph at concurrency minus 2.
- Turn the training opt-out on in the console: client product photos and faces must not train Higgsfield's models ([model training](https://docs.higgsfield.ai/docs/enterprise/model-training.md)).
- Webhooks are signed (Standard Webhooks); verify the signature and dedupe on `webhook-id` ([webhooks](https://docs.higgsfield.ai/docs/how-to/webhooks.md)).
- Discounts on the catalog are time-limited (15–75 % off list); budget at list price.

## Voice and sound

The voice is generated first with Eleven v4 from Devanagari text, measured, and aligned word by word; the picture is cut to it, the captions are drawn from it, and the music and SFX are laid under it, all from ElevenLabs, for about $0.15 per ad.

**Model choice.** [Eleven v4 and v4 Turbo](https://elevenlabs.io/blog/eleven-v4) shipped on 28 Sep 2026 with Hindi and 13 other Indic languages, better audio-tag adherence than v3, and IPA pronunciation rules for non-English text; v3 is now the previous generation and Turbo v2.5 is deprecated in favour of Flash.

| Use | Model | Why | Price |
| --- | --- | --- | --- |
| Final voice-over | `eleven_v4` | Best Hindi quality, audio tags, IPA for brand names, professional voice clones | $0.08 per 1k characters |
| Beat previews while editing | `eleven_v4_turbo` | Same voice family, \~100 ms latency | $0.04 per 1k |
| Number-heavy or flat reads | `eleven_multilingual_v2` | Best number normalisation and the only model with a `speed` control (0.7–1.2) | $0.08 per 1k |
| Bulk drafts | `eleven_flash_v2_5` | Cheapest; weaker on numbers | $0.04 per 1k |

A 30 s Hindi VO is 450–600 characters: $0.036–0.048 on v4, three takes about $0.14 ([pricing](https://elevenlabs.io/pricing/api)). PAYG top-ups can be in INR with a ₹500 minimum ([usage billing](https://elevenlabs.io/docs/overview/pricing/usage-based-billing)).

**Script rules the localizer enforces** (the v1 finding that Latin Hinglish produces worse speech holds: a third-party test in Sept 2026 found Latin-script Hinglish read with English vowel rules, while a Devanagari sentence with one Latin English word read cleanly — [elevenlabs Hindi page](https://elevenlabs.io/text-to-speech/hindi)):

- Devanagari matrix; brand names and short English words in Latin inside it; `language_code: "hi"` on every call.
- No Hindi text normaliser exists on ElevenLabs, so the localizer spells out ₹, lakh and crore grouping, percentages, dates and phone numbers in Devanagari words before sending (₹1,20,000 → एक लाख बीस हज़ार रुपये).
- Brand names that still mispronounce: Devanagari respelling first, then an inline IPA override on v4, then a versioned pronunciation dictionary.
- Emotion through [audio tags](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/prompting/v3): `[excited]`, `[whispers]`, `[curious]`, `[short pause]`, `[long pause]`, described voice quality for anything else; tags stay in English. One energy tag per beat from Script Brain's energy field.
- No `speed` on v4: pacing comes from punctuation, line breaks and pause tags; if a beat must hit a duration, the compositor time-stretches at most ±5 %.
- Stability 0.35–0.45 for ad reads, `similarity_boost` 0.75, a fixed `seed`, `previous_text` / `next_text` between beats so beat 2 does not restart cold; three takes of the hook, one of each other beat.

**Voices.** The Brand Kit stores one voice id per brand, chosen from the [Voice Library](https://elevenlabs.io/docs/api-reference/voice-library/get-shared-voices) filtered by `language=hi` and `use_cases=advertisement`, auditioned on a real ad line with numbers. ElevenLabs promotes Hindi voices such as Bunty ("punchy, reel-focused"), Niraj, Monika Sogam and Devi; premade default voices expire on 31 Dec 2026, so none is hard-coded. A business owner can clone their own voice (Instant Voice Clone from 1–2 min with the consent checkbox; Professional Voice Clone from 30 min on Creator and above, own voice only). Voice Design (`eleven_ttv_v3`) makes a new brand voice from a description that names the language and region in its first sentence.

**Captions and cut points.** [Forced Alignment](https://elevenlabs.io/docs/api-reference/forced-alignment/create) takes the audio file plus the script and returns `words[]` with start and end times: the cleanest route to karaoke-style Devanagari captions and to the beat boundaries the compositor cuts on. The `with-timestamps` TTS endpoint is the fallback (character-level; words are rebuilt by grapheme cluster for Devanagari). Scribe v2 speech-to-text (Hindi in the high-accuracy tier, word timestamps, SRT output) verifies any experiment where a video model generated its own speech.

**Music and SFX.** [Eleven Music](https://elevenlabs.io/docs/api-reference/music/compose) (`music_v2_5`, 3 s–10 min, `force_instrumental`) makes the bed per ad for $0.15 per minute; the Music Terms permit all online commercial use including social ads from the Starter plan up (TV and radio need Enterprise) ([music terms](https://elevenlabs.io/music-terms)). Vocals are not offered in Hindi, so beds are instrumental, prompted by the campaign pack ("festive dhol-light, 100 bpm, no vocals"). [Sound effects](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert) (`eleven_text_to_sound_v3`, 0.5–30 s) supply the whoosh on cut 1, the ting on the price, the WhatsApp pop on the CTA.

**Assembly rules kept from v1, now with the voice first**

1. Generate and measure every beat's voice before any shot is planned; store the alignment with the beat.
2. Cut each shot to its beat's words plus a 0.3 s tail; never pad with silence; never trim a word.
3. Mix at real levels (`amix normalize=0`), music ducked 12 dB under speech with 150 ms attack, SFX at hits only.
4. Hold the last frame only on the end card, where the voice finishes under the number.
5. Two-pass `loudnorm I=-14:TP=-1:LRA=11` on the final mix, since ElevenLabs sets no loudness target; output `mp3_44100_192` or `pcm_44100` for the voice track.
6. Silence map and sync report on every job; a gap over 0.4 s inside a beat is a warning the Director's Cut shows.

**Plan tier.** Creator ($22) covers about 460 single-take ads a month and unlocks 192 kbps MP3, library voices via API and one professional clone; Pro ($99) adds 44.1 kHz PCM and \~2,000 ads. Commercial use starts at Starter; the Free tier has no commercial rights.

**What ElevenLabs does not do.** Dubbing has no lip-sync, and the lip-sync models inside ElevenCreative are third-party and not on the API; the talking-actor decision in Model routing stands.

## Consistency v3

Consistency v3 keeps v1's rule, approved pixels are the truth, and moves the enforcement into the models' own reference inputs: every call carries the approved face, product and room images in the same order, the approved still is the first frame of every video, and the judge compares every take against the same three images.

**Three reference kinds, one subject each**

| Reference | How it is made | How it is used | Cost |
| --- | --- | --- | --- |
| Face (Brand Face) | Either 10–30 consented photos of a real person, or an AI actor: Soul 2 makes 4 candidates, the user approves one, Soul 2 generates 20 views of it (front, ¾, profile, smiling, holding), and those train a [Soul ID](https://docs.higgsfield.ai/docs/models/soul-id/create-character.md) | `custom_reference_id` on every Soul 2 still; the approved front still is image 1 on every video call; identity QC target | $2.50 per training, about 5 minutes |
| Product | Upload → background removed and label kept sharp (Qwen Image 3 edit or Marketing Studio Image) → one product per image | Image 1 in Marketing Studio product stills; image 2 on video calls; product-fidelity QC target | cents |
| Room or set | A shop photo, or a generated set with no people (Soul 2) | Image 3 on video calls; room-continuity QC target; keeps the background the same between cuts (v1's "rooms re-invented" wall) | cents |
| Style (optional) | A Soul `style_id` from `GET /v1/text2image/soul-styles/v2` and, for brand films, a Cinema Studio colour palette | Same look across every still of a brand | free |

**Rules**

1. One subject per reference image. Multi-panel sheets, collages and turnaround grids are never sent; v1 proved they leak their layout into the video.
2. Ordered references, always face, product, room, so the compiled prompt can say "the person in image 1 holds the product in image 2 in the room in image 3" and the Cinema Studio `<<<image_n>>>` tokens line up.
3. The approved still is the first frame. Image-to-video from approved pixels drifts least; multi-reference models are used only when two subjects must move in one shot.
4. Chain at most two clips by last frame → first frame before re-anchoring on an approved still, which is Higgsfield's own guidance ([Soul ID post](https://higgsfield.ai/blog/keep-ai-character-consistent)).
5. Every take is judged against the references with tri-state verdicts; Master blocks on fail or unknown, Standard warns, Draft shows the badge.
6. Seeds are logged for reproducibility and never used as a consistency tool.
7. A reference is immutable once approved and carries lineage (`parent_id`, the model and prompt that made it, who approved it). Changing a Brand Face re-trains the Soul ID and marks every still that used the old one as stale (v1's WP2.5a, kept).
8. Originals stay at full resolution in storage; a copy no larger than 2048 px is what the API receives.

**Template re-shoot, the strongest consistency lane.** A template is a finished, proven ad video (its motion, cuts and timing already judged good). [Genjutsu motion transfer](https://docs.higgsfield.ai/docs/models/genjutsu/motion-transfer.md) re-shoots it with 1–8 new reference images, so the client's product and Brand Face replace the template's while every cut lands where it did. This is what Higgsfield's own Ad Multiplier runs on ([Ad Multiplier](https://higgsfield.ai/blog/ad-multiplier-ads-studio)), and it turns the template library into a consistency device: the first client pays for exploration, the hundredth gets a re-shoot.

**What v1 kept that still matters.** The reference registry, the approval API with a named approver, content-hash resume, and the rule that a judge who cannot see enough answers "unknown", never "pass".

## Script Brain

Script Brain turns a brief into hooks first, then a timed beat sheet, then a shot list, then compiled prompts, in seven LLM steps that cost cents and run before any pixel is paid for; a pasted script goes through the same steps with its words frozen.

**The seven steps (Auto mode)**

| Step | Input | Output | Model settings |
| --- | --- | --- | --- |
| 1. Brief intake | Wizard fields, product photos (vision-described), brand kit, campaign pack | `Brief` JSON: business, category, product facts, audience, offer, CTA type, language and register, tone, platform, duration, must-say / never-say | temp 0.2, JSON schema |
| 2. Hooks | Brief + hook library | 6 candidates across ≥ 3 hook types, each with: spoken line (≤ 8 words), on-screen text card, first-frame visual, type badge, score | temp 0.8, streamed so the first hook shows in \~3 s |
| 3. Hook scoring | The 6 candidates | Top 3 by clarity, specificity, curiosity, Hinglish naturalness, category fit, length | temp 0.1 |
| 4. Beat sheet | Chosen hook + Brief + template | 5 beats with time budget, VO line (Devanagari for voice, Latin Hinglish for display), on-screen text, visual intent, product-presence flag, energy level | temp 0.3 |
| 5. Shot list | Beat sheet | 4–5 or 7–9 shots: type (talking actor, product hero, demo, before/after, B-roll, end card), subject references (face, product, room), camera preset, target duration, caption text, model tier hint | temp 0.3 |
| 6. Prompt compiler | Each shot + the router's model choice | Model-specific positive prompt, negatives, camera and lighting block, Indian context cues, reference bindings, aspect, duration; a 0–100 score; refused under 40 after one auto-fix | temp 0.1 |
| 7. Localizer + compliance | Beat sheet | Numbers and currency spelled for voice (₹499 → चार सौ निन्यानवे रुपये), brand names kept in Latin with a pronunciation hint, voice energy tags per beat, claim flags (health, finance, "No. 1", guarantees, celebrity names), AI-label requirement | temp 0.1 |

Every output is validated against a JSON schema, retried once on failure, versioned on the ad, and editable in the UI. Changing a hook re-runs steps 4–7 only; changing one beat's words re-runs step 6 for the shots in that beat.

**Script mode (the user pastes a script).** The words are frozen; Script Brain may only add, never rewrite.

1. Split into sentences; the voice is synthesised first so durations are measured, not estimated.
2. Assign sentences to the five beats. If the first sentence is not a library hook type, propose one added hook line the user can accept or decline; the original sentence becomes beat 2.
3. If the measured voice runs past the chosen duration, offer the 30 s cut or mark the sentences that would have to go; nothing is trimmed without a click.
4. Build the shot list and compiled prompts from the beats as in Auto mode.
5. Show a fit report: words per beat, seconds per beat, which beat carries the offer, which the CTA, and what was added.

**Hinglish rules Script Brain follows**

- Spoken lines are stored in Devanagari (the v1 finding: Latin Hinglish produced silent mouths and worse voice). English words inside Hindi sentences are transliterated for voice and kept in Latin for display.
- Register: `aap` by default; `tum` only for youth and fashion brands when the brief says so. Verb endings match the register ("WhatsApp karein" / "WhatsApp karo").
- Mix: about 60/40 Hindi/English for metro audiences, 80/20 for tier-2 and tier-3. No Sanskritised Hindi; the word the buyer would say on the phone.
- On-screen text defaults to Latin Hinglish for Reels readability; Devanagari on-screen is a brand-kit switch. Numbers (sizes, dates) stay as digits on screen and are spelled out for the voice; no prices until D11 (Amendment A).
- One idea per beat, one number per ad (the offer), one CTA.

**Campaign and trend awareness.** Campaign mode injects a campaign pack from the calendar (angle, motifs, greeting, palette, CTA, deadline). The trend feed is a list of format templates (POV, green-screen reaction, split-screen before/after, notes-app text ad) with a last-verified date; Script Brain offers one only when it fits the category.

**What it never does.** Invent product facts not in the brief, write a claim the compliance step flags, put text in a video prompt, or spend a Higgsfield credit. The full prompts are in the System instructions tab.

## Templates, campaigns and trends

The content system is data, not code: a hook library of 16 types, 19 templates mapped onto the five beats, a festive calendar from Dhanteras 2026 to Black Friday 2027, 17 vertical playbooks and the CTA and platform conventions, all in Templates & hooks and all editable by an admin without a deploy.

**How a template is stored.** A template JSON holds: the beat budgets for 15 s and 30 s, the VO word budget per beat, the shot skeleton (shot types, which beats carry the product, camera presets), the lane (Presenter, Product, Re-shoot, Film), the hook types it prefers, the verticals it is switched off for, and, for the Re-shoot lane, the master video and its reference slots. Script Brain fills the skeleton; the router reads the lane.

**How a campaign pack is stored.** Dates, angle, motifs ("diya, marigold, rangoli"), palette, greeting line, CTA line, the delivery-by deadline, the categories it fits, and a last-verified date. The Library's campaign strip shows packs whose window opens within six weeks; Campaign mode pre-fills the brief from the pack; the compositor takes palette and motif cues from it.

**How the trend feed works.** A trend is a format template with a last-verified date and the evidence behind it (POV, split-screen before/after, kinetic captions, owner-led, "notes-app" text ads). An admin adds or retires trends weekly; Script Brain offers a trend only when its verticals match and marks it as a trend in the hook card. Trends with no Indian performance evidence are kept out of the default set.

**Template re-shoots.** For each high-use template, one master ad is rendered once at Master quality with placeholder product and Brand Face, judged, and stored with its reference slots. A new ad on that template runs Genjutsu motion transfer with the client's references, keeps every cut and timing, then gets its own voice, captions and end card. This is the cheapest path to a consistent, proven ad and the one to grow the catalogue around.

**What is deliberately absent.** No fabricated testimonials or fake customers, no celebrity-likeness templates, no clinic before/after, no coaching "100 % selection" angle, no trending-audio sound hooks in paid ads; the compliance checker enforces these from the playbook table.

## UI spec

Simple by default and advanced on demand: a new user sees four screens (brief, opening, making, your ad) with one primary action each, picks the voice and the video model, and never sees a money figure; the Advanced switch in the top bar reveals per-shot models and ETAs, the beat editor, storyboard approval and the Director's Cut on the same screens. The React + GSAP mockup is linked at the end of this section.

| Screen | What the user does | What is always visible |
| --- | --- | --- |
| 1. Library (home) | Sees ads as cards (status, duration, platform), opens one, starts a new ad; a campaign strip says "Diwali in 12 days — 3 templates" | Ads made this month (a count, no money) |
| 2. New Ad wizard, step 1 "What are we selling?" | Picks the category, drops 1–5 product or shop photos, types the product name and the offer (free text, no price field), picks the CTA type (WhatsApp, call, visit, order link; number pre-filled from the brand kit); or switches to **Paste a script** | Nothing else; the screen is a form |
| 3. Wizard, step 2 "How should it feel?" | Language (Hindi, Hinglish, English), register (aap / tum), duration (15, 30, both), platform, style (UGC phone, Studio product, Cinematic, Festive), presenter (none, a Brand Face, a new AI actor), campaign (auto-suggested from the calendar), preset (Draft / Standard / Master) | The estimate updates live: models that will run and total time |
| 4. Wizard, step 3 "Pick your hook" | Three hook cards with a type badge, the spoken line, the on-screen text card and the first-frame visual; "show 3 more" or "write my own" | Hook type explained in one line each |
| 5. Script & Beats | Edits the five beats: VO line (Devanagari with Latin preview), on-screen text, energy; plays the voice per beat; sees measured seconds against the budget; "auto-fit to 15 s" | Status bar; per-beat measured seconds |
| 6. Storyboard | Reviews one still per shot with the references used (face, product, room chips), the model badge and the duration; approves, re-rolls or changes a reference; Master requires approval, Draft auto-approves | Status bar; approvals count; "Render" button with the final time estimate |
| 7. Render | Watches a pipeline strip (voice → stills → video → QC → assemble → reframes) and per-shot cards with model, ETA and QC verdict as they land | Status bar; time remaining; "open Director's Cut" when the first cut exists |
| 8. Director's Cut | 9:16 player; beat-level timeline (beats as blocks, shots under them, voice lane with waveform, captions lane, music lane); per shot: swap take, re-roll with a note, trim; per beat: re-voice, edit words; global: music, caption style, end card, logo bug, **Change hook** (re-renders beat 1 only); the scorecard; export | Scorecard pass count; time the next action takes before it runs |
| 9. Brand Kit | Logo, colours, fonts, phone, WhatsApp, address, caption style and script system; **Brand Faces** (make an AI actor or upload a consented photo, approve 3 views); **Products** (reference images with background removed); **Rooms** (shop photos or generated sets); default voice with a Hindi audition line | Which ads use each reference |

**Rules the UI keeps everywhere**

- Simple mode shows the chosen voice and model and time only ("ready in about 5 min"); Advanced mode adds the per-shot model and ETA before the click. No money figure appears anywhere, in either mode (Amendment A). Script & Beats and Storyboard approval are Advanced-only panels under Making; Simple mode auto-approves.
- Three states for every shot: generating (with model and ETA), ready (with QC badge), needs attention (with the reason in plain words). Nothing fails silently.
- The first cut is playable before the last shot finishes: beats fill in as they land, so the user watches an ad assemble instead of a progress bar.
- Hindi first: every label has a Hindi string; numbers in the UI use Indian grouping (₹1,20,000).
- Phone-first layout: the wizard and the Director's Cut work one-handed on a 6-inch screen; export offers "Send to WhatsApp" and "Save to phone" before "Download".
- No "Remix". Regeneration is always scoped: one shot, one beat, one hook, one voice. A whole-ad regenerate exists only as "Duplicate as new ad".

**Dropped from v1:** Episodes, Show Templates, the separate Sequence and Dialogue surfaces (both are templates now), the Avatars page (merged into Brand Kit), engine-per-segment controls (the router decides, the Director's Cut overrides per shot).

**Director's Cut, the detail that matters.** The timeline unit is the beat, not the frame. A user drags a shot boundary and the voice does not move; the compositor re-cuts the picture to the voice. Swap take shows every take ever made for that shot with its QC verdict. Change hook keeps beats 2–5 and their renders. Re-voice re-generates one beat's audio, re-measures it, and re-cuts only that beat's shots. The scorecard is the "feels like an ad" checklist with pass / warn / fail per item, and export is allowed on warn, blocked on fail only in Master.

**Mockup (superseded by v5, see Amendment A).** React + GSAP. Simple mode runs brief → opening → making → your ad with one primary action per screen; Advanced adds model and time readouts, the quality preset, the Director's Cut timeline with takes and the scorecard. Screens: Create (with the live first-frame phone), Opening, Making, Your ad, My ads, Moments (campaign packs and formats), Brand: [SocialAdzGen Studio v2 mockup](https://claude.ai/artifact/JXTPB8yhVJMf81vpor21Ke). The v5 mockup carries no sample prices.

## Backend, data and API

One TypeScript monorepo for the app and API (Next.js, shared types for Brief / Beat / Shot JSON) and Python for the workers (Shot Engine, provider adapters, compositor), decided 3 Nov. Postgres, object storage and a Redis-backed queue sit between the two sides, and the job contract (step name, input hash, JSON payload, result reference) is the only shared surface: the API enqueues, the Python workers execute. The Higgsfield and ElevenLabs Python SDKs and ffmpeg live on the worker side, Celery or arq runs the queue, and Pydantic models generated from the TypeScript JSON schemas keep both sides in step.

**Core tables**

| Table | Holds | Notes |
| --- | --- | --- |
| `workspaces`, `users` | The business and its people | Email OTP or Google login; one workspace per brand to start |
| `brand_kits` | Logo, colours, fonts, address, phone, WhatsApp number, default voice, caption style, on-screen script (Latin / Devanagari) | Drives the compositor and the end card |
| `references` | Approved images: `kind` face / product / room / style, source (upload or generated), model, prompt, hash, `parent_id` lineage, `approved_by`, `approved_at` | The spine of Consistency v3; a reference is immutable once approved |
| `ads` | Mode (auto / script / campaign), `brief` JSON, language, register, durations, aspects, preset, status, version | Everything Script Brain produced is versioned under the ad |
| `hooks` | The 6 candidates with scores, the chosen one | Kept for A/B variants |
| `beats` | Index, type, VO text (Devanagari), display text, on-screen text, energy, measured `start_ms` / `end_ms` | Timing is written only after the voice is measured |
| `shots` | Beat, index, type, reference ids, compiled prompt JSON, model, target and measured duration, chosen `take_id` | One row per shot; re-renders add takes, never rows |
| `takes` | Provider job id, model, params, cost, URL, QC verdict JSON, provenance (judge, frames, temperature) | A take is never deleted; the Director's Cut swaps between them |
| `voice_tracks` | Voice id, model, text sent, audio URL, word alignment JSON, measured duration, cost | One per beat so a beat can be re-voiced alone |
| `jobs` | Ad, step, status, attempts, `input_hash`, output ref, error, timings | The job graph; idempotent by `input_hash` |
| `ledger` | Provider, model, units, cost in INR, job id | Per-call; summed live in the UI |
| `renders` | Variant (hook A/B), aspect, duration, master URL, SRT, cover, scorecard JSON | What the user downloads |
| `content_*` | Templates, hook library, calendar, trend feed, campaign packs | Versioned JSON, admin-editable |

**API (REST + server-sent events)**

- Brand: `POST /brands`, `PUT /brands/:id/kit`, `POST /brands/:id/references` (upload or generate), `POST /references/:id/approve`
- Ad: `POST /ads` (brief or script) → `POST /ads/:id/hooks` → `PUT /ads/:id/hook` → `POST /ads/:id/plan` (beats + shots) → `PUT /ads/:id/beats/:n` → `POST /ads/:id/voice` → `POST /ads/:id/storyboard` (stills) → `POST /ads/:id/render` → `POST /shots/:id/retake` → `POST /ads/:id/export`
- Live: `GET /ads/:id/events` streams job state, ETA, cost so far, QC verdicts
- Estimate: `GET /ads/:id/estimate` before render (model list and time to the web app; money internal only), `GET /ads/:id/ledger` after (owner role only)
- Providers: `POST /webhooks/higgsfield`, `POST /webhooks/elevenlabs` (signed), polling fallback every 10 s when a webhook is late
- Content: `GET /content/{templates,hooks,calendar,trends}`; admin `PUT` behind a role

**Job orchestration rules**

1. One job graph per ad: `voice` → `stills` (parallel per shot) → `approve` (human gate in Master, auto in Draft) → `video` (parallel) → `lipsync` (only once the v2.1 adapter exists) → `qc` (per take) → `assemble` → `reframe` → `export`.
2. Every step is keyed by `sha256(step, inputs)`; a repeat with the same inputs returns the cached output and spends nothing.
3. Retries: one automatic retry on a provider error, one automatic re-roll on a QC fail, then the shot is marked "needs attention" and the ad still assembles with the best available take.
4. Per-provider concurrency caps and per-model timeouts; webhooks first, polling as fallback; a dead-letter list the admin can see.
5. Budget: the estimate is shown before render; a hard cap per ad per preset and a monthly cap per workspace; a render that would exceed the cap asks first.
6. Provider keys live only on the server; assets are served by signed URLs; uploads are size- and type-checked.

**Provider adapters** are the only code that knows a provider's wire format: `submit(model, params, references) → job`, `status(job)`, `result(job)`, `estimate(model, params)`. Adding or swapping a model is a router entry plus an adapter mapping, never a pipeline change.

## QC and guardrails

Three gates run on every ad, none of them fails open, and the compliance gate is now as important as the quality gate: ASCI's synthetic-content labelling guidelines (published 29 Sep 2026, in force about three months later) and MeitY's IT Rules 2026 (in force since 20 Feb 2026) decide what an AI-made Indian ad may show and must declare.

**Gate 1, before any spend (Script Brain).** The compiler's score gate refuses prompts under 40/100; the compliance checker flags claims by vertical (health results, "No. 1", guarantees, "100 %", unlicensed names, competitor names), checks the offer has both prices when discounted, checks urgency has a real source, and sets the AI-label requirement. A flagged line is shown with the reason and a rewrite; the user can accept the rewrite or remove the line, never override a prohibited item.

**Gate 2, per take (QC judge, prompt 5).** Identity, product fidelity, room continuity, invented text, anatomy, motion, product presence, culture fit, safety; tri-state verdicts; one re-roll with the judge's hint; Master blocks, Standard warns, Draft shows. Provenance (judge model, frames, prompt version, cost) is stored on the take and shown in the Director's Cut.

**Gate 3, before export (scorecard).** The "feels like an ad" checklist plus the technical checks: silence map (no gap over 0.4 s inside a beat), sync report (voice to picture), caption safe zone per export profile, loudness at −14 LUFS, end card held at least 2 s, disclaimer held at least 4 s when present, AI label present when required.

**What is never generated** (hard refusals, with the reason shown in plain words):

- A fabricated testimonial, review or customer story voiced by an AI presenter, even labelled ([ASCI SGC guidelines](https://www.ascionline.in/wp-content/uploads/2026/09/Press-Release_Guidelines-for-Responsible-Labelling-of-Synthetically-Generated-Content-in-Advertising.pdf)).
- A real person's face or voice without recorded consent; any celebrity, cricketer or film likeness ([CCPA 2022 guidelines](https://www.mondaq.com/india/social-media/1312524/ccpa-guidelines-for-misleading-advertisements-and-endorsements-2022)).
- An AI doctor, expert or authority figure; any patient story; before/after for a medical, dental or health outcome ([NMC guidelines, 6 Oct 2026](https://medicaldialogues.in/pdf_upload/2026/10/07/nmc-guidelines-on-ethical-advertising-and-public-communication-478642.pdf)).
- An exaggerated AI transformation implying the product did it; a non-existent shop, hotel, location or facility shown as real.
- Children as presenters; political or religious content beyond festival greetings; betting, real-money gaming, crypto, tobacco, alcohol.
- Trending or licensed music, film clips or dialogue in a paid ad.

**What is labelled** (default on, user can only turn it off with a stated reason that is logged): any synthetic presenter, a cloned voice, a realistic generated setting, a demo of a product that does not exist yet. Wording "Video created using AI" / "यह वीडियो AI से बनाया गया है"; a 4 s super at the start and a small persistent label inside the safe zone; an audio prefix when a cloned voice imitates a real person; C2PA metadata preserved; a reminder to tick the platform's synthetic-content declaration ([Medianama on IT Rules 2026](https://www.medianama.com/2026/02/223-meity-amendments-it-rules-synthetic-media-deepfakes/), [Google Ads AI labelling](https://support.google.com/adspolicy/answer/17257106?hl=en)).

**Disclaimers.** Same language as the claim, at most two lines, each held over 4 s, inside the safe zone, never used to cure a misleading claim ([ASCI disclaimer guidelines](https://www.socialsamosa.com/2023/01/asci-guidelines-for-disclaimers-in-advertisements)). In a 15 s ad the disclaimer sits under the CTA from 10 s to 15 s.

**Vertical gates** come from the playbook table: clinics lose templates 3, 5, 8, 12 and 13 and gain the NMC source mark; coaching loses 8 and 13 and gains the consent rule for toppers; jewellers must show the HUID; real estate must show the RERA number and QR; food must not claim "100 %".

**Provider policy guardrails.** Higgsfield's terms put likeness and trademark rights on the uploader and its moderation returns a terminal `nsfw` status; the uploader (the business) confirms rights to product photos and faces at upload, and the training opt-out is on for the account ([Higgsfield ownership help](https://higgsfield.ai/creator-hub/help-center/account/who-owns-my-generations-and-can-i-use-them-commercially)). ElevenLabs professional cloning is own-voice only and the commercial licence starts at the Starter plan.

**Data.** Client photos, faces and voices are stored in the workspace's bucket with signed URLs, deleted on request, never reused across workspaces, and never sent to a provider that trains on them by default without the opt-out set.

## Cost and time per ad

A 15 s Standard ad costs about ₹290 in provider fees at list price (₹170 at today's discounts) and is ready in 6–8 minutes; Draft is about ₹110 and Master about ₹685, with the LLM layer on free tiers, against what an agency charges. These figures are for the owner's gates and reports only; the website never shows them (Amendment A).

Assumptions: 15 s = 6 shots, about 20 billed seconds of video (each shot is generated at its target length plus a 1 s tail; Wan allows 2–30 s, Kling 3–15 s); 30 s = 9 shots, about 36 billed seconds; ₹84 per USD; list prices from the [Higgsfield catalog](https://open.higgsfield.ai/pricing) on 2 Nov 2026 (discounted figures in brackets are time-limited); ElevenLabs at [usage rates](https://elevenlabs.io/pricing/api).

| Line | Draft | Standard | Master |
| --- | --- | --- | --- |
| Video model | Wan 3.0 480p, $0.05/s ($0.02) | Kling 3.0 Pro 1080p, $0.112/s ($0.056) | Kling 4.0 1080p, $0.235/s ($0.11) |
| Video, 20 billed s | $1.00 ($0.40) | $2.24 ($1.12) | $4.70 ($2.20) |
| QC re-roll allowance | none | +25 % | +40 % |
| Stills (Soul 2 × 24, Marketing Studio × 2) | $0.17 | $0.44 | $1.36 |
| Voice (v4; 3 hook takes), music bed, SFX | $0.15 | $0.20 | $0.20 |
| LLM planner + vision judge | ₹0 on free tiers ($0.08 if paid) | ₹0 on free tiers ($0.10 if paid) | ₹0 on free tiers ($0.14 if paid) |
| **15 s total** | **$1.32 ≈ ₹110 (₹60)** | **$3.45 ≈ ₹290 (₹170)** | **$8.16 ≈ ₹685 (₹390)** |
| **30 s total** | ≈ ₹220 (₹120) | ≈ ₹560 (₹330) | ≈ ₹1,300 (₹750) |
| End to end, excluding human approval | 4–5 min | 6–8 min | 10–14 min |

**Other lines**

| Item | Cost | Time |
| --- | --- | --- |
| Brand Face setup (Soul 2 views + Soul ID training) | $2.60 ≈ ₹220, once per face | \~6 min |
| Second hook variant for A/B (beat 1 re-rendered only) | one shot: ₹20–₹80 by preset | 2–3 min |
| 1:1 and 16:9 reframes | free (compositor) | 30 s |
| Template re-shoot of a 15 s template (Genjutsu, 720p) | $4.77 ($2.39) ≈ ₹400 (₹200); Genjutsu Light $0.75 ≈ ₹65 | 3–5 min |
| Brand film, one 15 s Cinema Studio 4.0 take at 720p | $3.10–$6.90 ≈ ₹260–₹580 | 5–8 min |
| Two static companion creatives (Ads Studio) | $0.17 ≈ ₹14 | 1 min |
| Seedance 2.5 instead of Kling for a Master shot | \~$0.50/s at 720p, token-metered, 1080p several times more | p50 about 4 min per shot |

**Where the time goes** (web-app medians Higgsfield published in July 2026, no API figures exist: Kling 720p 5 s ≈ 60 s, 1080p ≈ 2.5× slower; Wan ≈ 1.5 min per clip; Seedance 720p ≈ 3.5–4 min; peak slowdown 01:00–08:00 UTC, which is 06:30–13:30 IST, the Indian working morning — [source](https://higgsfield.ai/blog/how-long-ai-video-generation-takes)). Voice and alignment take about a minute for five beats; stills a minute in parallel; QC 10–20 s per take; assembly 30 s. The UI's ETA is the critical path of the job graph at the account's concurrency, re-estimated as steps land.

**Pricing suggestion (for the business model, not the landing page).** Per-ad prices in rupees with UPI packs and a GST invoice beat credit systems with every Indian competitor's users (credit complaints are the top review theme across Higgsfield, Creatify and Icon). Draft ₹149, Standard ₹499, Master ₹1,299 would hold 40–70 % gross margin at list provider prices and more at discounted ones; a monthly cap per workspace protects both sides.

## Build roadmap

Twelve weeks from a clean repository to a passed pilot test, with a gate at the end of every phase that a human judges, the first two weeks spent proving the four things the whole plan rests on before any product code is written, and hosting, billing and a public launch as a separate final phase that starts only when the pilot passes.

```
 Phase 0  Foundations + proofs   10 Nov – 23 Nov 2026   G0: one 15 s Hindi ad from API outputs passes the checklist
 Phase 1  Core pipeline (local)  24 Nov – 21 Dec 2026   G1: 10 ads / 5 verticals rated ≥ 7/10; cost within the table
 Phase 2  Editor, brand, content 22 Dec – 11 Jan 2027   G2: Director's Cut, Brand Kit, 8 templates, compliance gate, exports; 5 pilots onboarded
 Phase 3  Talking heads + pilot  12 Jan – 6 Feb 2027    G3: 5 businesses post real ads, hook rate ≥ 30 % on 3, ASCI audit clean
 Phase 4  Hosting + launch       after G3 only          G4: hosted stack matches local output; billing; launch checklist
```

**Phase 4, hosting and launch, starts only after G3.** Everything before it runs on the dev machine; a Cloudflare quick tunnel is the only exposure and only for pilot testers. Phase 4 holds: Vercel for the app, a container host in Mumbai for the API and workers, managed Postgres, R2 with CDN for objects, signed webhooks on a public URL, accounts hardening, INR billing with UPI and GST invoices, monthly caps, then the public launch. None of it is built, configured or paid for earlier. Claude Code's summary at the end of each phase must restate that hosting remains last.

**Phase 0 proofs, each a script and a folder of outputs, not a feature:** a Soul ID trained from 20 generated views holds a face across 10 Soul 2 stills; Kling 3.0 Pro image-to-video from those stills holds the face and the product across six 3 s shots; Eleven v4 reads a Devanagari ad script with numbers and a brand name cleanly and forced alignment returns usable word times; Genjutsu re-shoots a 15 s clip with a new product and face without breaking the cuts. If a proof fails, the routing table changes before Phase 1, not after.

**How the work is run** (kept from v1): one work package per branch with a written plan before code; characterization tests pin the working path before behaviour changes; new behaviour behind flags only where a model or a tier is being swapped; a fresh reviewer pass on every package; the owner is asked before any package passes 15 files, touches billing or the data model.

**Team shape.** One full-stack engineer owns the app and API, one owns the Shot Engine and adapters, and the owner writes the content system (hooks, templates, packs, prompts) in parallel from week 1, since the content system is where the ads are decided. A third engineer shortens Phase 2 and 3 by about two weeks each.

## Risks and open decisions

The two risks that could change the architecture are the missing lip-sync endpoint and Hindi speech quality inside video models; everything else is a config or contract problem.

| Risk | Likelihood | What it would cost | Mitigation in the plan |
| --- | --- | --- | --- |
| No lip-sync on the Higgsfield API; audio-reference models re-voice rather than sync | Certain today | Talking-head templates | VO-led presenters at launch; one external adapter after a 10-line Hindi bake-off; two experiments (STT-verified guided speech, Genjutsu "act it yourself") |
| Hindi speech generated by video models is unverified | High | Wrong words in a client's ad | Never use model-generated speech in a deliverable; ElevenLabs is the only voice |
| Catalog churn: DoP vanished between Sept and Nov, Sora 2 retired, Kling 4.0 schema unpublished | High | A router entry breaks | Adapter per provider, router as config, a weekly "model canary" job that renders one known shot per model and alerts on failure |
| Price volatility: 15–75 % discounts are time-limited; Seedance 2.5 and Cinema Studio are token-metered | High | Margin | Budget at list; `/estimate` before every call; Standard tier on per-second Kling 3.0; cap per ad |
| Moderation false positives (`nsfw`) on ordinary Indian content | Medium | Failed shots, confused users | One compiler rephrase; Marketing Studio `moderation: low`; refusal shown in plain words; refunded by provider |
| Latency peaks 01:00–08:00 UTC, the Indian working morning | Medium | Slower renders when users are active | Stills and voice pre-rendered as soon as a hook is chosen; ETA model learns time of day |
| Concurrency tied to funding in the last 28 days | Medium | Queueing at 2 concurrent | Keep $100 funded (20 concurrent); enterprise capacity when volume justifies |
| Outputs train Higgsfield models by default; URLs expire in 7 days | Certain | Client data exposure, lost assets | Opt-out set on day one; every output copied to object storage before the step completes |
| ASCI synthetic-content rules in force about Dec 2026; NMC doctor rules; MeitY labels | Certain | A client's ad rejected or penalised | Labels default on, hard refusals, vertical template switches, disclaimer timing |
| ElevenLabs: premade voices expire 31 Dec 2026; v4 has no speed control; Devanagari pronunciation rules untested | Medium | Voice churn, pacing | Brand Kit stores a chosen or cloned voice id; pacing by punctuation and ±5 % stretch; dictionary tested in week 1 |
| Genjutsu re-shoot fidelity on Indian products and faces unverified | Medium | The template lane underdelivers | Pilot three master templates before building the catalogue |
| Kling `elements` cannot be created through the API | Likely | A consistency feature unavailable | Use ordered `image_urls` references, not elements |
| Vendor concentration: one provider for every pixel | Medium | Outage halts rendering | Adapter abstraction; the same Kling and Wan families exist on other hosts as a secondary route |
| Reputation of credit systems (top complaint on Higgsfield, Creatify, Icon reviews) | Medium | Churn | Per-ad rupee pricing; failed and refused shots never charged |

**Added 3 Nov, after the decision to run free-tier LLMs for now.** Free tiers rate-limit under load and retire model ids without notice, which was a v1 wall (429s on Gemini and Groq, NVIDIA vision effectively dead). The plan absorbs it with rules rather than money: planner and judge on separate keys and quotas, `Retry-After` honoured with jittered backoff, fallbacks in config order (Gemini free → Groq free → NVIDIA NIM free → OpenRouter free), a daily canary call per id that removes a dead one from the chain, hook generation cached per brief so a retry never re-spends quota, and QC batched to 8 frames per call. Adding a paid LLM is outside the plan: it needs the owner to lift constraint (2) explicitly, and nothing in the build assumes it.

**Open decisions** (each changes the build; the plan assumes the first option where one is named)

- [ ] D1. Product name: keep SOCIALADZGEN STUDIO, or rename for v2
- [ ] D2. Stack: decided 3 Nov, TypeScript app and API, Python workers
- [ ] D3. Launch without talking heads (assumed) or wait for the lip-sync adapter
- [ ] D4. Lip-sync bake-off order: Sync Labs, Higgsfield Speak v2 via Segmind, Kling lip-sync
- [ ] D5. Real-owner Brand Faces (consented photos, own-voice clone) at launch (assumed) or later
- [ ] D6. The first five templates to build as Re-shoot masters
- [ ] D7. Second language after Hindi: Marathi, Tamil or Gujarati
- [ ] D8. Expose the Draft tier to users (assumed) or keep it internal
- [ ] D9. Pricing: per-ad tiers (₹149 / ₹499 / ₹1,299, assumed) or monthly packs
- [ ] D10. Hosting: decided 3 Nov, deferred to the last phase after testing; Fly.io or Railway in Mumbai for the API, Vercel for the app, when it comes


## Amendment A — UI v5 and the no-money rule (4 Nov 2026)

This amendment overrides constraint (3) at the top of this file, the UI spec section and the Library, wizard,
Render and Director's Cut rows that mention cost, credits, balance, price or a rupee figure. Its last note records a
second owner decision of the same day: Phase 0 runs on plain files, with containers from task 1.1.

**The owner's rule (verbatim).** "Never display the cost, price, pricing, fees, subscription amounts, or monetary
value of anything anywhere on the website. This restriction applies to every section, component, tooltip, card,
modal, footer, CTA, and dynamically generated content. Do not introduce pricing sections or cost-related
messaging."

**What changes**
- Simple and Advanced both show no money. Advanced shows time and model detail only (models that run, resolution,
  shot length, per-shot time, total time, QC, takes).
- The brief has no price field; the offer is free text. Sample content carries no prices.
- Library cards show status, duration and platform (no cost). No credits, balance or monthly cap in money.
- The "price anchor" template and the "price shock" hook type are parked until D11 is decided; the script brain
  writes no prices and no discount percentages (CCPA needs the original price beside a discount, which the rule
  forbids showing).
- Cost and time per ad, `/estimate` and the `ledger` stay: they are the owner's engineering numbers for gates and
  reports in `SUMMARIES/`. The API never sends money fields to the web app.
- Indian number grouping still applies to non-money numbers (views, counts).

**The look.** UI v5 "editorial plum", approved by the owner. Authority: `docs/design/DESIGN_SYSTEM.md`; stack for
apps/web: `docs/design/FRONTEND_STACK.md`; rounds v2 → v5: `docs/design/DESIGN_HISTORY.md`; source:
`mockup/studio-ui`; bundle: `mockup/socialadz-studio.html`.

**New open decisions**
- [ ] D11. May a shop's own typed price appear inside its exported ad video (the reel preview on the website would
  then show it)? Assumed **no** until the owner says otherwise; the compositor has no price card.
- [ ] D12. How users pay once billing exists (Phase 4.3) when the website may not show amounts: off-site invoice or
  payment link, a provider-hosted payment page, or an explicit exception for one checkout screen.
- D9 (pricing tiers) stays an internal business decision; no tier or amount appears on the website.

**Phase 0 runs on plain files (owner decision, 4 Nov 2026).** No Docker, Postgres, Redis or MinIO in Phase 0; they
arrive in Phase 1, task 1.1, as local containers (hosting stays Phase 4, after G3). Until then:
- proof outputs and request logs go in `proofs/out/<date>/` (one JSON line per provider call, never a key);
- the step cache (`sha256(step, inputs)`) and the LLM cache are one local SQLite file, `.cache/steps.sqlite3`;
- assets go in the local folder `assets/`; every provider output is downloaded there before a step is marked done
  (Higgsfield URLs still expire in 7 days);
- providers are polled, not called back: there is no public URL for webhooks in Phase 0.
Storage and cache sit behind small interfaces, so 1.1 swaps in MinIO and Postgres without changing their callers.
Where this file's Architecture, Hosting or Backend sections, or `docs/plan/03-contracts.md`, name Postgres, Redis or
MinIO for local runs, read "from 1.1".
