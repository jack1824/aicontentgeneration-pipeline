#!/bin/bash
# ============================================================================
# EVERY-BOOT launcher — lives on the volume at /workspace/start.sh.
# The volume keeps ComfyUI + custom nodes + models; the container's pip installs
# do NOT persist, so we redo them here each boot (fast, mostly cached wheels).
# On L40S (Ada, sm_89) the fp8 weights run on NATIVE fp8 tensor cores — much
# faster than the A100's fp8->bf16 dequant. No flags needed for that; it's the
# hardware. Attention stays on PyTorch SDPA (reliable everywhere; sageattention
# is an optional Ada-only speedup to trial later, off by default).
# ============================================================================
set +e
which aria2c >/dev/null 2>&1 || (apt-get update -qq && apt-get install -y aria2 ffmpeg)

# custom-node python deps
cd /workspace/ComfyUI/custom_nodes 2>/dev/null && \
  for d in */; do [ -f "$d/requirements.txt" ] && pip install -q -r "$d/requirements.txt"; done

# base-image fixes discovered on the runpod cuda12.8 template:
python3 -m pip install -q -U comfy-kitchen comfy-aimdo   # fp8/fp4 backends (loads native fp8 on L40S)
python3 -m pip install -q "kornia==0.7.3"                # ComfyUI-LTXVideo import compatibility

# Model integrity gate: a truncated .safetensors (disk filled mid-download) passes a
# size check but dies MID-RENDER with "Expecting value: line 1 column 1" — after TTS
# credits + earlier clips are already spent. Verify headers before we accept any render.
# Override with SKIP_MODEL_CHECK=1 if a false positive ever blocks launch. A missing
# check-models.sh never bricks launch (it just skips the gate with a warning).
CHK="$(dirname "$0")/check-models.sh"
if [ "${SKIP_MODEL_CHECK:-0}" = "1" ]; then
  echo "SKIP_MODEL_CHECK=1 — skipping model integrity gate."
elif [ -f "$CHK" ]; then
  bash "$CHK" || {
    echo "!! MODEL INTEGRITY FAIL — refusing to launch ComfyUI on a corrupt/truncated model."
    echo "   Fix:  bash $CHK fix     (re-fetches only the broken files)"
    echo "   Or override:  SKIP_MODEL_CHECK=1 bash $0"
    exit 1
  }
else
  echo "!! check-models.sh not found next to start.sh — skipping integrity gate."
  echo "   Place check-models.sh alongside start.sh on the volume for boot verification."
fi

# launch ComfyUI on 8188 (NOT 8888 = Jupyter). SDPA attention (no sageattention on the
# duo graph — node 122 is already set to sdpa).
cd /workspace/ComfyUI && exec python3 main.py --listen 0.0.0.0 --port 8188 \
  --enable-cors-header '*' --use-pytorch-cross-attention
