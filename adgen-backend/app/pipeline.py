"""The generate() flow + mode switch (file 05). Only mode="overlay" is wired so far.

overlay = silent Wan t2v clips + optional narration laid on top (AUDIO-AFTER, file 04).
Other modes (lipsync / cinematic / product / multitalk) raise until their chunks are built.
Clips are generated SEQUENTIALLY on the first pod for now — parallel fan-out is a later chunk.

Output layout (user's rule: exactly TWO flat folders, matching names, no per-job folders):
    outputs/video/<name>-clip1.mp4, <name>-clip2.mp4, ..., <name>-final.mp4
    outputs/audio/<name>-narration.mp3
"""
from pathlib import Path

OUTPUT_VIDEO_DIR = Path("outputs/video")
OUTPUT_AUDIO_DIR = Path("outputs/audio")

from app.assembly import ffmpeg
from app.config import COMFY_POD_URLS
from app.providers import comfy
from app.providers.tts import synthesize_voice
from app.workflow_mappings import (
    WAN_I2V_MAPPING,
    WAN_S2V_MAPPING,
    WAN_S2V_QUALITY_INPUTS,
    WAN_T2V_MAPPING,
)

DEFAULT_BASE_SEED = 1000

# Per-pipeline output homes (user rule: separate folders per pipeline so nothing mixes up).
S2V_VIDEO_DIR = Path("outputs/wans2v/video")
S2V_AUDIO_DIR = Path("outputs/wans2v/audio")
I2V_VIDEO_DIR = Path("outputs/wani2v/video")
I2V_AUDIO_DIR = Path("outputs/wani2v/audio")


def generate(req: dict, name: str, on_progress=None) -> str:
    """Run one generation job end to end. Returns the final video path.

    `name` prefixes every output file (outputs/video/<name>-*.mp4,
    outputs/audio/<name>-narration.mp3) so audio/video pairs are obvious.

    req (validated upstream by the API layer):
        mode: "overlay" (only mode wired so far)
        shots: [{prompt, negative_prompt?}, ...]   # user-supplied, both Wan 2.2 boxes
        script: str | None    # narration text; None -> plain stitch, no overlay
        language: "hi" | "en"
        seed: int | None      # base seed; shot i uses seed + i (reproducible)
        music: str | None     # optional music file path
        quality: "quality" | "fast"   # fast = Lightning LoRA 4-step (previews); default quality

    on_progress(status, progress_pct, detail) is called at each stage transition.
    """
    def report(status: str, pct: int, detail: str = "") -> None:
        if on_progress:
            on_progress(status, pct, detail)

    mode = req["mode"]
    if not COMFY_POD_URLS:
        raise RuntimeError("COMFY_POD_URLS is not set in .env — no pod to generate on.")
    if mode == "lipsync":
        return _generate_lipsync(req, name, report)
    if mode == "product":
        return _generate_product(req, name, report)
    if mode != "overlay":
        raise NotImplementedError(
            f"mode='{mode}' is not built yet — only 'overlay', 'lipsync' and 'product'. "
            f"cinematic/multitalk arrive in later chunks."
        )

    OUTPUT_VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    pod = COMFY_POD_URLS[0]

    # 1. TTS (skipped when no script — then the result is a plain stitch)
    narration = None
    if req.get("script"):
        report("tts", 5, "synthesizing narration")
        narration = synthesize_voice(
            req["script"],
            voice_id=req.get("voice_id"),
            language=req.get("language", "hi"),
            output_path=str(OUTPUT_AUDIO_DIR / f"{name}-narration.mp3"),
        )

    # 2. GENERATE — sequential clips on one pod (parallel fan-out = later chunk)
    wf = comfy.load_workflow("wan_t2v")
    shots = req["shots"]
    base_seed = req.get("seed") or DEFAULT_BASE_SEED
    clips: list[str] = []
    for i, shot in enumerate(shots):
        pct = 10 + int(75 * i / len(shots))
        report("generating", pct, f"clip {i + 1}/{len(shots)} (several min each)")
        inputs = {"prompt": shot["prompt"], "seed": base_seed + i}
        if shot.get("negative_prompt"):
            inputs["negative_prompt"] = shot["negative_prompt"]
        if req.get("width"):
            inputs["width"] = req["width"]
        if req.get("height"):
            inputs["height"] = req["height"]
        if req.get("quality") == "fast":
            # Lightning LoRA 4-step preset (file 06). Previews/iteration only —
            # finals should stay on the default QUALITY (20-step) path.
            inputs["lightning_lora"] = True
        clips.append(
            comfy.comfy_generate(
                pod, wf, inputs, WAN_T2V_MAPPING,
                out_path=str(OUTPUT_VIDEO_DIR / f"{name}-clip{i + 1}.mp4"),
            )
        )

    # 3. ASSEMBLE (FFmpeg on this host)
    report("assembling", 90, "stitch + overlay")
    final = str(OUTPUT_VIDEO_DIR / f"{name}-final.mp4")
    if narration:
        final = ffmpeg.stitch_and_overlay(clips, narration, music=req.get("music"), out=final)
    else:
        final = ffmpeg.stitch(clips, out=final)  # silent clips, no narration -> plain stitch

    report("done", 100, "")
    return final


def _generate_product(req: dict, name: str, report) -> str:
    """mode="product": Wan i2v — animate a PRODUCT PHOTO per shot, optional narration on top.

    AUDIO-AFTER (file 04): clips are silent; narration/music overlay at assembly. Every shot
    animates the same uploaded start image with its own motion prompt + seed.
    """
    product_image = req.get("product_image")
    if not product_image:
        raise ValueError(
            "product mode needs `product_image` — path to the product photo "
            "(e.g. assets/wani2v/bottle.png)."
        )
    if not Path(product_image).exists():
        raise FileNotFoundError(f"product_image not found: {product_image}")

    I2V_VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    I2V_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    pod = COMFY_POD_URLS[0]

    # 1. TTS (optional — silent product loops are valid too)
    narration = None
    if req.get("script"):
        report("tts", 5, "synthesizing narration")
        narration = synthesize_voice(
            req["script"],
            voice_id=req.get("voice_id"),
            language=req.get("language", "hi"),
            output_path=str(I2V_AUDIO_DIR / f"{name}-narration.mp3"),
        )

    # 2. UPLOAD the product photo once; every shot animates it
    report("uploading", 8, "product image -> pod")
    image_name = comfy.upload_file(pod, product_image)

    # 3. GENERATE — one i2v clip per shot (sequential; fan-out is a later chunk)
    wf = comfy.load_workflow("wan_i2v")
    shots = req["shots"]
    base_seed = req.get("seed") or DEFAULT_BASE_SEED
    clips: list[str] = []
    for i, shot in enumerate(shots):
        pct = 12 + int(72 * i / len(shots))
        report("generating", pct, f"clip {i + 1}/{len(shots)}")
        inputs = {"prompt": shot["prompt"], "start_image": image_name,
                  "seed": base_seed + i}
        if shot.get("negative_prompt"):
            inputs["negative_prompt"] = shot["negative_prompt"]
        if req.get("width"):
            inputs["width"] = req["width"]
        if req.get("height"):
            inputs["height"] = req["height"]
        if req.get("quality") == "fast":
            inputs["lightning_lora"] = True  # this export's FAST branch is wired correctly
        clips.append(
            comfy.comfy_generate(
                pod, wf, inputs, WAN_I2V_MAPPING,
                out_path=str(I2V_VIDEO_DIR / f"{name}-clip{i + 1}.mp4"),
            )
        )

    # 4. ASSEMBLE — silent clips; overlay narration if provided (AUDIO-AFTER)
    report("assembling", 90, "stitch + overlay")
    final = str(I2V_VIDEO_DIR / f"{name}-final.mp4")
    if narration:
        final = ffmpeg.stitch_and_overlay(clips, narration, music=req.get("music"), out=final)
    else:
        final = ffmpeg.stitch(clips, out=final)

    report("done", 100, "")
    return final


def _generate_lipsync(req: dict, name: str, report) -> str:
    """mode="lipsync": Wan-S2V talking avatar. AUDIO-FIRST (file 04) — the narration is
    synthesized first and DRIVES the mouth; the reference image locks the face.

    Notes bound to the current wan_s2v.json export:
      - output length is FIXED (~14.4s: base + 2 extend segments) — script should fill ~12-14s.
      - the output video comes back WITH the narration already muxed in (CreateVideo node),
        so assembly is just an optional music bed — no overlay.
      - the export's defaults are the FAST config (4 steps / CFG 1 / Lightning LoRA). QUALITY
        applies WAN_S2V_QUALITY_INPUTS (20 / 6.0 / LoRA bypassed) per file 06 — the LoRA
        visibly degrades S2V, so finals must run quality.
    """
    if not req.get("script"):
        raise ValueError("lipsync needs a narration `script` — the audio drives the mouth.")
    avatar_image = req.get("avatar_image")
    if not avatar_image:
        raise ValueError(
            "lipsync needs `avatar_image` — path to the reference face image "
            "(e.g. assets/wans2v/priya.jpg)."
        )
    if not Path(avatar_image).exists():
        raise FileNotFoundError(f"avatar_image not found: {avatar_image}")

    S2V_VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    S2V_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    pod = COMFY_POD_URLS[0]

    # 1. TTS — audio first, it drives the generation
    report("tts", 5, "synthesizing narration")
    narration = synthesize_voice(
        req["script"],
        voice_id=req.get("voice_id"),
        language=req.get("language", "hi"),
        output_path=str(S2V_AUDIO_DIR / f"{name}-narration.mp3"),
    )

    # 2. UPLOAD narration + reference image to the pod's input dir
    report("uploading", 8, "narration + reference image -> pod")
    audio_name = comfy.upload_file(pod, narration)
    image_name = comfy.upload_file(pod, avatar_image)

    # 3. GENERATE — one continuous talking segment chain (uses shots[0] as the scene prompt)
    shot = req["shots"][0]
    base_seed = req.get("seed") or DEFAULT_BASE_SEED
    inputs = {
        "prompt": shot["prompt"],
        "ref_image": image_name,
        "audio": audio_name,
        "seed": base_seed,
        "seed_extend1": base_seed + 1,
        "seed_extend2": base_seed + 2,
    }
    if shot.get("negative_prompt"):
        inputs["negative_prompt"] = shot["negative_prompt"]
    if req.get("width"):
        inputs["width"] = req["width"]
    if req.get("height"):
        inputs["height"] = req["height"]
    if req.get("quality") != "fast":
        inputs.update(WAN_S2V_QUALITY_INPUTS)  # 20 steps / CFG 6.0 / LoRA bypassed
    if req.get("steps"):
        inputs["steps"] = req["steps"]         # explicit user override wins over presets

    report("generating", 15, "talking avatar (~14s output; QUALITY takes a while)")
    wf = comfy.load_workflow("wan_s2v")
    clip = comfy.comfy_generate(
        pod, wf, inputs, WAN_S2V_MAPPING,
        out_path=str(S2V_VIDEO_DIR / f"{name}-clip1.mp4"),
    )

    # 4. ASSEMBLE — audio is already inside the clip; optionally add a music bed
    report("assembling", 92, "finalizing")
    final = str(S2V_VIDEO_DIR / f"{name}-final.mp4")
    if req.get("music"):
        final = ffmpeg.stitch_plus_music([clip], music=req["music"], out=final)
    else:
        final = ffmpeg.stitch([clip], out=final)

    report("done", 100, "")
    return final
