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
    # LTX renders ~5s; a slow settle reads as deliberate at that length.
    "ltx": "slow push-in from wide over three seconds, settling at a medium shot and holding there",
    "wan_t2v": "slow lateral dolly at walking pace settling into a steady medium shot",
    # Image-anchored engines must not wander off the reference framing.
    "wan_i2v": "static locked-off medium shot, holding chest-up",
    "wan_s2v": "static locked-off medium shot, holding chest-up",
    "longcat": "static locked-off medium shot, holding chest-up",
}
_FALLBACK_CAMERA = _DEFAULT_CAMERA["ltx"]

# Applied once, at the end, so a second pass is a no-op.
_STAMP = "  "  # two spaces: invisible in output, but see _already_enhanced


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

    return text, build_negative(negative, stylised=stylised)


def enhance_shot(shot: dict, *, engine: str = "ltx",
                 image_anchored: bool = False) -> dict:
    """In-place convenience wrapper for a {"prompt", "negative_prompt"} dict."""
    shot["prompt"], shot["negative_prompt"] = enhance_prompt(
        shot.get("prompt", ""), engine=engine, image_anchored=image_anchored,
        negative=shot.get("negative_prompt"))
    return shot
