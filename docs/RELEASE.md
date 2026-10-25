# Release of a version

Checklist for the maintainer, and the texts of the releases. Nothing here is done automatically: the tag and the
release text are the maintainer's decision.

Published: the repository is public; v0.2.0 (2026-10-23) is the first release. Its text is at the end of this file.

## Before every tag

- [ ] `./build.sh` passes (typecheck, unit tests, master data checks, notices, local installer).
- [ ] The app or the master data changed visibly: `pnpm docs:media` (screenshot and example report), look at
      both, commit them.
- [ ] `git status` is clean, `main` equals `origin/main`.
- [ ] The version in `apps/desktop/package.json` is the one to tag (the tag is `v` plus that version).
- [ ] The tag starts the Installers workflow (`.github/workflows/release.yml`: checks, installers for macOS,
      Windows and Linux, SHA-256 files, release with the files attached). Wait until all three are green.
- [ ] Edit the release on GitHub: title and text (warning, what is new, known limitations with the issue numbers,
      checksum note). The workflow creates the release without a text.
- [ ] Download the installers from the release, compare the SHA-256 value with the checksum file
      (`shasum -a 256 <file>` on macOS, `sha256sum <file>` on Linux, `certutil -hashfile <file> SHA256` on
      Windows) and start each once on its platform ([WINDOWS-TEST.md](WINDOWS-TEST.md) for Windows): the app opens,
      a load can be opened, the master data lists calibers, bullets and powders, the report can be viewed and saved.
- [ ] Changes of the first-start text (`DISCLAIMER_VERSION`): start the installer with `--disclaimer` once and read
      it in German and English.
- [ ] What becomes public: `git ls-files` shows no load tables, no databases, no PDFs, no local notes, no
      `fixtures/`, no `local/`, no scripts of restricted sources (they are in `local/`), no catalogue excerpts
      (testdata is synthetic).
- [ ] The known limitations in the release text and in the open issues (#1 to #5) are still true.

## Before telling a wider public

Done:

- [x] Commits under the noreply address, repository public, warning dialog checked in the real app.

Open (the maintainer decides how far to go; the points are accepted risks, not forgotten):

- [ ] Name BallisticaInterna: check TMview/DPMA/EUIPO and GitHub.
- [ ] Run each installer once on its platform (Windows and Linux were not checked after the release).
- [ ] Per maker: terms of service and robots.txt read and noted in `data/sources.csv`; still to confirm for Norma and
      Vihtavuori.
- [x] Repository settings (checked 2026-10-22): description and topics set, Issues enabled, private vulnerability
      reporting enabled (SECURITY.md points to it). Still to look at: no Sponsors button, no donation links
      (CONTRIBUTING.md).
- [ ] GitHub account: "Keep my email addresses private" and "Block command line pushes that expose my email" on.
- [ ] Enquiry to the liability insurer: is publishing free open-source software, and damage to third parties from
      wrong calculations, covered (enquiry to be written by the maintainer).
- [x] Impressum checked by the maintainer (2026-10-22): not needed.
- [ ] The lawyer questions below.
- [ ] Say in every announcement: this is a simulation, not load data (see the warning in the release text).

## Installers are unsigned

The installers carry no signature of a certificate authority and are not notarised (no certificate).
The macOS app is signed ad hoc only (`identity: '-'` in electron-builder.yml): without that, an arm64 app is reported
as damaged after a download, but Gatekeeper still asks for confirmation. The Windows installer is not signed at all.
Each release therefore carries SHA-256 checksums (`SHA256SUMS-*.txt`), and the release text says so. A Developer ID
and notarisation are not planned for now (cost); see issues #1 (macOS) and #2 (Windows).

## Open questions (for a lawyer, if one is consulted later)

The maintainer decided on 2026-10-21 not to consult a lawyer before publication. The questions stay open; the
five of the review are in `local/legal-review-2026-10-21.md`. Among them:

- **Impressum** (section 5 DDG): none for now. A pure GitHub repository without a web page of its own, no
  e-mail address, no income. Whether this is enough is not clarified.
- Whether the fitting of powder parameters to publicly available laboratory loads and the listing of catalogue
  facts (section 44b UrhG, database rights) is permitted where a maker's terms or robots.txt exclude automated
  use.
- How far the exclusion of liability carries for free but safety-relevant software, and whether the private
  liability insurance covers it.
- Whether the new product liability rules or the Cyber Resilience Act apply as long as there is no income.
- Donations and sponsoring: none; if ever wished, clarify with a lawyer first.

Reply template if a maker complains: [CEASE-AND-DESIST-RESPONSE.md](CEASE-AND-DESIST-RESPONSE.md).

## Text of the release v0.3.0 (draft, 2026-10-25)

**BallisticaInterna 0.3.0: interior ballistics for rifle handloads**

It calculates pressure, velocity and energy of a rifle load over the bullet's travel and opens and saves
`.grtload` files. Compatible with the .grtload file format of Gordon's Reloading Tool (not affiliated with, not
checked by GRT).

**Warning: this is a simulation, not load data.** The calculated pressure can be too low: at fill ratios below
about 90 % it is on average too low (below 80 %: about 15 %, single loads up to 43 %), so the real pressure can be
higher than shown. Never load on the basis of this app alone; use only the makers' published load data, start
with the starting load and never exceed the maximum load. Reloading is dangerous and can cause serious injury or
death.

What is new since 0.2.0
- Burn law: the burn rate grows with p^0.9 (Vieille's law) instead of proportionally to the pressure; all shipped
  powders are refitted. The rise of the pressure from start to maximum load now matches the measured one.
- Case capacities: 34 rifle calibers take their capacity from the fill ratios of the Reload Swiss load data guide,
  the others an estimate from the C.I.P. outline. The app says which, next to the caliber and the result.
- New warnings: slow powder loosely filled (secondary explosion effect), the worst case of the tests at the load's
  fill ratio next to every result, and an estimated case capacity.
- The first-start notice states the figures of this version (it is shown again once).
- Accuracy checked again on measured sets rebuilt from the shipped master data
  ([docs/MODEL.md](https://github.com/kiliankoller/ballistica-interna/blob/main/docs/MODEL.md#accuracy)).
- 39 powder models (Reload Swiss 9, Vihtavuori 19, Norma 6, Rottweil 5): Norma MRP is no longer shipped.
  About 1640 bullets (was about 1560).

How accurate it is
- Velocity: about 3.7 % rms against the makers' measured loads. Checked on customer loads of Reload Swiss that
  were not used for fitting: 4.4 % (standard rifles), 3.1 % (magnum).
- Pressure: 11.6 % (magnum) to 12.9 % (standard) rms, 13.6 % on loads held out of the fit. It is no safety margin.

Known limitations (each has an issue)
- [#1](https://github.com/kiliankoller/ballistica-interna/issues/1) macOS: not signed with a Developer ID, not
  notarised. Open the app once via System Settings → Privacy & Security → Open Anyway.
- [#2](https://github.com/kiliankoller/ballistica-interna/issues/2) Windows: not code-signed. SmartScreen: More
  info → Run anyway.
- [#3](https://github.com/kiliankoller/ballistica-interna/issues/3) Pressure deviates about 12 to 13 % rms from
  measured loads. It is no safety margin.
- [#4](https://github.com/kiliankoller/ballistica-interna/issues/4) Low fill ratios (below 90 %): the pressure is
  calculated too low.
- [#5](https://github.com/kiliankoller/ballistica-interna/issues/5) Handguns are not supported.
- [#10](https://github.com/kiliankoller/ballistica-interna/issues/10) The derived case capacities are not yet
  compared with measured water capacities.
- No powders of Hodgdon, Ramshot, IMR, Winchester and Alliant (their terms forbid using the load data).

Compare the SHA-256 checksum (`SHA256SUMS-*.txt`, attached to this release) with your download before you start
an installer: `shasum -a 256 <file>` on macOS, `sha256sum <file>` on Linux, `certutil -hashfile <file> SHA256`
on Windows.

Provided free of charge and without warranty; liability is excluded to the extent permitted by law
([DISCLAIMER.md](https://github.com/kiliankoller/ballistica-interna/blob/main/DISCLAIMER.md)). Licences: code
GPL-3.0-or-later, data (`data/*.csv`) ODbL 1.0 with attribution (NOTICE). Not affiliated with, endorsed by or
sponsored by any maker, the C.I.P. or GRT. No outside contributions, no donations (see CONTRIBUTING.md). Security
reports: GitHub private vulnerability reporting (SECURITY.md).

## Text of the release v0.2.0

**BallisticaInterna 0.2.0: interior ballistics for rifle handloads**

It calculates pressure, velocity and energy of a rifle load over the bullet's travel and opens and saves
`.grtload` files. Compatible with the .grtload file format of Gordon's Reloading Tool (not affiliated with, not
checked by GRT).

**Warning: this is a simulation, not load data.** The calculated pressure can be too low: at fill ratios below
about 90 % it is on average clearly too low (60 to 70 %: about 32 % too low), so the real pressure can be higher
than shown. For Vihtavuori powders the pressure is assumed, not measured. Never load on the basis of this app
alone; use only the makers' published load data, start with the starting load and never exceed the maximum
load. Reloading is dangerous and can cause serious injury or death.

What is in it
- 486 C.I.P. calibers, about 1560 bullets of Berger, Nosler, Hornady, Sierra, Lapua, Norma, Speer, Barnes and
  Styria Arms, 40 powder models (Reload Swiss, Vihtavuori, Norma, Rottweil), each record with its source.
- Own library for calibers, bullets and powders; master data stays read only.
- Load ladder, comparison of loads, cartridge and chamber drawing, PDF report (view or save).
- Warnings for a short jump, a missing bullet length, an estimated bulk density and a too slow twist.

How accurate it is
- Velocity: about 4 to 5 % rms against the makers' measured loads; 75 % of the loads within 5 %. Checked on
  customer loads of Reload Swiss that were not used for fitting: 5.0 % (standard rifles), 3.6 % (magnum).
- Pressure: 12 % (magnum) to 20 % (standard) rms. It is no safety margin.
- Details: [docs/MODEL.md](https://github.com/kiliankoller/ballistica-interna/blob/main/docs/MODEL.md).

Known limitations (each has an issue)
- [#1](https://github.com/kiliankoller/ballistica-interna/issues/1) macOS: not signed with a Developer ID, not
  notarised. Open the app once via System Settings → Privacy & Security → Open Anyway.
- [#2](https://github.com/kiliankoller/ballistica-interna/issues/2) Windows: not code-signed. SmartScreen: More
  info → Run anyway.
- [#3](https://github.com/kiliankoller/ballistica-interna/issues/3) Pressure deviates 12 % (magnum) to 20 %
  (standard rifles) rms from measured loads. It is no safety margin.
- [#4](https://github.com/kiliankoller/ballistica-interna/issues/4) Low fill ratios (below 90 %): velocity and
  pressure are calculated too low.
- [#5](https://github.com/kiliankoller/ballistica-interna/issues/5) Handguns are not supported.
- No powders of Hodgdon, Ramshot, IMR, Winchester and Alliant (their terms forbid using the load data).

Compare the SHA-256 checksum (`SHA256SUMS-*.txt`, attached to this release) with your download before you start
an installer: `shasum -a 256 <file>` on macOS, `sha256sum <file>` on Linux, `certutil -hashfile <file> SHA256`
on Windows.

Provided free of charge and without warranty; liability is excluded to the extent permitted by law
([DISCLAIMER.md](https://github.com/kiliankoller/ballistica-interna/blob/main/DISCLAIMER.md)). Licences: code
GPL-3.0-or-later, data (`data/*.csv`) ODbL 1.0 with attribution (NOTICE). Not affiliated with, endorsed by or
sponsored by any maker, the C.I.P. or GRT. No outside contributions, no donations (see CONTRIBUTING.md). Security
reports: GitHub private vulnerability reporting (SECURITY.md).
