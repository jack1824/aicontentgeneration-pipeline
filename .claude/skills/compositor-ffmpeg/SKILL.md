---
name: compositor-ffmpeg
description: How the deterministic ffmpeg compositor assembles an ad — cutting shots to the measured voice, burning Devanagari/Latin captions from word times inside the safe box, music ducking and SFX, end card, loudness, 9:16/1:1/16:9 reframes, SRT and cover. Load before touching workers/compositor/.
---
# Compositor (CPU only, deterministic, never calls a provider)

## Inputs
Beats with measured `start_ms/end_ms` and word alignment; chosen takes per shot (mp4); voice track (mp3/wav); music bed; SFX files; brand kit (logo PNG, colours, fonts, number, address); caption style; export profiles.

## Steps
1. **Cut to the voice.** For each shot: trim to its beat's word span + 300 ms tail (`-ss/-t` on the take); never trim a word; if a take is shorter than the span, slow by at most 5 % (`setpts`), else flag "needs attention". No silent padding ever.
2. **Concat** with `concat` demuxer (same codec/size); keep 30 fps constant.
3. **Captions.** From word times, build cards of 2–4 words (ASS subtitles via `subtitles=` filter with `force_style`, font Mukta ExtraBold for Devanagari and Schibsted Grotesk ExtraBold for Latin (the same faces as the website reel, so the export matches the preview), bold, box background from the brand kit). Keep every card inside the safe box: on 1080×1920, x 65–1015, y 270–1250 (clears Meta top 14 % / bottom 35 % / sides 6 % and Shorts top 10 % / bottom 25 % / right 10 %). Hook card ≈ 40 pt-equivalent, body ≈ 28 pt.
4. **Overlays.** Offer card on the offer beat (text from the brief's free-text offer; no price card until owner decision D11), logo bug (small, top right, inside safe box), AI label: 4 s super at start + persistent small label bottom-left inside the safe box ("Video created using AI" / "यह वीडियो AI से बनाया गया है"); disclaimer under the CTA for ≥ 4 s when the compliance gate asks.
5. **End card** 2–3 s: logo, CTA line, number/address/QR, brand colours; voice may finish over it.
6. **Audio.** `amix` with `normalize=0`; music `volume` ducked by `sidechaincompress` (threshold −30 dB, ratio 8, attack 150 ms, release 400 ms) under the voice; SFX placed at cut 1, offer, CTA; two-pass `loudnorm=I=-14:TP=-1:LRA=11` (measure then apply).
7. **Reframes.** 1:1 and 16:9 by crop + reposition captions (re-run step 3 with the profile's safe box); never stretch.
8. **Exports.** H.264 High, CRF 20, `-pix_fmt yuv420p`, AAC 192 kbps, `+faststart`; 9:16 master 1080×1920; WhatsApp version ≤ 16 MB (lower CRF/bitrate if needed); SRT sidecar; cover JPG from the judge's best frame of shot 1.
9. **Reports.** Silence map (any gap > 400 ms inside a beat → warning), sync report (caption vs word times), loudness report, duration per beat vs budget. Attach to the render.

Fonts (SIL OFL): ship Mukta, Schibsted Grotesk and Tiro Devanagari Hindi (hook card, optional) in `workers/compositor/fonts/`, Noto Sans Devanagari as the fallback; pass `fontsdir`. Test with the sample Diwali ad: `uv run pytest workers/tests/test_compositor.py`.
