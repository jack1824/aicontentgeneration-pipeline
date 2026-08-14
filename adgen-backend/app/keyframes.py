"""Stills-first keyframe stage (consistency architecture, 2026-07-10 research;
local engine 2026-07-12).

The industry-consensus fix for shot-to-shot drift: lock identity/wardrobe/
palette in IMAGE space first — one keyframe per shot, every keyframe derived
from the SAME canonical character still and the SAME real product photo — get
the stills approved (cheap re-rolls, human taste in the loop), then demote
video models to motion-only: each approved keyframe rides the existing Wan i2v
lane (sequence `product` segments) with I2V_PRESERVE.

ENGINE: Qwen-Image-Edit 2509 on the pod (Apache-2.0, ComfyUI graph
`qwen_image_edit`, ~30GB one-time download) — an EDIT model, so the reference
person/product comes back IDENTICAL with only the instructed change. Gemini
image editing remains as the API fallback when no pod is reachable (needs paid
image quota).

A failed video take re-animates the same approved still, so retries can never
drift identity, wardrobe or product. Keyframes land in assets/keyframes/ and
are served via /assets-files for the approval pass.
"""
import base64
import copy
import random
import re
import time
import uuid
from pathlib import Path

import httpx

from app.config import COMFY_POD_URLS, GEMINI_API_KEY
from app.providers import comfy
from app.qc import QC_GEMINI_API_KEY
from app.workflow_mappings import QWEN_EDIT_MAPPING

KEYFRAME_MODEL = "gemini-2.5-flash-image"  # API fallback engine only
_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
KEYFRAMES_DIR = Path("assets/keyframes")

_MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}

# The edit instruction is a fixed contract: scene wording varies, fidelity
# language never does (identity + label fidelity are the whole point).
_EDIT_TEMPLATE = """\
Create ONE photorealistic keyframe image for a video ad shot.

{subjects}

SCENE FOR THIS KEYFRAME: {scene}

STRICT RULES:
- The person's face, hairstyle and every garment must stay IDENTICAL to the reference — same colors, same fabrics, no added or removed clothing items.
- The product's label must stay PIXEL-FAITHFUL to the reference: identical text, identical logo, identical colors. Never redraw or restyle packaging text.
- Photorealistic advertising photography: sharp focus on the subject, natural light logic, no borders, no split panels, no text overlays, no watermark.
- Frame it as described in the scene; keep the composition clean with room for social captions at top and bottom."""

_KEYFRAME_NEGATIVE = (
    "cartoon, anime, CGI, 3D render, plastic skin, waxy skin, doll face, "
    "deformed hands, extra fingers, split panels, collage, borders, text, "
    "watermark, logo overlay, blurry, low quality"
)

# Canonical portrait emotion variants (the review's emotional-arc fix): derive
# these from an approved hero portrait, get THEM approved, then each character
# beat starts i2v from the variant matching its planned emotion instead of
# re-seeding the same neutral face every shot.
VARIANT_SCENES = {
    "curious": (
        "The IDENTICAL head-and-shoulders portrait — same framing, background and "
        "light. Change ONLY her expression to gentle curiosity: eyes slightly "
        "widened, head tilted a touch, lips just parting as if noticing something."),
    "concentrating": (
        "The IDENTICAL head-and-shoulders portrait — same framing, background and "
        "light. Change ONLY her expression to quiet concentration: brow gently "
        "furrowed, gaze focused downward, lips softly pressed together."),
    "small success": (
        "The IDENTICAL head-and-shoulders portrait — same framing, background and "
        "light. Change ONLY her expression to a small success: a soft smile just "
        "beginning, eyes brightening."),
    "quiet pride": (
        "The IDENTICAL head-and-shoulders portrait — same framing, background and "
        "light. Change ONLY her expression to quiet pride: chin slightly lifted, "
        "a calm warm smile, relaxed shoulders."),
}


def _pod() -> str | None:
    """First healthy pod, or None (the Gemini fallback handles pod-less runs).

    Probes the featherweight /system_stats — comfy.health_check fetches the
    4MB /object_info catalog, which times out for minutes after a ComfyUI
    reboot and silently dumped every keyframe job onto the quota-dead Gemini
    fallback (2026-07-13 postmortem)."""
    for pod in COMFY_POD_URLS:
        try:
            httpx.get(f"{pod.rstrip('/')}/system_stats", timeout=10).raise_for_status()
            return pod
        except Exception:
            continue
    return None


def _derive_keyframe_pod(pod: str, scene: str, out_path: str,
                         character_image: str | None,
                         product_image: str | None,
                         seed: int | None, on_submit=None) -> str:
    """One keyframe on the pod's Qwen-Image-Edit graph. image1 drives output
    size (~1MP, aspect preserved) — pass the character still first so keyframes
    inherit portrait framing; a product-only edit sizes from the product photo."""
    ref1 = character_image or product_image
    # BEFORE the render: comfy_generate's download does a bare open(out,'wb') —
    # a missing dir would burn the whole GPU job and die at the last step
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    wf = copy.deepcopy(comfy.load_workflow("qwen_image_edit"))
    inputs: dict = {
        "prompt": _EDIT_TEMPLATE.format(
            subjects="\n".join(filter(None, [
                character_image and "Reference image 1: the PERSON — reuse exactly this person.",
                product_image and (
                    f"Reference image {'2' if character_image else '1'}: "
                    "the PRODUCT — reuse exactly this product."),
            ])),
            scene=scene.strip()),
        "negative_prompt": _KEYFRAME_NEGATIVE,
        "seed": seed if seed is not None else random.randint(1, 2**31),
        # unique remote names: two refs both called photo.png would silently
        # overwrite each other pod-side and condition on the wrong image
        "image1": comfy.upload_file(
            pod, ref1, remote_name=f"kf-{uuid.uuid4().hex[:8]}-1{Path(ref1).suffix}"),
    }
    if character_image and product_image:
        inputs["image2"] = comfy.upload_file(
            pod, product_image,
            remote_name=f"kf-{uuid.uuid4().hex[:8]}-2{Path(product_image).suffix}")
    else:
        # single-reference edit: drop the second LoadImage and its wires
        wf.pop("79", None)
        for enc in ("76", "77"):
            wf[enc]["inputs"].pop("image2", None)
    tmp_png = str(Path(out_path).with_suffix(".tmp.png"))
    try:
        comfy.comfy_generate(pod, wf, inputs, QWEN_EDIT_MAPPING,
                             out_path=tmp_png, timeout=600, on_submit=on_submit)
        out = Path(out_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        Path(tmp_png).replace(out)
    finally:
        Path(tmp_png).unlink(missing_ok=True)
    return str(out_path)


def _img_part(path: str) -> dict:
    p = Path(path)
    return {"inline_data": {"mime_type": _MIME.get(p.suffix.lower(), "image/png"),
                            "data": base64.b64encode(p.read_bytes()).decode()}}


def _derive_keyframe_gemini(scene: str, out_path: str,
                            character_image: str | None,
                            product_image: str | None) -> str:
    """API fallback (needs paid Gemini image quota — free tier is limit:0)."""
    key = QC_GEMINI_API_KEY or GEMINI_API_KEY
    if not key:
        raise RuntimeError("no pod reachable and no Gemini API key for keyframes")
    subjects, parts = [], []
    if character_image:
        parts.append(_img_part(character_image))
        subjects.append(f"Reference image {len(parts)}: the PERSON — reuse exactly this person.")
    if product_image:
        parts.append(_img_part(product_image))
        subjects.append(f"Reference image {len(parts)}: the PRODUCT — reuse exactly this product.")
    body = {
        "contents": [{"role": "user", "parts": [
            {"text": _EDIT_TEMPLATE.format(subjects="\n".join(subjects), scene=scene.strip())},
            *parts,
        ]}],
        "generationConfig": {"responseModalities": ["IMAGE"]},
    }
    last = ""
    for attempt in range(3):
        try:
            r = httpx.post(_URL.format(model=KEYFRAME_MODEL),
                           headers={"x-goog-api-key": key}, json=body, timeout=120)
            r.raise_for_status()
            for part in r.json()["candidates"][0]["content"]["parts"]:
                blob = part.get("inlineData") or part.get("inline_data")
                if blob and blob.get("data"):
                    out = Path(out_path)
                    out.parent.mkdir(parents=True, exist_ok=True)
                    out.write_bytes(base64.b64decode(blob["data"]))
                    return str(out)
            last = "response contained no image part"
        except httpx.HTTPStatusError as e:
            last = f"{e.response.status_code}: {e.response.text[:300]}"
            if e.response.status_code == 429:
                m = re.search(r"retry in ([0-9.]+)s", e.response.text)
                time.sleep(min(float(m.group(1)) + 1.0 if m else 20.0, 40.0))
                continue
            if e.response.status_code not in (500, 503):
                break
            time.sleep(2 * (attempt + 1))
        except (httpx.HTTPError, KeyError, IndexError) as e:
            last = str(e)
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"keyframe generation failed: {last}")


def derive_keyframe(scene: str, out_path: str, character_image: str | None = None,
                    product_image: str | None = None, seed: int | None = None,
                    on_submit=None) -> str:
    """One keyframe from up to two reference images + a scene description.
    Pod engine first (local Qwen-Image-Edit — free, identity-faithful);
    Gemini image API as the pod-less fallback.

    Raises RuntimeError with the engine's words on failure — the caller decides
    whether to retry; keyframes are cheap and re-rolls are the design."""
    if not character_image and not product_image:
        raise ValueError("keyframe needs at least one reference image (character and/or product)")
    pod = _pod()
    if pod:
        return _derive_keyframe_pod(pod, scene, out_path, character_image,
                                    product_image, seed, on_submit=on_submit)
    return _derive_keyframe_gemini(scene, out_path, character_image, product_image)


# --- Character-into-room composite (episode background lock, 2026-08-08) ------
# Wan S2V animates its ref_image as the WHOLE frame, so a bare face portrait lets
# it reinvent the backdrop every take (the shop drifts between cuts). Compositing
# the EXACT character into the EXACT room plate FIRST — plate as image1 so the
# output inherits the room's aspect (the S2V frame) — hands S2V a full-scene
# reference: same room, same person, every beat. Identity + background locked in
# image space, exactly the stills-first doctrine this module is built on.
_COMPOSITE_TEMPLATE = """\
Create ONE {realism} keyframe for a video ad shot.

Reference image 1: the ROOM/SET — reuse this exact environment: same shelves, props, colours and lighting.
Reference image 2: {subject_desc}

SCENE FOR THIS KEYFRAME: {place_line} inside the room from reference image 1, {framing}, as if actually filmed standing there and looking toward the camera, ready to speak.

STRICT RULES:
- {identity_rule}
- The room's layout, shelves, products, colours and lighting stay IDENTICAL to reference image 1 — do not redraw or restyle the environment.
- {count_rule}
- {style_line}
- No borders, no split panels, no text overlays, no watermark; clean composition with headroom for a talking shot."""

# One or two people composited from the SAME reference — a two-person still composites
# BOTH characters into the scene so a both-in-frame ad animates ONE locked keyframe
# every beat (identity + background locked, no take-to-take drift).
_COMPOSITE_PEOPLE = {
    "one": {
        "subject_desc": "the PERSON — reuse this exact person: same face, hairstyle and clothing.",
        "place_line": "Place the person from reference image 2 naturally",
        "identity_rule": ("The person's face, hairstyle and every garment stay IDENTICAL to "
                          "reference image 2 — same colours, same fabrics, nothing added or removed."),
        "count_rule": "Exactly ONE person, upper body clearly visible, natural eyeline to camera.",
    },
    "two": {
        "subject_desc": ("the TWO PEOPLE — reuse these exact people: same faces, hairstyles and "
                         "clothing, keeping the same left/right arrangement."),
        "place_line": "Place BOTH people from reference image 2 naturally, side by side,",
        "identity_rule": ("Each person's face, hairstyle and every garment stay IDENTICAL to "
                          "reference image 2 — same colours, same fabrics, nothing added or removed, "
                          "and keep them in the same left/right positions."),
        "count_rule": ("BOTH people clearly visible, side by side, upper bodies in frame, both "
                       "facing toward the camera."),
    },
}

# The looks the client asked for. realistic = photoreal ad; animated = full 2D cartoon;
# cartoon_real = the mixed brief — a REAL photographic background with CARTOON characters
# in it. Each look must NOT ban its own style in the negative, or the edit fights the brief.
_COMPOSITE_STYLE = {
    "realistic": {
        "realism": "photorealistic",
        "style_line": "Photorealistic advertising photography: sharp focus, natural light logic.",
        "negative": _KEYFRAME_NEGATIVE,
    },
    "animated": {
        "realism": "2D animated, stylized cartoon-illustration",
        "style_line": ("Flat 2D animated cartoon-illustration look, clean line art, bright "
                       "cel shading — deliberately NOT photographic."),
        "negative": ("photorealistic, photograph, realistic skin pores, 3D render, split "
                     "panels, collage, borders, text, watermark, blurry, low quality"),
    },
    "cartoon_real": {
        "realism": "mixed-media (photorealistic background + cartoon characters)",
        "style_line": ("Render the PEOPLE as lively 2D/3D cartoon characters — stylised, clean, "
                       "expressive — while keeping their faces, hairstyles and clothing clearly "
                       "recognisable; keep the ROOM/background exactly as the PHOTOREALISTIC "
                       "reference (a real-photo backdrop with cartoon characters standing in it). "
                       "The contrast is intentional: real place, cartoon cast."),
        "negative": ("photorealistic people, realistic human skin pores on the characters, "
                     "cartoon background, flattened illustrated backdrop, split panels, collage, "
                     "borders, text, watermark, blurry, low quality"),
    },
}


def composite_into_scene(character_image: str, plate_image: str, out_path: str,
                         framing: str = "medium shot, upper body in frame",
                         style: str = "realistic", people: str = "one",
                         seed: int | None = None, on_submit=None) -> str:
    """Composite an EXACT character (or a two-person still, people="two") into an
    EXACT room plate -> one locked keyframe the S2V lane animates, pinning identity +
    background across cuts. image1 = the PLATE (output inherits the room aspect = the
    S2V frame), image2 = the character/two-person still.
    `style` picks the look (realistic | animated | cartoon_real = real bg + cartoon cast).
    Pod Qwen-Image-Edit first; Gemini image API as the pod-less fallback."""
    if not character_image or not plate_image:
        raise ValueError("composite needs both a character image and a room plate")
    conf = _COMPOSITE_STYLE.get(style, _COMPOSITE_STYLE["realistic"])
    who = _COMPOSITE_PEOPLE.get(people, _COMPOSITE_PEOPLE["one"])
    prompt = _COMPOSITE_TEMPLATE.format(realism=conf["realism"], framing=framing,
                                        style_line=conf["style_line"], **who)
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    pod = _pod()
    if pod:
        wf = copy.deepcopy(comfy.load_workflow("qwen_image_edit"))
        inputs = {
            "prompt": prompt,
            "negative_prompt": conf["negative"],
            "seed": seed if seed is not None else random.randint(1, 2**31),
            # plate = image1 (drives output size/aspect), character = image2
            "image1": comfy.upload_file(
                pod, plate_image,
                remote_name=f"kf-{uuid.uuid4().hex[:8]}-1{Path(plate_image).suffix}"),
            "image2": comfy.upload_file(
                pod, character_image,
                remote_name=f"kf-{uuid.uuid4().hex[:8]}-2{Path(character_image).suffix}"),
        }
        tmp_png = str(Path(out_path).with_suffix(".tmp.png"))
        try:
            comfy.comfy_generate(pod, wf, inputs, QWEN_EDIT_MAPPING,
                                 out_path=tmp_png, timeout=600, on_submit=on_submit)
            Path(tmp_png).replace(out_path)
        finally:
            Path(tmp_png).unlink(missing_ok=True)
        return str(out_path)
    return _composite_into_scene_gemini(character_image, plate_image, out_path,
                                        prompt, conf["negative"])


def _composite_into_scene_gemini(character_image: str, plate_image: str, out_path: str,
                                 prompt: str, negative: str) -> str:
    """API fallback for the room composite (image1 = plate, image2 = person)."""
    key = QC_GEMINI_API_KEY or GEMINI_API_KEY
    if not key:
        raise RuntimeError("no pod reachable and no Gemini API key for keyframe composite")
    body = {
        "contents": [{"role": "user", "parts": [
            {"text": prompt + f"\n\nAvoid: {negative}"},
            _img_part(plate_image), _img_part(character_image),
        ]}],
        "generationConfig": {"responseModalities": ["IMAGE"]},
    }
    last = ""
    for attempt in range(3):
        try:
            r = httpx.post(_URL.format(model=KEYFRAME_MODEL),
                           headers={"x-goog-api-key": key}, json=body, timeout=120)
            r.raise_for_status()
            for part in r.json()["candidates"][0]["content"]["parts"]:
                blob = part.get("inlineData") or part.get("inline_data")
                if blob and blob.get("data"):
                    out = Path(out_path)
                    out.parent.mkdir(parents=True, exist_ok=True)
                    out.write_bytes(base64.b64decode(blob["data"]))
                    return str(out)
            last = "response contained no image part"
        except httpx.HTTPStatusError as e:
            last = f"{e.response.status_code}: {e.response.text[:300]}"
            if e.response.status_code == 429:
                m = re.search(r"retry in ([0-9.]+)s", e.response.text)
                time.sleep(min(float(m.group(1)) + 1.0 if m else 20.0, 40.0))
                continue
            if e.response.status_code not in (500, 503):
                break
            time.sleep(2 * (attempt + 1))
        except (httpx.HTTPError, KeyError, IndexError) as e:
            last = str(e)
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"keyframe composite failed: {last}")


def derive_set(scenes: list[str], name: str, character_image: str | None,
               product_image: str | None, on_progress=None) -> list[str]:
    """One keyframe per scene, all conditioned on the SAME references —
    coherent by construction. Returns the saved paths in scene order."""
    out: list[str] = []
    for i, scene in enumerate(scenes):
        if on_progress:
            on_progress("keyframes", 5 + int(85 * i / len(scenes)),
                        f"keyframe {i + 1}/{len(scenes)}")
        out.append(derive_keyframe(
            scene, str(KEYFRAMES_DIR / f"{name}-k{i + 1}.png"),
            character_image=character_image, product_image=product_image))
    return out


def derive_variants(portrait: str, name: str,
                    emotions: list[str] | None = None, on_progress=None) -> list[str]:
    """Emotion variants of an approved hero portrait — the emotional-arc fix.
    Unknown emotion labels get a generic same-portrait instruction."""
    chosen = emotions or list(VARIANT_SCENES)
    scenes = [
        VARIANT_SCENES.get(
            e.lower().strip(),
            # slug-form labels ("small-success") should still hit the curated prompt
            VARIANT_SCENES.get(
                e.lower().strip().replace("-", " ").replace("_", " "),
                "The IDENTICAL head-and-shoulders portrait — same framing, background "
                f"and light. Change ONLY her expression to: {e.strip()}."))
        for e in chosen
    ]
    safe: list[str] = []
    for e in chosen:  # unique tags — duplicate labels must not overwrite files
        tag = re.sub(r"[^a-z0-9]+", "-", e.lower().strip()).strip("-") or "variant"
        while tag in safe:
            tag += "2"
        safe.append(tag)
    out: list[str] = []
    for i, (scene, tag) in enumerate(zip(scenes, safe)):
        if on_progress:
            on_progress("keyframes", 5 + int(85 * i / len(scenes)),
                        f"variant {i + 1}/{len(scenes)}: {chosen[i]}")
        out.append(derive_keyframe(
            scene, str(KEYFRAMES_DIR / f"{name}-{tag}.png"), character_image=portrait))
    return out
