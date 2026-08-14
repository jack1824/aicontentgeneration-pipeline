#!/bin/bash
# ============================================================================
# L40S model downloader — SELF-VERIFYING. Every fetch:
#   1. refuses to start if the volume lacks room (the disk-full truncation cause),
#   2. downloads with aria2 -c (resumable),
#   3. parses the safetensors header afterwards and RE-FETCHES ONCE if corrupt.
# So a fresh L40S pod just runs this and gets COMPLETE models — no manual fixing,
# no truncated surprises mid-render. Idempotent: complete files are re-verified,
# not re-downloaded.
#
#   bash download-models.sh duo     # ~40 GB — both-in-frame duo ad
#   bash download-models.sh core    # + Wan S2V/t2v/i2v + Qwen (lipsync/faces/composite)
#   bash download-models.sh all     # + LTX-2.3 cinematic (b-roll / product brand-lock)
# ============================================================================
set +e
which aria2c >/dev/null 2>&1 || (apt-get update -qq && apt-get install -y aria2)
cd /workspace/ComfyUI/models || { echo "run after ComfyUI is cloned to /workspace/ComfyUI"; exit 1; }
mkdir -p diffusion_models diffusion_models/LongCat text_encoders vae audio_encoders \
         loras facerestore_models checkpoints latent_upscale_models
SET="${1:-duo}"
MIN_FREE_GB="${MIN_FREE_GB:-20}"   # refuse to fetch a big file with less than this free

free_gb() { df -BG /workspace 2>/dev/null | awk 'NR==2{gsub(/G/,"",$4); print $4+0}'; }

verify_header() {
  [[ "$1" == *.safetensors ]] || return 0   # only safetensors have the header contract
  python3 - "$1" <<'PY'
import sys, os, json, struct
p = sys.argv[1]
try:
    size = os.path.getsize(p)
    with open(p, "rb") as fh:
        n = struct.unpack("<Q", fh.read(8))[0]
        if n <= 0 or n > size - 8: sys.exit(1)
        hdr = fh.read(n)
        if len(hdr) < n: sys.exit(1)
        json.loads(hdr)
    sys.exit(0)
except Exception:
    sys.exit(1)
PY
}

# fetch <dir> <name> <url> [extra aria2 args...]
fetch() {
  local dir="$1" name="$2" url="$3"; shift 3
  local path="$dir/$name"
  if [ -f "$path" ] && verify_header "$path"; then
    echo "OK (verified) $path"; return 0
  fi
  local fg; fg="$(free_gb)"
  if [ -n "$fg" ] && [ "$fg" -lt "$MIN_FREE_GB" ]; then
    echo "!! ABORT: only ${fg}G free on /workspace (need >= ${MIN_FREE_GB}G) — grow the volume or prune before fetching $name"
    echo "   (downloading into a full disk is exactly what truncates models.)"
    exit 3
  fi
  echo ">> fetching $path (${fg}G free)"
  aria2c -x16 -s16 -c -d "$dir" -o "$name" "$@" "$url"
  if ! verify_header "$path"; then
    echo "   header corrupt after download — re-fetching once..."
    rm -f "$path"*
    aria2c -x16 -s16 -d "$dir" -o "$name" "$@" "$url"
    verify_header "$path" && echo "   OK after re-fetch" \
      || echo "   !! STILL CORRUPT: $path — check disk space / URL"
  fi
}

WAN=https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files
KJW=https://huggingface.co/Kijai/WanVideo_comfy/resolve/main
KJL=https://huggingface.co/Kijai/LongCat-Video_comfy/resolve/main

echo "###### DUO — both-characters-in-one-frame (LongCat MultiTalk) — ~40 GB ######"
fetch diffusion_models/LongCat LongCat-Avatar_comfy_bf16.safetensors "$KJL/Avatar/LongCat-Avatar_comfy_bf16.safetensors"
fetch loras LongCat_distill_lora_alpha64_bf16.safetensors "$KJL/LongCat_distill_lora_alpha64_bf16.safetensors"
fetch vae            Wan2_1_VAE_bf16.safetensors         "$KJW/Wan2_1_VAE_bf16.safetensors"
fetch text_encoders  umt5-xxl-enc-fp8_e4m3fn.safetensors "$KJW/umt5-xxl-enc-fp8_e4m3fn.safetensors"
fetch audio_encoders wav2vec2_large_english_fp16.safetensors "$WAN/audio_encoders/wav2vec2_large_english_fp16.safetensors"
[ "$SET" = "duo" ] && { echo "== DUO set done. =="; exit 0; }

echo "###### CORE — Wan 2.2 (lipsync/faces/b-roll) + Qwen (composite) — ~120 GB ######"
fetch diffusion_models wan2.2_s2v_14B_fp8_scaled.safetensors            "$WAN/diffusion_models/wan2.2_s2v_14B_fp8_scaled.safetensors"
fetch diffusion_models wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors "$WAN/diffusion_models/wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors"
fetch diffusion_models wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors  "$WAN/diffusion_models/wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors"
fetch diffusion_models wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors "$WAN/diffusion_models/wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors"
fetch diffusion_models wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors  "$WAN/diffusion_models/wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors"
fetch text_encoders umt5_xxl_fp8_e4m3fn_scaled.safetensors "$WAN/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors"
fetch vae           wan_2.1_vae.safetensors                "$WAN/vae/wan_2.1_vae.safetensors"
fetch loras wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors "$WAN/loras/wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors"
fetch loras wan2.2_t2v_lightx2v_4steps_lora_v1.1_low_noise.safetensors  "$WAN/loras/wan2.2_t2v_lightx2v_4steps_lora_v1.1_low_noise.safetensors"
fetch loras wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors   "$WAN/loras/wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors"
fetch loras wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors    "$WAN/loras/wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors"
fetch facerestore_models codeformer.pth https://github.com/sczhou/CodeFormer/releases/download/v0.1.0/codeformer.pth
fetch diffusion_models qwen_image_edit_2509_fp8mixed.safetensors "https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_edit_2509_fp8mixed.safetensors"
fetch text_encoders qwen_2.5_vl_7b_fp8_scaled.safetensors "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors"
fetch vae qwen_image_vae.safetensors "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors"
[ "$SET" = "core" ] && { echo "== CORE set done. =="; exit 0; }

echo "###### LTX-2.3 cinematic (b-roll / product brand-lock) — ~60 GB ######"
fetch checkpoints ltx-2.3-22b-dev-fp8.safetensors "https://huggingface.co/Lightricks/LTX-2.3-fp8/resolve/main/ltx-2.3-22b-dev-fp8.safetensors"
fetch text_encoders gemma_3_12B_it_fp4_mixed.safetensors "https://huggingface.co/Comfy-Org/ltx-2/resolve/main/split_files/text_encoders/gemma_3_12B_it_fp4_mixed.safetensors"
fetch latent_upscale_models ltx-2.3-spatial-upscaler-x2-1.1.safetensors "https://huggingface.co/Lightricks/LTX-2.3/resolve/main/ltx-2.3-spatial-upscaler-x2-1.1.safetensors"
fetch loras ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors "https://huggingface.co/Lightricks/LTX-2.3/resolve/main/ltx-2.3-22b-distilled-lora-384-1.1.safetensors"
fetch checkpoints ltx-2.3-22b-distilled-fp8.safetensors "https://huggingface.co/Lightricks/LTX-2.3-fp8/resolve/main/ltx-2.3-22b-distilled-fp8.safetensors"
fetch loras ltx-2.3-22b-ic-lora-ingredients-0.9.safetensors "https://huggingface.co/Lightricks/LTX-2.3-22b-IC-LoRA-Ingredients/resolve/main/ltx-2.3-22b-ic-lora-ingredients-0.9.safetensors" --header="Authorization: Bearer $HF_TOKEN"
echo "== ALL sets done. Verifying render-critical set... =="
bash "$(dirname "$0")/check-models.sh" || echo "!! some render-critical files failed verify — run: bash check-models.sh fix"
