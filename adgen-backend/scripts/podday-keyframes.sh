#!/bin/bash
# ==== KEYFRAME ENGINE INSTALL — run ON THE POD (web terminal) when it's next on ====
# Qwen-Image-Edit 2509 for ComfyUI. ~30 GB total onto the network volume:
#   unet fp8 ~20.4 GB + Qwen2.5-VL text encoder fp8 ~9.4 GB + VAE ~254 MB
# All under models/ on the volume so it survives pod stops (never terminate).
set -e
cd /workspace/ComfyUI/models
mkdir -p diffusion_models text_encoders vae

echo "== [1/3] Qwen-Image-Edit 2509 unet (fp8mixed, ~20.5 GB — e4m3fn makes BLACK frames on Ampere/A40)"
wget -c -O diffusion_models/qwen_image_edit_2509_fp8mixed.safetensors \
  "https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_edit_2509_fp8mixed.safetensors"

echo "== [2/3] Qwen2.5-VL 7B text encoder (fp8, ~9.4 GB)"
wget -c -O text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors \
  "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors"

echo "== [3/3] Qwen-Image VAE (~254 MB)"
wget -c -O vae/qwen_image_vae.safetensors \
  "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors"

echo "== done. sizes:"
ls -lh diffusion_models/qwen_image_edit_2509_fp8mixed.safetensors \
       text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors \
       vae/qwen_image_vae.safetensors
echo "NOTE: TextEncodeQwenImageEditPlus needs ComfyUI >= Sept 2025. If the"
echo "preflight (run from the Mac) reports it MISSING, update ComfyUI:"
echo "  cd /workspace/ComfyUI && git pull && pip install -r requirements.txt"
