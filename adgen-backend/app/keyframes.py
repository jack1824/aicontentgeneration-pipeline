"""Stills-first keyframe stage (consistency architecture, 2026-07-10 research).

The industry-consensus fix for shot-to-shot drift: lock identity/wardrobe/
palette in IMAGE space first — one keyframe per shot, every keyframe derived
from the SAME canonical character still and the SAME real product photo via
Gemini image editing — approve the stills (cheap re-rolls, human taste in the
loop), then demote video models to motion-only: each approved keyframe rides
the existing Wan i2v lane (sequence `product` segments) with I2V_PRESERVE.

A failed video take re-animates the same approved still, so retries can never
drift identity, wardrobe or product. Keyframes land in assets/keyframes/ and
are served via /assets-files for the approval pass.
"""
import base64
import re
import time
from pathlib import Path

import httpx

from app.config import GEMINI_API_KEY
from app.qc import QC_GEMINI_API_KEY

KEYFRAME_MODEL = "gemini-2.5-flash-image"
_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
KEYFRAMES_DIR = Path("assets/keyframes")

_MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}

# The edit instruction is a fixed contract: scene wording varies, fidelity
# language never does (identity + label fidelity are the whole point).
_EDIT_TEMPLATE = """\
Create ONE photorealistic vertical 9:16 keyframe image for a video ad shot.

{subjects}

SCENE FOR THIS KEYFRAME: {scene}

STRICT RULES:
- The person's face, hairstyle and every garment must stay IDENTICAL to the reference — same colors, same fabrics, no added or removed clothing items.
- The product's label must stay PIXEL-FAITHFUL to the reference: identical text, identical logo, identical colors. Never redraw or restyle packaging text.
- Photorealistic advertising photography: sharp focus on the subject, natural light logic, no borders, no split panels, no text overlays, no watermark.
- Frame it as described in the scene; keep the composition clean with room for social captions at top and bottom."""


def _img_part(path: str) -> dict:
    p = Path(path)
    return {"inline_data": {"mime_type": _MIME.get(p.suffix.lower(), "image/png"),
                            "data": base64.b64encode(p.read_bytes()).decode()}}


def derive_keyframe(scene: str, out_path: str, character_image: str | None = None,
                    product_image: str | None = None) -> str:
    """One keyframe from up to two reference images + a scene description.

    Raises RuntimeError with the API's words on failure — the caller decides
    whether to retry; keyframes are cheap and re-rolls are the design."""
    key = QC_GEMINI_API_KEY or GEMINI_API_KEY
    if not key:
        raise RuntimeError("no Gemini API key configured for keyframe generation")
    subjects, parts = [], []
    if character_image:
        parts.append(_img_part(character_image))
        subjects.append(f"Reference image {len(parts)}: the PERSON — reuse exactly this person.")
    if product_image:
        parts.append(_img_part(product_image))
        subjects.append(f"Reference image {len(parts)}: the PRODUCT — reuse exactly this product.")
    if not parts:
        raise ValueError("keyframe needs at least one reference image (character and/or product)")
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
