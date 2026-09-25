"""The single place a video prompt is brought up to house standard.

WHY THIS EXISTS
---------------
The house shot-prompt formula (STYLE -> SUBJECT -> ACTION -> SCENE -> CAMERA ->
LIGHT/COLOR -> AUDIO, the closed camera menu, the canonical negative block) lived
only inside llm.SYSTEM_PROMPT — i.e. it applied ONLY to prompts the planner wrote,
and only as advice it could ignore. Every other origin reached the GPU raw:

  * six frontend surfaces where a person types or edits a prompt,
  * main._beat_prompt, the sole prompt source for every episode render,
  * the timeline's browser-side composer for the director's render_shot op,
  * stored character/environment anchors,
  * any pasted script.

The measured cost of that gap was not subtle. Every video render site reads
`if shot.get("negative_prompt")`, so a prompt with no negative shipped with NO
NEGATIVE AT ALL, falling back to whatever the graph baked in. For ltx2_av — the
cinematic lane — that default is the complete string:

    "pc game, console game, video game, cartoon, childish, ugly"

No anti-deformed-hands, no anti-plastic-skin, no anti-morphing-props. The QC pass
on a6000-coffee-v2 flagged "prop glitch: coffee cup morphs into a different mug
style" on a clip rendered under exactly that default — a defect the canonical
block's "morphing props, swapped objects" exists to suppress. Stills already had
tuned defaults (FACE_NEGATIVE, PRODUCT_NEGATIVE, SHEET_NEGATIVE, _KEYFRAME_NEGATIVE);
video had none.

DESIGN
------
Deterministic, additive, idempotent. No LLM call: this runs per shot, and putting
a model hop in the render path would add latency and burn the same Gemini quota
that already starves QC. Enhancement is therefore textual and conservative — it
ADDS what is missing and never rewrites what the author wrote.

Style intent is detected, not assumed. A prompt that asks for a cartoon keeps its
cartoon: it gets no documentary opener, and the conflicting anti-illustration terms
are dropped from its negative. Fighting the author's stated style is worse than
adding nothing.
"""

from __future__ import annotations

import re

# The canonical negative block, kept BYTE-IDENTICAL to the one taught in
# llm.SYSTEM_PROMPT (the "Every shot's negative_prompt starts from this canonical
# block" rule). Two copies of one string is a maintenance smell, but the planner
# needs it as literal prose inside a prompt while the renderer needs it as data;
# _CANON_PARTS below is the shared source of truth and llm.py quotes it verbatim.
#
# NOTE: "static camera" is deliberately ABSENT. Four of the ten camera presets
# hold the camera still on purpose; negating it there tells the model to hold and
# not hold at once, which produces the drifting framing those presets prevent.
# The stasis we penalise is a DEAD SCENE, not a deliberately still camera.
_CANON_PARTS: tuple[str, ...] = (
    # look / medium
    "cartoon", "anime", "CGI", "3D render",
    # skin + faces
    "plastic skin", "waxy skin", "doll face", "cloned faces", "face morphing",
    # hands + anatomy — the defects clients reject on sight
    "deformed hands", "bad anatomy", "extra fingers", "extra limbs", "mismatched hands",
    # props + continuity
    "swapped objects", "morphing props", "identity drift",
    # motion
    "robotic movement", "synchronized movement", "frozen expressions", "jerky motion",
    "flickering", "temporal inconsistency", "unstable camera",
    "still photograph", "motionless subject", "frozen background",
    "stiff walk", "sliding feet",
    # grade + artefacts
    "oversaturated colors", "harsh shadows", "watermark", "logo", "subtitles",
    "blurry", "low quality",
)

CANONICAL_NEGATIVE = ", ".join(_CANON_PARTS)

# Terms that only make sense when the ad is photoreal. A stylised prompt keeps its
# style: these are stripped so we never negate the look the author asked for.
_PHOTOREAL_ONLY = frozenset({"cartoon", "anime", "CGI", "3D render",
                             "plastic skin", "waxy skin", "doll face"})

# The defects worth suppressing NO MATTER the art direction. A 2D cartoon still
# must not have six fingers or a mug that morphs between frames.
_STYLE_AGNOSTIC = frozenset(_CANON_PARTS) - _PHOTOREAL_ONLY

# An author who names a non-photoreal medium means it. Matched word-ish so
# "cartoonish" counts but "uncartoon" does not.
_STYLISED = re.compile(
    r"\b(cartoon\w*|anime|animated|illustrat\w+|2d|3d|cgi|claymation|stop[- ]motion|"
    r"storybook|comic|vector|pixel[- ]art|watercolou?r|painterly|sketch\w*|"
    r"low[- ]poly|cel[- ]shad\w+|render\w*)\b",
    re.I,
)

# Already-photoreal openers. If the author (or the planner) has anchored realism,
# we must not prepend a second one — that is how "Realistic documentary footage:
# Realistic documentary footage: ..." happens on a re-plan.
_REALISM = re.compile(
    r"\b(realistic|photoreal\w*|documentary|photojournalis\w+|candid|live[- ]action|"
    r"cinema[- ]?v[ée]rit[ée]|shot on \w+|film still)\b",
    re.I,
)

# The house opener, verbatim from the formula's STYLE rule.
REALISM_OPENER = "Realistic documentary footage:"

# Does the prompt already direct the camera? Deliberately broad — a prompt that
# mentions ANY camera intent keeps it; we only supply one when there is none.
_HAS_CAMERA = re.compile(
    r"\b(camera|shot|dolly|orbit|pan\w*|tilt\w*|track\w*|handheld|crane|zoom\w*|"
    r"push[- ]in|pull[- ]back|close[- ]up|wide|medium|rack focus|locked[- ]off|"
    r"static|aerial|drone|fpv|over[- ]the[- ]shoulder|pov)\b",
    re.I,
)

# Engine-appropriate default camera. These are drawn from the closed menu in
# llm.SYSTEM_PROMPT and carry a SPEED and a SETTLE — a move with no measurable
# speed or end state produces the unbounded push-in that collapses into an ugly
# extreme close-up by the last second.
_DEFAULT_CAMERA = {
    # CONTINUOUS moves only. These clips are ~4.84s and qc.FREEZE_FAIL_S is 0.8s,
    # so any camera that arrives somewhere and HOLDS spends its last second static
    # and fails the freeze gate. Measured on the-awakening-ritual: a "settling ...
    # and holding there" phrasing produced frame-to-frame deltas of 0.02-0.10 for
    # the first 16 and last 15 frames against a mid-clip peak of 1.40 — QC read
    # 0.92s frozen on all three takes, so the shot burned every re-roll and still
    # shipped failing. A move that never settles keeps the whole clip alive.
    "ltx": "slow continuous push-in at a steady creep throughout the shot, never settling",
    "wan_t2v": "slow continuous lateral dolly at walking pace throughout the shot",
    # Image-anchored engines must not wander off the reference framing, so the
    # camera stays put — but the SUBJECT has to carry the motion. These lanes are
    # safe because their subject is inherently moving (a talking head on s2v, a
    # turning product on i2v); a still camera over a still subject would freeze.
    "wan_i2v": "locked-off medium shot, framing held steady while the subject moves",
    "wan_s2v": "locked-off medium shot, framing held steady while the subject speaks",
    "longcat": "locked-off medium shot, framing held steady while the subject speaks",
}
_FALLBACK_CAMERA = _DEFAULT_CAMERA["ltx"]

# --- light / contrast -------------------------------------------------------
# Haze is the one defect we CANNOT fix with a negative prompt on the cinematic
# lane (proven on the pod: a negative naming "potted green plant, plant, leaves"
# left the plant fully present at NAG scale 5, 15 AND 30 — negated content is not
# removed there at any scale). So contrast has to be asked for POSITIVELY.
#
# The measured signature of a hazy render is a compressed luma range: the
# awakening-ritual render sat at black 78 / white 156 = 79 levels against 102 on
# a clean one, and measured 0.78 sharpness against 2.47.
_HAS_LIGHT = re.compile(
    r"\b(light|lighting|lit|sunlight|sunlit|daylight|backlit|golden hour|shadow\w*|"
    r"contrast|silhouett\w+|grade[dr]?|tones?|overcast|neon|lamp|glow|dim|bright)\b",
    re.I,
)
# Deliberately names CONTRAST, not just a mood. "soft diffused morning light" is
# what produces the flat grey frame; a stated black point is what prevents it.
CONTRAST_CLAUSE = ("Crisp directional light with deep true blacks and clean bright "
                   "highlights, strong tonal contrast, no haze")

# --- vagueness gate ---------------------------------------------------------
# A prompt too thin to render reliably costs THREE generations, not one: QC fails
# the take, the seed re-rolls, and the shot ships failing anyway (measured on
# the-awakening-ritual, where all three takes failed and the third still shipped).
# Catching it before the first GPU second is far cheaper than after the third.
#
# Threshold logic is deliberately crude and permissive. It exists to catch "a man
# drinking coffee", not to grade prose — a false block on a good prompt is worse
# than a wasted render.
_ACTION_VERB = re.compile(
    r"\b\w+(s|es|ing)\b", re.I)          # any inflected verb: lifts, pouring, taps
_CONCRETE_HINT = re.compile(
    r"\b(a|an|the)\s+\w+", re.I)         # article + noun ~ a named thing

# Words that carry no visual information. A prompt made mostly of these is the
# "cinematic advertisement shot." failure mode the formula bans.
_FILLER = frozenset({
    "cinematic", "beautiful", "stunning", "amazing", "nice", "good", "great",
    "dynamic", "epic", "professional", "high", "quality", "best", "awesome",
    "shot", "video", "footage", "scene", "clip", "ad", "advertisement",
})

# Two ACTION failure modes, each measured on a real render. These only WARN —
# they lower the score but do not by themselves block — because both are
# judgement calls and a false block costs more than a soft take.
#
# (1) Two mechanical processes joined by while/as. "presses the plunger down
#     through the grounds WHILE coffee streams into the cup" is a plunge and a
#     pour at the same instant; the model rendered a pour-over carafe instead,
#     twice, across two seeds.
#     Both sides must be a MANIPULATION verb — a hand acting on an object. An
#     earlier version matched any inflected word either side of while/as, which
#     flagged "takes a slow sip, then sets it down AS his shoulders drop": that is
#     one action plus a bodily consequence, and it rendered correctly. Only
#     independent mechanical processes are the failure.
_PROCESS_VERB = (r"press(?:es|ing)?|pour(?:s|ing)?|stream(?:s|ing)?|plunge[sd]?|plunging|"
                 r"brew(?:s|ing)?|stir(?:s|ring)?|shak(?:es|ing)|twist(?:s|ing)?|"
                 r"grind(?:s|ing)?|flow(?:s|ing)?|fill(?:s|ing)?|drip(?:s|ping)?|"
                 r"chop(?:s|ping)?|slic(?:es|ing)|whisk(?:s|ing)?|knead(?:s|ing)?")
_TWO_PROCESS = re.compile(
    rf"\b(?:{_PROCESS_VERB})\b[^.]{{0,90}}\b(?:while|as)\b[^.]{{0,90}}\b(?:{_PROCESS_VERB})\b",
    re.I)

# (2) A stative leading verb. If the first finite verb is "stands"/"sits"/"holds",
#     the model is being told to render a person existing, and it does — every
#     prop correct, hands in lap, action never performed.
_STATIVE_LEAD = re.compile(
    r"^[^.]*?\b(stands?|sits?|sat|holds?|is\s+(?:seen|positioned|standing|sitting)|"
    r"leans?|rests?)\b", re.I)


def assess(prompt: str) -> dict:
    """Score how renderable a prompt is. Returns {score, ok, reasons}.

    score 0-100. Not a style judgement — purely "does this name enough concrete
    things for a video model to land them repeatably". The A/B that motivated
    this: "alarm clock / bedside table" drifted and failed three takes, while
    "RED ALARM CLOCK on a WOODEN BEDSIDE TABLE beside a small POTTED GREEN PLANT"
    landed every object first try on the same model and seed."""
    text = (prompt or "").strip()
    words = re.findall(r"[A-Za-z']+", text)
    n = len(words)
    reasons: list[str] = []

    if n < 12:
        reasons.append(f"only {n} words — too thin to pin down a shot (aim for 45-90)")
    nouns = len(_CONCRETE_HINT.findall(text))
    if nouns < 3:
        reasons.append(f"names only {nouns} concrete thing(s) — say WHICH objects are in frame")
    if not _ACTION_VERB.search(text):
        reasons.append("no action verb — a shot with no motion renders as a frozen frame")
    meaningful = [w for w in words if w.lower() not in _FILLER]
    if n and len(meaningful) / n < 0.6:
        reasons.append("mostly vibe words (cinematic/beautiful/epic) — these direct nothing")

    # Strip the style opener before the stative test: "Realistic documentary
    # footage:" is not the sentence's verb, and the check is about what the
    # SUBJECT is first said to do.
    body = re.sub(r"^\s*realistic documentary [a-z-]+:\s*", "", text, flags=re.I)
    two_process = bool(_TWO_PROCESS.search(body))
    stative = bool(_STATIVE_LEAD.search(body))
    if two_process:
        reasons.append("two processes joined by 'while'/'as' — the model renders "
                       "neither cleanly; split this into two shots")
    if stative:
        reasons.append("leading verb is stative (stands/sits/holds) — lead with the "
                       "action itself or the subject will just exist on camera")

    score = 100
    score -= 34 * (n < 12)
    score -= 26 * (nouns < 3)
    score -= 20 * (not _ACTION_VERB.search(text))
    score -= 20 * bool(n and len(meaningful) / n < 0.6)
    score -= 15 * two_process
    score -= 10 * stative
    score = max(0, score)
    return {"score": score, "ok": score >= MIN_RENDERABLE_SCORE, "reasons": reasons}


# Below this a prompt is refused BEFORE any GPU spend. Set low on purpose: it
# should only catch prompts that are genuinely unrenderable, never merely plain
# ones. Everything between this and 100 renders, with thin prompts noted.
MIN_RENDERABLE_SCORE = 40


def _split_terms(neg: str) -> list[str]:
    return [t.strip() for t in (neg or "").split(",") if t.strip()]


def is_stylised(prompt: str) -> bool:
    """True when the author asked for a non-photoreal look.

    Checked BEFORE the realism test so "3D render of a realistic cat" is treated
    as stylised — the medium wins over an adjective describing it."""
    return bool(_STYLISED.search(prompt or ""))


def build_negative(existing: str | None, *, stylised: bool) -> str:
    """Merge the canonical block into whatever the author supplied.

    Additive by design: the author's own negatives always survive, and canonical
    terms are appended only when absent, so calling this twice is a no-op. On a
    stylised prompt the anti-illustration terms are dropped — negating "cartoon"
    on a cartoon brief is how a deliberate art direction gets sanded off — but the
    anatomy, prop and continuity terms stay, because six fingers is a defect in
    every medium."""
    have = _split_terms(existing)
    lowered = {t.lower() for t in have}
    wanted = _STYLE_AGNOSTIC if stylised else set(_CANON_PARTS)
    # Preserve canonical ORDER rather than set order, so the negative is stable
    # across renders and diffable between takes.
    additions = [t for t in _CANON_PARTS if t in wanted and t.lower() not in lowered]
    return ", ".join(have + additions)


def enhance_prompt(prompt: str,
                   *,
                   engine: str = "ltx",
                   image_anchored: bool = False,
                   negative: str | None = None) -> tuple[str, str]:
    """Bring one shot up to house standard. Returns (prompt, negative_prompt).

    `engine`        one of _DEFAULT_CAMERA's keys; selects the fallback camera.
    `image_anchored` the shot starts from a reference image (product / identity
                     lock / i2v). Such shots get a locked-off camera and NO
                     realism opener — the look is set by the reference, and a
                     style sentence prepended to an i2v prompt fights it.

    Idempotent: enhancing an already-enhanced prompt returns it unchanged."""
    text = (prompt or "").strip()
    if not text:
        # Nothing to enhance, but the negative floor still applies — an empty
        # prompt with a real negative is a better failure than an empty both.
        return text, build_negative(negative, stylised=False)

    stylised = is_stylised(text)

    # 1. STYLE. Only for photoreal, non-image-anchored shots that have not already
    #    anchored realism themselves.
    if not stylised and not image_anchored and not _REALISM.search(text):
        text = f"{REALISM_OPENER} {text[0].lower() + text[1:] if text[:1].isupper() else text}"

    # 2. CAMERA. Supply one only when the author directed none. A prompt that
    #    already names any camera intent keeps it verbatim — overriding a stated
    #    camera is exactly the "unbounded push-in" failure the closed menu exists
    #    to prevent, and the author is likelier than us to know the beat.
    if not _HAS_CAMERA.search(text):
        cam = _DEFAULT_CAMERA.get(
            "wan_i2v" if image_anchored else engine, _FALLBACK_CAMERA)
        text = f"{text.rstrip().rstrip('.')}. {cam[0].upper()}{cam[1:]}."

    # 3. LIGHT/CONTRAST. Only when the author described none, and only for
    #    photoreal shots. This is the sole defence against the flat grey frame on
    #    the cinematic lane, where a negative prompt provably cannot remove
    #    anything — so "no haze" has to be asserted positively or not at all.
    if not stylised and not _HAS_LIGHT.search(text):
        text = f"{text.rstrip().rstrip('.')}. {CONTRAST_CLAUSE}."

    return text, build_negative(negative, stylised=stylised)


def enhance_shot(shot: dict, *, engine: str = "ltx",
                 image_anchored: bool = False) -> dict:
    """In-place convenience wrapper for a {"prompt", "negative_prompt"} dict."""
    shot["prompt"], shot["negative_prompt"] = enhance_prompt(
        shot.get("prompt", ""), engine=engine, image_anchored=image_anchored,
        negative=shot.get("negative_prompt"))
    return shot
