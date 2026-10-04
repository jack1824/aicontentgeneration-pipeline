#!/usr/bin/env bash
# =============================================================================
# pod-all-models.sh — every model + custom node EVERY workflow in this repo loads.
#
#   bash pod-all-models.sh                 # install nodes, download, verify, restart ComfyUI
#   HF_TOKEN=hf_xxx bash pod-all-models.sh # also fetch the 2 gated LTX IC-LoRAs
#   DRY=1 bash pod-all-models.sh           # print the plan and total size, touch nothing
#
# Why this exists instead of pod.sh: pod.sh's registry covers 20 files, but the
# workflow graphs reference 32. It was missing the LTX Ingredients + LipDub
# IC-LoRAs, the Wan i2v fp16 pair and its LoRAs, the LongCat single-avatar model
# and the whole post-enhance chain (SeedVR2 / CodeFormer / RIFE). Separately, a
# fresh pod lacks 24 node CLASSES (WanVideoWrapper, VideoHelperSuite, SeedVR2,
# Frame-Interpolation, facerestore, LTXVideo) — weights without those nodes load
# nothing. So nodes install first.
#
# Lessons baked in (each one cost real time):
#  * ComfyUI's location is DETECTED from the running process. Hardcoding
#    /workspace/ComfyUI put 94 GB where the running ComfyUI never looked.
#  * Python is the SAME interpreter the running ComfyUI uses (it lives in a venv;
#    a bare `pip` installs into the wrong environment).
#  * Gated HF files use curl, not aria2: aria2 forwards the Authorization header
#    to the signed CDN redirect, which rejects it ("only one auth mechanism").
#  * Sage attention is stripped on relaunch: A40/A6000 are Ampere and sage
#    black-frames Qwen-Image there.
#  * 'present' means header-valid AND byte-exact against the upstream
#    content-length. A header check alone cannot see a truncated file.
# =============================================================================
set -uo pipefail

DRY="${DRY:-0}"
HF_TOKEN="${HF_TOKEN:-}"

WAN=https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files
KJW=https://huggingface.co/Kijai/WanVideo_comfy/resolve/main
KJL=https://huggingface.co/Kijai/LongCat-Video_comfy/resolve/main
LTXF=https://huggingface.co/Lightricks/LTX-2.3-fp8/resolve/main
LTX=https://huggingface.co/Lightricks/LTX-2.3/resolve/main
LX2=https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main
CO=https://huggingface.co/Comfy-Org

# subdir|saved-as|url|gated(0/1)      -- ordered by value: if the disk fills, the
# important lanes are already in.
MANIFEST="
checkpoints|ltx-2.3-22b-dev-fp8.safetensors|$LTXF/ltx-2.3-22b-dev-fp8.safetensors|0
checkpoints|ltx-2.3-22b-distilled-fp8.safetensors|$LTXF/ltx-2.3-22b-distilled-fp8.safetensors|0
text_encoders|gemma_3_12B_it_fp4_mixed.safetensors|$CO/ltx-2/resolve/main/split_files/text_encoders/gemma_3_12B_it_fp4_mixed.safetensors|0
latent_upscale_models|ltx-2.3-spatial-upscaler-x2-1.1.safetensors|$LTX/ltx-2.3-spatial-upscaler-x2-1.1.safetensors|0
loras|ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors|$LTX/ltx-2.3-22b-distilled-lora-384-1.1.safetensors|0
diffusion_models|qwen_image_edit_2509_fp8mixed.safetensors|$CO/Qwen-Image-Edit_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_edit_2509_fp8mixed.safetensors|0
text_encoders|qwen_2.5_vl_7b_fp8_scaled.safetensors|$CO/Qwen-Image_ComfyUI/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors|0
vae|qwen_image_vae.safetensors|$CO/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors|0
diffusion_models|wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors|$WAN/diffusion_models/wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors|0
diffusion_models|wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors|$WAN/diffusion_models/wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors|0
diffusion_models|wan2.2_s2v_14B_fp8_scaled.safetensors|$WAN/diffusion_models/wan2.2_s2v_14B_fp8_scaled.safetensors|0
text_encoders|umt5_xxl_fp8_e4m3fn_scaled.safetensors|$WAN/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors|0
vae|wan_2.1_vae.safetensors|$WAN/vae/wan_2.1_vae.safetensors|0
loras|wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors|$WAN/loras/wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors|0
loras|wan2.2_t2v_lightx2v_4steps_lora_v1.1_low_noise.safetensors|$WAN/loras/wan2.2_t2v_lightx2v_4steps_lora_v1.1_low_noise.safetensors|0
audio_encoders|wav2vec2_large_english_fp16.safetensors|$WAN/audio_encoders/wav2vec2_large_english_fp16.safetensors|0
diffusion_models/LongCat|LongCat-Avatar_comfy_bf16.safetensors|$KJL/Avatar/LongCat-Avatar_comfy_bf16.safetensors|0
diffusion_models/LongCat|LongCat-Avatar-single_fp8_e4m3fn_scaled_mixed_KJ.safetensors|$KJL/Avatar/LongCat-Avatar-single_fp8_e4m3fn_scaled_mixed_KJ.safetensors|0
loras|LongCat_distill_lora_alpha64_bf16.safetensors|$KJL/LongCat_distill_lora_alpha64_bf16.safetensors|0
vae|Wan2_1_VAE_bf16.safetensors|$KJW/Wan2_1_VAE_bf16.safetensors|0
text_encoders|umt5-xxl-enc-fp8_e4m3fn.safetensors|$KJW/umt5-xxl-enc-fp8_e4m3fn.safetensors|0
diffusion_models|wan2.2_i2v_high_noise_14B_fp16.safetensors|$WAN/diffusion_models/wan2.2_i2v_high_noise_14B_fp16.safetensors|0
diffusion_models|wan2.2_i2v_low_noise_14B_fp16.safetensors|$WAN/diffusion_models/wan2.2_i2v_low_noise_14B_fp16.safetensors|0
loras|i2v_lightx2v_high_noise_model.safetensors|$LX2/Wan2.2-I2V-A14B-4steps-lora-rank64-Seko-V1/high_noise_model.safetensors|0
loras|i2v_lightx2v_low_noise_model.safetensors|$LX2/Wan2.2-I2V-A14B-4steps-lora-rank64-Seko-V1/low_noise_model.safetensors|0
SEEDVR2|seedvr2_ema_3b_fp8_e4m3fn.safetensors|https://huggingface.co/numz/SeedVR2_comfyUI/resolve/main/seedvr2_ema_3b_fp8_e4m3fn.safetensors|0
SEEDVR2|ema_vae_fp16.safetensors|https://huggingface.co/numz/SeedVR2_comfyUI/resolve/main/ema_vae_fp16.safetensors|0
facerestore_models|codeformer.pth|https://github.com/sczhou/CodeFormer/releases/download/v0.1.0/codeformer.pth|0
@rife|rife49.pth|https://github.com/Fannovel16/ComfyUI-Frame-Interpolation/releases/download/models/rife49.pth|0
loras|ltx-2.3-22b-ic-lora-ingredients-0.9.safetensors|https://huggingface.co/Lightricks/LTX-2.3-22b-IC-LoRA-Ingredients/resolve/main/ltx-2.3-22b-ic-lora-ingredients-0.9.safetensors|1
loras|ltx-2.3-22b-ic-lora-lipdub-0.9.safetensors|https://huggingface.co/Lightricks/LTX-2.3-22b-IC-LoRA-DubIt/resolve/main/ltx-2.3-22b-ic-lora-dubit-0.9.safetensors|1
"

NODES="
kijai/ComfyUI-WanVideoWrapper
Kosinkadink/ComfyUI-VideoHelperSuite
Lightricks/ComfyUI-LTXVideo
kijai/ComfyUI-KJNodes
numz/ComfyUI-SeedVR2_VideoUpscaler
Fannovel16/ComfyUI-Frame-Interpolation
mav-rik/facerestore_cf
"

say(){ printf '%s\n' "$*"; }
rows(){ printf '%s\n' "$MANIFEST" | awk -F'|' 'NF==4'; }
remote_size(){ curl -sIL --max-time 40 ${2:+-H "Authorization: Bearer $2"} "$1" 2>/dev/null \
  | awk '{k=tolower($1)} k=="content-length:"{l=$2} END{gsub(/\r/,"",l);print l+0}'; }
# ^ tolower(), not gawk's IGNORECASE: Ubuntu's default awk is mawk, which ignores
#   IGNORECASE, so a capitalised "Content-Length" would read as 0 and every size
#   check would silently pass as "unknown".

# --- 1. find the ComfyUI that is actually serving ----------------------------
PID=$(pgrep -f 'main\.py' | head -1 || true)
if [ -n "${COMFY_DIR:-}" ]; then C="$COMFY_DIR"; PY="${PY:-python3}"
elif [ -n "$PID" ]; then
  ARG=$(tr '\0' '\n' < /proc/$PID/cmdline | grep 'main\.py$' | head -1)
  case "$ARG" in /*) C=$(dirname "$ARG");; *) C=$(readlink -f /proc/$PID/cwd);; esac
  PY=$(readlink -f /proc/$PID/exe)
else
  C=$(dirname "$(find / -name main.py -path '*ComfyUI*' -not -path '*/custom_nodes/*' 2>/dev/null | head -1)")
  PY=python3
fi
[ -f "$C/main.py" ] || { say "!! cannot find ComfyUI (looked: $C). Set COMFY_DIR=/path/to/ComfyUI"; exit 2; }
M="$C/models"
say "ComfyUI  : $C"; say "python   : $PY"; say "models   : $M"

# --- 2. plan -----------------------------------------------------------------
say; say "== plan: $(rows | wc -l) files =="
tot=0
while IFS='|' read -r sub name url gated; do
  s=$(remote_size "$url" "$([ "$gated" = 1 ] && echo "$HF_TOKEN")")
  [ "$gated" = 1 ] && [ -z "$HF_TOKEN" ] && s=0
  tot=$((tot+s))
  printf '  %6.2f GB  %-22s %s%s\n' "$(awk -v s=$s 'BEGIN{print s/1e9}')" "$sub" "$name" \
    "$([ "$gated" = 1 ] && [ -z "$HF_TOKEN" ] && echo '   <- GATED, skipped (no HF_TOKEN)')"
done < <(rows)
say "  ------"; printf '  %6.1f GB total to fetch\n' "$(awk -v t=$tot 'BEGIN{print t/1e9}')"
say "  NOTE: df on RunPod's MooseFS mount reports the shared cluster, not your quota."
say "        Check the dashboard: you need ~$(awk -v t=$tot 'BEGIN{printf "%d", t/1e9+30}') GB free."
[ "$DRY" = 1 ] && { say; say "DRY=1 — nothing changed."; exit 0; }

# --- 3. custom nodes ---------------------------------------------------------
say; say "== custom nodes =="
command -v aria2c >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq aria2; }
mkdir -p "$C/custom_nodes"; cd "$C/custom_nodes" || exit 1
for r in $NODES; do
  d=$(basename "$r")
  if [ -d "$d/.git" ]; then say "  have   $d"
  else git clone --depth 1 -q "https://github.com/$r.git" && say "  cloned $d" || say "  !! clone FAILED: $r"; fi
  [ -f "$d/requirements.txt" ] && "$PY" -m pip install -q -r "$d/requirements.txt" 2>&1 | tail -1
done

# --- 4. models ---------------------------------------------------------------
say; say "== models =="
verify(){  # header valid + byte-exact against upstream
  "$PY" - "$1" "$2" <<'PYV'
import sys,os,json,struct
p,want=sys.argv[1],int(sys.argv[2])
try:
    have=os.path.getsize(p)
    if want and have!=want: sys.exit(1)
    if p.endswith(".safetensors"):
        with open(p,"rb") as f:
            n=struct.unpack("<Q",f.read(8))[0]; json.loads(f.read(n))
except Exception: sys.exit(1)
PYV
}
FAILED=""
while IFS='|' read -r sub name url gated; do
  if [ "$sub" = "@rife" ]; then dest="$C/custom_nodes/ComfyUI-Frame-Interpolation/ckpts/rife"
  else dest="$M/$sub"; fi
  mkdir -p "$dest"; f="$dest/$name"
  tok=""; [ "$gated" = 1 ] && tok="$HF_TOKEN"
  if [ "$gated" = 1 ] && [ -z "$HF_TOKEN" ]; then say "  skip   $name (gated — set HF_TOKEN and accept terms on the model page)"; continue; fi
  want=$(remote_size "$url" "$tok")
  if [ -s "$f" ] && verify "$f" "$want"; then say "  ok     $name"; continue; fi
  say "  fetch  $name"
  if [ -n "$tok" ]; then   # curl: drops Authorization on the cross-host redirect
    curl -L -C - --fail -sS -H "Authorization: Bearer $tok" -o "$f" "$url"
  else
    aria2c -x16 -s16 -c --file-allocation=none --auto-file-renaming=false \
      --summary-interval=0 --console-log-level=warn -d "$dest" -o "$name" "$url"
  fi
  if verify "$f" "$want"; then say "         verified"
  else say "  !! BAD/SHORT: $name   (re-run this script — it resumes)"; FAILED="$FAILED $name"; fi
done < <(rows)

# --- 5. restart ComfyUI exactly as it was running, minus sage attention ------
say; say "== restart ComfyUI =="
if [ -n "$PID" ]; then
  CMD=$(tr '\0' ' ' < /proc/$PID/cmdline | sed 's/--use-sage-attention//g')
  CWD=$(readlink -f /proc/$PID/cwd)
  pkill -f 'main\.py'; sleep 4
  ( cd "$CWD" && nohup $CMD > /tmp/comfyui_run.log 2>&1 & )
  say "  relaunched: $CMD"
else
  say "  (ComfyUI was not running — start it yourself: cd $C && $PY main.py --listen --port 8188)"
fi
say; say "== done. log: /tmp/comfyui_run.log =="
[ -n "$FAILED" ] && say "!! files needing a re-run:$FAILED"
say "Tell Claude when ComfyUI is back up — it will check every node class and model from outside."
