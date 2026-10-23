# Logo

A case head with the headstamp BALLISTICA / INTERNA: brass on anthracite. `headstamp.py` sets the two words on one
circle, letter by letter, and writes the letters as outlines.

```sh
pip install fonttools
curl -L -o /tmp/BarlowSemiCondensed-Bold.ttf \
  https://github.com/google/fonts/raw/main/ofl/barlowsemicondensed/BarlowSemiCondensed-Bold.ttf
python3 tools/logo/headstamp.py /tmp/BarlowSemiCondensed-Bold.ttf
```

It writes

- `apps/desktop/src/renderer/src/assets/logo.svg`: the logo (start notice, PDF report),
- `apps/desktop/build/icon.svg`: the app icon on a 1024 px canvas with the margin of the macOS icon grid.

`apps/desktop/build/icon.png` (1024 px, transparent) is rendered from `icon.svg`, e.g. with Chrome:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --default-background-color=00000000 --window-size=1024,1024 \
  --screenshot=apps/desktop/build/icon.png apps/desktop/build/icon.svg
```

electron-builder makes the macOS, Windows and Linux icons from `build/icon.png`.

The font, Barlow Semi Condensed (SIL Open Font License 1.1), is not part of the repository; the logo contains
only the outlines of the letters.
