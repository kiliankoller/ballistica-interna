#!/usr/bin/env bash
# Checks the code and the data and builds the installer for the current platform (apps/desktop/dist).
#   ./build.sh            checks, tests, master data, licence notices, installer
#   ./build.sh --no-test  master data, licence notices, installer only
#   ./build.sh --check    checks and tests only, no installer
set -euo pipefail
cd "$(dirname "$0")"
unset ELECTRON_RUN_AS_NODE
mode="${1:-}"

step() { printf '\n== %s\n' "$*"; }

step "dependencies"
pnpm install --frozen-lockfile

if [ "$mode" != "--no-test" ]; then
  step "typecheck";          pnpm typecheck
  step "tests";              pnpm test
  step "master data tests";  pnpm test:data
fi

step "master data";          pnpm data
step "licence notices";      pnpm notices
for f in data/build/ballisticainterna.db apps/desktop/notices/THIRD_PARTY_NOTICES.txt; do
  [ -s "$f" ] || { echo "missing: $f" >&2; exit 1; }
done

[ "$mode" = "--check" ] && { step "checks passed"; exit 0; }

step "installer";            pnpm dist

step "summary"
echo "version:     $(node -p "require('./apps/desktop/package.json').version") ($(git describe --always --dirty))"
echo "master data: $(sqlite3 data/build/ballisticainterna.db "select (select count(*) from caliber) || ' calibers, ' || (select count(*) from projectile) || ' bullets, ' || (select count(*) from propellant) || ' powders'" 2>/dev/null || echo 'built')"
echo "licences:    $(grep -c '^- ' apps/desktop/notices/THIRD_PARTY_NOTICES.txt) third-party packages"
echo "installer:"
find apps/desktop/dist -maxdepth 1 \( -name '*.dmg' -o -name '*.exe' -o -name '*.AppImage' \) -newer data/build/ballisticainterna.db -print
