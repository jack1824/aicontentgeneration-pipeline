#!/usr/bin/env bash
# Build the single-file mockup ../socialadz-studio.html (fonts and scripts inlined, works offline).
# Optional: ./build.sh --artifact also writes ../socialadz-studio.artifact.html for publishing as a claude.ai artifact.
set -euo pipefail
cd "$(dirname "$0")"
command -v pnpm >/dev/null || npm i -g pnpm
[ -d node_modules ] || pnpm install
pnpm typecheck && pnpm lint
pnpm build
cp dist/index.html ../socialadz-studio.html
echo "wrote ../socialadz-studio.html"
if [ "${1:-}" = "--artifact" ]; then python3 bundle-artifact.py ../socialadz-studio.artifact.html; fi
