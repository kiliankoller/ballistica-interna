# Licence of the data

The CSV files in this directory (`data/*.csv`, the master data of BallisticaInterna) are made available under the
**Open Database License (ODbL) 1.0**: <https://opendatacommons.org/licenses/odbl/1-0/>. The full licence text is
in [ODbL-1.0.txt](ODbL-1.0.txt) (plain-text version of that page, from
<https://opendatacommons.org/licenses/odbl/odbl-10.txt>); it must be included when the data is redistributed,
also in releases. The program code is licensed separately, under GPL-3.0-or-later (see `../LICENSE`).

Copyright (C) 2026 Kilian Koller, for the compilation, the corrections and the own fitted powder parameters.

## What the licence covers, and what it does not

The records contain (a) facts published by cartridge, bullet and powder makers and by the C.I.P. (dimensions,
weights, ballistic coefficients, pressures, datasheet values): BallisticaInterna claims no rights in these facts;
the source and the retrieval date are stated per record in [sources.csv](sources.csv); (b) BallisticaInterna's own work:
the selection and arrangement of the records, corrections, estimated values and the fitted powder parameters
(burn model values), which are covered by the licence. No load tables of makers are included.

Trademarks and product names belong to their owners and are used only to identify components. If you hold rights
in a record and want it removed, open an issue on GitHub.

## Attribution

If you use the data or a substantial part of it, state:

> Data: BallisticaInterna master data (https://github.com/kiliankoller/ballistica-interna), Copyright (C) 2026 Kilian
> Koller, licensed under the ODbL 1.0 (https://opendatacommons.org/licenses/odbl/1-0/). Cartridge and chamber
> dimensions and pressures after the C.I.P. TDCC, public part, retrieved 2026-10-19; bullet data from the
> makers' published catalogues and product pages, in part lengths from the JBM Ballistics bullet length list
> (see sources.csv).

Under the ODbL, a derived database that you publish must be offered under the ODbL as well (share-alike), and
changes must be indicated. Read the licence for the exact terms.

## Sources

| data | source |
|---|---|
| `calibers.csv` | C.I.P. TDCC (Tables of dimensions of cartridges and chambers), public part, https://bobp.cip-bobp.org/en/tdcc_public, retrieved 2026-10-19; only the dimensions and pressures needed for the simulation |
| `bullets.csv` | makers' published catalogues and product pages; lengths in part from the JBM Ballistics bullet length list, https://jbmballistics.com/downloads/lengthlist.html |
| `powders.csv` | makers' datasheets; the burn parameters are BallisticaInterna's own fit to publicly available laboratory loads (no load tables included) |

Per-record details: [sources.csv](sources.csv).
