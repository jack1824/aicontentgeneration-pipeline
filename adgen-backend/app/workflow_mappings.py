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
}

# As exported, the template defaults are the FAST config: steps 4 / CFG 1 / Lightning LoRA ("107")
# in the model chain. QUALITY (file 06: S2V wants 20 steps / CFG 6.0 / LoRA BYPASSED — the LoRA
# visibly degrades S2V) is applied as an API-side patch: bump steps/cfg and rewire node 54's model
# input straight to the UNETLoader ("37"), skipping the LoRA node entirely.
WAN_S2V_QUALITY_INPUTS = {
    "steps": 20,
    "cfg": 6.0,
    "model_source": ["37", 0],               # bypass LoRA node "107" -> UNET "37" directly
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
    "audio_frames": ("214", "frames_number"),  # audio latent frames ≈ 19.2*seconds + 1 (97 = 5s)
    "lora_strength": ("232", "strength_model"),
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
    "lora_strength": ("4", "strength_model"),  # IC-LoRA weight (1.0; tune to 1.4)
    "seed": ("16", "seed"),
    "steps": ("16", "steps"),
    "filename_prefix": ("22", "filename_prefix"),
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
    "cfg": ("427", "value"),                 # shared cfg FloatConstant (1.0)
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
