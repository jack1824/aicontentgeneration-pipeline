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
Given a rough ad idea, propose 1-3 concrete ad approaches. For each approach pick ONE pipeline:

- overlay   : silent text-to-video b-roll + narration voiceover on top. BUILT.
- lipsync   : single talking avatar (audio-first, reference face image). BUILT.
- product   : animate a PRODUCT PHOTO (image-to-video) + optional voiceover/music. BUILT.
              The photo locks the product's exact look; prompts describe camera moves and
              lighting (push-in, orbit, rim light, dust particles, reflections). Fastest
              pipeline (~2 min/clip) — favor it for product showcases and beauty shots.
- cinematic : LTX story ad with native audio. NOT BUILT YET.
- multitalk : 2+ people conversation. NOT BUILT YET.

Rules:
- Prefer BUILT pipelines; include an unavailable one only if clearly the best fit, marked available=false.
- Audio strategy follows the mouth rule: visible speaking mouth -> lipsync (audio drives video);
  nobody speaks on screen -> overlay (voice over the top).
- The user message states the narration LANGUAGE. Write narration_script in exactly that
  language. In Hindi scripts keep brand names and English product terms in Latin script
  (natural Hinglish ad copy is good); the rest in Devanagari.
- Honor the requested DURATION and FORMAT: each shot is ~5 seconds, so shot count = duration/5
  (15s = 3 shots, 30s = 6). Compose for the aspect ratio: 9:16 vertical -> tight single-subject
  framing and close-ups; 1:1 -> centered subjects; 16:9 -> wider establishing shots.
- Shot prompts must be DETAILED documentary style: each subject described individually (age,
  hair, clothing, distinct faces), photographic wording ("shot on a DSLR, photojournalism,
  true-to-life, realistic skin texture"), continuity anchors kept verbatim across shots.
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
         duration_s: int = 15) -> dict:
    """Ask Gemini for 1-3 proposed ad approaches. Returns the parsed proposals dict."""
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
    body = {
        "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": user_msg}]}],
        "generationConfig": {
            "temperature": 0.7,
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
