"""Keyframe-engine preflight — run FROM THE MAC once the pod is on and the
downloads finished. Usage: python3 podday_keyframes_preflight.py <pod-8188-url>
Validates every node class + model file the qwen_image_edit graph needs, then
smoke-tests one real variant from the approved portrait B."""
import sys

import httpx

POD = (sys.argv[1] if len(sys.argv) > 1 else "").rstrip("/")
if not POD:
    sys.exit("usage: podday_keyframes_preflight.py https://<pod>-8188.proxy.runpod.net")

info = httpx.get(f"{POD}/object_info", timeout=120).json()

NEED = ["UNETLoader", "CLIPLoader", "VAELoader", "TextEncodeQwenImageEditPlus",
        "ModelSamplingAuraFlow", "ImageScaleToTotalPixels", "VAEEncode",
        "KSampler", "VAEDecode", "SaveImage", "LoadImage"]
missing = [n for n in NEED if n not in info]
for n in NEED:
    print(("OK   " if n in info else "MISS ") + n)
if "TextEncodeQwenImageEditPlus" in missing and "TextEncodeQwenImageEdit" in info:
    print("→ Plus node missing but single-image TextEncodeQwenImageEdit exists:")
    print("  ComfyUI needs a git pull for multi-ref; single-ref edits would work today.")

for node, field in [("UNETLoader", "unet_name"), ("CLIPLoader", "clip_name"),
                    ("VAELoader", "vae_name")]:
    try:
        opts = info[node]["input"]["required"][field][0]
        hits = [o for o in opts if "qwen" in o.lower()]
        print(f"{node}: {'OK   ' if hits else 'MISS '}{hits or 'no qwen files visible'}")
    except (KeyError, IndexError, TypeError):
        print(f"{node}: could not list {field}")

if missing:
    sys.exit("\nFIX the MISSes above before the smoke test.")

print("\n== smoke test: one 'quiet pride' variant from portrait B ==")
import os
os.environ.setdefault("COMFY_POD_URLS", POD)
sys.path.insert(0, "adgen-backend")
os.chdir("adgen-backend")
from app import keyframes  # noqa: E402

p = keyframes.derive_variants("assets/stills/gen-8dbb67c95965.png",
                              "portraitB", emotions=["quiet pride"])
print("VARIANT SAVED:", p)
print("open it: http://localhost:8000/assets-files/keyframes/" + p[0].split("/")[-1])
