#!/usr/bin/env bash
# Starts the desktop app in development mode (live reload).
#   ./run.sh
set -euo pipefail
cd "$(dirname "$0")"

# VS Code's terminal sets this for its own Electron; with it Electron runs as plain Node without a window.
unset ELECTRON_RUN_AS_NODE

[ -d node_modules ] || pnpm install
pnpm data
pnpm notices
./scripts/dev-mac-branding.sh   # macOS: name and icon in the Dock
exec pnpm dev
