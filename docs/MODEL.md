# The BallisticaInterna model

BallisticaInterna calculates the interior ballistics of a load with a lumped-parameter model: one gas space, one
mean pressure, the bullet as a rigid body. This page states the equations, where the parameters come from and
how close the results come to the powder makers' laboratory measurements. The code is in `packages/solver`.

## Equations

State: bullet travel *x*, velocity *v*, burnt fraction of the charge *z*.

| | |
|---|---|
| burn law | dz/dt = Ba(T) · φ(z) · 1000 · (p / 1000 bar)ⁿ, n = 0.9 |
| energy (Résal) | p · V_free = f · m_c · z − (κ − 1) · (½ · m · v² + F_f · x) |
| force of the powder | f = (κ − 1) · Q_ex |
| free volume (Noble–Abel) | V_free = V₀ + A · x − m_c · (1 − z) / ρ_c − b · m_c · z |
| momentum | m · dv/dt = A · p,  m = m_p + s · m_c |

*V₀* is the space behind the bullet (case capacity minus the part of the bullet inside the case), *A* the
effective bore area (C.I.P. Q), *m_c* the charge, *m_p* the bullet mass, *s* the Sebert factor (the share of
the charge mass moved with the bullet), *ρ_c* the material density of the powder and *b* its covolume. The
system is integrated with an adaptive Dormand–Prince step until the bullet reaches the muzzle; the reported
pressure is the space-mean pressure.

**Shot start.** The bullet is held until the gas reaches the start pressure *p_s*; the burnt fraction at that
moment follows from the energy equation with *x* = 0. Defaults (`apps/desktop/src/renderer/src/lib/startPressure.ts`):
rifles 250 bar, auto pistol cartridges 290 bar, revolver cartridges 150 bar (the cylinder gap acts like a long
jump), unless the bullet record gives its own value. With a jump below about 1.5 mm the app advises about
800 bar (see *Start pressure and jump*).

**Bullet friction.** A force *F_f* = 2.85 MPa · bullet length · bullet diameter does work along the travel and
takes energy from the gas; it does not act in the bullet's momentum. The coefficient was set during development
and is checked against the measured loads below.

## Form function

Three phases with *φ(0) = 1*:

| phase | range | φ(z) |
|---|---|---|
| progressive | z < z₁ | (1 + a₀ · z)ⁿ, n = 0.3571 |
| primary degressive | z₁ … z₂ | φ(z₁) + a₁ · (z − z₁) |
| secondary degressive | z > z₂ | φ(z₂) · ((1 − z) / (1 − z₂))^q, q = 2/3 (shrinking sphere) |

The exponent *n* reproduces the documented progressivity factor Bp = √(2(κ − 1)) · Ba · φ(z₁) · Q_ex / 10⁴
together with the brisance factor Br = √(2(κ − 1)) · Ba · Q_ex / 10⁴ (Q_ex in kJ/kg).

**Powder temperature.** Ba is scaled by 1 + 5.4·10⁻⁴ / K below and 1.0·10⁻³ / K above 21 °C; a powder with its
own temperature coefficients uses 1 + 0.0255 · t_cc · |ΔT| (cold) or 1 + 0.0268 · t_ch · |ΔT| (hot).

**Covolume.** b = 1.2 / ρ_c (0.75 cm³/g at 1600 kg/m³), a typical value for nitrocellulose powders.

**Pressure exponent.** The burn rate grows with pⁿ (Vieille's law), n = 0.9, taken relative to 1000 bar so that
Ba keeps its meaning. With n = 1 (rate proportional to the pressure) the calculated pressure rose 53 % from the
start to the maximum load of the same case, bullet and powder, while Reload Swiss measured 45 %; n = 0.9 gives
45 %. Cross-validated (2026-10-24, held-out loads, powders refitted per variant with the split of the shipped fits:
Reload Swiss, Norma and Rottweil with all calibers, Vihtavuori with defined case capacities only; Vihtavuori at
most 60 loads per powder and set):

| n | loads with pressure | Pmax mean | Pmax rms | fill < 80 % mean | maximum loads mean | Pmax rise RS / Sax (measured +45 / +13 %) | V0 rms (2132 loads) |
|---|---|---|---|---|---|---|---|
| 1 | 1096 | −2.0 % | 14.3 % | −16.5 % | −0.2 % | +53 / +13 % | 4.6 % |
| 0.9 | 1096 | −2.3 % | 13.8 % | −13.9 % | −2.8 % | +45 / +11 % | 4.2 % |
| 0.85 | 1096 | −2.4 % | 13.8 % | −12.7 % | −3.8 % | +41 / +10 % | 4.2 % |
| 0.8 | 1096 | −2.4 % | 14.0 % | −11.7 % | −4.6 % | +38 / +9 % | 4.2 % |

Shipped powders refitted with n = 0.9 on 2026-10-24. The Vihtavuori fit uses only the calibers with a defined
case capacity (`--defined-capacity`): with all calibers, the maximum loads of the handgun calibers (estimated
capacities) pull the burn law to the edge of its range (a₀ = 5 for N110, the maximum loads at 48 % of the C.I.P.
limit). The Sax-based sets (Norma, Rottweil) and Reload Swiss were refitted with all calibers.

Lower exponents help at low fill but make the maximum loads too low, the dangerous side; 0.9 is the compromise.
The error at low fill is not removed by the exponent.

**Shipped fits.** `data/fits-shipped.json` holds the burn values that `tools/master-data/build_csv.py` writes to
`data/powders.csv`, per measured set and powder, with the fit file each one came from (`source`). Fits in
`fixtures/calibration` are not read by the build, so a test run (e.g. `--powders N110`) cannot change the master
data. To ship a new fit: run `fit-powders`, copy the fitted values of the approved fit into that file, rebuild.

## Powder models

The master data powders (`data/powders.csv`) carry the burn values Ba, a₀, z₁, z₂ and, where the maker publishes
none, Q_ex, fitted by `scripts/fit-powders.ts` to the maker's laboratory loads: two thirds of the calibers fit,
one third checks. Score per load: (ΔPmax / 5 %)² + (ΔV0 / 2 %)². κ = 1.23 and ρ_c = 1600 kg/m³ for all powders;
Q_ex and the bulk density come from the maker's datasheet where it publishes them. Where a maker gives velocities
only, a published maximum load is assumed to reach 80 … 105 % of the C.I.P. maximum pressure. The load tables
themselves are not shipped. `fit_status` in the CSV says what each fit rests on.

The bulk density sets only the fill ratio, not pressure or velocity. Without a datasheet it is estimated from the
loads a maker marks as compressed (`scripts/estimate-bulk-density.ts`) or set to a typical 950 kg/m³; the app
says so next to the powder.

## Derived values

- **Case capacity** (where not measured): see *Case capacity* below. Measure your own cases.
- **Optimal barrel time** after C. Long's master model, OBT = (A·N + B)·L + C·N + D with separate coefficient
  sets for odd and even nodes; the node nearest to the time the pressure first reaches 10 % of its peak is shown.
- **Free recoil**: momentum of bullet and carried charge at the muzzle plus the remaining gas leaving at
  √(v² + p₀·V / (3 m_c)).
- **IPSC factor** m_p [gr] · v [ft/s] / 1000, **MIP** m_p [g] · v [m/s] / 10.
- **Jump** (free travel to the lands): C.I.P. freebore end (L3 + G) minus the cartridge length plus the bullet's
  tip length (tip to full diameter).

### Case capacity

The C.I.P. tables give no case capacity, so `V` in `data/calibers.csv` (grains of water) comes from one of two
sources, named in `V_source`:

- `reload-swiss-fill` (34 calibers, all rifle): derived from the fill ratios of the Reload Swiss load data guide
  2025 (charge, bulk density, fill ratio and the seated bullet of the master data), for calibers with at least 4
  charges. The derivation (`local/scripts/derive-capacity.ts`) and its result
  (`fixtures/calibration/capacity-rs.json`) are not in the repository; `build_csv.py` stops without that file.
  Reload Swiss's brass is one maker's brass: other makers and lots differ by a few percent.
- `estimate` (452 calibers, all handgun calibers among them): from the C.I.P. cartridge outline with typical brass
  thicknesses (`data/README.md`); for rifle calibers (C.I.P. Tab. I to III) times `CAPACITY_FACTOR` = 0.966, the
  median ratio of derived capacity to outline estimate over the 34 calibers. Leave-one-out over them, the factor
  lowers the rms deviation from 4.0 to 2.6 % (2026-10-24; with 7 mm-08 the median was the same).

**7 mm-08 Rem.** (`REJECTED_DERIVED` in `build_csv.py`, since 2026-10-24) takes the outline estimate, 55.6 grains;
from the fill ratios it would be 51.1, though its case is the .308 Win. case necked down (55.8 derived). The
derivation is right, but the guide's fill ratios for this caliber do not follow the bullets: all three bullets
give the same combustion chamber of about 42 grains, although their seated volumes differ by 2.8 grains, so the
derived capacity goes from 50.2 to 54.0 grains with the bullet. In consistent data it is the other way round
(.308 Win.: 54.1 … 54.9 grains for bullets seated 1.3 grains apart). Weaker signs of the same are in 444 Marlin,
6 XC, 6.5 PRC, .338 Norma Mag. and 7.62 × 54 R; their derived values agree with the outline within 8 % and are kept.

**Circularity.** The derived capacities come from the same guide that is fitted and checked with them. Fitted and
cross-validated on the Reload Swiss loads once with the outline estimate (× 0.966) instead (same 963 loads, 746
held out, n = 0.9, 2026-10-24), the held-out Pmax rms is 15.7 % instead of 15.5 % (fit 14.2 instead of 13.7 %), the
V0 rms 4.8 instead of 4.6 %. The derived capacities flatter the Reload Swiss figures by about 0.2 percentage points;
the selection of the loads by the fill-ratio check makes no difference.

Limits, open:

- The factor is fitted on rifle calibers only, so it is not applied to the handgun calibers (Tab. IV, decided
  2026-10-24): no derived capacity checks their estimate, and its error is not known.
- No published water capacity of these calibers is among the sources yet, so the derived values are checked only
  against the outline (`test_master_data.py`, 8 %).
- The app marks an estimated capacity next to the caliber and the result (`lib/capacity.ts`); a capacity derived
  from load data is named as such.

## Start pressure and jump

A start pressure that does not fit the seating makes a large difference in small and handgun cases with fast
powders and still several percent in rifles. Rules of thumb found in practice: about 250 bar for bullets jumping
to the lands; +500 bar or about 650–800 bar for bullets touching the lands or with a jump below about 1.5 mm
(Styria Arms: otherwise up to 1000 bar more in reality, for every kind of bullet); about 100–150 bar for bullets
with driving bands or relief grooves. Vaughn reports about 1000 psi less peak pressure per 0.030" of additional
free run (≈ 90 bar per mm); the measured loads used here show about 1 % per mm in the same direction. The
classical assumption of instantaneous engraving at the start pressure overestimates the early pressure
(Zhang et al. 2024); a jump-dependent start pressure is planned once enough bullets carry their tip length.

## Accuracy

The shipped powder models against the makers' measured loads (`pnpm accuracy`, deviation = calculated −
measured, rms in %). Loads used for fitting are included, so the pressure figures of the fitting sets are
slightly optimistic; the velocity sets of other makers are independent.

Figures of 2026-10-25, with the shipped master data (n = 0.9, the powder fits of 2026-10-24; the Vihtavuori fit
with defined case capacities only, see *Pressure exponent*; 7 mm-08 Rem. with the outline estimate):

| class | loads | V0 mean | V0 rms | loads with pressure | Pmax mean | Pmax rms |
|---|---|---|---|---|---|---|
| standard rifle | 6311 | +0.1 % | 3.7 % | 982 | −1.6 % | 13.0 % |
| magnum rifle (case > 5 cm³) | 1321 | −0.5 % | 3.6 % | 278 | 0.0 % | 11.6 % |
| handgun (barrel < 300 mm) | 38 | +3.0 % | 8.6 % | — | — | — |

The measured sets (rs, rsk, sax, v-vihtavuori, v-barnes, v-sierra) were rebuilt on 2026-10-24 from the current
master data, so the jobs carry the case capacities of `data/calibers.csv`. The rifle rows are unchanged by the
rebuild: the rifle jobs already had these capacities. The handgun jobs had capacities 3.3 … 3.5 % too small (the
correction factor 0.966 still applied to them); with the outline estimates the handgun row went from +5.2 % /
10.5 % to +3.0 % / 8.6 %. With the outline estimate for 7 mm-08 Rem. (see *Case capacity*) the fill-ratio check
leaves out 6 more of its Reload Swiss charges, and the standard rifle row went from 6317 / 988 loads, Pmax −1.4 % /
13.2 % to the figures above.

**Handguns are not supported.** The app says so for every load with a barrel below 300 mm. The handgun row is
the model with rifle powders in handgun cartridges, which is what the app would calculate if asked. Its V0 is
too high on average (+3 %). This comes from the Vihtavuori fit: its maximum loads anchor the pressure through the
C.I.P. limit, and the case capacities of most handgun calibers are estimated (see *Pressure exponent*). The rifle
rows improved in every column against the previous fit. The 38 loads are the handgun loads of the sets with a
shipped powder (54) less those whose bullet matched by weight only (16), which `pnpm accuracy` leaves out; the
fill-ratio check of the set builder plays no part, since the handgun sources state no fill ratio. The earlier
handgun figures (59 loads, −2.9 % / 9.4 %) came from an older run and are not reproduced.

Since 2026-10-24 the handgun row is for information only: a change of the model or of the fits is judged by the
rifle rows, and "no class gets worse" applies to them only. Handgun support would be a project of its own, with
handgun powders, measured case capacities and its own acceptance figures.

The analyses below were rerun on the shipped fits (n = 0.9) and the rebuilt measured sets: the cross-validations
on 2026-10-24, still with the derived 51.1 grains for 7 mm-08 Rem. (12 of 756 Reload Swiss loads), the others on
2026-10-25.

**Cross-validation.** `pnpm fit-powders --cv` fits every powder three times, each time without a third of the
calibers, and checks it on the calibers left out (all three folds together). The held-out figures are close to
those on the fitting loads, so the deviations are the limit of the model and not an effect of the fit (split of
the shipped fits, see *Pressure exponent*):

| powders (sets) | held-out loads | V0 rms held out (fit) | Pmax rms held out (fit) |
|---|---|---|---|
| Reload Swiss (rs) | 756 | 4.7 % (4.2 %) | 15.6 % (13.8 %) |
| Norma (sax) | 140 | 2.0 % (1.7 %) | 9.1 % (8.2 %) |
| Rottweil (sax) | 108 | 1.9 % (1.8 %) | 8.3 % (7.8 %) |
| Vihtavuori (v-vihtavuori, pressure from sax), defined capacities | 1092 | 4.2 % (3.5 %) | 7.7 % (6.4 %) |
| Vihtavuori 24N41 (all calibers, velocity only) | 36 | 4.1 % (4.0 %) | — |

**Systematic deviation (rifles, `pnpm accuracy --by`).** The error depends on the fill ratio (calculated with the
bullet seated): at 70 … 80 % the model is 1.7 % low in V0 and 12.7 % low in Pmax (68 loads with pressure), at
80 … 90 % 0.6 % and 3.4 %, at 90 … 100 % it is unbiased (V0 0.0 %, Pmax −0.6 %, rms 3.1 % and 10.7 %), at 100 % and
more (compressed charges) it is 1.7 % high in V0 and 5.2 % high in Pmax. Below 70 % there is a single load with
pressure.

**Direction of the error.** The dangerous direction is the low one: at fill ratios below about 90 % the
calculated pressure is on average too low (70 … 80 %: 13 %, held out below 80 %: 14 %), so the real pressure can
be higher than shown. Bullets of 300 gr and more are 3.3 % high in V0. Other weight classes show no trend in V0
(−0.5 … +0.9 %).

**Warnings of the app** (`lib/warnings.ts`). Their figures come from the held-out loads of the cross-validation
of 2026-10-24 (pressure exponent 0.9, split of the shipped fits, 1096 rifle loads of Reload Swiss and Sax with
measured pressure; fill ratios as published by Reload Swiss, Sax publishes none).

- Fill ratio below 90 %: the calculated pressure was on average 4 % too low at 80 … 90 % and 14 % below 80 %,
  single loads up to 43 %. Below 85 % the warning is shown as a danger.
- Slow powder (Ba ≤ 0.55, N160, RS62, Norma 204 and slower) below 85 % fill: risk of the secondary explosion
  effect, which no model calculates. The bound is checked against the shipped powders by a test, as Ba changes
  with every refit.
- Worst case next to every result: the measured pressure exceeded the calculated one by up to 76 % below 90 %
  fill, 42 % at 90 … 100 % and 30 % above (Sax, without fill ratio: up to 25 %).
- Estimated case capacity (see *Case capacity*).

The Vihtavuori powders are fitted to Vihtavuori's velocities together with Sax's measured pressures (`fit_status`),
so the app no longer marks their pressure as not backed.

**Independent check.** The customer loads of the Reload Swiss load data guide 2025 (rifles) were not used for
fitting. Reload Swiss checks them for plausibility only, and their seating depth and pressure are not reliable, so
only the velocity V5 (at 5 m) is compared, with the bullet seated to the C.I.P. maximum cartridge length and the
shipped master data (bullets matched by type or maker, 627 loads; 2026-10-25, `pnpm accuracy`, sets rsk and rs):

| class | loads | V0 mean | V0 rms | within ±5 % |
|---|---|---|---|---|
| standard rifle, customer loads | 534 | −1.5 % | 4.5 % | 79 % |
| magnum rifle, customer loads | 93 | −1.3 % | 3.1 % | 89 % |
| same powders, laboratory loads (standard / magnum) | 606 / 144 | +0.6 / −0.3 % | 4.4 / 3.9 % | 81 / 83 % |

The velocity holds up on loads from real rifles with unknown seating: the rms is the same as on the laboratory
loads for standard rifles and lower for magnums. The model is about 1.5 % low on average against the customers
(median −2.0 % standard, −1.1 % magnum); V5 is a few tenths of a percent below V0, so the true bias is a little
larger.

Handgun powders are not shipped yet: on handgun loads the model's pressure scatters much more (rms about 26 %),
mostly per cartridge. The case capacity, the bullet dimensions and the powder lot change the pressure far more
than the model's error: BallisticaInterna's results are a simulation, not load data.

## Sources

- Gordon's Reloading Tool, published manual (help pages "Formalism", "Burn rate chart") – the definitions of the
  powder inputs (Ba, a₀, z₁, z₂, Qex, κ) and of the factors Br and Bp, so that `.grtload` files mean the same here.
  Compatible with the .grtload file format of Gordon's Reloading Tool (not affiliated with, not checked by GRT).
- B. P. Kneubuehl (ed.), *Ballistik: Theorie und Praxis*, Springer, 2019 – interior ballistics, Résal equation.
- Rheinmetall, *Waffentechnisches Taschenbuch*, 1980 – form function, powder characteristics.
- R. E. Kutterer, *Ballistik*, Vieweg, 1959.
- J. Corner, *Theory of the Interior Ballistics of Guns*, Wiley, 1950 – Lagrange gradient, Noble–Abel equation.
- R. D. Anderson, K. D. Fickie, *IBHVG2 – A User's Guide*, BRL-TR-2829, 1987 – lumped-parameter interior ballistics.
- C. Long, *Optimal Barrel Time*, 2003 – OBT master model.
- H. R. Vaughn, *Rifle Accuracy Facts*, 1998 – pressure and free run.
- Styria Arms (M. Mayerl), AERO price list and reloading notes – start pressure with a short jump.
- Zhang et al., Numerical simulation of the coupled dynamics model of the projectile engraving process,
  *International Journal of Mechanical System Dynamics*, 2024.
- ChamberSim Reloaded (GPL-3.0): findings compared, no code taken over.
- Makers' laboratory data used for fitting and checking: Reload Swiss, Lovex, Vihtavuori, Sax; datasheets of
  Reload Swiss, Vihtavuori, Norma (see `data/sources.csv`).
