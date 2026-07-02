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
    "lightning_lora": ("128:129", "value"),  # bool; NOTE: as exported, the on_true branch still
                                             # carries 20 steps / CFG 3.5 — NOT the FAST 4-step
                                             # config, so leave false until the graph is fixed.
}
