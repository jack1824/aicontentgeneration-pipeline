"""The generate() flow + mode switch (file 05). Only mode="overlay" is wired so far.

overlay = silent Wan t2v clips + optional narration laid on top (AUDIO-AFTER, file 04).
Other modes (lipsync / cinematic / product / multitalk) raise until their chunks are built.
Clips are generated SEQUENTIALLY on the first pod for now — parallel fan-out is a later chunk.

Output layout (user's rule: exactly TWO flat folders, matching names, no per-job folders):
    outputs/video/<name>-clip1.mp4, <name>-clip2.mp4, ..., <name>-final.mp4
    outputs/audio/<name>-narration.mp3
"""
import json
import os
from pathlib import Path

import httpx

OUTPUT_VIDEO_DIR = Path("outputs/video")
OUTPUT_AUDIO_DIR = Path("outputs/audio")

from app import qc
from app.assembly import ffmpeg
from app.config import COMFY_POD_URLS
from app.providers import comfy
from app.providers.tts import synthesize_voice
from app.workflow_mappings import (
    INGREDIENTS_MAPPING,
    LIPDUB_MAPPING,
    LONGCAT_2W_MAPPING,
    LONGCAT_DUO_MAPPING,
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
ING_VIDEO_DIR = Path("outputs/ingredients/video")
ING_AUDIO_DIR = Path("outputs/ingredients/audio")

# Ingredients (IC-LoRA) constants: trained bucket is 768x448 / 121 frames; the
# pod template runs 25fps. 121 frames @25fps ≈ 4.84s per clip, native audio.
ING_FPS = 25
ING_FRAMES = 121

# LTX-2.3 constants (workflows/ltx2_av.json): 25fps clips, ~5s each; the audio
# latent runs at ~19.2 frames/s (97 frames = 5s in the official template).
LTX_FPS = 25
LTX_CLIP_SECONDS = 5


def inject_cast(prompt: str, anchors: list[str]) -> str:
    """Prepend the cast's verbatim anchors to a shot prompt.

    The ingredients-wrapper mechanism generalized: anchors are the consistency
    (verbatim repetition keeps the same actor across cuts and across ads), so
    every cast member's anchor rides at the head of every shot prompt. Pure
    function — unit-testable without a pod."""
    if not anchors:
        return prompt
    block = " ".join(a.strip().rstrip(".") + "." for a in anchors if a.strip())
    return f"Featuring {block}\n\n{prompt}"


def _qc_on(req: dict) -> bool:
    """QC gate default: ON for every render, FAST included — user rule 2026-07-09:
    "when i say fast, make sure quality doesn't degrade". The review costs seconds
    and a FAST re-roll only minutes, so even previews never ship a defective take.
    Explicit req["qc"]=false is the only off-switch."""
    q = req.get("qc")
    return True if q is None else bool(q)


# Seed offset between takes: prime and far from the +i / +i*3 shot spacing, so a
# re-rolled take can never collide with a neighbouring shot's seed.
_TAKE_SEED_STEP = 9973


def _render_takes(render, out_path: str, *, label: str, context: str,
                  report, pct: int, enabled: bool, records: list[dict]):
    """QC take-loop around one clip render (Phase 1: selection, not luck).

    `render(out_path, seed_bump)` performs the actual pod render. Take 1 keeps
    the canonical path; failing QC re-rolls with bumped seeds up to QC_MAX_TAKES,
    then the best-scoring take is promoted to the canonical path. QC failures
    surface as ⚠ progress details (the API layer persists those as warnings)."""
    if not enabled:
        return render(out_path, 0)
    # Rank by (ok, score): a PASSING take must beat every failing one no matter
    # the scores — score alone let a sharp-but-defective take outscore a clean
    # re-roll and ship (review finding, 2026-07-09). The tuple also makes the
    # vision-outage regime (flat local-only score) safely comparable.
    best: tuple[bool, float, str, dict] | None = None
    try:
        for take in range(1, qc.QC_MAX_TAKES + 1):
            path = out_path if take == 1 else out_path.replace(".mp4", f"-take{take}.mp4")
            path = render(path, (take - 1) * _TAKE_SEED_STEP)
            rec = qc.review_clip(path, context)
            rec.update(take=take, shot=label, shipped=False)
            records.append(rec)
            if take == 1 and rec["vision"] is None:
                report("generating", pct,
                       f"⚠ {label}: vision QC unavailable (Gemini) — only local freeze/blur checks ran")
            if best is None or (rec["ok"], rec["score"]) > (best[0], best[1]):
                best = (rec["ok"], rec["score"], path, rec)
            if rec["ok"]:
                break
            if take < qc.QC_MAX_TAKES:
                report("generating", pct,
                       f"⚠ {label}: QC failed take {take} ({'; '.join(rec['issues'])}) — re-rolling seed")
            else:
                report("generating", pct,
                       f"⚠ {label}: no take passed QC after {qc.QC_MAX_TAKES} tries — "
                       f"shipping best (score {best[1]:.1f}: {'; '.join(best[3]['issues'])})")
        if best[2] != out_path:
            os.replace(best[2], out_path)
        # The sidecar must name the file that actually shipped — take files are
        # renamed/deleted below, so stale take names would point at nothing.
        best[3]["shipped"] = True
        best[3]["clip"] = Path(out_path).name
    finally:
        # Runs on success, cancel (JobCancelled from report) and pod errors alike:
        # losing takes must never leak into the flat Library folders.
        for take in range(2, qc.QC_MAX_TAKES + 1):
            Path(out_path.replace(".mp4", f"-take{take}.mp4")).unlink(missing_ok=True)
    return out_path


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
    # Cast injection — ONE site for every mode. Product is exempt: its prompts
    # describe camera/light around a photographed product, and a character
    # anchor there would fight the i2v start image.
    anchors = req.get("cast_anchors") or []
    if anchors and mode != "product":
        for shot in req.get("shots") or []:
            shot["prompt"] = inject_cast(shot["prompt"], anchors)
        for seg in req.get("segments") or []:
            if seg.get("prompt") and seg.get("pipeline") != "product":
                seg["prompt"] = inject_cast(seg["prompt"], anchors)
    if mode == "sequence":
        return _generate_sequence(req, name, report, on_submit)
    if mode == "lipsync":
        return _generate_lipsync(req, name, report, on_submit)
    if mode == "product":
        return _generate_product(req, name, report, on_submit)
    if mode == "cinematic":
        return _generate_cinematic(req, name, report, on_submit)
    if mode == "ingredients":
        return _generate_ingredients(req, name, report, on_submit)
    if mode == "longcat":
        return _generate_longcat(req, name, report, on_submit)
    if mode == "duo":
        return _generate_duo(req, name, report, on_submit)
    if mode == "redub":
        return _generate_redub(req, name, report, on_submit)
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
    qc_records: list[dict] = []
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

        def render(out, bump, inputs=inputs):
            inp = {k: (v + bump if k.startswith("seed") else v) for k, v in inputs.items()}
            return comfy.comfy_generate(pod, wf, inp, WAN_T2V_MAPPING,
                                        out_path=out, on_submit=on_submit)
        clips.append(_render_takes(
            render, str(OUTPUT_VIDEO_DIR / f"{name}-clip{i + 1}.mp4"),
            label=f"clip {i + 1}", context=shot["prompt"], report=report, pct=pct,
            enabled=_qc_on(req), records=qc_records,
        ))

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
    qc.write_sidecar(final, qc_records)
    report("assembling", 99, "export ready")
    return final


# Face stills for avatar profiles: Wan t2v used as a text-to-IMAGE model —
# duration 0 -> floor(0*fps)+1 = exactly ONE frame, extracted to PNG. QUALITY
# path (20 steps, no Lightning LoRA): a face rendered once is reused forever.
FACE_PROMPT_SUFFIX = (
    ". Professional studio headshot photograph, 85mm portrait lens, front-facing, "
    "looking directly at the camera, gentle natural closed-mouth smile, head and "
    "shoulders framing, arms relaxed and out of frame, realistic skin pores and "
    "texture, soft diffused key light, neutral seamless background, sharp focus "
    "on the eyes, photorealistic"
)
FACE_NEGATIVE = (
    "cartoon, anime, 3d render, cgi, illustration, painting, airbrushed skin, "
    "plastic skin, uncanny, deformed face, asymmetric eyes, crooked teeth, "
    "exaggerated smile, multiple people, extra faces, side profile, sunglasses, "
    "raised arms, hands, text, watermark, blur"
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
        # 1024² (vs the videos' 640-class): stills have no motion budget to spend,
        # so spend it on resolution — S2V gets a much cleaner identity to lock.
        "width": 1024,
        "height": 1024,
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


# Brand Lock reference sheets, same 1-frame trick: one Wan still laid out as a
# multi-panel sheet. The model card wants clean panels on a plain background
# with NO text — text-laden panels measurably hurt identity carry-over.
SHEET_PROMPT_PREFIX = (
    "A professional brand reference sheet: a clean grid of separate panels on a "
    "solid black background, no text anywhere. The panels show: "
)
SHEET_PROMPT_SUFFIX = (
    ". Each element gets its own large uncluttered panel — characters as a "
    "front-facing close-up plus full-body turnaround views, products from "
    "several angles like studio product photography, the setting as one wide "
    "clean panel. Crisp even lighting, photorealistic, sharp focus."
)
SHEET_NEGATIVE = (
    "text, letters, words, labels, captions, watermark, numbers, cluttered "
    "layout, overlapping panels, torn edges, collage borders, single scene, "
    "blur, low quality"
)


def generate_sheet(description: str, width: int = 896, height: int = 1536,
                   seed: int | None = None, out_stem: str = "sheet",
                   on_submit=None) -> str:
    """Render ONE reference-sheet still for the Ingredients pipeline.

    Generated at ~2x the ad's output size and in the SAME aspect, because the
    IC-LoRA scales the sheet to exactly the output frame (downscale factor 1) —
    a mismatched aspect would stretch every panel.
    """
    if not COMFY_POD_URLS:
        raise RuntimeError("COMFY_POD_URLS is not set in .env — no pod to generate on.")
    pod = COMFY_POD_URLS[0]
    httpx.get(f"{pod.rstrip('/')}/system_stats", timeout=10).raise_for_status()

    out_dir = Path("assets/sheets")
    out_dir.mkdir(parents=True, exist_ok=True)
    tmp_mp4 = out_dir / f"{out_stem}.mp4"
    png = out_dir / f"{out_stem}.png"

    inputs = {
        "prompt": SHEET_PROMPT_PREFIX + description.strip() + SHEET_PROMPT_SUFFIX,
        "negative_prompt": SHEET_NEGATIVE,
        "seed": seed or DEFAULT_BASE_SEED,
        "duration": 0.0,          # 1 frame — a still sheet
        "width": width,
        "height": height,
        "lightning_lora": False,  # QUALITY path — the sheet IS the brand identity
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


# Scene stills (duo refs, staged shots): cinematic framing, NOT the headshot or
# sheet scaffolds — the still IS the set: whatever is in it is what S2V/LongCat
# will animate (the eyeline test proved prompts can't override the ref image).
SCENE_PROMPT_SUFFIX = (
    ". Cinematic photograph, natural believable framing, realistic skin texture "
    "and fabric detail, soft directional light, sharp focus, photorealistic, "
    "no text anywhere"
)
SCENE_NEGATIVE = (
    "text, letters, captions, watermark, cartoon, anime, 3d render, cgi, "
    "illustration, deformed faces, asymmetric eyes, extra limbs, cloned faces, "
    "blur, low quality"
)


def generate_scene(description: str, width: int = 832, height: int = 480,
                   seed: int | None = None, out_stem: str = "scene",
                   on_submit=None) -> str:
    """Render ONE staged scene still (e.g. the two-person duo reference:
    speaker 1 on the LEFT, speaker 2 on the RIGHT). Quality path, 1 frame."""
    if not COMFY_POD_URLS:
        raise RuntimeError("COMFY_POD_URLS is not set in .env — no pod to generate on.")
    pod = COMFY_POD_URLS[0]
    httpx.get(f"{pod.rstrip('/')}/system_stats", timeout=10).raise_for_status()

    out_dir = Path("assets/stills")
    out_dir.mkdir(parents=True, exist_ok=True)
    tmp_mp4 = out_dir / f"{out_stem}.mp4"
    png = out_dir / f"{out_stem}.png"
    inputs = {
        "prompt": description.strip() + SCENE_PROMPT_SUFFIX,
        "negative_prompt": SCENE_NEGATIVE,
        "seed": seed or DEFAULT_BASE_SEED,
        "duration": 0.0,
        "width": width,
        "height": height,
        "lightning_lora": False,  # the still becomes the whole set — QUALITY only
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
      - overlay  : one Wan t2v clip (~5s); optional script slice -> per-segment voiceover
      - cinematic: one LTX-2.3 clip (~5s @25fps, NATIVE audio); optional script slice
                   -> voiceover ducks the native ambience (music lane = the clip itself)
      - product  : one i2v clip from segment `image`; optional script slice -> voiceover
      - lipsync  : S2V take (~14.4s, audio embedded); script + image REQUIRED

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
    qc_records: list[dict] = []  # per-take QC verdicts; lipsync segments are exempt
    # (an S2V take is fixed-length, voice-embedded and expensive — re-rolling it
    # re-rolls the performance; the underfill guard already covers its failure mode)
    n = len(segments)
    prev_engine: str | None = None
    for i, seg in enumerate(segments):
        pct = 5 + int(80 * i / n)
        pipeline_kind = seg["pipeline"]
        report("generating", pct, f"segment {i + 1}/{n} ({pipeline_kind})")
        seg_stem = f"{name}-seg{i + 1}"
        # Mixed engines on one GPU: evict the other family's weights at each
        # switch (LTX 22B + Wan 14B don't fit side by side on the A40; the
        # ingredients checkpoint also differs from cinematic's dev checkpoint).
        if pipeline_kind == "cinematic":
            engine = "ltx-ing" if seg.get("image") else "ltx-av"
        else:
            engine = "wan"
        if prev_engine is not None and engine != prev_engine:
            comfy.free_memory(pod)
        prev_engine = engine

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
            # The S2V take is FIXED (~14.4s): a script that underfills it leaves
            # the speaker mouthing silence for the rest (protein-ad postmortem —
            # Hinglish reads ~2x faster than pure Hindi, word counts mislead).
            ndur = ffmpeg.probe(narration)["duration"]
            if ndur < 10.5:
                report("generating", pct,
                       f"⚠ segment {i + 1}: script fills only {ndur:.0f}s of the ~14s "
                       f"take — the speaker will fall silent; add ~{int((13 - ndur) * 2.9)} words")
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
                # QUALITY S2V (20 steps, CFG 6, 3 windows, ~14s take) runs past the
                # default 30min ceiling — the protein-ab postmortem: the render was
                # healthy, only the client gave up.
                timeout=3600.0 if not fast else comfy.DEFAULT_TIMEOUT,
            )
            # The segment clip stays in the Library — lock its lip-synced voice
            # just like the final, or /revoice could desync its mouth.
            Path(clip).with_suffix(".meta.json").write_text(json.dumps({"voice_lock": True}))
        elif pipeline_kind == "cinematic":
            if seg.get("image"):
                # Brand-locked b-roll: the segment's product/reference photo rides
                # the Ingredients graph — the REAL product appears IN the scene,
                # identity held (the model can't hallucinate a different jar).
                sheet_name = upload_once(seg["image"])
                desc = seg.get("image_description") or "the product in the reference photo"
                w = req.get("width") or 768
                h = req.get("height") or 448
                inputs = {
                    "prompt": f"Reference sheet: {desc}\n\nGenerated video: {seg['prompt']}",
                    "sheet_image": sheet_name,
                    "sheet_width": w, "sheet_height": h,
                    "width": w, "height": h,
                    "length": ING_FRAMES, "sheet_frames": ING_FRAMES,
                    "audio_frames": ING_FRAMES,
                    "seed": base_seed + i * 3,
                    "filename_prefix": f"video/adgen_seq_{seg_stem}",
                }
                wf, mapping = comfy.load_workflow("ltx2_ingredients"), INGREDIENTS_MAPPING
            else:
                # LTX-2.3 b-roll: ~5s @25fps WITH native audio. Renders half-size
                # then 2x latent-upsamples, so the injected dims are target // 2.
                inputs = {
                    "prompt": seg["prompt"],
                    "seed": base_seed + i * 3,
                    "seed_refine": base_seed + 1000 + i,
                    "width": max(2, (req.get("width") or 1280) // 2),
                    "height": max(2, (req.get("height") or 720) // 2),
                    "filename_prefix": f"video/adgen_seq_{seg_stem}",
                }
                wf, mapping = comfy.load_workflow("ltx2_av"), LTX2_MAPPING
            if seg.get("negative_prompt"):
                inputs["negative_prompt"] = seg["negative_prompt"]

            def render(out, bump, inputs=inputs, wf=wf, mapping=mapping):
                inp = {k: (v + bump if k.startswith("seed") else v) for k, v in inputs.items()}
                return comfy.comfy_generate(pod, wf, inp, mapping,
                                            out_path=out, on_submit=on_submit)
            # QC runs on the SILENT clip — a re-roll must happen before the
            # voiceover mux, and the judge doesn't need audio.
            clip = _render_takes(
                render, str(SEQ_VIDEO_DIR / f"{seg_stem}.mp4"),
                label=f"segment {i + 1}", context=seg["prompt"], report=report,
                pct=pct, enabled=_qc_on(req), records=qc_records,
            )
            if seg.get("script"):
                narration = synthesize_voice(
                    seg["script"],
                    voice_id=seg.get("voice_id") or req.get("voice_id"),
                    language=req.get("language", "hi"),
                    output_path=str(SEQ_AUDIO_DIR / f"{seg_stem}-narration.mp3"),
                )
                silent = clip
                # The clip's own soundtrack becomes the ducked bed under the VO —
                # same trick as cinematic mode's assembly.
                clip = ffmpeg.replace_audio(
                    clip, narration, music=clip, music_gain=0.25,
                    out=str(SEQ_VIDEO_DIR / f"{seg_stem}-voiced.mp4"),
                    on_warning=lambda w, i=i: report("generating", pct, f"segment {i + 1}: {w}"),
                )
                Path(silent).unlink(missing_ok=True)
        else:
            inputs = {"prompt": seg["prompt"], **common}
            if fast:
                inputs["lightning_lora"] = True
            if pipeline_kind == "product":
                inputs["start_image"] = upload_once(seg["image"])
                wf, mapping = comfy.load_workflow("wan_i2v"), WAN_I2V_MAPPING
            else:  # overlay (t2v b-roll)
                wf, mapping = comfy.load_workflow("wan_t2v"), WAN_T2V_MAPPING

            def render(out, bump, inputs=inputs, wf=wf, mapping=mapping):
                inp = {k: (v + bump if k.startswith("seed") else v) for k, v in inputs.items()}
                return comfy.comfy_generate(pod, wf, inp, mapping,
                                            out_path=out, on_submit=on_submit)
            clip = _render_takes(
                render, str(SEQ_VIDEO_DIR / f"{seg_stem}.mp4"),
                label=f"segment {i + 1}", context=seg["prompt"], report=report,
                pct=pct, enabled=_qc_on(req), records=qc_records,
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

    qc.write_sidecar(final, qc_records)
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
    qc_records: list[dict] = []
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

        def render(out, bump, inputs=inputs):
            inp = {k: (v + bump if k.startswith("seed") else v) for k, v in inputs.items()}
            return comfy.comfy_generate(pod, wf, inp, WAN_I2V_MAPPING,
                                        out_path=out, on_submit=on_submit)
        clips.append(_render_takes(
            render, str(I2V_VIDEO_DIR / f"{name}-clip{i + 1}.mp4"),
            label=f"clip {i + 1}", context=shot["prompt"], report=report, pct=pct,
            enabled=_qc_on(req), records=qc_records,
        ))

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

    qc.write_sidecar(final, qc_records)
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
        # A narration that outruns the video gets tempo-fit only up to ~1.12x —
        # past that it would be CUT mid-sentence. Fail now with the exact fix
        # instead of shipping half a script (the sa01 lesson: 91s VO, 53s video).
        ndur = ffmpeg.probe(narration)["duration"]
        clip_s = 4.84  # measured real seconds per LTX clip (121f @25fps after mux)
        capacity = len(req["shots"]) * clip_s
        if ndur > capacity * 1.10:
            import math
            need = math.ceil((ndur / 1.08 - capacity) / clip_s)
            raise ValueError(
                f"narration runs {ndur:.0f}s but {len(req['shots'])} shots give only "
                f"~{capacity:.0f}s of video — add ~{need} more shots or shorten the script."
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
    qc_records: list[dict] = []
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

        def render(out, bump, inputs=inputs):
            inp = {k: (v + bump if k.startswith("seed") else v) for k, v in inputs.items()}
            return comfy.comfy_generate(pod, wf, inp, LTX2_MAPPING,
                                        out_path=out, on_submit=on_submit)
        clips.append(_render_takes(
            render, str(LTX_VIDEO_DIR / f"{name}-clip{i + 1}.mp4"),
            label=f"cinematic clip {i + 1}", context=shot["prompt"], report=report,
            pct=pct, enabled=_qc_on(req), records=qc_records,
        ))

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

    qc.write_sidecar(final, qc_records)
    report("assembling", 99, "export ready")  # API layer owns the terminal 'done'
    return final


def _generate_ingredients(req: dict, name: str, report, on_submit=None) -> str:
    """mode="ingredients": LTX-2.3 IC-LoRA reference-sheet control — every clip
    keeps the characters/props/setting from an uploaded REFERENCE SHEET image
    (brand-locked footage: same mascot, same pack, same store in every cut).

    Prompting is two-part per the model card: the sheet DESCRIPTION says what
    the panels contain; each shot prompt says what happens. Clips are ~4.8s
    @25fps with native audio; assembly mirrors cinematic (narration ducks the
    native soundtrack, explicit music replaces it).
    """
    sheet = req.get("sheet_image")
    if not sheet:
        raise ValueError("ingredients needs `sheet_image` — the reference sheet image.")
    if not Path(sheet).exists():
        raise FileNotFoundError(f"sheet_image not found: {sheet}")
    sheet_desc = (req.get("sheet_description") or "").strip()
    if not sheet_desc:
        raise ValueError("ingredients needs `sheet_description` — what the sheet's "
                         "panels contain (characters, props, setting).")

    ING_VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    ING_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    pod = COMFY_POD_URLS[0]

    narration = None
    if req.get("script"):
        report("tts", 5, "synthesizing narration")
        narration = synthesize_voice(
            req["script"],
            voice_id=req.get("voice_id"),
            language=req.get("language", "hi"),
            output_path=str(ING_AUDIO_DIR / f"{name}-narration.mp3"),
        )

    report("uploading", 8, "reference sheet -> pod")
    sheet_name = comfy.upload_file(pod, sheet)

    comfy.free_memory(pod)  # its checkpoint differs from cinematic's — make room
    wf = comfy.load_workflow("ltx2_ingredients")
    shots = req["shots"]
    base_seed = req.get("seed") or DEFAULT_BASE_SEED
    # Trained bucket is 768x448-class sizes; the sheet is scaled to the SAME
    # frame as the output (reference downscale factor 1).
    w = req.get("width") or 768
    h = req.get("height") or 448
    clips: list[str] = []
    qc_records: list[dict] = []
    for i, shot in enumerate(shots):
        pct = 12 + int(72 * i / len(shots))
        report("generating", pct, f"brand-locked clip {i + 1}/{len(shots)} (~5s + audio)")
        inputs = {
            "prompt": f"Reference sheet: {sheet_desc}\n\nGenerated video: {shot['prompt']}",
            "sheet_image": sheet_name,
            "sheet_width": w, "sheet_height": h,
            "width": w, "height": h,
            "length": ING_FRAMES, "sheet_frames": ING_FRAMES,
            "audio_frames": ING_FRAMES,
            "seed": base_seed + i,
            "filename_prefix": f"video/adgen_ingredients_{name}",
        }
        if shot.get("negative_prompt"):
            inputs["negative_prompt"] = shot["negative_prompt"]

        def render(out, bump, inputs=inputs):
            inp = {k: (v + bump if k.startswith("seed") else v) for k, v in inputs.items()}
            return comfy.comfy_generate(pod, wf, inp, INGREDIENTS_MAPPING,
                                        out_path=out, on_submit=on_submit)
        clips.append(_render_takes(
            render, str(ING_VIDEO_DIR / f"{name}-clip{i + 1}.mp4"),
            label=f"brand-locked clip {i + 1}", context=shot["prompt"], report=report,
            pct=pct, enabled=_qc_on(req), records=qc_records,
        ))

    # Assembly mirrors cinematic: clips carry native audio in every path.
    report("assembling", 90, "joining brand-locked clips")
    final = str(ING_VIDEO_DIR / f"{name}-final.mp4")
    if narration:
        joined = ffmpeg.concat_reencode(clips, out=str(ING_VIDEO_DIR / f"{name}-joined.mp4"))
        bed = req.get("music") or joined
        try:
            final = ffmpeg.replace_audio(
                joined, narration, music=bed, out=final,
                music_gain=0.25 if bed == joined else 0.15,
                on_warning=lambda w_: report("assembling", 92, w_),
            )
        finally:
            Path(joined).unlink(missing_ok=True)
    elif req.get("music"):
        final = ffmpeg.stitch_plus_music(clips, music=req["music"], out=final)
    else:
        final = ffmpeg.stitch(clips, out=final)

    qc.write_sidecar(final, qc_records)
    report("assembling", 99, "export ready")  # API layer owns the terminal 'done'
    return final


# NOTE: longcat/duo/redub/lipsync stay OUTSIDE the QC gate by design — their
# takes are fixed-length with the voice performance embedded, so a re-roll
# re-rolls the performance itself; their failure modes have dedicated guards
# (underfill warning, window count from narration length).
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

    # 3. GENERATE — window count follows the NARRATION length (time is the #1
    # user complaint): 2 windows ≈ 10.8s take when the script fits, 3 windows
    # ≈ 15.8s otherwise. A window costs ~1/3 of the render — never spend it on
    # seconds nobody scripted.
    narration_s = ffmpeg.probe(narration)["duration"]
    two_windows = narration_s <= 9.8  # 10.8s take minus a ~1s breathing tail
    shot = req["shots"][0]
    base_seed = req.get("seed") or DEFAULT_BASE_SEED
    inputs = {
        "prompt": shot["prompt"],
        "ref_image": image_name,
        "audio": audio_name,
        "seed": base_seed,
        "seed_extend1": base_seed + 1,
        "filename_prefix": f"adgen_longcat_{name}",
    }
    if not two_windows:
        inputs["seed_extend2"] = base_seed + 2
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
    wf_name = "longcat_avatar_2w" if two_windows else "longcat_avatar"
    mapping = LONGCAT_2W_MAPPING if two_windows else LONGCAT_MAPPING
    report("generating", 15,
           f"LongCat avatar ({'~11s take, 2 windows — short script, faster' if two_windows else '~16s take, 3 windows'})")
    clip = comfy.comfy_generate(
        pod, comfy.load_workflow(wf_name), inputs, mapping,
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


DUO_VIDEO_DIR = Path("outputs/duo/video")
DUO_AUDIO_DIR = Path("outputs/duo/audio")
DUO_MAX_SPEECH_S = 15.0  # 3-window take is ~15.8s — the conversation must fit


def _generate_duo(req: dict, name: str, report, on_submit=None) -> str:
    """mode="duo": MULTI-STREAM dialogue — two people in ONE continuous LongCat
    take. The reference image is a staged two-person still (speaker 0 seated
    LEFT, speaker 1 RIGHT); each speaker's own audio stream drives their mouth
    while the other visibly listens. This is the genuinely-natural conversation
    the cut-per-turn dialogue can't do.

    req extras: duo_turns=[{speaker:0|1, text}], duo_voices=[voiceA, voiceB],
    avatar_image = the two-person still, shots[0].prompt = scene/action.
    """
    turns = req.get("duo_turns") or []
    if len(turns) < 2:
        raise ValueError("duo needs at least 2 turns.")
    voices = req.get("duo_voices") or []
    if len(voices) != 2:
        raise ValueError("duo needs `duo_voices` — one ElevenLabs voice per speaker.")
    ref = req.get("avatar_image")
    if not ref:
        raise ValueError("duo needs `avatar_image` — the staged TWO-PERSON still "
                         "(speaker 1 on the left, speaker 2 on the right).")
    if not Path(ref).exists():
        raise FileNotFoundError(f"avatar_image not found: {ref}")

    DUO_VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    DUO_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    pod = COMFY_POD_URLS[0]

    # 1. TTS every turn with its speaker's voice
    report("tts", 5, f"synthesizing {len(turns)} turns")
    turn_files, speakers = [], []
    for i, t in enumerate(turns):
        spk = int(t["speaker"])
        turn_files.append(synthesize_voice(
            t["text"], voice_id=voices[spk], language=req.get("language", "hi"),
            output_path=str(DUO_AUDIO_DIR / f"{name}-turn{i + 1}.mp3"),
        ))
        speakers.append(spk)

    # 2. Per-speaker timeline tracks + combined mux track
    report("tts", 10, "building the two audio streams")
    track_a, track_b, mix, total = ffmpeg.dialogue_tracks(
        turn_files, speakers,
        str(DUO_AUDIO_DIR / f"{name}-trackA.mp3"),
        str(DUO_AUDIO_DIR / f"{name}-trackB.mp3"),
        str(DUO_AUDIO_DIR / f"{name}-mix.mp3"),
    )
    if total > DUO_MAX_SPEECH_S:
        raise ValueError(
            f"the conversation runs {total:.1f}s — a duo take fits ~{DUO_MAX_SPEECH_S:.0f}s "
            f"of speech. Trim the lines (about 3 words/second)."
        )

    # 3. UPLOAD ref still + all three tracks
    report("uploading", 12, "two-person still + audio streams -> pod")
    inputs = {
        "prompt": req["shots"][0]["prompt"],
        "ref_image": comfy.upload_file(pod, ref),
        "audio": comfy.upload_file(pod, track_a),
        "audio_b": comfy.upload_file(pod, track_b),
        "audio_mix": comfy.upload_file(pod, mix),
        "filename_prefix": f"adgen_duo_{name}",
    }
    base_seed = req.get("seed") or DEFAULT_BASE_SEED
    inputs.update({"seed": base_seed, "seed_extend1": base_seed + 1,
                   "seed_extend2": base_seed + 2})
    if req["shots"][0].get("negative_prompt"):
        inputs["negative_prompt"] = req["shots"][0]["negative_prompt"]
    w = req.get("width") or 832
    h = req.get("height") or 480
    inputs.update({
        "width": w, "height": h,
        # speaker masks: left/right halves of the frame
        "m_full1_w": w, "m_full1_h": h, "m_half1_w": w // 2, "m_half1_h": h,
        "m_full2_w": w, "m_full2_h": h, "m_half2_w": w // 2, "m_half2_h": h,
        "m_x2": w // 2,
    })
    if req.get("steps"):
        inputs["steps"] = req["steps"]

    # 4. GENERATE — one continuous two-person take (heaviest model we run)
    comfy.free_memory(pod)
    report("generating", 15, "multi-stream duo take (~16s, both speakers in frame)")
    clip = comfy.comfy_generate(
        pod, comfy.load_workflow("longcat_duo"), inputs, LONGCAT_DUO_MAPPING,
        out_path=str(DUO_VIDEO_DIR / f"{name}-clip1.mp4"),
        timeout=3600.0, on_submit=on_submit,
    )

    # 5. ASSEMBLE — conversation audio already muxed; optional music bed
    report("assembling", 92, "finalizing")
    final = str(DUO_VIDEO_DIR / f"{name}-final.mp4")
    if req.get("music"):
        final = ffmpeg.stitch_plus_music([clip], music=req["music"], out=final)
    else:
        final = ffmpeg.stitch([clip], out=final)

    # Both mouths are baked to their voices — /revoice must refuse this.
    Path(final).with_suffix(".meta.json").write_text(json.dumps({"voice_lock": True}))
    Path(clip).with_suffix(".meta.json").write_text(json.dumps({"voice_lock": True}))

    report("assembling", 99, "export ready")  # API layer owns the terminal 'done'
    return final


REDUB_VIDEO_DIR = Path("outputs/redub/video")
REDUB_AUDIO_DIR = Path("outputs/redub/audio")
REDUB_MAX_SECONDS = 12.0  # single-pass v1; longer sources need chunked redub (next)


def _generate_redub(req: dict, name: str, report, on_submit=None) -> str:
    """mode="redub": LTX LipDub — re-render an existing video's MOUTH to match a
    NEW ElevenLabs track (any language, any voice) while preserving everything
    else. This is how a generated ad becomes Hindi/English-dubbed with one
    consistent brand voice — or how a speaking character gets professional audio.

    req: source_video (an existing render), script + voice_id (the new line),
    shots[0].prompt = scene description (the spoken text is appended to it).
    """
    src = req.get("source_video")
    if not src:
        raise ValueError("redub needs `source_video` — the video whose lips to re-render.")
    if not Path(src).exists():
        raise FileNotFoundError(f"source_video not found: {src}")
    if not req.get("script"):
        raise ValueError("redub needs `script` — the new spoken line(s).")

    info = ffmpeg.probe(src)
    if info["duration"] > REDUB_MAX_SECONDS:
        raise ValueError(
            f"source is {info['duration']:.1f}s — single-pass redub handles up to "
            f"~{REDUB_MAX_SECONDS:.0f}s for now. Pick a shorter clip."
        )
    fps = info["fps"] if info["fps"] > 1 else 25.0
    # Stage-2 (output) size: source rounded to /64 so the half-res stage stays
    # /32-legal for LTX's latent grid. crop=disabled stretches — small aspect
    # drift on odd sizes is invisible next to a mouth re-render.
    s2w = max(64, round(info["width"] / 64) * 64)
    s2h = max(64, round(info["height"] / 64) * 64)
    frames = int(round(info["duration"] * fps))
    length = max(9, ((frames - 1) // 8) * 8 + 1)

    REDUB_VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    REDUB_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    pod = COMFY_POD_URLS[0]

    # 1. TTS the new line, padded/trimmed to EXACTLY the video's length
    report("tts", 5, "synthesizing the dub track")
    raw = synthesize_voice(
        req["script"], voice_id=req.get("voice_id"),
        language=req.get("language", "hi"),
        output_path=str(REDUB_AUDIO_DIR / f"{name}-dub-raw.mp3"),
    )
    dub = ffmpeg.fit_audio_duration(raw, info["duration"],
                                    str(REDUB_AUDIO_DIR / f"{name}-dub.mp3"))

    # 2. UPLOAD source video + dub track
    report("uploading", 10, "source video + dub track -> pod")
    video_name = comfy.upload_file(pod, src)
    audio_name = comfy.upload_file(pod, dub)

    # 3. GENERATE — two-stage re-render with the source as IC reference
    scene = req["shots"][0]["prompt"] if req.get("shots") else "A person speaking to camera"
    base_seed = req.get("seed") or DEFAULT_BASE_SEED
    inputs = {
        "prompt": f"{scene} They speak clearly, saying: \"{req['script']}\"",
        "video": video_name,
        "audio": audio_name,
        "s1_width": s2w // 2, "s1_height": s2h // 2,
        "s2_width": s2w, "s2_height": s2h,
        "latent_width": s2w // 2, "latent_height": s2h // 2,
        "length": length,
        "audio_frames": length,
        "audio_fps": int(round(fps)),
        "cond_fps": float(fps),
        "out_fps": float(fps),
        "seed": base_seed,
        "seed_refine": base_seed + 1000,
        "filename_prefix": f"video/adgen_redub_{name}",
    }
    if req["shots"] and req["shots"][0].get("negative_prompt"):
        inputs["negative_prompt"] = req["shots"][0]["negative_prompt"]

    comfy.free_memory(pod)
    report("generating", 15, "re-rendering lips to the new track (two-stage)")
    clip = comfy.comfy_generate(
        pod, comfy.load_workflow("ltx2_lipdub"), inputs, LIPDUB_MAPPING,
        out_path=str(REDUB_VIDEO_DIR / f"{name}-clip1.mp4"),
        timeout=1800.0, on_submit=on_submit,
    )

    # 4. ASSEMBLE — the dubbed take IS the final; new lips are baked to the track
    report("assembling", 95, "finalizing")
    final = str(REDUB_VIDEO_DIR / f"{name}-final.mp4")
    final = ffmpeg.stitch([clip], out=final)
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
    # Fixed ~14.4s take: an underfilled script = silent lip-flapping for the rest.
    ndur = ffmpeg.probe(narration)["duration"]
    if ndur < 10.5:
        report("tts", 6,
               f"⚠ script fills only {ndur:.0f}s of the ~14s take — the speaker "
               f"will fall silent; add ~{int((13 - ndur) * 2.9)} words")

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
        # QUALITY S2V outruns the default 30min ceiling (protein-ab postmortem).
        timeout=3600.0 if req.get("quality") != "fast" else comfy.DEFAULT_TIMEOUT,
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
