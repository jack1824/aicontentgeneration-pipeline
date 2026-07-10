"""Per-workflow node-id mappings for inject_inputs() (see workflows/README.md).

Each mapping ties a logical input name to (node_id, input_field) in that workflow's
API-format JSON. Node ids are specific to OUR exports — re-check them if a workflow
is re-exported from ComfyUI (ids can change when the graph is edited).
"""

# workflows/wan_t2v.json — Wan 2.2 14B text-to-video (exported 2026-07-02).
# As exported: 640x640, 5s @ 16fps (81 frames), QUALITY mode (Lightning LoRA switch
# node 128:129 = false -> 20 steps / split 10 / CFG 3.5). Two-stage KSamplerAdvanced:
# 128:81 (high-noise, owns the seed) -> 128:78 (low-noise, add_noise=disable).
WAN_T2V_MAPPING = {
    "prompt": ("128:89", "text"),            # positive CLIPTextEncode
    "negative_prompt": ("128:72", "text"),   # negative CLIPTextEncode
    "seed": ("128:81", "noise_seed"),        # first-stage sampler (the only live seed)
    "duration": ("128:126", "value"),        # Float (Duration), seconds; length = floor(d*fps)+1
    "fps": ("128:125", "value"),             # Float (FPS)
    "width": ("128:74", "width"),            # EmptyHunyuanLatentVideo
    "height": ("128:74", "height"),
    "lightning_lora": ("128:129", "value"),  # bool; True = FAST 4-step preset. The on_true branch
                                             # values were fixed locally (2026-07-03): steps 4 /
                                             # split 2 / CFG 1.0. NOTE: the graph in the ComfyUI UI
                                             # still has the old values — re-apply if re-exported.
    # QUALITY-path knobs (2026-07-10 audit): split_steps = how many of `steps`
    # run on the HIGH-noise expert; the remainder run LOW-noise, which is where
    # identity/detail is preserved — fewer high steps = less identity drift.
    "steps": ("128:114", "value"),           # QUALITY steps (default 20)
    "split_steps": ("128:115", "value"),     # high->low expert handoff (default 10)
    "cfg": ("128:116", "value"),             # QUALITY CFG (default 3.5)
}

# workflows/wan_s2v.json — Wan 2.2 14B S2V talking avatar (exported 2026-07-03, native template).
# Structure: base segment (KSampler "3") + 2 extend segments ("79:77", "85:183"), 77 frames each
# @16fps → FIXED ~14.4s output (changing length = graph edit, not an input). CreateVideo ("82")
# muxes the narration INTO the output video — S2V clips come back WITH audio (audio-first).
# The ref image ("52") and narration audio ("58") are pod-side FILENAMES — upload them first via
# comfy.upload_file(), then inject the returned names.
WAN_S2V_MAPPING = {
    "prompt": ("6", "text"),                 # positive CLIPTextEncode (avatar action/scene)
    "negative_prompt": ("7", "text"),        # negative CLIPTextEncode (Chinese default)
    "ref_image": ("52", "image"),            # LoadImage — UPLOADED avatar face filename
    "audio": ("58", "audio"),                # LoadAudio — UPLOADED narration filename
    "seed": ("3", "seed"),                   # base segment sampler
    "seed_extend1": ("79:77", "seed"),       # extend segment 1 sampler
    "seed_extend2": ("85:183", "seed"),      # extend segment 2 sampler
    "steps": ("103", "value"),               # shared by all 3 samplers
    "cfg": ("105", "value"),                 # shared by all 3 samplers
    "model_source": ("54", "model"),         # ModelSamplingSD3's model input (link, not value)
    "width": ("93", "width"),                # WanSoundImageToVideo frame size; keep multiples
    "height": ("93", "height"),              # of 16 (e.g. 432x768 = exact 9:16 for reels)
}

# workflows/wan_i2v.json — Wan 2.2 14B image-to-video (exported 2026-07-04; product pipeline).
# Animates a START IMAGE (the product photo — upload first, inject the pod-side name).
# Same two-stage family as t2v; this export's FAST switch ("129:131") is wired CORRECTLY
# (on_true: 4 steps / split 2 / CFG 1). Defaults: QUALITY (20/10/3.5), 640x640, 5s@16fps.
# NOTE: model/LoRA filenames in the JSON were re-pointed to THIS pod's files
# (fp16 UNets + i2v_lightx2v_*_model.safetensors) — re-check on any pod change.
WAN_I2V_MAPPING = {
    "prompt": ("129:93", "text"),            # positive CLIPTextEncode (motion/camera description)
    "negative_prompt": ("129:89", "text"),   # negative CLIPTextEncode (Chinese default)
    "start_image": ("97", "image"),          # LoadImage — UPLOADED product photo filename
    "seed": ("129:86", "noise_seed"),        # first-stage sampler (the only live seed)
    "width": ("129:98", "width"),            # WanImageToVideo frame size (multiples of 16)
    "height": ("129:98", "height"),
    "duration": ("129:161", "value"),        # seconds; length = floor(d*fps+1)
    "fps": ("129:162", "value"),
    "lightning_lora": ("129:131", "value"),  # bool switch; True = FAST 4-step (correctly wired)
    # QUALITY-path knobs (2026-07-10 audit) — same identity-preserving split
    # semantics as t2v; the product pipeline's start-image adherence benefits
    # from biasing steps toward the LOW-noise expert (lower split_steps).
    "steps": ("129:128", "value"),           # QUALITY steps (default 20)
    "split_steps": ("129:127", "value"),     # high->low expert handoff (default 10)
    "cfg": ("129:126", "value"),             # QUALITY CFG (default 3.5)
}

# FLIPPED 2026-07-10 (audit): the JSON defaults are now the QUALITY config
# (steps 20 / CFG 6.0 / LoRA bypassed — node 54 wired straight to UNET "37"),
# so a code path that forgets to patch fails SAFE at final quality. FAST is the
# explicit API-side patch: 4 steps / CFG 1 and node 54 rewired through the
# Lightning LoRA ("107") — which visibly degrades S2V, previews only.
WAN_S2V_FAST_INPUTS = {
    "steps": 4,
    "cfg": 1.0,
    "model_source": ["107", 0],              # route through Lightning LoRA for speed
}

# workflows/ltx2_av.json — LTX-2.3 22B text-to-video WITH native synchronized audio
# (authored 2026-07-05 from the official ComfyUI template video_ltx2_3_t2v.json, flattened:
# prompt-enhancer branch removed, math/primitive scaffolding replaced by direct injection).
# Two-stage render: base pass at HALF resolution (node 228) -> latent 2x upsample (253)
# -> refine pass -> tiled decode + audio decode -> CreateVideo -> SaveVideo.
# Defaults: 5s @ 25fps (126 video frames / 97 audio latent frames), distilled LoRA @0.5,
# cfg 1, manual distilled sigmas. IMPORTANT: inject the HALF dimensions (final = 2x).
LTX2_MAPPING = {
    "prompt": ("240", "text"),               # positive CLIPTextEncode (Gemma encoder)
    "negative_prompt": ("247", "text"),      # negative CLIPTextEncode
    "seed": ("237", "noise_seed"),           # stage-1 (base) noise
    "seed_refine": ("216", "noise_seed"),    # stage-2 (refine) noise — template fixed it at 42
    "width": ("228", "width"),               # BASE-pass latent size — pass final//2
    "height": ("228", "height"),
    "length": ("228", "length"),             # video frames = fps*seconds + 1 (126 = 5s@25)
    # audio_frames is VIDEO frames (the node derives audio latent length from it
    # + frame_rate) — ALWAYS inject the same value as `length`. The old '97 = 5s'
    # formula was reverse-engineered from a wrong default that shorted every
    # LTX clip's audio by ~1.2s (2026-07-10 audit; JSON default now 126).
    "audio_frames": ("214", "frames_number"),
    "lora_strength": ("232", "strength_model"),
    # NOTE: negative_prompt above is INERT on this graph today — both stages run
    # cfg=1.0 (distilled) and there is no NAG node; needs a pod re-export to bite.
    "cfg": ("231", "cfg"),                   # base-stage CFG (default 1.0, distilled)
    "cfg_refine": ("213", "cfg"),            # refine-stage CFG
    "refine_strength": ("230", "strength"),  # refine conditioning strength
    "filename_prefix": ("75", "filename_prefix"),
}

# workflows/ltx2_ingredients.json — LTX-2.3 IC-LoRA "Ingredients" reference-sheet
# control (authored 2026-07-06 from the pod's video_ltx2_3_ic_lora template:
# MoGe/union-control branch dropped, first-frame conditioning dropped (trained
# with p=0), prompt-enhancer dropped). The reference sheet is a STILL image the
# graph loops pod-side (ImageScale -> RepeatImageBatch) into the ≥121-frame
# static video the IC-LoRA expects. Single-stage distilled sampling (8 steps,
# cfg 1) on ltx-2.3-22b-distilled-fp8; output = length frames @25fps WITH native
# audio. Prompt format is two-part: "Reference sheet: ...\n\nGenerated video: ...".
# width/height go to BOTH the sheet scaler and the latent; length to the latent,
# the repeat amount and the audio latent — the pipeline passes them together.
INGREDIENTS_MAPPING = {
    "prompt": ("6", "text"),                 # composed two-part prompt
    "negative_prompt": ("7", "text"),
    "sheet_image": ("9", "image"),           # LoadImage — UPLOADED sheet filename
    "sheet_width": ("10", "width"),          # ImageScale (must equal output size)
    "sheet_height": ("10", "height"),
    "sheet_frames": ("11", "amount"),        # RepeatImageBatch (= length, >=121)
    "width": ("12", "width"),                # EmptyLTXVLatentVideo
    "height": ("12", "height"),
    "length": ("12", "length"),
    "audio_frames": ("13", "frames_number"),  # LTXVEmptyLatentAudio (= length here)
    "lora_strength": ("4", "strength_model"),  # IC-LoRA weight (default now 1.4 per model card)
    "seed": ("16", "seed"),
    "steps": ("16", "steps"),
    # 2026-07-10 audit adds. negative_prompt is INERT at the default cfg 1.0
    # (no NAG node) — a pod re-export must add NAG or a non-distilled quality
    # tier (dev checkpoint, 30 steps, guidance 3.5-4.0) for negatives to bite.
    "cfg": ("16", "cfg"),
    "sampler_name": ("16", "sampler_name"),
    "scheduler": ("16", "scheduler"),
    "guide_strength": ("14", "strength"),    # LTXVAddGuide sheet-adherence weight (1.0)
    "filename_prefix": ("22", "filename_prefix"),
}

# workflows/ltx2_lipdub.json — LTX-2.3 IC-LoRA LipDub (authored 2026-07-06 from
# the official ComfyUI-LTXVideo two-stage distilled example; Gemma-API branch
# dropped, frame-count math computed host-side, target audio from a SEPARATE
# LoadAudio — our ElevenLabs track, not the video's own). Video-to-video: the
# source video enters both stages as an IC reference (LTXAddVideoICLoRAGuide),
# the new audio conditions via LTXVSetAudioRefTokens, and the model re-renders
# the mouth to match. s2 = source size rounded to /64; s1 = s2/2; output length
# and fps follow the source.
LIPDUB_MAPPING = {
    "prompt": ("10", "text"),                # scene description + the spoken line
    "negative_prompt": ("11", "text"),
    "video": ("20", "file"),                 # LoadVideo — UPLOADED source filename
    "audio": ("27", "audio"),                # LoadAudio — UPLOADED dub track
    "s1_width": ("22", "width"), "s1_height": ("22", "height"),
    "s2_width": ("23", "width"), "s2_height": ("23", "height"),
    "latent_width": ("40", "width"), "latent_height": ("40", "height"),
    "length": ("40", "length"),              # ((frames-1)//8)*8+1, computed host-side
    "audio_frames": ("41", "frames_number"),
    "audio_fps": ("41", "frame_rate"),       # int fps
    "cond_fps": ("30", "frame_rate"),        # float fps (conditioning)
    "out_fps": ("72", "fps"),                # float fps (output mux)
    "seed": ("47", "noise_seed"),
    "seed_refine": ("65", "noise_seed"),
    # 2026-07-10 audit adds (negative_prompt is INERT at cfg 1.0 without NAG —
    # same caveat as ingredients). Sigmas strings are the only steps control.
    "sigmas_base": ("48", "sigmas"),         # stage-1 manual sigmas (8-step string)
    "sigmas_refine": ("66", "sigmas"),       # stage-2 manual sigmas (3-step string)
    "cfg": ("45", "cfg"),
    "cfg_refine": ("64", "cfg"),
    "distilled_strength": ("2", "strength_model"),  # distilled LoRA (0.5)
    "iclora_strength": ("3", "strength_model"),     # LipDub IC-LoRA weight
    "filename_prefix": ("73", "filename_prefix"),
}

# workflows/longcat_avatar.json — LongCat-Video-Avatar 1.5 talking avatar (converted
# 2026-07-05 from the Kijai WanVideoWrapper template LongCatAvatar_audio_image_to_video,
# SetNode/GetNode registers resolved, per-window preview muxes dropped, MelBandRoFormer
# vocal separation BYPASSED — our narration is clean TTS). Windowed extender: 93-frame
# base + two 93-frame extensions with 13-frame overlap @16fps ≈ 15.8s single take,
# lips driven by the uploaded narration (audio muxed into the output by VHS node 453).
LONGCAT_MAPPING = {
    "prompt": ("241", "positive_prompt"),    # WanVideoTextEncodeCached (scene/action)
    "negative_prompt": ("241", "negative_prompt"),
    "ref_image": ("284", "image"),           # LoadImage — UPLOADED face filename
    "audio": ("125", "audio"),               # LoadAudio — UPLOADED narration filename
    "width": ("245", "value"),               # INTConstant pair (default 832x480 landscape;
    "height": ("246", "value"),              # pass e.g. 480x832 for 9:16 reels)
    "seed": ("324", "seed"),                 # window-1 sampler
    "seed_extend1": ("327", "seed"),         # window-2 sampler
    "seed_extend2": ("456", "seed"),         # window-3 sampler
    "steps": ("325", "steps"),               # WanVideoSchedulerv2 (longcat_distill_euler, 12)
    "cfg": ("427", "value"),                 # shared cfg FloatConstant (1.0). NOTE: at cfg 1
                                             # the negative_prompt is INERT (distilled path).
    # 2026-07-10 audit adds — lipsync-intensity knobs; audio_cfg_scale runs as a
    # SEPARATE audio-CFG pass, so it works even on this cfg=1 distilled path.
    "audio_scale": ("194", "audio_scale"),
    "audio_cfg_scale": ("194", "audio_cfg_scale"),
    "lora_strength": ("138", "strength"),    # LongCat distill LoRA (0.9 = Kijai default)
    "shift": ("325", "shift"),               # distill schedule shift (12)
    "filename_prefix": ("453", "filename_prefix"),
}

# workflows/longcat_duo.json — MULTI-STREAM dialogue (2026-07-06): the proven
# LongCat graph on the FULL bf16 model (fp8-quantized at load), with a second
# audio stream (audio_2, multi_audio_type 'para') and left/right speaker masks
# (SolidMask+MaskComposite halves -> MaskBatchMulti -> ref_target_masks).
# The ref image is a staged TWO-PERSON still: speaker 0 sits LEFT, speaker 1
# RIGHT. Per-speaker tracks carry silence during the other's turns; a third
# combined track feeds the final mux.
LONGCAT_DUO_MAPPING = {
    **LONGCAT_MAPPING,
    "audio_b": ("600", "audio"),             # LoadAudio — speaker 1's timeline track
    "audio_mix": ("620", "audio"),           # LoadAudio — combined conversation (mux)
    # mask canvas must match the frame size — the pipeline injects all of these
    "m_full1_w": ("610", "width"), "m_full1_h": ("610", "height"),
    "m_half1_w": ("611", "width"), "m_half1_h": ("611", "height"),
    "m_full2_w": ("613", "width"), "m_full2_h": ("613", "height"),
    "m_half2_w": ("614", "width"), "m_half2_h": ("614", "height"),
    "m_x2": ("615", "x"),                    # right half starts at width//2
}
# (2026-07-06): 2x 93-frame windows, 13-frame overlap -> 173 frames ≈ 10.8s.
# ~1/3 less compute; the pipeline auto-picks it when the narration is short —
# rendering seconds nobody scripted is pure wasted wall-clock for the user.
LONGCAT_2W_MAPPING = {k: v for k, v in LONGCAT_MAPPING.items() if k != "seed_extend2"}
