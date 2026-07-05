"""The generate() flow + mode switch (file 05). Only mode="overlay" is wired so far.

overlay = silent Wan t2v clips + optional narration laid on top (AUDIO-AFTER, file 04).
Other modes (lipsync / cinematic / product / multitalk) raise until their chunks are built.
Clips are generated SEQUENTIALLY on the first pod for now — parallel fan-out is a later chunk.

Output layout (user's rule: exactly TWO flat folders, matching names, no per-job folders):
    outputs/video/<name>-clip1.mp4, <name>-clip2.mp4, ..., <name>-final.mp4
    outputs/audio/<name>-narration.mp3
"""
import json
from pathlib import Path

import httpx

OUTPUT_VIDEO_DIR = Path("outputs/video")
OUTPUT_AUDIO_DIR = Path("outputs/audio")

from app.assembly import ffmpeg
from app.config import COMFY_POD_URLS
from app.providers import comfy
from app.providers.tts import synthesize_voice
from app.workflow_mappings import (
    LONGCAT_MAPPING,
    LTX2_MAPPING,
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
SEQ_VIDEO_DIR = Path("outputs/sequence/video")
SEQ_AUDIO_DIR = Path("outputs/sequence/audio")
LTX_VIDEO_DIR = Path("outputs/ltx2/video")
LTX_AUDIO_DIR = Path("outputs/ltx2/audio")
LONGCAT_VIDEO_DIR = Path("outputs/longcat/video")
LONGCAT_AUDIO_DIR = Path("outputs/longcat/audio")

# LTX-2.3 constants (workflows/ltx2_av.json): 25fps clips, ~5s each; the audio
# latent runs at ~19.2 frames/s (97 frames = 5s in the official template).
LTX_FPS = 25
LTX_CLIP_SECONDS = 5


def generate(req: dict, name: str, on_progress=None, on_submit=None) -> str:
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
    # Cheap preflight BEFORE any TTS call — an unreachable pod must not burn
    # ElevenLabs credits on narration that can never be rendered.
    try:
        httpx.get(f"{COMFY_POD_URLS[0].rstrip('/')}/system_stats",
                  timeout=10).raise_for_status()
    except httpx.HTTPError:
        raise RuntimeError(
            "pod unreachable — start/rebuild the ComfyUI pod (and update "
            "COMFY_POD_URLS) before generating."
        ) from None
    # Fail BEFORE any TTS/pod spend: a typo'd music path used to surface only at the
    # final assembly step, after the whole render had already burned time and credits.
    if req.get("music") and not Path(req["music"]).exists():
        raise FileNotFoundError(f"music file not found: {req['music']}")
    if mode == "sequence":
        return _generate_sequence(req, name, report, on_submit)
    if mode == "lipsync":
        return _generate_lipsync(req, name, report, on_submit)
    if mode == "product":
        return _generate_product(req, name, report, on_submit)
    if mode == "cinematic":
        return _generate_cinematic(req, name, report, on_submit)
    if mode == "longcat":
        return _generate_longcat(req, name, report, on_submit)
    if mode != "overlay":
        raise NotImplementedError(
            f"mode='{mode}' is not built yet — 'overlay', 'lipsync', 'product', "
            f"'cinematic' and 'longcat' are. multitalk is parked (LongCat covers it)."
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
                on_submit=on_submit,
            )
        )

    # 3. ASSEMBLE (FFmpeg on this host)
    report("assembling", 90, "stitch + overlay")
    final = str(OUTPUT_VIDEO_DIR / f"{name}-final.mp4")
    if narration:
        final = ffmpeg.stitch_and_overlay(clips, narration, music=req.get("music"), out=final,
                                          on_warning=lambda w: report("assembling", 92, w))
    elif req.get("music"):
        # No narration but a music bed WAS chosen — it must not silently vanish.
        final = ffmpeg.stitch_music_only(clips, req["music"], out=final)
    else:
        final = ffmpeg.stitch(clips, out=final)  # silent clips, no narration -> plain stitch

    # The API layer owns the terminal 'done' (it sets video_path atomically with it —
    # a 'done' from here would race pollers into a video-less done state).
    report("assembling", 99, "export ready")
    return final


# Face stills for avatar profiles: Wan t2v used as a text-to-IMAGE model —
# duration 0 -> floor(0*fps)+1 = exactly ONE frame, extracted to PNG. QUALITY
# path (20 steps, no Lightning LoRA): a face rendered once is reused forever.
FACE_PROMPT_SUFFIX = (
    ", professional portrait photograph, front-facing, looking directly at the camera, "
    "head and shoulders framing, arms relaxed at the sides, natural skin texture, "
    "soft flattering light, sharp focus, photorealistic"
)
FACE_NEGATIVE = (
    "cartoon, anime, 3d render, cgi, illustration, painting, deformed face, "
    "asymmetric eyes, multiple people, extra faces, side profile, sunglasses, "
    "raised arms, hands near face, text, watermark, blur"
)


def generate_face(description: str, negative: str | None = None,
                  seed: int | None = None, out_stem: str = "face",
                  on_submit=None) -> str:
    """Render ONE photoreal portrait still (768x768 PNG) for an avatar profile.

    Returns the PNG path under assets/avatars/ — the same folder uploaded faces
    live in, so the profile machinery treats both identically.
    """
    if not COMFY_POD_URLS:
        raise RuntimeError("COMFY_POD_URLS is not set in .env — no pod to generate on.")
    pod = COMFY_POD_URLS[0]
    httpx.get(f"{pod.rstrip('/')}/system_stats", timeout=10).raise_for_status()

    out_dir = Path("assets/avatars")
    out_dir.mkdir(parents=True, exist_ok=True)
    tmp_mp4 = out_dir / f"{out_stem}.mp4"
    png = out_dir / f"{out_stem}.png"

    inputs = {
        "prompt": description.strip() + FACE_PROMPT_SUFFIX,
        "negative_prompt": negative or FACE_NEGATIVE,
        "seed": seed or DEFAULT_BASE_SEED,
        "duration": 0.0,          # 1 frame — a still photo, not a clip
        "width": 768,
        "height": 768,
        # PINNED to the QUALITY path (20 steps / split 10 / CFG 3.5): this face is
        # every future ad's identity — never let a preset leak the 4-step LoRA in.
        "lightning_lora": False,
    }
    try:
        comfy.comfy_generate(
            pod, comfy.load_workflow("wan_t2v"), inputs, WAN_T2V_MAPPING,
            out_path=str(tmp_mp4), on_submit=on_submit,
        )
        ffmpeg.extract_frame(str(tmp_mp4), str(png))
    finally:
        tmp_mp4.unlink(missing_ok=True)
    return str(png)


def _generate_sequence(req: dict, name: str, report, on_submit=None) -> str:
    """mode="sequence": the 60s-ad composer (file 15) — a TIMELINE of mixed-pipeline
    segments (e.g. lipsync hook -> i2v product shots -> t2v b-roll -> lipsync CTA),
    each with its own script slice, assembled into ONE video.

    Per segment:
      - overlay : one t2v clip (~5s); optional script slice -> per-segment voiceover
      - product : one i2v clip from segment `image`; optional script slice -> voiceover
      - lipsync : S2V take (~14.4s, audio embedded); script + image REQUIRED

    All segments render at the job's width/height @16fps, then concat_reencode() joins
    the mixed sources (silent parts get a real silent track). Optional music bed last.
    """
    segments = req.get("segments") or []
    if not segments:
        raise ValueError("sequence mode needs `segments` — a non-empty timeline.")
    for i, seg in enumerate(segments):
        p = seg.get("pipeline")
        if p == "lipsync":
            if not seg.get("script"):
                raise ValueError(f"segment {i + 1} (lipsync) needs a `script` — audio drives the mouth.")
            if not seg.get("image"):
                raise ValueError(f"segment {i + 1} (lipsync) needs `image` — the reference face.")
        if p == "product" and not seg.get("image"):
            raise ValueError(f"segment {i + 1} (product) needs `image` — the product photo.")
        if seg.get("image") and not Path(seg["image"]).exists():
            raise FileNotFoundError(f"segment {i + 1} image not found: {seg['image']}")

    SEQ_VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    SEQ_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    pod = COMFY_POD_URLS[0]
    base_seed = req.get("seed") or DEFAULT_BASE_SEED
    fast = req.get("quality") == "fast"
    uploaded: dict[str, str] = {}  # local path -> pod filename (upload each asset once)

    def upload_once(path: str) -> str:
        # Pod-side name carries a hash of the LOCAL path: two different files that
        # happen to share a basename (a/face.jpg vs b/face.jpg) must not overwrite
        # each other on the pod while the cache still points at the first upload.
        if path not in uploaded:
            import hashlib
            p = Path(path)
            unique = f"{hashlib.sha1(str(p.resolve()).encode()).hexdigest()[:8]}-{p.name}"
            uploaded[path] = comfy.upload_file(pod, path, remote_name=unique)
        return uploaded[path]

    processed: list[str] = []
    n = len(segments)
    for i, seg in enumerate(segments):
        pct = 5 + int(80 * i / n)
        pipeline_kind = seg["pipeline"]
        report("generating", pct, f"segment {i + 1}/{n} ({pipeline_kind})")
        seg_stem = f"{name}-seg{i + 1}"

        common: dict = {"seed": base_seed + i * 3}
        if seg.get("negative_prompt"):
            common["negative_prompt"] = seg["negative_prompt"]
        if req.get("width"):
            common["width"] = req["width"]
        if req.get("height"):
            common["height"] = req["height"]

        if pipeline_kind == "lipsync":
            narration = synthesize_voice(
                seg["script"],
                voice_id=seg.get("voice_id") or req.get("voice_id"),
                language=req.get("language", "hi"),
                output_path=str(SEQ_AUDIO_DIR / f"{seg_stem}-narration.mp3"),
            )
            inputs = {
                "prompt": seg["prompt"],
                "ref_image": upload_once(seg["image"]),
                "audio": comfy.upload_file(pod, narration),
                "seed": base_seed + i * 3,
                "seed_extend1": base_seed + i * 3 + 1,
                "seed_extend2": base_seed + i * 3 + 2,
                **{k: v for k, v in common.items() if k != "seed"},
            }
            if not fast:
                inputs.update(WAN_S2V_QUALITY_INPUTS)
            if req.get("steps"):
                inputs["steps"] = req["steps"]
            clip = comfy.comfy_generate(
                pod, comfy.load_workflow("wan_s2v"), inputs, WAN_S2V_MAPPING,
                out_path=str(SEQ_VIDEO_DIR / f"{seg_stem}.mp4"),
                on_submit=on_submit,
            )
            # The segment clip stays in the Library — lock its lip-synced voice
            # just like the final, or /revoice could desync its mouth.
            Path(clip).with_suffix(".meta.json").write_text(json.dumps({"voice_lock": True}))
        else:
            inputs = {"prompt": seg["prompt"], **common}
            if fast:
                inputs["lightning_lora"] = True
            if pipeline_kind == "product":
                inputs["start_image"] = upload_once(seg["image"])
                wf, mapping = comfy.load_workflow("wan_i2v"), WAN_I2V_MAPPING
            else:  # overlay (t2v b-roll)
                wf, mapping = comfy.load_workflow("wan_t2v"), WAN_T2V_MAPPING
            clip = comfy.comfy_generate(
                pod, wf, inputs, mapping,
                out_path=str(SEQ_VIDEO_DIR / f"{seg_stem}.mp4"),
                on_submit=on_submit,
            )
            if seg.get("script"):
                # Per-segment voiceover (AUDIO-AFTER) so the slice stays in its window.
                narration = synthesize_voice(
                    seg["script"],
                    voice_id=seg.get("voice_id") or req.get("voice_id"),
                    language=req.get("language", "hi"),
                    output_path=str(SEQ_AUDIO_DIR / f"{seg_stem}-narration.mp3"),
                )
                silent = clip
                clip = ffmpeg.replace_audio(
                    clip, narration, out=str(SEQ_VIDEO_DIR / f"{seg_stem}-voiced.mp4"),
                    on_warning=lambda w, i=i: report("generating", pct, f"segment {i + 1}: {w}"),
                )
                Path(silent).unlink(missing_ok=True)  # one clip per segment in the Library
        processed.append(clip)

    report("assembling", 88, "joining mixed segments")
    final = str(SEQ_VIDEO_DIR / f"{name}-final.mp4")
    if req.get("music"):
        joined = ffmpeg.concat_reencode(processed,
                                        out=str(SEQ_VIDEO_DIR / f"{name}-joined.mp4"))
        report("assembling", 95, "music bed")
        final = ffmpeg.stitch_plus_music([joined], music=req["music"], out=final)
        Path(joined).unlink(missing_ok=True)  # exactly ONE final per job
    else:
        final = ffmpeg.concat_reencode(processed, out=final)

    if any(seg["pipeline"] == "lipsync" for seg in segments):
        # Voice-lock sidecar: this final contains lip-synced speech — /revoice must
        # refuse it (a new voice would desync the avatar segments). Phase-3 DB
        # replaces these sidecars.
        Path(final).with_suffix(".meta.json").write_text(json.dumps({"voice_lock": True}))

    report("assembling", 99, "export ready")  # API layer owns the terminal 'done'
    return final


def _generate_product(req: dict, name: str, report, on_submit=None) -> str:
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
                on_submit=on_submit,
            )
        )

    # 4. ASSEMBLE — silent clips; overlay narration if provided (AUDIO-AFTER)
    report("assembling", 90, "stitch + overlay")
    final = str(I2V_VIDEO_DIR / f"{name}-final.mp4")
    if narration:
        final = ffmpeg.stitch_and_overlay(clips, narration, music=req.get("music"), out=final,
                                          on_warning=lambda w: report("assembling", 92, w))
    elif req.get("music"):
        final = ffmpeg.stitch_music_only(clips, req["music"], out=final)
    else:
        final = ffmpeg.stitch(clips, out=final)

    report("assembling", 99, "export ready")  # API layer owns the terminal 'done'
    return final


def _generate_cinematic(req: dict, name: str, report, on_submit=None) -> str:
    """mode="cinematic": LTX-2.3 — text-to-video WITH native synchronized audio
    (ambience/SFX generated by the model itself; docs file 03's cinematic slot).

    One ~5s 25fps clip per shot, stitched with their native audio kept. Optional
    narration script lays ElevenLabs voice ON TOP with the native audio ducked
    underneath (the clip's own soundtrack rides the music lane of replace_audio).
    An explicit music bed replaces the native-audio duck instead.
    """
    LTX_VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    LTX_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    pod = COMFY_POD_URLS[0]

    # 1. TTS first (same fail-early rule as overlay: preflight already passed)
    narration = None
    if req.get("script"):
        report("tts", 5, "synthesizing narration")
        narration = synthesize_voice(
            req["script"],
            voice_id=req.get("voice_id"),
            language=req.get("language", "hi"),
            output_path=str(LTX_AUDIO_DIR / f"{name}-narration.mp3"),
        )

    # 2. GENERATE — one LTX clip per shot. The workflow renders at HALF size then
    # 2x latent-upsamples, so the injected width/height are final//2.
    comfy.free_memory(pod)  # unload other engines' cached weights (RAM headroom)
    wf = comfy.load_workflow("ltx2_av")
    shots = req["shots"]
    base_seed = req.get("seed") or DEFAULT_BASE_SEED
    final_w = req.get("width") or 1280
    final_h = req.get("height") or 720
    clips: list[str] = []
    for i, shot in enumerate(shots):
        pct = 10 + int(75 * i / len(shots))
        report("generating", pct, f"cinematic clip {i + 1}/{len(shots)} (~5s @25fps + audio)")
        inputs = {
            "prompt": shot["prompt"],
            "seed": base_seed + i,
            "seed_refine": base_seed + 1000 + i,
            "width": max(2, final_w // 2),
            "height": max(2, final_h // 2),
            "filename_prefix": f"video/adgen_ltx2_{name}",
        }
        if shot.get("negative_prompt"):
            inputs["negative_prompt"] = shot["negative_prompt"]
        clips.append(
            comfy.comfy_generate(
                pod, wf, inputs, LTX2_MAPPING,
                out_path=str(LTX_VIDEO_DIR / f"{name}-clip{i + 1}.mp4"),
                on_submit=on_submit,
            )
        )

    # 3. ASSEMBLE — clips carry native audio; keep it in every path.
    report("assembling", 90, "joining cinematic clips")
    final = str(LTX_VIDEO_DIR / f"{name}-final.mp4")
    if narration:
        joined = ffmpeg.concat_reencode(clips, out=str(LTX_VIDEO_DIR / f"{name}-joined.mp4"))
        # replace_audio's music lane = the joined video ITSELF -> its native
        # ambience ducks under the ElevenLabs narration.
        bed = req.get("music") or joined
        try:
            final = ffmpeg.replace_audio(
                joined, narration, music=bed, out=final,
                music_gain=0.25 if bed == joined else 0.15,
                on_warning=lambda w: report("assembling", 92, w),
            )
        finally:
            Path(joined).unlink(missing_ok=True)
    elif req.get("music"):
        final = ffmpeg.stitch_plus_music(clips, music=req["music"], out=final)
    else:
        # Stream-copy concat KEEPS each clip's native audio — nothing else needed.
        final = ffmpeg.stitch(clips, out=final)

    report("assembling", 99, "export ready")  # API layer owns the terminal 'done'
    return final


def _generate_longcat(req: dict, name: str, report, on_submit=None) -> str:
    """mode="longcat": LongCat-Video-Avatar 1.5 — AUDIO-FIRST talking avatar like
    lipsync, but the LongCat windowed extender (3x 93-frame windows, 13-frame
    overlap @16fps) gives a ~15.8s continuous take with stronger identity
    stability. The narration is muxed into the output by the workflow itself.
    """
    if not req.get("script"):
        raise ValueError("longcat needs a narration `script` — the audio drives the mouth.")
    avatar_image = req.get("avatar_image")
    if not avatar_image:
        raise ValueError("longcat needs `avatar_image` — path to the reference face image.")
    if not Path(avatar_image).exists():
        raise FileNotFoundError(f"avatar_image not found: {avatar_image}")

    LONGCAT_VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    LONGCAT_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    pod = COMFY_POD_URLS[0]

    # 1. TTS — audio first; the take is ~15.8s, so the script should fill ~14-15s.
    report("tts", 5, "synthesizing narration")
    narration = synthesize_voice(
        req["script"],
        voice_id=req.get("voice_id"),
        language=req.get("language", "hi"),
        output_path=str(LONGCAT_AUDIO_DIR / f"{name}-narration.mp3"),
    )

    # 2. UPLOAD narration + reference face
    report("uploading", 8, "narration + reference image -> pod")
    audio_name = comfy.upload_file(pod, narration)
    image_name = comfy.upload_file(pod, avatar_image)

    # 3. GENERATE — one continuous 3-window take (shots[0] is the scene prompt)
    shot = req["shots"][0]
    base_seed = req.get("seed") or DEFAULT_BASE_SEED
    inputs = {
        "prompt": shot["prompt"],
        "ref_image": image_name,
        "audio": audio_name,
        "seed": base_seed,
        "seed_extend1": base_seed + 1,
        "seed_extend2": base_seed + 2,
        "filename_prefix": f"adgen_longcat_{name}",
    }
    if shot.get("negative_prompt"):
        inputs["negative_prompt"] = shot["negative_prompt"]
    if req.get("width"):
        inputs["width"] = req["width"]
    if req.get("height"):
        inputs["height"] = req["height"]
    if req.get("steps"):
        inputs["steps"] = req["steps"]

    # LongCat shares the pod with LTX/Wan — drop their cached weights first or
    # the container RAM limit trips (OOM'd the pod on the first attempt).
    comfy.free_memory(pod)
    report("generating", 15, "LongCat avatar (~16s take, 3 windows — takes a while)")
    clip = comfy.comfy_generate(
        pod, comfy.load_workflow("longcat_avatar"), inputs, LONGCAT_MAPPING,
        out_path=str(LONGCAT_VIDEO_DIR / f"{name}-clip1.mp4"),
        timeout=3600.0, on_submit=on_submit,
    )

    # 4. ASSEMBLE — narration already muxed in; optional music bed on top.
    report("assembling", 92, "finalizing")
    final = str(LONGCAT_VIDEO_DIR / f"{name}-final.mp4")
    if req.get("music"):
        final = ffmpeg.stitch_plus_music([clip], music=req["music"], out=final)
    else:
        final = ffmpeg.stitch([clip], out=final)

    # Lips are baked to this voice — /revoice must refuse it.
    Path(final).with_suffix(".meta.json").write_text(json.dumps({"voice_lock": True}))
    Path(clip).with_suffix(".meta.json").write_text(json.dumps({"voice_lock": True}))

    report("assembling", 99, "export ready")  # API layer owns the terminal 'done'
    return final


def _generate_lipsync(req: dict, name: str, report, on_submit=None) -> str:
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
        on_submit=on_submit,
    )

    # 4. ASSEMBLE — audio is already inside the clip; optionally add a music bed
    report("assembling", 92, "finalizing")
    final = str(S2V_VIDEO_DIR / f"{name}-final.mp4")
    if req.get("music"):
        final = ffmpeg.stitch_plus_music([clip], music=req["music"], out=final)
    else:
        final = ffmpeg.stitch([clip], out=final)

    report("assembling", 99, "export ready")  # API layer owns the terminal 'done'
    return final
