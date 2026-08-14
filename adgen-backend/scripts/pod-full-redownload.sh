#!/bin/bash
# ==== FULL MODEL RE-DOWNLOAD — run ON A FRESH POD (web terminal) ====
# Use when the OLD pod's volume is unreachable (A40 sold out everywhere,
# volume stuck) and you need to stand up a NEW pod from scratch.
# This is the stopgap, NOT the fix — the fix is a network volume so this
# never has to run again. ~205 GB total, aria2c -x16 (resumable, faster
# than wget; HF signed URLs decay — if a transfer dies, just re-run, -c resumes).
#
# Usage:
#   1) SSH/web-terminal into the NEW pod.
#   2) bash pod-full-redownload.sh              # TIER1+TIER2 only (what you need TODAY)
#   3) bash pod-full-redownload.sh --all         # + LTX cinematic, ingredients, LongCat
set -e
which aria2c >/dev/null 2>&1 || (apt-get update -qq && apt-get install -y aria2)

cd /workspace/ComfyUI/models   # <-- CONFIRM this is the volume-backed path on the new pod
mkdir -p diffusion_models text_encoders vae audio_encoders loras facerestore_models \
         checkpoints latent_upscale_models diffusion_models/LongCat

A="aria2c -x16 -s16 -c"
WAN=https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files

echo "###### TIER 1 — Wan 2.2 core (required for ANY render) — ~90 GB ######"
$A -d diffusion_models -o wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors "$WAN/diffusion_models/wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors"
$A -d diffusion_models -o wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors  "$WAN/diffusion_models/wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors"
$A -d diffusion_models -o wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors "$WAN/diffusion_models/wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors"
$A -d diffusion_models -o wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors  "$WAN/diffusion_models/wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors"
$A -d diffusion_models -o wan2.2_s2v_14B_fp8_scaled.safetensors            "$WAN/diffusion_models/wan2.2_s2v_14B_fp8_scaled.safetensors"
$A -d text_encoders    -o umt5_xxl_fp8_e4m3fn_scaled.safetensors          "$WAN/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors"
$A -d vae              -o wan_2.1_vae.safetensors                        "$WAN/vae/wan_2.1_vae.safetensors"
$A -d audio_encoders   -o wav2vec2_large_english_fp16.safetensors        "$WAN/audio_encoders/wav2vec2_large_english_fp16.safetensors"
$A -d loras -o wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors "$WAN/loras/wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors"
$A -d loras -o wan2.2_t2v_lightx2v_4steps_lora_v1.1_low_noise.safetensors  "$WAN/loras/wan2.2_t2v_lightx2v_4steps_lora_v1.1_low_noise.safetensors"
$A -d loras -o wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors   "$WAN/loras/wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors"
$A -d loras -o wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors    "$WAN/loras/wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors"
$A -d facerestore_models -o codeformer.pth \
  https://github.com/sczhou/CodeFormer/releases/download/v0.1.0/codeformer.pth

echo "###### TIER 2 — Qwen-Image-Edit keyframe engine (required for Director portraits/identity) — ~30 GB ######"
echo "###### e4m3fn = BLACK FRAMES on Ampere/A40 — fp8mixed ONLY, never swap this ######"
$A -d diffusion_models -o qwen_image_edit_2509_fp8mixed.safetensors \
  https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_edit_2509_fp8mixed.safetensors
$A -d text_encoders -o qwen_2.5_vl_7b_fp8_scaled.safetensors \
  https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors
$A -d vae -o qwen_image_vae.safetensors \
  https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors

if [ "$1" = "--all" ]; then
  echo "###### TIER 3 — LTX-2.3 cinematic mode — ~32 GB ######"
  $A -d checkpoints -o ltx-2.3-22b-dev-fp8.safetensors \
    https://huggingface.co/Lightricks/LTX-2.3/resolve/main/ltx-2.3-22b-dev-fp8.safetensors
  $A -d text_encoders -o gemma_3_12B_it_fp4_mixed.safetensors \
    https://huggingface.co/Comfy-Org/Lightricks_LTX_2.3_ComfyUI/resolve/main/split_files/text_encoders/gemma_3_12B_it_fp4_mixed.safetensors
  $A -d latent_upscale_models -o ltx-2.3-spatial-upscaler-x2-1.1.safetensors \
    https://huggingface.co/Lightricks/LTX-2.3-spatial-upscaler/resolve/main/ltx-2.3-spatial-upscaler-x2-1.1.safetensors
  $A -d loras -o ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors \
    https://huggingface.co/Lightricks/LTX-2.3-distilled-lora/resolve/main/ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors

  echo "###### TIER 3b — LTX-2.3 Ingredients (brand-lock IC-LoRA) — GATED, needs HF token ######"
  echo "!! Requires: huggingface-cli login (accept the license on the model page first)"
  $A -d checkpoints -o ltx-2.3-22b-distilled-fp8.safetensors \
    https://huggingface.co/Lightricks/LTX-2.3-fp8/resolve/main/ltx-2.3-22b-distilled-fp8.safetensors
  $A -d loras -o ltx-2.3-22b-ic-lora-ingredients-0.9.safetensors \
    --header="Authorization: Bearer $HF_TOKEN" \
    https://huggingface.co/Lightricks/LTX-2.3-22b-IC-LoRA-Ingredients/resolve/main/ltx-2.3-22b-ic-lora-ingredients-0.9.safetensors

  echo "###### TIER 4 — LongCat Avatar (single-stream) — ~20 GB — SKIP unless actively used ######"
  $A -d diffusion_models/LongCat -o LongCat-Avatar-single_fp8_e4m3fn_scaled_mixed_KJ.safetensors \
    https://huggingface.co/Kijai/LongCat-Video_comfy/resolve/main/Avatar/LongCat-Avatar-single_fp8_e4m3fn_scaled_mixed_KJ.safetensors
  $A -d loras -o LongCat_distill_lora_alpha64_bf16.safetensors \
    https://huggingface.co/Kijai/LongCat-Video_comfy/resolve/main/Avatar/LongCat_distill_lora_alpha64_bf16.safetensors
  $A -d vae -o Wan2_1_VAE_bf16.safetensors \
    https://huggingface.co/Kijai/WanVideo_comfy/resolve/main/Wan2_1_VAE_bf16.safetensors
  $A -d text_encoders -o umt5-xxl-enc-fp8_e4m3fn.safetensors \
    https://huggingface.co/Kijai/WanVideo_comfy/resolve/main/umt5-xxl-enc-fp8_e4m3fn.safetensors
else
  echo "Skipped TIER 3/4 (LTX cinematic, ingredients, LongCat) — re-run with --all if you need them today."
fi

echo ""
echo "== DONE. Run pod-check-models.sh next to verify everything landed before trusting this pod. =="
