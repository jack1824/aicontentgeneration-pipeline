#!/bin/bash
# ==== POD MORNING DRILL — paste ON THE POD after ANY start / restart / migration ====
# Result: fully ready pod, ZERO model downloads (everything lives on the volume).
# Then on the Mac side: paste the new URL to Claude if it changed (-8188, not -8888!).

echo "== [1/4] restore container-side packs (SeedVR2/facerestore code — dies every reset)"
bash /workspace/restore_after_reset.sh

echo "== [2/4] SeedVR2 model symlink (files live on volume; link dies every reset)"
ln -sfn /workspace/ComfyUI/models/SEEDVR2 /ComfyUI/models/SEEDVR2

echo "== [3/4] purge template junk (the template RE-DOWNLOADS ~110GB of unused"
echo "         defaults on migration boots — verified orphans, zero graph references)"
cd /workspace/ComfyUI/models/diffusion_models
rm -f wan2.2_animate_14B_bf16.safetensors \
      wan2.2_t2v_high_noise_14B_fp16.safetensors \
      wan2.2_t2v_low_noise_14B_fp16.safetensors \
      wan2.2_ti2v_5B_fp16.safetensors \
      wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors \
      MelBandRoformer_fp32.safetensors

echo "== [4/4] relaunch ComfyUI: NO sage attention (black-frames Qwen-Image on"
echo "         Ampere) + logs on CONTAINER disk (a /workspace log fd once went"
echo "         quota-poisoned and killed every render with fake EDQUOT errors)"
pkill -f "main.py"; sleep 3
cd /root && nohup python3 /ComfyUI/main.py --listen --enable-cors-header '*' \
  --extra-model-paths-config /ComfyUI/extra_model_paths.yaml \
  > /ComfyUI/comfyui_run.log 2>&1 &
sleep 10
curl -s localhost:8188/system_stats >/dev/null \
  && echo "✓ ComfyUI up — no sage, container logs. Tell Claude the pod is ready." \
  || echo "✗ ComfyUI not answering yet — wait 30s, then: tail -20 /ComfyUI/comfyui_run.log"
