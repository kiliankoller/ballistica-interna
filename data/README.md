# Master data

The component data BallisticaInterna ships: one CSV per type, built into `data/build/ballisticainterna.db` (not part of the
repository) by

```sh
python3 tools/master-data/build_csv.py   # local sources in fixtures/ → data/*.csv (maintainers only)
python3 tools/master-data/build_db.py    # data/*.csv → data/build/ballisticainterna.db, every row checked
```

The CSVs are licensed under the ODbL 1.0 (attribution required), see [LICENSE-DATA.md](LICENSE-DATA.md).

The CSVs are the reviewed state: changes come as pull requests and show in the diff. Users never change master
data; they add own entries, or take a master record over as an own copy, in their separate library.

| file | content | source |
|---|---|---|
| `calibers.csv` | C.I.P. Tab I–IV (centre-fire rifle and handgun): cartridge maximum dimensions (`L1` … `H2`, `G1`), chamber and barrel (`c_*`, `c_Q` effective bore area), pressures | C.I.P. TDCC |
| `bullets.csv` | maker bullets: diameter, weight, length, BC (Berger also nose and boat tail length), part numbers | Styria Arms AERO price list; Berger reference charts; Nosler, Hornady and Lapua catalogues; Norma product pages; Sierra, Barnes, Speer, Sax and Fox Bullets product pages; Sellier & Bellot catalogue; lengths of Hornady, Sierra, Lapua, Norma and Sellier & Bellot (which publish none) from the JBM bullet length list |
| `powders.csv` | rifle powders: datasheet values (Qex, bulk density) and own fitted burn values; `fit_status` says what the fit rests on (Reload Swiss; Norma and Rottweil via Sax's loads: measured pressure and velocity; Vihtavuori: measured velocity, pressure anchored at the C.I.P. maximum of the published maximum loads) and whether the bulk density is estimated (makers without a datasheet: from compressed loads, else a typical 950 kg/m³ for Rottweil; the app warns, it sets the fill ratio only) | maker datasheets (Vihtavuori N530: Vihtavuori's industrial powders brochure, which lists the powders the reloading guide lacks), makers' laboratory loads (fit only, not shipped), own fit |
| `sources.csv` | every source of the shipped data with URL, licence note and retrieval date | |

Column names follow the C.I.P. designations, as the app's component fields do.

**Bullets** (`tools/master-data/merge_bullets.py`). Key: maker + `part_number` (box sizes of the same bullet
joined, "1744 / 1744C"). `gdia_in`, `glen_in` are the published inch values, `gdia`, `glen`, `gtip`, `gtailh`
the same in mm. `length_source` says where the length comes from: `maker`, `jbm` or `jbm-litz` (JBM's figure
measured by Bryan Litz); JBM has no part numbers, so its bullet is found by maker, diameter, weight and type
name. Each row carries `url` and `retrieved`. `flags`:

| flag | meaning |
|---|---|
| `length_missing` | no length published by the maker or JBM; the user measures it (never estimated) |
| `length_ambiguous` | several JBM bullets fit with lengths more than 3 % apart; none taken |
| `jbm_no_match` | JBM lists bullets of that weight, but none with a matching type name |
| `length_conflict` | maker and JBM (or two values on the maker's page) differ by more than 3 %; the maker's value is kept, both are in the build report (`logs/bullet-report.md`) |
| `maker_pages_disagree` | the maker's page states two lengths; the one JBM confirms is kept |
| `weight_from_sd` | the maker gives no weight in the name; computed from the published sectional density |
| `implausible_length`, `implausible_weight`, `implausible_bc` | outside length/diameter 0.9 … 6.5, sectional density 0.07 … 0.50, G1 0.03 … 1.2 or G7 ≥ G1: probably an error of the source, kept and flagged |
| `corrected` | an error of the maker's page corrected by `data/bullet_corrections.csv` (each line names its evidence) |

Checked against the makers that publish lengths, the matched JBM length is within 3 % of the maker's value
for about 90 % of Berger and Nosler bullets and three quarters of Speer and Barnes bullets.

**Case capacity `V`** (grains of water) is not part of the C.I.P. tables. Where `V_source` is
`reload-swiss-fill` it is derived from the fill ratios of the Reload Swiss load data guide; where it is `estimate`
it is computed from the C.I.P. cartridge outline with typical brass values (head 9 % of the case length for bottleneck
cases, 20 % for straight cases; wall 0.6 / 0.5 mm above the head thinning to the neck wall; where an old sheet
lacks the shoulder, it is put 3 mm before the neck). The estimate can be several percent off, most for very short old revolver cases. The user should replace it by the measured capacity of
fired cases (own copy).
