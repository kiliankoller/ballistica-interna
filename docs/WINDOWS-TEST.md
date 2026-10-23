# Testing the Windows installer

The installer is built on Windows itself (the SQLite module is native).

## Prepare (once)

1. Node.js 22 LTS (nodejs.org), then in PowerShell: `corepack enable`
2. Python 3.9 or later (python.org, "Add python.exe to PATH")
3. Git (git-scm.com)
4. `git clone git@github.com:kiliankoller/ballistica-interna.git` (or the share from the Mac)

## Build

```powershell
cd ballistica-interna
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm test:data
pnpm data
pnpm notices
pnpm dist              # the installer
```

Simpler: the GitHub Actions workflow "Installers" builds the Windows installer too; download it from the run's artifacts.
The installer is `apps\desktop\dist\BallisticaInterna Setup <version>.exe`; it is not signed, so Windows
SmartScreen asks for confirmation ("More info" → "Run anyway").

## Checklist

| # | Step | Expected |
|---|---|---|
| 1 | Install and start | starts without error; window title BallisticaInterna |
| 2 | First start | notice "Wichtiger Hinweis" / "Important notice"; "Continue" only after the box is ticked |
| 3 | Restart | the notice does not come again |
| 4 | Caliber choice | group "Stammdaten (BallisticaInterna)" with about 486 calibers; e.g. "308 Win." |
| 5 | Choose 308 Win., an AERO bullet, RS 52 | values filled in; line "Quelle: …" under each choice; a result is computed |
| 6 | Pencil "Edit as own copy" on the caliber | form with values; change the case capacity; save |
| 7 | Caliber choice again | group "Own" with the copy; line "Eigene Kopie von „308 Win. …“" after choosing it |
| 8 | Settings → own components → pencil | the copy opens and can be changed |
| 9 | Settings → Licences → third-party software | list of about 57 packages with licence texts |
| 10 | Save the load, open it again | same values |
| 11 | Report (PDF) | PDF with the red warning box above the footer |
| 12 | New load, choose caliber and bullet only | results name the missing fields like the panels do (e.g. „Pulvermasse (mc) – fehlt“), the rows are marked red |
| 13 | Uninstall | removes the app; own components stay in `%APPDATA%\BallisticaInterna` |

Note what differs (with a screenshot) in a file next to this one or in an issue.
