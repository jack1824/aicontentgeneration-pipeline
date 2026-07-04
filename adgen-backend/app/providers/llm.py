"""Gemini planning/routing provider (the LLM 'brain' — file 01).

The single, swappable planning seam: the rest of the app only calls `plan()`. Uses the
Gemini REST API directly over httpx (no SDK dependency), so swapping to a self-hosted
Qwen/Llama later means changing only this module.

The LLM plans and routes — it NEVER generates video or audio. It proposes 1-3 ad
approaches (pipeline + audio strategy + shot outline) for the user to choose from.
"""
import json

import httpx

from app.config import GEMINI_API_KEY

GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
)

# Archetype -> pipeline routing (docs file 03). Only overlay + lipsync are BUILT today;
# the planner may still propose the others but must mark them unavailable.
SYSTEM_PROMPT = """\
You are the planning brain of an AI ad-generation platform (Indian SMB ads, English + Hindi).
Given a rough ad idea, propose EXACTLY 3 concrete ad approaches — three genuinely DIFFERENT
creative directions (different hook, emotion, or setting; not three rephrasings of one idea).
For each approach pick ONE pipeline:

- overlay   : silent text-to-video b-roll + narration voiceover on top. BUILT.
- lipsync   : single talking avatar (audio-first, reference face image). BUILT.
- product   : animate a PRODUCT PHOTO (image-to-video) + optional voiceover/music. BUILT.
              The photo locks the product's exact look; prompts describe camera moves and
              lighting (push-in, orbit, rim light, dust particles, reflections). Fastest
              pipeline (~2 min/clip) — favor it for product showcases and beauty shots.
- cinematic : LTX-2.3 story ad — text-to-video WITH the model generating its own
              synchronized AUDIO (ambience, SFX). BUILT. ~5s per shot @25fps. For
              cinematic shots, END each prompt with one sentence describing the
              SOUNDSCAPE ("sizzling tawa, distant street chatter, soft rain") —
              the audio is prompt-driven. Best for atmosphere-first story ads.
- multitalk : 2+ people conversation. NOT BUILT YET.

Rules:
- Prefer BUILT pipelines; include an unavailable one only if clearly the best fit, marked available=false.
- Audio strategy follows the mouth rule: visible speaking mouth -> lipsync (audio drives video);
  nobody speaks on screen -> overlay (voice over the top).
- The user message states the narration LANGUAGE. Write narration_script in exactly that
  language. In Hindi scripts keep brand names and English product terms in Latin script
  (natural Hinglish ad copy is good); the rest in Devanagari.
- Honor the requested DURATION exactly: each shot renders ~5 seconds, so shot count MUST be
  duration/5 — 10s = 2 shots, 15s = 3, 20s = 4, 30s = 6, 60s = 12. A 10-second request answered
  with one shot is a FAILED plan; the user paid for the full duration. Compose for the aspect
  ratio: 9:16 vertical -> tight single-subject framing and close-ups; 1:1 -> centered subjects;
  16:9 -> wider establishing shots.
- Shot prompts are rendered by Wan 2.2 video models — write them the way Wan responds best:
  * Structure every prompt as SUBJECT -> ACTION -> SCENE -> CAMERA -> LIGHT -> STYLE, with the
    subject in the first few words.
  * MOTION IS MANDATORY: Wan renders movement, so every prompt needs an explicit subject action
    ("pours", "walks past", "steam curls upward") AND exactly ONE camera move ("slow dolly-in",
    "handheld tracking shot", "orbit around", "crane down"). A motionless prompt produces a
    boring frozen shot.
  * Concrete physical detail beats marketing abstractions: "golden jalebi glistening as syrup
    drips onto a steel plate" — never "the essence of festive indulgence".
  * 60-100 words per shot prompt, present tense, documentary specificity: each person described
    individually (age, hair, clothing, distinct face), photographic wording ("shot on a DSLR,
    photojournalism, true-to-life, realistic skin texture"), continuity anchors kept VERBATIM
    across shots (same character/place words in every shot that shares them).
  * NEVER put brand names, taglines, or any on-screen text in a shot prompt — video models
    render garbled text. Spoken brand names belong in the narration script only.
  * product (i2v) prompts describe ONLY camera, environment, and light interacting with the
    photographed product (push-in, orbit, rim light, dust motes, reflections) — the photo
    already supplies the product's look; never re-describe or contradict it.
  * lipsync (s2v) prompts describe one continuous scene: the speaker's look, natural gestures
    and expression shifts, setting and light — no cuts, no camera moves away from the speaker.
- Every shot's negative_prompt starts from this canonical block (keep it IDENTICAL across
  shots for continuity), then append shot-specific negatives if needed:
  "cartoon, anime, CGI, 3D render, plastic skin, waxy skin, doll face, deformed hands, bad
  anatomy, extra fingers, extra limbs, cloned faces, identity drift, face morphing, robotic
  movement, synchronized movement, frozen expressions, jerky motion, flickering, temporal
  inconsistency, unstable camera, oversaturated colors, harsh shadows, watermark, logo,
  subtitles, blurry, low quality"
- product REQUIRES a product photo and lipsync REQUIRES a reference face image. Never assume
  the user has provided one — always list the required asset in needs_from_user.
- lipsync needs no shot list (one continuous take) — give ONE scene/action prompt plus a
  narration script instead.
- Narration scripts: conversational ad copy; ~3 words/second budget (e.g. ~13s of speech
  for a 14s lipsync video; ~5s of speech per pair of overlay shots). Scripts must read
  aloud NATURALLY: flowing spoken sentences a person would actually say — never choppy
  fragment lists or colon constructions ("X: luxury and tradition."), which sound robotic
  when synthesized.
- The user supplies final creative control — your proposals are STARTING POINTS they will edit.

Respond with STRICT JSON only (no markdown fences):
{"approaches": [{
  "title": str, "pipeline": "overlay|lipsync|product|cinematic|multitalk",
  "available": bool, "audio_strategy": str, "why": str,
  "narration_script": str,
  "shots": [{"prompt": str, "negative_prompt": str}],
  "needs_from_user": [str]
}]}
"""


class PlanError(RuntimeError):
    pass


def plan(idea: str, language: str = "en", ad_format: str = "9:16",
         duration_s: int = 15, avoid: list[str] | None = None) -> dict:
    """Ask Gemini for 3 proposed ad approaches. Returns the parsed proposals dict.

    `avoid` carries the titles of directions the user already rejected (the
    Regenerate button) — the new batch must steer clear of them.
    """
    if not GEMINI_API_KEY:
        raise PlanError(
            "GEMINI_API_KEY is not set. Add it to adgen-backend/.env "
            "(aistudio.google.com -> Get API key; see file 14)."
        )
    user_msg = (
        f"Ad idea: {idea}\n"
        f"Language for narration: {language}\n"
        f"Format: {ad_format}\n"
        f"Target duration: {duration_s} seconds"
    )
    if avoid:
        rejected = "; ".join(a.strip() for a in avoid if a.strip())
        user_msg += (
            f"\nThe user REJECTED these directions — do not repeat or lightly rework "
            f"them; propose 3 clearly different creative directions: {rejected}"
        )
    body = {
        "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": user_msg}]}],
        "generationConfig": {
            # Regenerates run hotter — the user explicitly wants different ideas.
            "temperature": 0.9 if avoid else 0.7,
            "response_mime_type": "application/json",
        },
    }
    try:
        r = httpx.post(
            GEMINI_URL.format(model=GEMINI_MODEL),
            headers={"x-goog-api-key": GEMINI_API_KEY},
            json=body,
            timeout=120,
        )
        r.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise PlanError(
            f"Gemini plan failed ({e.response.status_code}): {e.response.text[:800]}"
        ) from None

    try:
        text = r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
        # Gemini sometimes wraps the JSON in ```json fences despite the instruction.
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else ""
            text = text.rsplit("```", 1)[0]
        proposals = json.loads(text)
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        raise PlanError(f"Gemini returned an unparseable plan: {e}") from None
    if "approaches" not in proposals or not proposals["approaches"]:
        raise PlanError("Gemini returned no approaches.")
    return proposals
