# Click checks

Step lists for the check mode of the app: each step runs JavaScript in the window (clicks, inputs), waits and
may take a screenshot; the results are printed. The steps find buttons by their German texts: run them with the
app language set to German (or add `--lang de`). The check mode keeps the settings in memory and does not save
them; `--clean` starts from the default settings instead of the user's.

```sh
cd apps/desktop && npx electron-vite build
unset ELECTRON_RUN_AS_NODE
# a load with a short jump (bullet with tip length, cartridge 1 mm before the freebore end):
npx electron out/main/index.js --screenshot /tmp/check/start.png --open <load.grtload> --steps checks/jump-and-close.json
npx electron out/main/index.js --screenshot /tmp/check/start.png --steps checks/choose-and-edit.json
npx electron out/main/index.js --screenshot /tmp/check/start.png --open <load.grtload> --steps checks/quit-question.json
```

- `jump-and-close.json`: the short-jump warning, the button "Auf 800 bar setzen", the question when an unsaved
  tab is closed, "Nicht speichern". Expected: warning first, start pressure 800 and no warning after the click,
  the question, no tab left.
- `choose-and-edit.json`: a new load, caliber, a bullet with a JBM length (Bryan Litz) and Rottweil R902 chosen
  from the lists, their notes; then a new own bullet in the editor, saved, found in the library and deleted again
  (the check uses the real library of the user and leaves it as it was).

- `quit-question.json`: the question when the window is closed with an unsaved load. The system dialog is
  replaced by the check (step `{"close": 1}` answers "Abbrechen", `{"close": 0}` "Änderungen verwerfen").
  Expected: after the first close the question and the window still open, after the second the window closed.
  Same load as `jump-and-close.json`.
