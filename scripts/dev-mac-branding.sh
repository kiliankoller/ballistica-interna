#!/usr/bin/env bash
# Development on macOS: the Dock and the menu bar take name and icon from the Electron app in node_modules, not
# from BallisticaInterna. This sets them there (name BallisticaInterna, icon from apps/desktop/build/icon.png); the installed
# app gets both from electron-builder. Run by run.sh; harmless to repeat.
set -euo pipefail
[ "$(uname)" = Darwin ] || exit 0
cd "$(dirname "$0")/.."
dir=$(cd apps/desktop && node -e "console.log(require('path').dirname(require.resolve('electron/package.json')))")
app="$dir/dist/Electron.app"
plist="$app/Contents/Info.plist"
[ -f "$plist" ] || exit 0
for key in CFBundleName CFBundleDisplayName; do
  /usr/libexec/PlistBuddy -c "Set :$key BallisticaInterna" "$plist" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :$key string BallisticaInterna" "$plist"
done
icon=apps/desktop/build/icon.png
if [ -f "$icon" ]; then
  set_dir=$(mktemp -d)/BallisticaInterna.iconset
  mkdir -p "$set_dir"
  for s in 16 32 128 256 512; do
    sips -z $s $s "$icon" --out "$set_dir/icon_${s}x${s}.png" >/dev/null
    sips -z $((s * 2)) $((s * 2)) "$icon" --out "$set_dir/icon_${s}x${s}@2x.png" >/dev/null
  done
  iconutil -c icns "$set_dir" -o "$app/Contents/Resources/electron.icns"
  rm -r "$(dirname "$set_dir")"
fi
# make the Dock read the changed bundle again
touch "$app"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$app" >/dev/null 2>&1 || true
