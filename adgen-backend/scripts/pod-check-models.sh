#!/bin/bash
# ==== MODEL PRESENCE CHECK — run ON THE POD any time, before trusting a render ====
# Verifies every file MODELS.txt says the pipeline needs is actually on disk,
# with the right approx size (catches truncated/interrupted downloads).
cd /workspace/ComfyUI/models 2>/dev/null || { echo "wrong dir — cd to the volume-backed models/ first"; exit 1; }

check() {
  local path="$1" minmb="$2"
  if [ ! -f "$path" ]; then
    echo "MISSING  $path"
    return
  fi
  local sz=$(du -m "$path" | cut -f1)
  if [ "$sz" -lt "$minmb" ]; then
    echo "TRUNCATED  $path  (${sz}MB, expected >=${minmb}MB — re-download with -c)"
  else
    echo "OK  $path  (${sz}MB)"
  fi
}

echo "###### TIER 1 — Wan 2.2 core ######"
check diffusion_models/wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors 13000
check diffusion_models/wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors  13000
check diffusion_models/wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors 13000
check diffusion_models/wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors  13000
check diffusion_models/wan2.2_s2v_14B_fp8_scaled.safetensors            13000
check text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors              6000
check vae/wan_2.1_vae.safetensors                                      1300
check audio_encoders/wav2vec2_large_english_fp16.safetensors           500
check loras/wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors 500
check loras/wan2.2_t2v_lightx2v_4steps_lora_v1.1_low_noise.safetensors  500
check loras/wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors   500
check loras/wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors    500
check facerestore_models/codeformer.pth                                350

echo ""
echo "###### TIER 2 — Qwen-Image-Edit keyframe engine ######"
check diffusion_models/qwen_image_edit_2509_fp8mixed.safetensors 19000
check text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors         9000
check vae/qwen_image_vae.safetensors                              200

echo ""
echo "###### TIER 3 — LTX-2.3 cinematic (only if you ran --all) ######"
check checkpoints/ltx-2.3-22b-dev-fp8.safetensors                          21000
check text_encoders/gemma_3_12B_it_fp4_mixed.safetensors                   7000
check latent_upscale_models/ltx-2.3-spatial-upscaler-x2-1.1.safetensors    100
check loras/ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors 500

echo ""
echo "###### TIER 3b — Ingredients (brand-lock) ######"
check checkpoints/ltx-2.3-22b-distilled-fp8.safetensors           21000
check loras/ltx-2.3-22b-ic-lora-ingredients-0.9.safetensors       1000

echo ""
echo "###### TIER 4 — LongCat Avatar (only if you ran --all) ######"
check diffusion_models/LongCat/LongCat-Avatar-single_fp8_e4m3fn_scaled_mixed_KJ.safetensors 16000
check loras/LongCat_distill_lora_alpha64_bf16.safetensors                                   1200
check vae/Wan2_1_VAE_bf16.safetensors                                                        1300
check text_encoders/umt5-xxl-enc-fp8_e4m3fn.safetensors                                      6500

echo ""
echo "###### CUSTOM NODE PACKS (installed via ComfyUI Manager, not files here) ######"
if [ -d /ComfyUI/custom_nodes ]; then
  for pack in SeedVR2 facerestore; do
    ls /ComfyUI/custom_nodes 2>/dev/null | grep -qi "$pack" \
      && echo "OK  custom_nodes containing '$pack'" \
      || echo "MISSING  custom_nodes containing '$pack' — install via Manager, see below"
  done
else
  echo "MISSING  /ComfyUI/custom_nodes not found — is ComfyUI running from the right path?"
fi

echo ""
echo "== Disk used by models/: =="
du -sh /workspace/ComfyUI/models 2>/dev/null

echo ""
echo "Any MISSING/TRUNCATED line above -> re-run the matching wget/aria2c line"
echo "from pod-full-redownload.sh with -c (resumes, doesn't restart)."
