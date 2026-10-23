#!/usr/bin/env bash
# Makes the pictures of the documentation from the example load in docs/examples/: docs/images/screenshot.png
# (the app in English, light theme, default units, twice the resolution) and docs/examples/<name>-report.pdf
# (the report of that load). Uses the screenshot mode of the app: it does not touch the user's settings, and the
# load is shown by its file name only (no local path in the pictures).
# Run after changes of the app or the master data, look at both files and commit them.
#
#   scripts/docs-media.sh [docs/examples/<name>.grtload]
set -euo pipefail
cd "$(dirname "$0")/.."
root=$(pwd)

if [ $# -gt 0 ]; then
  load=$1
else
  shopt -s nullglob
  loads=(docs/examples/*.grtload)
  if [ ${#loads[@]} -ne 1 ]; then
    echo "expected one example load in docs/examples/, found ${#loads[@]}; name it as argument" >&2
    exit 1
  fi
  load=${loads[0]}
fi
load=$(cd "$(dirname "$load")" && pwd)/$(basename "$load")
name=$(basename "$load" .grtload)

pnpm data
(cd apps/desktop && npx electron-vite build)
# set when the script runs inside a tool that is itself an Electron app; Electron would start as plain Node
unset ELECTRON_RUN_AS_NODE
(cd apps/desktop && npx electron out/main/index.js --clean --lang en --scale 2 --name-only \
  --screenshot "$root/docs/images/screenshot.png" --open "$load" --pdf "$root/docs/examples/$name-report.pdf")
