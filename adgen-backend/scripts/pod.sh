#!/usr/bin/env bash
# =============================================================================
# pod.sh — ONE command from a fresh RunPod pod to a ComfyUI that provably has the
# models for the mode you want to render. Idempotent; re-run it after every
# container restart (apt/pip live on the container disk and are wiped; only the
# network volume persists).
#
#   bash pod.sh doctor              # read-only: what is here, what is wrong
#   bash pod.sh plan cinematic      # what would be downloaded, and does it FIT
#   bash pod.sh up cinematic        # deps -> models -> launch -> verify
#   bash pod.sh models cinematic    # download only
#   bash pod.sh launch              # kill the template ComfyUI, start ours, verify
#   bash pod.sh prune wan           # free space by removing a model family
#
# Every failure this replaces was real, on 2026-08-27:
#
#  * aria2c was missing (container disk wiped). The old script called it per file,
#    got "command not found", printed "corrupt after download - re-fetching once"
#    and then "!! STILL CORRUPT" for EVERY model, and exited 0 having downloaded
#    nothing. An hour was spent hunting a corruption problem that did not exist.
#    -> deps are checked ONCE, up front, and a missing binary is fatal.
#
#  * The free-space guard could never fire. It read `df /workspace`, which on
#    RunPod's MooseFS mount reports the SHARED CLUSTER filesystem (318 TB free),
#    not the 50 GB volume quota - and it was written `[ -n "$fg" ] && [ "$fg" -lt N ]`,
#    so an unmeasurable volume counted as an infinite one. It failed OPEN.
#    -> capacity is a ladder that FAILS CLOSED (see cap_gb).
#
#  * "download-models.sh all" is cumulative (duo -> core -> LTX) and LTX is LAST,
#    so on a 50 GB volume it filled up on models the demo did not need and never
#    reached the ones it did.
#    -> models are selected PER MODE, from what the workflow graphs actually load.
#
#  * ComfyUI lived at three different paths across the repo, the pod copies and
#    the template (/workspace/ComfyUI, /adgen/ComfyUI, /workspace/runpod-slim/ComfyUI).
#    -> the path is DETECTED, and legacy paths are symlinked to it.
#
#  * The RunPod template auto-starts its own stock ComfyUI on 8188 - no custom
#    nodes, no models - and it answers health checks with 200, so the backend
#    thought the pod was ready and every render failed.
#    -> we kill it, and after launching we verify MODELS ARE VISIBLE, not just
#       that the port answers.
# =============================================================================
set -Eeuo pipefail
trap 'rc=$?; echo "!! FAILED at ${BASH_SOURCE[0]}:${LINENO}: ${BASH_COMMAND} (exit $rc)" >&2; exit $rc' ERR

PORT="${COMFY_PORT:-8188}"
WAN=https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files
KJW=https://huggingface.co/Kijai/WanVideo_comfy/resolve/main
KJL=https://huggingface.co/Kijai/LongCat-Video_comfy/resolve/main
LTXF=https://huggingface.co/Lightricks/LTX-2.3-fp8/resolve/main
LTX=https://huggingface.co/Lightricks/LTX-2.3/resolve/main
CO=https://huggingface.co/Comfy-Org

# --- model registry: key | subdir | filename | url | approx GB ------------------
# Sizes are measured from the real content-length, not guessed, so `plan` can tell
# you whether a mode fits BEFORE anything is written.
MODELS="
ltx_dev|checkpoints|ltx-2.3-22b-dev-fp8.safetensors|$LTXF/ltx-2.3-22b-dev-fp8.safetensors|27.1
ltx_distilled|checkpoints|ltx-2.3-22b-distilled-fp8.safetensors|$LTXF/ltx-2.3-22b-distilled-fp8.safetensors|27.1
ltx_gemma|text_encoders|gemma_3_12B_it_fp4_mixed.safetensors|$CO/ltx-2/resolve/main/split_files/text_encoders/gemma_3_12B_it_fp4_mixed.safetensors|8.8
ltx_upscaler|latent_upscale_models|ltx-2.3-spatial-upscaler-x2-1.1.safetensors|$LTX/ltx-2.3-spatial-upscaler-x2-1.1.safetensors|0.9
ltx_lora|loras|ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors|$LTX/ltx-2.3-22b-distilled-lora-384-1.1.safetensors|1.5
wan_t2v_hi|diffusion_models|wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors|$WAN/diffusion_models/wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors|14.0
wan_t2v_lo|diffusion_models|wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors|$WAN/diffusion_models/wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors|14.0
wan_s2v|diffusion_models|wan2.2_s2v_14B_fp8_scaled.safetensors|$WAN/diffusion_models/wan2.2_s2v_14B_fp8_scaled.safetensors|14.0
wan_umt5|text_encoders|umt5_xxl_fp8_e4m3fn_scaled.safetensors|$WAN/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors|6.7
wan_vae|vae|wan_2.1_vae.safetensors|$WAN/vae/wan_2.1_vae.safetensors|0.3
wan_t2v_lora_hi|loras|wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors|$WAN/loras/wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors|0.6
wan_t2v_lora_lo|loras|wan2.2_t2v_lightx2v_4steps_lora_v1.1_low_noise.safetensors|$WAN/loras/wan2.2_t2v_lightx2v_4steps_lora_v1.1_low_noise.safetensors|0.6
wan_wav2vec|audio_encoders|wav2vec2_large_english_fp16.safetensors|$WAN/audio_encoders/wav2vec2_large_english_fp16.safetensors|0.6
qwen_edit|diffusion_models|qwen_image_edit_2509_fp8mixed.safetensors|$CO/Qwen-Image-Edit_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_edit_2509_fp8mixed.safetensors|20.0
qwen_vl|text_encoders|qwen_2.5_vl_7b_fp8_scaled.safetensors|$CO/Qwen-Image_ComfyUI/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors|8.0
qwen_vae|vae|qwen_image_vae.safetensors|$CO/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors|0.3
longcat|diffusion_models/LongCat|LongCat-Avatar_comfy_bf16.safetensors|$KJL/Avatar/LongCat-Avatar_comfy_bf16.safetensors|28.0
longcat_lora|loras|LongCat_distill_lora_alpha64_bf16.safetensors|$KJL/LongCat_distill_lora_alpha64_bf16.safetensors|1.2
longcat_vae|vae|Wan2_1_VAE_bf16.safetensors|$KJW/Wan2_1_VAE_bf16.safetensors|0.3
longcat_umt5|text_encoders|umt5-xxl-enc-fp8_e4m3fn.safetensors|$KJW/umt5-xxl-enc-fp8_e4m3fn.safetensors|6.7
"

# --- mode -> models, taken from what each workflow graph actually loads ---------
# NOTE: `product` is deliberately absent. workflows/wan_i2v.json asks for
# wan2.2_i2v_*_14B_fp16 + i2v_lightx2v_*_model, but the old downloader fetched
# fp8_scaled files under different names - so that mode could never have worked,
# and it wasted ~30 GB on models no graph loads. The fp16 pair exists upstream
# (26.6 GB each) but the two i2v LoRAs 404 at the expected path. Add `product`
# here only once those URLs are known-good; a guessed URL is how you get a 404
# body saved as a .safetensors.
mode_models() {
  case "$1" in
    cinematic)   echo "ltx_dev ltx_gemma ltx_upscaler ltx_lora" ;;
    ingredients) echo "ltx_distilled ltx_gemma" ;;
    overlay)     echo "wan_t2v_hi wan_t2v_lo wan_umt5 wan_vae wan_t2v_lora_hi wan_t2v_lora_lo" ;;
    lipsync)     echo "wan_s2v wan_umt5 wan_vae wan_wav2vec wan_t2v_lora_hi" ;;
    keyframes)   echo "qwen_edit qwen_vl qwen_vae" ;;
    duo)         echo "longcat longcat_lora longcat_vae longcat_umt5" ;;
    demo)        echo "ltx_dev ltx_gemma ltx_upscaler ltx_lora" ;;   # the lane that looks best
    *) echo "" ;;
  esac
}
VALID_MODES="cinematic ingredients overlay lipsync keyframes duo demo"

row()  { printf '%s\n' "$MODELS" | awk -F'|' -v k="$1" '$1==k{print; exit}'; }
f_dir()  { row "$1" | cut -d'|' -f2; }
f_name() { row "$1" | cut -d'|' -f3; }
f_url()  { row "$1" | cut -d'|' -f4; }
f_gb()   { row "$1" | cut -d'|' -f5; }

# --- environment ---------------------------------------------------------------
env_resolve() {
  [ "$(id -u)" = 0 ] || { echo "!! not root — apt-get will fail"; exit 11; }
  VOLUME_ROOT="$(readlink -f "${VOLUME_ROOT:-/workspace}")"
  [ -d "$VOLUME_ROOT" ] || { echo "!! no volume at $VOLUME_ROOT"; exit 11; }

  # Detect ComfyUI rather than assuming. Prefer one ON THE VOLUME: a clone on the
  # container disk disappears at the next restart and takes your custom nodes with it.
  COMFY_ROOT=""
  local c
  for c in "${COMFY_ROOT_HINT:-}" "$VOLUME_ROOT/runpod-slim/ComfyUI" "$VOLUME_ROOT/ComfyUI" /ComfyUI; do
    [ -n "$c" ] && [ -f "$c/main.py" ] && [ -d "$c/comfy" ] && { COMFY_ROOT="$(readlink -f "$c")"; break; }
  done
  if [ -z "$COMFY_ROOT" ]; then
    c="$(find "$VOLUME_ROOT" -maxdepth 4 -name main.py -path '*ComfyUI*' 2>/dev/null | head -1)"
    [ -n "$c" ] && COMFY_ROOT="$(readlink -f "$(dirname "$c")")"
  fi
  [ -n "$COMFY_ROOT" ] || { echo "!! no ComfyUI found under $VOLUME_ROOT — run: bash pod.sh install"; exit 11; }

  MODELS_ROOT="$COMFY_ROOT/models"
  mkdir -p "$MODELS_ROOT"/{checkpoints,diffusion_models,diffusion_models/LongCat,text_encoders,vae,loras,audio_encoders,latent_upscale_models}
  export VOLUME_ROOT COMFY_ROOT MODELS_ROOT
  echo "volume=$VOLUME_ROOT  comfy=$COMFY_ROOT"
}

# Legacy paths other scripts and older notes assume. Only ever links where nothing real is.
env_links() {
  _l() { [ "$(readlink -f "$2" 2>/dev/null)" = "$1" ] && return 0
         [ -e "$2" ] && [ ! -L "$2" ] && { echo "?? $2 is a real dir — leaving it"; return 0; }
         ln -sfn "$1" "$2" && echo "linked $2 -> $1"; }
  [ "$COMFY_ROOT" = "$VOLUME_ROOT/ComfyUI" ] || _l "$COMFY_ROOT" "$VOLUME_ROOT/ComfyUI"
  _l "$VOLUME_ROOT" /adgen
}

# --- capacity: FAILS CLOSED ----------------------------------------------------
# df is untrustworthy here (reports the shared cluster fs). Ladder, in order:
#   1. $VOLUME_GB set by the operator — authoritative, survives everything
#   2. RunPod REST, if the pod has a scoped key
#   3. df, but ONLY if it returns something physically plausible (<= 4 TB, RunPod's cap)
#   4. refuse, and say exactly how to fix it
cap_gb() {
  if [ -n "${VOLUME_GB:-}" ]; then echo "$VOLUME_GB"; return 0; fi
  if [ -n "${RUNPOD_API_KEY:-}" ] && [ -n "${RUNPOD_VOLUME_ID:-}" ]; then
    local s; s="$(curl -s --max-time 15 -H "Authorization: Bearer $RUNPOD_API_KEY" \
      "https://rest.runpod.io/v1/networkvolumes/$RUNPOD_VOLUME_ID" 2>/dev/null \
      | grep -oE '"size"[: ]+[0-9]+' | grep -oE '[0-9]+' | head -1)"
    [ -n "$s" ] && { echo "$s"; return 0; }
  fi
  local d; d="$(df -B1 --output=size "$VOLUME_ROOT" 2>/dev/null | tail -1 | tr -dc '0-9')"
  if [ -n "$d" ] && [ "$d" -gt 0 ] && [ "$d" -le 4400000000000 ]; then
    echo $(( d / 1073741824 )); return 0
  fi
  echo ""   # unmeasurable -> callers must refuse, never assume room
}
used_gb() { du -sBG "$MODELS_ROOT" 2>/dev/null | awk '{gsub(/G/,"",$1); print $1+0}'; }

plan() {
  local mode="$1" keys need=0 have=0 k p
  keys="$(mode_models "$mode")"
  [ -n "$keys" ] || { echo "!! unknown mode '$mode'. valid: $VALID_MODES"; exit 64; }
  echo "mode '$mode' needs:"
  for k in $keys; do
    p="$MODELS_ROOT/$(f_dir "$k")/$(f_name "$k")"
    if [ -s "$p" ]; then printf "   have  %-58s %5s GB\n" "$(f_name "$k")" "$(f_gb "$k")"
                         have=$(echo "$have + $(f_gb "$k")" | bc)
    else printf "   FETCH %-58s %5s GB\n" "$(f_name "$k")" "$(f_gb "$k")"
         need=$(echo "$need + $(f_gb "$k")" | bc); fi
  done
  local cap used free
  cap="$(cap_gb)"; used="$(used_gb)"
  echo "--------------------------------------------------------------------"
  printf "  to download : %s GB\n  already here: %s GB\n" "$need" "$have"
  if [ -z "$cap" ]; then
    echo "  volume size : UNKNOWN — refusing to guess."
    echo "  Fix once:  export VOLUME_GB=<size from RunPod console → Storage>"
    return 3
  fi
  free=$(( cap - used ))
  printf "  volume      : %s GB total, %s GB used by models, %s GB free\n" "$cap" "$used" "$free"
  if [ "$(echo "$need > $free - 5" | bc)" = "1" ]; then
    echo "  !! DOES NOT FIT (need ${need} GB, ${free} GB free, keeping 5 GB headroom)"
    echo "     Either grow the volume, or free space:  bash pod.sh prune <wan|ltx|qwen|longcat>"
    return 4
  fi
  echo "  OK — fits."
}

# --- deps: fatal if missing, never a per-file no-op -----------------------------
deps() {
  command -v aria2c >/dev/null 2>&1 || {
    echo ">> installing aria2 (container disk — wiped every restart, so this re-runs)"
    apt-get update -qq && apt-get install -y -qq aria2 ffmpeg >/dev/null; }
  local miss=""
  for b in aria2c python3 curl; do command -v "$b" >/dev/null 2>&1 || miss="$miss $b"; done
  [ -z "$miss" ] || { echo "!! missing required binaries:$miss — refusing to continue"; exit 12; }
  echo "deps ok: aria2c $(aria2c --version 2>/dev/null | head -1 | awk '{print $3}')"
}

# A safetensors file starts with an 8-byte little-endian header length followed by
# that many bytes of JSON. Truncated downloads and HTML error pages both fail this.
verify_one() {
  python3 - "$1" <<'PY' 2>/dev/null
import json,struct,sys
p=sys.argv[1]
try:
    with open(p,'rb') as f:
        n=struct.unpack('<Q',f.read(8))[0]
        if n<=0 or n>200_000_000: sys.exit(1)
        json.loads(f.read(n).decode('utf-8'))
except Exception: sys.exit(1)
PY
}

get_one() {
  local k="$1" dir name url path
  dir="$MODELS_ROOT/$(f_dir "$k")"; name="$(f_name "$k")"; url="$(f_url "$k")"
  path="$dir/$name"; mkdir -p "$dir"
  if [ -s "$path" ]; then
    case "$name" in *.safetensors)
      verify_one "$path" && { echo "   ok (present) $name"; return 0; }
      echo "   !! $name present but header invalid — refetching"; rm -f "$path"* ;;
    *) echo "   ok (present) $name"; return 0 ;; esac
  fi
  echo ">> $name  ($(f_gb "$k") GB)"
  # aria2c presence was proven in deps(), so a failure here is a REAL failure.
  if ! aria2c -x16 -s16 --file-allocation=none --auto-file-renaming=false \
        --summary-interval=0 --console-log-level=warn -d "$dir" -o "$name" "$url"; then
    echo "   !! DOWNLOAD FAILED for $name (network/URL/disk) — not a corruption problem"
    return 1
  fi
  case "$name" in *.safetensors)
    verify_one "$path" || { echo "   !! $name downloaded but header is invalid (truncated? out of quota?)"; return 1; } ;;
  esac
  echo "   verified $name"
}

get_models() {
  local mode="$1" k rc=0
  plan "$mode" || return $?
  for k in $(mode_models "$mode"); do get_one "$k" || rc=1; done
  [ "$rc" = 0 ] && echo "== all models for '$mode' present and verified ==" \
                || { echo "!! some models failed — re-run; aria2 resumes"; return 1; }
}

prune() {
  local fam="${1:-}" ; [ -n "$fam" ] || { echo "usage: pod.sh prune <wan|ltx|qwen|longcat>"; exit 64; }
  local before; before="$(used_gb)"
  case "$fam" in
    wan)     rm -f "$MODELS_ROOT"/diffusion_models/wan2.2_* "$MODELS_ROOT"/text_encoders/umt5* \
                   "$MODELS_ROOT"/vae/wan_2.1_vae.safetensors "$MODELS_ROOT"/loras/wan2.2_* \
                   "$MODELS_ROOT"/audio_encoders/wav2vec2_* 2>/dev/null || true ;;
    ltx)     rm -f "$MODELS_ROOT"/checkpoints/ltx-* "$MODELS_ROOT"/text_encoders/gemma_* \
                   "$MODELS_ROOT"/latent_upscale_models/ltx-* "$MODELS_ROOT"/loras/ltx*  2>/dev/null || true ;;
    qwen)    rm -f "$MODELS_ROOT"/diffusion_models/qwen_* "$MODELS_ROOT"/text_encoders/qwen_* \
                   "$MODELS_ROOT"/vae/qwen_* 2>/dev/null || true ;;
    longcat) rm -rf "$MODELS_ROOT"/diffusion_models/LongCat "$MODELS_ROOT"/loras/LongCat_* 2>/dev/null || true ;;
    *) echo "!! unknown family '$fam'"; exit 64 ;;
  esac
  echo "pruned '$fam': ${before} GB -> $(used_gb) GB"
}

# --- ComfyUI -------------------------------------------------------------------
comfy_kill() {
  # The RunPod template starts its own stock ComfyUI here. It has no custom nodes
  # and no models, but it answers /system_stats with 200 — so every health check
  # passes while every render fails. Kill anything on the port, not just "ours".
  pkill -f "main.py.*--port[= ]*$PORT" 2>/dev/null || true
  pkill -f "ComfyUI.*main.py" 2>/dev/null || true
  sleep 3
}

comfy_launch() {
  cd "$COMFY_ROOT"
  nohup python3 main.py --listen 0.0.0.0 --port "$PORT" --enable-cors-header \
    > "$VOLUME_ROOT/comfy.log" 2>&1 &
  echo ">> ComfyUI starting (log: $VOLUME_ROOT/comfy.log)"
  local i
  for i in $(seq 1 60); do
    sleep 3
    curl -sf --max-time 5 "http://127.0.0.1:$PORT/system_stats" >/dev/null 2>&1 && { echo "   up after $((i*3))s"; return 0; }
  done
  echo "!! ComfyUI did not come up in 180s — tail $VOLUME_ROOT/comfy.log"; return 1
}

# The check that actually matters: not "does the port answer" but "can it SEE the
# models this mode needs". A stock template ComfyUI passes the former and fails this.
comfy_probe() {
  local mode="${1:-}" k missing=0
  curl -sf --max-time 10 "http://127.0.0.1:$PORT/system_stats" >/dev/null || { echo "!! ComfyUI not answering on $PORT"; return 1; }
  local seen; seen="$(curl -sf --max-time 40 "http://127.0.0.1:$PORT/object_info" 2>/dev/null \
    | python3 -c 'import json,sys
d=json.load(sys.stdin); out=set()
for n in d.values():
    try: req=n["input"]["required"]
    except Exception: continue
    for v in req.values():
        if isinstance(v,list) and v and isinstance(v[0],list):
            for x in v[0]:
                if isinstance(x,str): out.add(x.split("/")[-1])
print("\n".join(sorted(out)))' 2>/dev/null)"
  echo "ComfyUI on :$PORT sees $(printf '%s\n' "$seen" | grep -c . ) model file(s)"
  [ -n "$mode" ] || return 0
  for k in $(mode_models "$mode"); do
    if printf '%s\n' "$seen" | grep -qxF "$(f_name "$k")"; then echo "   OK   $(f_name "$k")"
    else echo "   MISS $(f_name "$k")"; missing=1; fi
  done
  [ "$missing" = 0 ] && echo "== '$mode' is RENDER-READY ==" \
                     || { echo "!! '$mode' is NOT ready — models missing from ComfyUI's view"; return 1; }
}

doctor() {
  echo "== paths ==";  echo "  volume=$VOLUME_ROOT  comfy=$COMFY_ROOT  models=$MODELS_ROOT"
  echo "== capacity =="
  local c; c="$(cap_gb)"
  if [ -n "$c" ]; then echo "  volume ${c} GB total, $(used_gb) GB in models"
  else echo "  UNKNOWN — set VOLUME_GB (RunPod console → Storage)"; fi
  echo "  df says: $(df -h "$VOLUME_ROOT" 2>/dev/null | tail -1 | awk '{print $2" total, "$4" free"}') (cluster fs — not your quota)"
  echo "== deps =="; for b in aria2c python3 curl ffmpeg; do printf "  %-8s %s\n" "$b" "$(command -v $b || echo MISSING)"; done
  echo "== port $PORT =="; (curl -sf --max-time 5 "http://127.0.0.1:$PORT/system_stats" >/dev/null && echo "  answering") || echo "  nothing listening"
  echo "== modes =="; local m
  for m in $VALID_MODES; do
    local n=0 t=0 k
    for k in $(mode_models "$m"); do t=$((t+1)); [ -s "$MODELS_ROOT/$(f_dir "$k")/$(f_name "$k")" ] && n=$((n+1)); done
    printf "  %-12s %s/%s files present\n" "$m" "$n" "$t"
  done
}

install_comfy() {
  cd "$VOLUME_ROOT"
  [ -d "$VOLUME_ROOT/ComfyUI/.git" ] || git clone --depth 1 https://github.com/comfyanonymous/ComfyUI.git "$VOLUME_ROOT/ComfyUI"
  cd "$VOLUME_ROOT/ComfyUI" && pip install -q -r requirements.txt
  echo "ComfyUI installed at $VOLUME_ROOT/ComfyUI"
}

CMD="${1:-doctor}"; MODE="${2:-}"
case "$CMD" in
  doctor)  env_resolve; doctor ;;
  plan)    env_resolve; plan "$MODE" ;;
  deps)    env_resolve; deps ;;
  install) env_resolve; deps; install_comfy ;;
  models)  env_resolve; env_links; deps; get_models "$MODE" ;;
  launch)  env_resolve; env_links; comfy_kill; comfy_launch; comfy_probe "$MODE" ;;
  probe)   env_resolve; comfy_probe "$MODE" ;;
  prune)   env_resolve; prune "$MODE" ;;
  up)      env_resolve; env_links; deps; get_models "$MODE"; comfy_kill; comfy_launch; comfy_probe "$MODE" ;;
  *) echo "usage: pod.sh {doctor|plan|deps|install|models|launch|probe|prune|up} [mode]"
     echo "modes: $VALID_MODES"; exit 64 ;;
esac
