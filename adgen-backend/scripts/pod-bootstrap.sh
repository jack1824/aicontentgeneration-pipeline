#!/bin/bash
# ============================================================================
# ONE-TIME setup on a FRESH volume. Clones ComfyUI + the 5 custom-node packs
# onto the volume (persists). Run this ONCE, then download-models.sh, then
# start.sh. (Workflows themselves live in the backend repo and are sent to the
# pod per-render — nothing to install for those.)
#   bash pod-bootstrap.sh
# ============================================================================
set -e
apt-get update -qq && apt-get install -y aria2 git ffmpeg

cd /workspace
[ -d ComfyUI ] || git clone --depth 1 https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI && pip install -q -r requirements.txt

cd /workspace/ComfyUI/custom_nodes
for repo in \
  ltdrdata/ComfyUI-Manager \
  kijai/ComfyUI-WanVideoWrapper \
  Lightricks/ComfyUI-LTXVideo \
  kijai/ComfyUI-KJNodes \
  Kosinkadink/ComfyUI-VideoHelperSuite ; do
  d=$(basename "$repo")
  [ -d "$d" ] || git clone --depth 1 "https://github.com/$repo.git"
  [ -f "$d/requirements.txt" ] && pip install -q -r "$d/requirements.txt"
done

echo ""
echo "== ComfyUI + nodes installed on the volume. Next:"
echo "   1) bash /workspace/download-models.sh duo     # ~40 GB, render the duo ad first"
echo "   2) bash /workspace/start.sh                    # launch ComfyUI on 8188"
echo "   (later: download-models.sh core, then all, for single-face + cinematic lanes)"
