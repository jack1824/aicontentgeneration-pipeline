"""Gemini planning/routing provider (the LLM 'brain' — file 01).

The single, swappable planning seam: the rest of the app only calls `plan()`. Uses the
Gemini REST API directly over httpx (no SDK dependency), so swapping to a self-hosted
Qwen/Llama later means changing only this module.

The LLM plans and routes — it NEVER generates video or audio. It proposes 1-3 ad
approaches (pipeline + audio strategy + shot outline) for the user to choose from.
"""
import json
import os
import re
import time

import httpx

from app.config import GEMINI_API_KEY

GEMINI_MODEL = "gemini-2.5-flash"
# Separate free-tier quota pool — the planner's lifeboat when flash is exhausted.
GEMINI_FALLBACK_MODEL = "gemini-2.5-flash-lite"
GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
)

# Third rung: NVIDIA NIM (OpenAI-compatible, account-wide key, trial credits).
# Qwen 3.5 is a different model family from the Groq Llama rung — ladder
# diversity means the rungs don't share one family's blind spots.
NVIDIA_API_KEY = (os.getenv("NVIDIA_API_KEY") or "").strip().strip("\"'“”")
if NVIDIA_API_KEY and not NVIDIA_API_KEY.startswith("nvapi-"):
    NVIDIA_API_KEY = ""  # non-NVIDIA paste — ignore
NVIDIA_MODEL = "qwen/qwen3.5-397b-a17b"
NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions"

# Fourth rung of the ladder: Groq-hosted Llama (independent vendor, independent
# quota) — the brain keeps planning even when Gemini AND NVIDIA are dry.
GROQ_API_KEY = (os.getenv("GROQ_API_KEY") or "").strip().strip("\"'“”")
if GROQ_API_KEY and not GROQ_API_KEY.startswith("gsk_"):
    GROQ_API_KEY = ""  # non-Groq paste — ignore
GROQ_MODEL = "llama-3.3-70b-versatile"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

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
- longcat   : LongCat-Avatar — like lipsync (single talking avatar, audio-first,
              reference face image) but a LONGER continuous take (~15-16s vs ~14s)
              with stronger identity stability. Script should fill ~14-15 seconds
              (~45 words). Prefer it over lipsync when the script needs the extra
              room or the take must stay rock-steady. BUILT.
- sequence  : a MIXED TIMELINE of 2-5 segments, each on its own pipeline — the
              classic full-ad shape: cinematic/overlay hook -> product shot ->
              lipsync avatar CTA. BUILT. Prefer it when the idea needs BOTH the
              product's real photo AND a human seller (most product ads do).
- multitalk : 2+ people conversation. NOT BUILT YET (longcat covers multi-speaker later).

Rules:
- NON-NEGOTIABLE CASTING RULE: every character is INDIAN and every environment is
  recognizably INDIA — faces, skin tones, clothing, streets, homes, shops, signage,
  vehicles, landscapes, light. Never default to Western people or places. Write it
  INTO the shot prompts explicitly ("Indian", named regions/settings where natural).
  Only an explicit user request for another market overrides this.
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
- Shot prompts read like a film director's notes, not a copywriter's. 45-90 words,
  present tense, in EXACTLY this order:
  STYLE -> SUBJECT -> ACTION -> SCENE -> CAMERA -> LIGHT/COLOR -> AUDIO.
  * STYLE: every prompt opens verbatim "Realistic documentary footage:" (or
    "Realistic documentary close-up:" for insert shots).
  * SUBJECT: THREE FROZEN BLOCKS, defined once per ad and pasted BYTE-IDENTICAL into
    every shot they appear in (consistency lives in verbatim repetition, never in
    paraphrase): (1) CHARACTER block — ~20-25 words: age, face, hair, and EVERY
    garment with its color and fabric; (2) SETTING block — the location with 3-4
    fixed physical details; (3) LOOK block — 2-3 concrete light/color phrases
    ("warm golden window light against cool steel shadows") reused in every shot
    so the whole ad grades as one film. Between shots, ONLY the action sentence
    and the camera preset may change.
  * WARDROBE-DRIFT NEGATIVES: for each character, append their concrete garment
    failure modes to that ad's negative block, naming the actual garments from the
    anchor ("different kurta color, missing turban, added dupatta, changed jewelry,
    different hoodie") — abstract terms like "inconsistent clothing" do nothing.
  * ACTION: one small physical action that TELLS the story beat — "his finger traces
    an empty line in the appointment diary", "her thumb taps the phone three
    deliberate times" — never a summary like "he looks worried". Motion is
    mandatory: a motionless prompt produces a boring frozen shot.
    MICRO-ACTION LAW (2026-07-12 panel review — the single biggest premium gap):
    every CHARACTER shot must contain one hand-scale verb of ENGAGEMENT with the
    world — picks up the thread, pushes the curtain aside, lifts the cup, traces
    the woven border, moves a strand of hair from her face. A character who
    merely stands/walks/looks is a FAILED shot ("she exists" is not directing).
  * PROPS & HANDS: video models mirror left/right — NEVER name a side ("right
    hand"). One prop = ONE owner = ONE continuous action per shot ("he raises
    the shaker and drinks" — never grip-with-one-hand-while-shaking-the-other).
    A prop that recurs across shots gets its own short verbatim anchor, pasted
    like a character anchor ("the matte black shaker with a steel mixing ball").
  * CAMERA: pick exactly ONE preset from the CLOSED MENU below and copy it VERBATIM —
    freeform camera prose is forbidden (it produces unbounded push-ins that collapse
    into ugly extreme close-ups by the last second):
      "static locked-off medium shot, holding chest-up"
      "slow lateral dolly settling into a steady medium shot"
      "slow push-in from wide, settling at a medium shot and holding there"
      "slow pull-back opening from medium to wide, subject fully in frame throughout"
      "quarter orbit settling front-on at medium-close distance and holding"
      "handheld follow at walking pace, keeping the subject centered at medium"
      "low-angle static hero shot, waist-up"
      "top-down static tabletop shot"
      "crane rise from chest height to a high wide reveal"
      "rack focus from foreground product to subject at medium, camera static"
  * LIGHT/COLOR carries the EMOTION — never name a feeling, grade it: sadness =
    "desaturated cold blue-grey tones, heavy silence"; dread = "lit from below, cold
    shadows"; hope = "sudden warm golden light floods the room"; success = "warm
    confident tones, morning sun streaming in".
  * AUDIO: the final sentence is always "The audio is ..." — 1-3 concrete diegetic
    sounds that carry the beat's emotion (a ticking wall clock, calculator key
    clicks sharp in the silence, a soft hopeful piano note swelling). Near-silence
    is a valid, powerful choice.
  * NEVER put brand names, taglines, or any on-screen text in a shot prompt — video models
    render garbled text. Spoken brand names belong in the narration script only.
  * product (i2v) prompts describe ONLY camera, environment, and light interacting with the
    photographed product (push-in, orbit, rim light, dust motes, reflections) — the photo
    already supplies the product's look; never re-describe or contradict it. The STYLE
    opener and character anchors don't apply here, but keep the order and the closing
    "The audio is ..." sentence when narration/music is planned.
  * lipsync (s2v) prompts describe one continuous scene: the speaker's look, natural gestures
    and expression shifts, setting and light — no cuts, no camera moves away from the speaker.
- STORY ARC for multi-shot ads: assign each shot ONE beat in order — hook -> pain ->
  agitate -> pattern break -> solution -> result -> CTA mood — and run a color
  script: cold desaturated grades through the problem beats, turning to warm gold
  AT the pattern-break shot and staying warm to the end.
- LIVING WORLD: every environment or wide shot carries exactly 1-2 background life
  elements — cloth drying on a line and swaying, thin smoke rising from a chulha,
  a bicycle passing, two birds lifting off a roof, a dog crossing the lane — the
  world must feel inhabited, never a sterile empty set. NEVER dense crowds or
  groups of extras (crowd anatomy breaks on every model; 1-2 elements maximum).
- BREATHING INSERTS: any ad of 20s or longer includes at least 2 atmospheric
  non-character inserts — dust motes drifting in a shaft of light, wind moving
  through crops, cloth swinging, a loom wheel turning, water dripping. These are
  the pauses that make premium ads feel cinematic; they cost zero identity risk.
- EMOTIONAL ARC: a character's face must CHANGE across the ad. Assign each
  character shot an "emotion" (schema field) following a progression — neutral ->
  curious -> focused -> small success -> quiet pride/peace — and write it into
  the ACTION physically ("a small smile breaks as the weave holds", "her brow
  tightens in concentration"), never as an adjective floating alone. A whole ad
  on one expression reads as AI; the arc is what reads as film.
- SIGNATURE SHOT: exactly ONE beat per ad is the "wow" shot — a scale reveal the
  viewer remembers: drone-style glide over a landscape, a massive wide with the
  subject tiny in frame, golden light flooding a dark room. Prefer landscapes/
  light/architecture as its subject (scale shots with faces multiply anatomy
  risk). Mark it by giving that shot shot_type "wide" and camera_move
  "drone glide" or "crane rise from chest height to a high wide reveal".
- ENDING RULE: the final beat is environment-as-hero — the subject small inside a
  wide frame, walking away, the world continuing without her — never a static
  centered portrait. The last frame belongs to the world, not the face.
- PRODUCT CONTACT BEAT: when the user HAS a real product photo, plan at least one
  CONTACT beat — the character holding / pouring / drinking / applying the REAL
  product. Plan it as pipeline "product" (i2v) whose start image is a COMPOSITED
  KEYFRAME (the platform composites the character still + the real product photo,
  the user approves it, then the shot animates motion-only: "she raises the
  bottle and drinks, the label steady"). List BOTH the product photo and the
  approved contact keyframe in needs_from_user. Generated pixels can never hold
  label typography — the product must enter every frame as real pixels.
- SPEAKING CHARACTERS (cinematic only): to make someone talk on screen, put the
  spoken line inside the shot prompt in quotes — 'he says warmly in Hindi: "..."' —
  add "His lips move naturally with the words", keep lines to ~8-10 words per shot,
  and leave that ad's narration_script empty. Two characters may exchange short
  lines in ONE shot; each gets a distinct voice. WRITE spoken Hindi lines in
  DEVANAGARI script (ये ज़मीन...) — Latin-script Hinglish inside quotes often
  renders a silent mouth (protein-ad postmortem vs the farmer ads that spoke).
- STYLE GROUNDING: open every shot with a CONCRETE genre anchor the model has a
  visual distribution for — "Realistic documentary footage", "photojournalism",
  "handheld news footage", "35mm film" — never an abstract vibe like "cinematic
  advertising style" alone (the farmer/dentist winners all grounded documentary
  realism first, then layered light and grade on top).
- Every shot's negative_prompt starts from this canonical block (keep it IDENTICAL across
  shots for continuity), then append shot-specific negatives if needed:
  "cartoon, anime, CGI, 3D render, plastic skin, waxy skin, doll face, deformed hands, bad
  anatomy, extra fingers, extra limbs, mismatched hands, swapped objects, morphing props,
  cloned faces, identity drift, face morphing, robotic movement, synchronized movement,
  frozen expressions, jerky motion, flickering, temporal inconsistency, unstable camera,
  static camera, frozen background, stiff walk, sliding feet,
  oversaturated colors, harsh shadows, watermark, logo, subtitles, blurry, low quality"
- product REQUIRES a product photo and lipsync REQUIRES a reference face image. Never assume
  the user has provided one — always list the required asset in needs_from_user.
- lipsync needs no shot list (one continuous take) — give ONE scene/action prompt plus a
  narration script instead.
- Narration scripts: conversational ad copy; ~3 words/second budget (e.g. ~13s of speech
  for a 14s lipsync video; ~5s of speech per pair of overlay shots). Scripts must read
  aloud NATURALLY: flowing spoken sentences a person would actually say — never choppy
  fragment lists or colon constructions ("X: luxury and tradition."), which sound robotic
  when synthesized.
- SEQUENCE proposals return "segments" INSTEAD of shots (set shots to [] and
  narration_script to "" — each segment carries its own script slice). 2-5 segments,
  each {pipeline, prompt, negative_prompt, script}. A segment's pipeline MUST be
  exactly one of overlay|cinematic|product|lipsync — longcat is NOT a valid segment
  type (the ~14s lipsync take IS the long closer). Hindi speech runs ~1.5 words/sec
  (HALF of English) — budget Hindi scripts accordingly:
  * cinematic / overlay segment (~5s): full director-formula prompt (cinematic gets
    the "The audio is..." closer; overlay is silent Wan b-roll). Script slice
    budget: <= 8 words Hindi / 12 English — the voice must fit its 5s window.
  * product segment (~5s): camera/light-only prompt around the photographed product;
    ALWAYS list the product photo in needs_from_user. Same script budget.
  * lipsync segment (~14s): ONE continuous scene prompt (no cuts); its script is the
    SPOKEN pitch. HARD LIMIT — count the words before answering: at most 20 words in
    Hindi / 38 in English. A longer script gets CUT OFF mid-sentence in the render.
    List the face image (or a saved avatar) in needs_from_user.
  * Order segments as story beats (hook -> product -> close) and keep the color arc
    across them; the segment scripts together read as ONE continuous ad narration.
  * RIGHT MODEL PER BEAT (measured on real renders, 2026-07-11 — follow exactly):
    - atmosphere / mood / texture beats with NO recognizable face -> cinematic (LTX:
      strongest light and native sound, zero identity dice).
    - character ACTION beats -> overlay (Wan). A recurring character's shots must
      ALL stay on the same pipeline — two engines will never draw the same face.
    - product/pack-shot beats -> product with the client's REAL photo. Generated
      pixels CANNOT hold label typography (every attempt garbles into gibberish);
      if no photo exists, keep any jar/pack ANONYMOUS and out of focus and say so
      in the prompt — the brand then lives in narration and the caption layer.
    - a character both SEEN ACTING and SPEAKING -> put the speech in the lipsync
      segment and reuse the SAME reference face; never ask a t2v segment to match
      a lipsync segment's face by description alone.
  * The first face or physical-strain moment must land inside the FIRST 2 SECONDS
    of the ad (muted-feed hook rule) — never open on an empty room.
- CINEMATIC RHYTHM (the premium-commercial grammar, from the 2026-07-11 reference
  study — this pacing is why expensive ads FEEL expensive):
  * Shot-size alternation: wide establish -> medium -> close-up -> environmental
    detail insert -> back to wide. Never two same-size shots back to back.
  * The BREATHE rule: after every 3-4 close/medium shots, cut back to a wide
    landscape/environment shot to reset the viewer before diving back in.
  * ONE protagonist carries the whole piece (verbatim anchor in every shot they
    appear in); the arc is a journey — establish -> immerse -> intimate ->
    breathe -> transform. The ENVIRONMENT is the final hero: close on a very
    wide shot where the world dwarfs the character.
  * Detail inserts are mandatory world-building: macro hands-on-texture shots
    (earth, fabric, product surface, steam) with very shallow depth of field —
    at least one per 15s of runtime. They add sensory realism no wide can.
  * Every shot carries exactly ONE subtle motivated movement (the camera preset
    menu above) — no static tripod frames, no flashy transitions; straight cuts
    motivated by movement or composition.
  * Emotion is UNDERPLAYED: thoughtful, observational faces — never exaggerated
    acting. Warm golden-hour light and earth tones (sand, brown, orange, muted
    blue, olive) held across every shot; simple earthy wardrobe.
- CINEMATIC DIRECTOR MODE (when an approach's pipeline is "cinematic" and the idea
  wants feeling over argument — this is the PREMIUM format, not the default):
  * Use the named story template "The Journey": travel -> arrival -> exploration ->
    reflection -> transformation. NO dialogue, no narration hard-sell — the story is
    told visually; audio is ambience/music only (LTX native sound). It sells with
    feeling (tourism, apparel, jewelry, vehicles, real estate); HOOK->PRODUCT->
    PROOF->CTA sells with argument — pick the right genre for the idea.
  * A 30s Journey needs 12-15 SHORT story beats, not 6 long ones — each shot is
    generated at ~5s but only its best ~2s is used at the edit (declare it).
  * Every character shot must be planned as i2v FROM A HERO PORTRAIT of the
    protagonist (list the portrait in needs_from_user; offer to generate it first)
    — never fresh t2v per shot, or the protagonist becomes 8 different people.
  * PORTRAIT VARIANTS: the platform can derive approved EMOTION VARIANTS of the
    hero portrait (curious / concentrating / small success / quiet pride). Match
    each character shot's start image to its "emotion" field — starting every
    beat from the same neutral portrait re-seeds the same neutral face and kills
    the emotional arc. List the needed variants in needs_from_user.
  * Each cinematic shot DECLARES its craft fields (see schema): shot_type follows
    the rotation WIDE -> MEDIUM -> CLOSE -> DETAIL with a WIDE breather every 3-4
    shots; camera_move is EXACTLY one of: push-in | pull-back | handheld drift |
    lateral track | drone glide | dolly forward | orbit | follow.
  * Append the project's ONE grade line verbatim to every shot prompt (golden
    hour, soft shadows, warm earth tones — sand/brown/orange/muted blue/olive,
    simple earthy costume) — the shared grade is what makes 15 generations feel
    like one film.
- The user supplies final creative control — your proposals are STARTING POINTS they will edit.

Respond with STRICT JSON only (no markdown fences):
{"approaches": [{
  "title": str, "pipeline": "overlay|lipsync|product|cinematic|longcat|sequence|multitalk",
  "available": bool, "audio_strategy": str, "why": str,
  "narration_script": str,
  "shots": [{"prompt": str, "negative_prompt": str,
             "shot_type": "wide|medium|close|detail",
             "camera_move": str, "duration_used": float,
             "emotion": str}],
  "segments": [{"pipeline": "overlay|cinematic|product|lipsync", "prompt": str,
                "negative_prompt": str, "script": str}],
  "needs_from_user": [str]
}]}
("segments" only for sequence proposals; otherwise omit it or use [].
shot_type/camera_move/duration_used are REQUIRED for cinematic approaches,
optional elsewhere; duration_used is the best-beat length in seconds, 1.5-2.5.)
"""


DIALOGUE_SYSTEM_PROMPT = """\
You are the planning brain for TWO-SPEAKER DIALOGUE ads (Indian SMB ads, English + Hindi).
The format: shot/reverse-shot conversation — the classic problem -> solution ad. Speaker A
voices the customer's pain; Speaker B lands the product as the answer. Each turn renders as
ONE ~14-second talking-avatar take (Wan-S2V), and the cuts alternate between the speakers.

Given a rough ad idea, write ONE dialogue:
- Exactly the requested number of turns, alternating speakers, starting with A.
- Every turn is SPOKEN aloud in <= 13 seconds: at most ~38 words. Natural, conversational
  lines a real person would say — contractions, rhythm, a little humor; never robotic copy.
  The LAST turn must land the pitch or call-to-action.
- The user message states the LANGUAGE. Hindi dialogue: Devanagari, with brand names and
  English product words kept in Latin script (natural Hinglish is good).
- Give each speaker an Indian first name, a gender ("female"|"male"), and a `scene`: one
  continuous Wan-S2V scene prompt (40-70 words) — the speaker's age, hair, clothing and
  distinct look, natural gestures while talking. No cuts, no on-screen text, no brand
  names inside the scene prompt. The two speakers must be visually distinct people.
- CONVERSATION GRAMMAR (this is what makes the cut feel like one real conversation,
  not two stitched testimonials):
  * ONE shared location for BOTH speakers — same room, same furniture words, same
    light words, repeated VERBATIM in both scenes (e.g. both "at a small wooden table
    in a bright chai stall, warm afternoon light"). Never two different settings.
  * MIRRORED EYELINES: speaker A is "framed from her left, face turned three-quarters
    toward someone just RIGHT of camera"; speaker B is "framed from his right, face
    turned three-quarters toward someone just LEFT of camera". Neither looks straight
    into the lens — they are talking to EACH OTHER across the cut.
  * Listening energy: each scene mentions the speaker occasionally nodding or reacting
    as if mid-conversation, not delivering a monologue.
- Spoken brand names belong in the turns, never in scene prompts.

Respond with STRICT JSON only (no markdown fences):
{"title": str,
 "speakers": [
   {"role": "a", "name": str, "gender": "female|male", "scene": str},
   {"role": "b", "name": str, "gender": "female|male", "scene": str}],
 "turns": [{"speaker": "a|b", "text": str}]}
"""


class PlanError(RuntimeError):
    pass


def _groq_json(system_prompt: str, user_msg: str, temperature: float) -> dict:
    """Groq/Llama JSON-mode call — the independent-vendor rung of the ladder."""
    r = httpx.post(GROQ_URL,
                   headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
                   json={"model": GROQ_MODEL,
                         "temperature": temperature,
                         "response_format": {"type": "json_object"},
                         "messages": [
                             {"role": "system", "content": system_prompt
                              + "\nRespond with a single JSON object only."},
                             {"role": "user", "content": user_msg},
                         ]},
                   timeout=120)
    r.raise_for_status()
    return json.loads(r.json()["choices"][0]["message"]["content"])


def _extract_json(text: str) -> dict:
    """Parse a JSON object out of a completion that may carry fences or
    reasoning prose around it (Qwen-class models think out loud)."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else ""
        text = text.rsplit("```", 1)[0]
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        raise json.JSONDecodeError("no JSON object in completion", text[:80], 0)
    return json.loads(text[start:end + 1])


def _nvidia_json(system_prompt: str, user_msg: str, temperature: float) -> dict:
    """NVIDIA NIM (Qwen 3.5) call. No response_format — support varies per NIM
    model, so we instruct JSON and parse defensively instead."""
    r = httpx.post(NVIDIA_URL,
                   headers={"Authorization": f"Bearer {NVIDIA_API_KEY}"},
                   json={"model": NVIDIA_MODEL,
                         "temperature": temperature,
                         "max_tokens": 8192,
                         "messages": [
                             {"role": "system", "content": system_prompt
                              + "\nRespond with a single JSON object only — no prose, no fences."},
                             {"role": "user", "content": user_msg},
                         ]},
                   timeout=120)
    r.raise_for_status()
    return _extract_json(r.json()["choices"][0]["message"]["content"])


def _fallback_json(system_prompt: str, user_msg: str, temperature: float,
                   require: str | None = None) -> dict | None:
    """The non-Gemini rungs, in order: NVIDIA (Qwen) then Groq (Llama).
    `require` names a top-level key the answer must carry — a rung returning
    valid-but-wrong-shape JSON counts as a failure so the NEXT rung is tried
    (otherwise one confused model short-circuits the whole ladder). Rung
    exceptions are swallowed broadly: a fallback must never crash the ladder.
    Returns None only when every configured rung fails."""
    for enabled, call in ((NVIDIA_API_KEY, _nvidia_json), (GROQ_API_KEY, _groq_json)):
        if not enabled:
            continue
        try:
            out = call(system_prompt, user_msg, temperature)
            if isinstance(out, dict) and (not require or require in out):
                return out
        except Exception:
            pass
    return None


def _gemini_json(system_prompt: str, user_msg: str, temperature: float,
                 require: str | None = None) -> dict:
    """One structured-JSON call with the platform's healing strategy:
      503/500 (overloaded)  -> short backoff, retry same model
      429 (free-tier quota) -> WAIT the delay Google names (fast retries burn
                               MORE quota in the same window), retry; if still
                               exhausted, fall back to flash-lite — free-tier
                               quotas are per model, so its pool is separate.
      Both Gemini pools dry -> Groq-hosted Llama (separate vendor entirely).
    """
    if not GEMINI_API_KEY:
        fb = _fallback_json(system_prompt, user_msg, temperature, require)
        if fb is not None:
            return fb
        raise PlanError(
            "GEMINI_API_KEY is not set (and no NVIDIA/Groq fallback answered). "
            "Add keys to adgen-backend/.env."
        )
    body = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_msg}]}],
        "generationConfig": {
            "temperature": temperature,
            "response_mime_type": "application/json",
        },
    }
    attempts = [GEMINI_MODEL, GEMINI_MODEL, GEMINI_FALLBACK_MODEL]
    last_err: str = ""
    r = None
    for i, model in enumerate(attempts):
        try:
            r = httpx.post(
                GEMINI_URL.format(model=model),
                headers={"x-goog-api-key": GEMINI_API_KEY},
                json=body,
                timeout=120,
            )
            r.raise_for_status()
            break
        except httpx.HTTPStatusError as e:
            code = e.response.status_code
            last_err = f"Gemini plan failed ({code}): {e.response.text[:800]}"
            if i == len(attempts) - 1 or code not in (429, 500, 503):
                # separate vendors — NVIDIA (Qwen) then Groq (Llama)
                fb = _fallback_json(system_prompt, user_msg, temperature, require)
                if fb is not None:
                    return fb
                raise PlanError(last_err) from None
            if code == 429:
                m = re.search(r"retry in ([0-9.]+)s", e.response.text)
                time.sleep(min(float(m.group(1)) + 1.0 if m else 30.0, 45.0))
            else:
                time.sleep(2 * (i + 1))
    if r is None:  # pragma: no cover — loop always breaks or raises
        raise PlanError(last_err)

    try:
        text = r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
        # Gemini sometimes wraps the JSON in ```json fences despite the instruction.
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else ""
            text = text.rsplit("```", 1)[0]
        out = json.loads(text)
        if require and require not in out:
            raise PlanError(f"Gemini plan missing required key '{require}'")
        return out
    except (KeyError, IndexError, json.JSONDecodeError, PlanError) as e:
        # a 200 response can still carry broken/wrong-shape JSON (long verbatim
        # briefs are the usual trigger) — that must fall through to NVIDIA/Groq
        # exactly like an HTTP error does, not dead-end the whole ladder.
        fb = _fallback_json(system_prompt, user_msg, temperature, require)
        if fb is not None:
            return fb
        raise PlanError(f"Gemini returned an unparseable plan: {e}") from None


QUESTIONS_PROMPT = """\
You are the intake brain of an AI ad studio for Indian SMBs (English + Hindi).
The user just said what they're advertising. Ask ONLY the follow-up questions whose
answers would genuinely CHANGE the ad you'd plan — the way a sharp creative director
probes a new client. Never ask generic filler; make every question specific to THIS
product/business, and make the chip options concrete guesses for THIS case (localized,
Indian-market real). Good axes to consider (pick what matters, skip what doesn't):
who it must reach, the one claim/offer to push, tone/vibe, whether they have a real
product photo or presenter face to feature, festival/season timing, price positioning.

Return STRICT JSON:
{"questions": [{"key": "<snake_slug>", "ask": "<the question, short, friendly>",
  "placeholder": "<example answer text>", "chips": ["<3-5 tappable options>"]}]}
2 to 4 questions, in the order you'd ask them. Write in the user's language."""


def plan_questions(idea: str, language: str = "en") -> dict:
    """Dynamic intake: the brain reads the user's idea and asks the follow-ups a
    creative director would — replaces the hardcoded audience/vibe questions."""
    out = _gemini_json(
        QUESTIONS_PROMPT,
        f"Language: {language}\nThe user is advertising: {idea.strip()}",
        temperature=0.7, require="questions",
    )
    qs = out.get("questions") or []
    clean = []
    for q in qs[:4]:
        if not (q.get("ask") or "").strip():
            continue
        clean.append({
            "key": str(q.get("key") or f"q{len(clean) + 1}")[:40],
            "ask": str(q["ask"])[:160],
            "placeholder": str(q.get("placeholder") or "")[:120],
            "chips": [str(c)[:40] for c in (q.get("chips") or [])[:5]],
        })
    if not clean:
        raise PlanError("intake brain returned no usable questions")
    return {"questions": clean}


def plan(idea: str, language: str = "en", ad_format: str = "9:16",
         duration_s: int = 15, avoid: list[str] | None = None,
         cast: list[dict] | None = None) -> dict:
    """Ask Gemini for 3 proposed ad approaches. Returns the parsed proposals dict.

    `avoid` carries the titles of directions the user already rejected (the
    Regenerate button) — the new batch must steer clear of them.
    `cast` carries saved characters as {name, anchor} — the plan must build its
    shots around them and paste each anchor VERBATIM (the SUBJECT-anchor rule
    the system prompt already teaches, now with a fixed cast instead of an
    invented one).
    """
    user_msg = (
        f"Ad idea: {idea}\n"
        f"Language for narration: {language}\n"
        f"Format: {ad_format}\n"
        f"Target duration: {duration_s} seconds"
    )
    if cast:
        lines = "\n".join(f'- {c["name"]}: "{c["anchor"]}"' for c in cast)
        user_msg += (
            f"\nCAST — build the shots around these saved characters. Paste each "
            f"character's anchor WORD-FOR-WORD into every shot they appear in "
            f"(never paraphrase an anchor — verbatim repetition is what keeps the "
            f"same actor across cuts):\n{lines}"
        )
    if avoid:
        rejected = "; ".join(a.strip() for a in avoid if a.strip())
        user_msg += (
            f"\nThe user REJECTED these directions — do not repeat or lightly rework "
            f"them; propose 3 clearly different creative directions: {rejected}"
        )
    # Regenerates run hotter — the user explicitly wants different ideas.
    proposals = _gemini_json(SYSTEM_PROMPT, user_msg,
                             temperature=0.9 if avoid else 0.7, require="approaches")
    if "approaches" not in proposals or not proposals["approaches"]:
        raise PlanError("Gemini returned no approaches.")
    return proposals


DIRECTOR_PROMPT = """\
You are the DIRECTOR'S ASSISTANT of an AI ad studio's timeline editor. The user
speaks like a director ("cut the first 2 seconds of the voice", "use the other
take of scene 3", "tighten everything", "kill 14 to 16 seconds", "make me a 20s
chai ad in Hindi") and you translate intent into editor operations. You NEVER
invent creative content — scripts and music come from the user.

You receive CONTEXT: the current timeline as JSON — clips (1-based index, label,
source duration, in_s/out_s window, takes available), voice track state
(source, offset_s, trim, gain), total seconds, and available narration files.

Respond with STRICT JSON only:
{"say": "<one short director-speak sentence: what you did or need>",
 "ops": [<zero or more operations, executed in order>]}

Operations (use EXACTLY these shapes; clip = 1-based index from CONTEXT):
 {"op":"trim","clip":int,"in_s":float|null,"out_s":float|null}   null = keep current
 {"op":"center_cut","clip":int|null,"seconds":float}             null clip = ALL clips
 {"op":"reorder","from":int,"to":int}                            1-based positions
 {"op":"swap_take","clip":int,"take":int}
 {"op":"delete","clip":int}
 {"op":"split","at_s":float}                                     timeline seconds
 {"op":"range_cut","start_s":float,"end_s":float}                remove this span
 {"op":"voice_offset","seconds":float}
 {"op":"voice_trim","in_s":float|null,"out_s":float|null}        trim WITHIN the voice file
 {"op":"voice_gain","gain":float}                                0.4-2.0
 {"op":"set_narration","name":str|null}                          null = clips' own audio
 {"op":"voice_script","script":str,"language":"hi"|"en"}
     the user pasted a READY narration script to speak over the cut — pass it
     VERBATIM (never rewrite, never translate); it is synthesized at export.
 {"op":"playhead","at_s":float}
 {"op":"preview"}
 {"op":"export","name":str|null}
 {"op":"plan","idea":str,"language":"hi"|"en","duration_s":int,"format":str}  new ad brief
 {"op":"generate_approach","index":int}   user picks approach N from the LAST shown plan
 {"op":"generate_portrait","description":str,"subject":"person"|"product"}
     create a NEW hero still from scratch (no reference exists yet).
     subject="person" (default): a full physical anchor — age, face, skin tone,
     hair, every garment with color — end with "head-and-shoulders portrait,
     neutral expression, looking at camera, photorealistic". The ✓-approved
     portrait becomes THE person for the session; variants derive from that
     exact image.
     subject="product": a GENERIC, UNBRANDED object/food/packshot (e.g. "a pizza
     box", "a cold drink can"). Describe it as studio product photography — NEVER
     add any portrait/headshot phrasing (that renders a human).
     Do NOT generate a REAL branded product the ad must show (a specific label or
     logo) — list it in needs_from_user as an upload; generated brand text garbles.
     An approval grid appears either way.
 {"op":"portrait_variants","portrait":str|null,"emotions":[str]|null}
     emotion stills from a hero portrait — approval grid appears in the chat.
     Reference the portrait by a filename from CONTEXT.stills; null only when
     there is exactly one still. Default emotions: curious / concentrating /
     small success / quiet pride.
 {"op":"keyframes","scenes":[str],"character":str|null,"product":str|null}
     per-shot stills conditioned on named stills from CONTEXT.stills (the
     stills-first flow: approve images, then animate). Write scenes as full
     keyframe descriptions.
 {"op":"ask","question":str}                                     when genuinely ambiguous
 {"op":"captions","items":[{"start":float,"end":float,"text":str,"position":"top"|"bottom"|"center","accent":bool}]}
     burn timed on-screen text/supers into the CURRENT rendered video (the most
     recent completed render or export in this conversation — never a still).
     Only fires when the user gives or pastes concrete on-screen text lines with
     timing (a script's "on-screen text" cues, or explicit "put OVERLAY from
     Xs to Ys"); never invent caption text yourself. Devanagari-safe. Keep each
     text <=120 chars; position defaults to "bottom"; accent=true for CTA/price
     lines that should pop in the accent color.

Rules:
- Resolve "scene N" via the clip labels in CONTEXT; if a reference is ambiguous
  (two clips could match, no voice track loaded for a voice op), emit ONE ask op
  and no destructive ops.
- "cut/remove the first X seconds of the audio/voice" -> voice_trim with in_s=X
  (voice ops act on the VOICE track when one is loaded; otherwise ask).
- "cut/remove seconds A to B" (of the film) -> range_cut.
- Sentences may compound: "swap scene 2 to take 1 and tighten it" -> swap_take
  then center_cut on that clip. Keep ops <= 8 per turn.
- Never export unless the user asks to export/render/finish.
- Only emit generate_approach when the user EXPLICITLY starts a shown approach
  ("make the first one", "render approach 2", "go with #1"). NEVER emit it from a
  message about handling an upload, how to use an image, adjusting the cut, or
  general conversation — those are not a render command. When unsure, emit ask.
- A fresh ad request ("make me a ... ad") -> ONE plan op; the app runs the
  planner and shows the treatment — do not fabricate shots yourself.
- "say" is a colleague's confirmation ("Trimmed the voice head by 2s — it now
  starts on the first beat."), never a JSON echo."""

_DIRECTOR_OPS = {
    "trim", "center_cut", "reorder", "swap_take", "delete", "split", "range_cut",
    "voice_offset", "voice_trim", "voice_gain", "set_narration", "voice_script",
    "playhead", "preview", "export", "plan", "generate_approach",
    "generate_portrait", "portrait_variants", "keyframes", "ask", "captions",
}


def director_intent(message: str, context: dict, history: list[dict] | None = None) -> dict:
    """One director-chat turn: user sentence + timeline context -> validated ops.

    The frontend executes the ops with its existing editor functions — this
    seam only translates intent, it never touches files or jobs itself."""
    lines = [f"CONTEXT:\n{json.dumps(context, ensure_ascii=False)[:6000]}"]
    for h in (history or [])[-6:]:
        role = "user" if h.get("role") == "user" else "assistant"
        lines.append(f"{role}: {str(h.get('text', ''))[:300]}")
    lines.append(f"user: {message.strip()[:4000]}")
    out = _gemini_json(DIRECTOR_PROMPT, "\n".join(lines), temperature=0.2, require="say")
    say = str(out.get("say") or "").strip()[:400]
    ops = []
    for op in (out.get("ops") or [])[:8]:
        if isinstance(op, dict) and op.get("op") in _DIRECTOR_OPS:
            ops.append(op)
    if not say and not ops:
        raise PlanError("director brain returned neither words nor operations")
    return {"say": say or "Done.", "ops": ops}


def plan_dialogue(idea: str, language: str = "en", turns: int = 2,
                  regenerate: bool = False) -> dict:
    """Ask Gemini for one two-speaker dialogue ad (speakers + alternating turns)."""
    user_msg = (
        f"Ad idea: {idea}\n"
        f"Language for the dialogue: {language}\n"
        f"Number of turns: {turns}"
    )
    if regenerate:
        user_msg += "\nWrite a FRESH take — different angle and lines than an earlier draft."
    result = _gemini_json(DIALOGUE_SYSTEM_PROMPT, user_msg,
                          temperature=0.9 if regenerate else 0.7, require="turns")
    if not result.get("turns") or len(result.get("speakers", [])) != 2:
        raise PlanError("Gemini returned an incomplete dialogue plan.")
    return result
