#!/bin/bash
# ============================================================================
# Canonical model VERIFIER for the L40S pod. A truncated .safetensors (disk
# filled mid-download) passes a naive size check but fails at LOAD with
# "Expecting value: line 1 column 1" (corrupt JSON header) — mid-render, after
# TTS credits + earlier clips are already spent. This checks BOTH:
#   1. size >= expected floor, AND
#   2. the safetensors header actually parses (the real anti-truncation check).
#
#   bash check-models.sh        # report only (exit 1 if anything is bad)
#   bash check-models.sh fix    # rm + re-download anything size-short OR header-corrupt
#
# start.sh runs this on boot and refuses to launch ComfyUI on a corrupt model.
# ============================================================================
cd /workspace/ComfyUI/models 2>/dev/null || { echo "run after ComfyUI is at /workspace/ComfyUI"; exit 2; }
FIX="${1:-}"
WAN=https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files
QE=https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/resolve/main/split_files
QI=https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files
which aria2c >/dev/null 2>&1 || apt-get install -y aria2 >/dev/null 2>&1

# Parse the safetensors header: first 8 bytes = little-endian uint64 header length
# N; the next N bytes must be valid JSON and 8+N must fit inside the file. A
# truncated file fails here even when its size accidentally clears the MB floor.
verify_header() {
  python3 - "$1" <<'PY'
import sys, os, json, struct
p = sys.argv[1]
try:
    size = os.path.getsize(p)
    with open(p, "rb") as fh:
        n = struct.unpack("<Q", fh.read(8))[0]
        if n <= 0 or n > size - 8:      # header longer than the file => truncated
            sys.exit(1)
        hdr = fh.read(n)
        if len(hdr) < n:                # couldn't even read the claimed header
            sys.exit(1)
        json.loads(hdr)                 # must be valid JSON
    sys.exit(0)
except Exception:
    sys.exit(1)
PY
}

# rows: relpath  min_MB  url   (render-critical set; the full fetch lives in download-models.sh)
ROWS=(
"diffusion_models/wan2.2_s2v_14B_fp8_scaled.safetensors|15000|$WAN/diffusion_models/wan2.2_s2v_14B_fp8_scaled.safetensors"
"diffusion_models/wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors|13000|$WAN/diffusion_models/wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors"
"diffusion_models/wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors|13000|$WAN/diffusion_models/wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors"
"diffusion_models/wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors|13000|$WAN/diffusion_models/wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors"
"diffusion_models/wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors|13000|$WAN/diffusion_models/wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors"
"diffusion_models/qwen_image_edit_2509_fp8mixed.safetensors|18000|$QE/diffusion_models/qwen_image_edit_2509_fp8mixed.safetensors"
"text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors|6000|$WAN/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors"
"text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors|8500|$QI/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors"
"vae/wan_2.1_vae.safetensors|200|$WAN/vae/wan_2.1_vae.safetensors"
"vae/qwen_image_vae.safetensors|200|$QI/vae/qwen_image_vae.safetensors"
"audio_encoders/wav2vec2_large_english_fp16.safetensors|500|$WAN/audio_encoders/wav2vec2_large_english_fp16.safetensors"
)
bad=0
for row in "${ROWS[@]}"; do
  IFS='|' read -r rel min url <<< "$row"
  reason=""
  if [ ! -f "$rel" ]; then
    reason="MISSING"
  else
    mb=$(( $(stat -c%s "$rel" 2>/dev/null || echo 0) / 1048576 ))
    if [ "$mb" -lt "$min" ]; then
      reason="TOO SMALL (${mb}MB < ${min}MB)"
    elif [[ "$rel" == *.safetensors ]] && ! verify_header "$rel"; then
      reason="CORRUPT HEADER (${mb}MB — truncated safetensors)"
    fi
  fi
  if [ -n "$reason" ]; then
    echo "BAD   $rel  — $reason"
    bad=$((bad+1))
    if [ "$FIX" = "fix" ]; then
      echo "  -> re-fetching..."; rm -f "$rel"*; mkdir -p "$(dirname "$rel")"
      aria2c -x16 -s16 -c -d "$(dirname "$rel")" -o "$(basename "$rel")" "$url"
      verify_header "$rel" && echo "  -> OK after re-fetch" || echo "  -> STILL BAD (check disk space)"
    fi
  else
    echo "OK    $rel  (${mb}MB, header ok)"
  fi
done
echo "== $bad file(s) need attention.  Disk: $(df -h /workspace 2>/dev/null | awk 'NR==2{print $4" free"}') =="
[ "$FIX" != "fix" ] && [ "$bad" -gt 0 ] && echo "Run: bash check-models.sh fix"
[ "$bad" -gt 0 ] && [ "$FIX" != "fix" ] && exit 1
exit 0
