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
| momentum | m · dv/dt = A · p − F_f,  m = m_p + s · m_c |

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

**Bullet friction.** A force *F_f* = 2.85 MPa · bullet length · bullet diameter brakes the bullet
(m·dv/dt = A·p − F_f) and its work along the travel is taken from the gas. The coefficient was set during
development and is checked against the measured loads below. Until 2026-10-28 the friction only took energy from
the gas and did not act in the bullet's momentum; acting on the bullet it lifts the pressure of loosely filled
loads more than that of full ones and so reduces the low-fill bias (held out below 80 % fill: −14.9 → −5.3 %, all
loads −2.0 → +0.8 %, loads more than 10 % too low 26 → 18 %). The cost is an overestimate of the fast Vihtavuori
powders (see *Cross-validation*). `frictionHeatReturn` (share of the friction work returned to the gas) and an
engraving resistance (`engravingResistance`, `engravingLength`) exist in the solver but are off: the heat share
made no difference, and the engraving resistance raised the start loads and the spread without helping the low
fill as much.

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

Shipped powders refitted with n = 0.9 on 2026-10-24, and all of them again on 2026-10-25 on the measured sets
rebuilt from the current master data (see *Shipped fits*). The Vihtavuori fit uses only the calibers with a defined
case capacity (`--defined-capacity`): with all calibers, the maximum loads of the handgun calibers (estimated
capacities) pull the burn law to the edge of its range (a₀ = 5 for N110, the maximum loads at 48 % of the C.I.P.
limit). The Sax-based sets (Norma, Rottweil) and Reload Swiss were refitted with all calibers.

Lower exponents help at low fill but make the maximum loads too low, the dangerous side; 0.9 is the compromise.
The error at low fill is not removed by the exponent. With the friction acting on the bullet (2026-10-28) the
exponent was checked again (0.9, 0.95, 1, cross-validated): 0.9 stays best in the worst underestimates, below 90 %
fill and in all loads; higher exponents fit the rise from start to maximum load of Reload Swiss slightly better
(+47 % instead of +43 %, measured +45 %) but overestimate Vihtavuori more.

**Shipped fits.** `data/fits-shipped.json` holds the burn values that `tools/master-data/build_csv.py` writes to
`data/powders.csv`, per measured set and powder, with the fit file each one came from (`source`). Fits in
`fixtures/calibration` are not read by the build, so a test run (e.g. `--powders N110`) cannot change the master
data. To ship a new fit: run `fit-powders`, copy the fitted values of the approved fit into that file, rebuild.

The shipped fits are those of 2026-10-28, a refit of all shipped powders with the friction acting on the bullet
(`local/scripts/refit-variant.sh`, the split and options of the previous fits, the measured sets of 2026-10-25).
Parameters at the bounds of the fit went from 8 to 1: the Lovex powders leave the lower Q_ex bound, S060, N150 and
R907 leave theirs; RS80 now ends at a₀ = 5. The fits before were those of 2026-10-25 (`local/scripts/refit-all.sh`),
made after the measured sets had been rebuilt from the master data (caliber aliases, unique bullet names, the
bullets of Fox and Sellier & Bellot, the case capacities of 7 mm-08 Rem., 270 WSM, 300 WSM and 300 PRC): a fit must
follow from the data it ships with. The warnings below use the figures of these fits.

## Powder models

The master data powders (`data/powders.csv`) carry the burn values Ba, a₀, z₁, z₂ and, where the maker publishes
none, Q_ex, fitted by `scripts/fit-powders.ts` to the maker's laboratory loads: two thirds of the calibers fit,
one third checks. Score per load: (ΔPmax / 5 %)² + (ΔV0 / 2 %)². κ = 1.23 and ρ_c = 1600 kg/m³ for all powders;
Q_ex and the bulk density come from the maker's datasheet where it publishes them. Where a maker gives velocities
only, a published maximum load is assumed to reach 80 … 105 % of the C.I.P. maximum pressure. The load tables
themselves are not shipped. `fit_status` in the CSV says what each fit rests on.

**Lovex** (Explosia): S060, S062, S065, S070, D073.4, D073.5 and D073.6, fitted to the Lovex reloading guide 2019,
which gives the pressure of the maximum loads only; the bulk density is from Explosia's catalogue 2023, which gives
no Q_ex, so Q_ex is fitted (3544 … 3930 kJ/kg; before the friction acted on the bullet it ended at the lower bound
of 3400 kJ/kg for four of them). S071 is left out (too few loads for the cross-validation). In
Explosia's burning-rate chart S062 equals Vihtavuori N530; in the model it is about 13 % slower (between N530 and
N140), while it meets Lovex's own maximum loads (held out: Pmax mean −1.2 %). The app notes next to a Lovex powder
that its pressure is checked on maximum loads only.

The bulk density sets only the fill ratio, not pressure or velocity. Without a datasheet it is estimated from the
loads a maker marks as compressed (`scripts/estimate-bulk-density.ts`) or set to a typical 950 kg/m³; the app
says so next to the powder.

## Derived values

- **Case capacity** (where not measured): see *Case capacity* below. Measure your own cases.
- **Optimal barrel time** after C. Long's master model, OBT = (A·N + B)·L + C·N + D with separate coefficient
  sets for odd and even nodes; the node nearest to the time the pressure first reaches 10 % of its peak is shown. This is an empirical rule
  about barrel vibration, not interior ballistics; the app says so next to the value and in the report.
- **Free recoil**: momentum of bullet and carried charge at the muzzle plus the remaining gas leaving at
  √(v² + p₀·V / (3 m_c)).
- **IPSC factor** m_p [gr] · v [ft/s] / 1000, **MIP** m_p [g] · v [m/s] / 10.
- **Jump** (free travel to the lands): C.I.P. freebore end (L3 + G) minus the cartridge length plus the bullet's
  tip length (tip to full diameter).

### Case capacity

The C.I.P. tables give no case capacity, so `V` in `data/calibers.csv` (grains of water) comes from one of two
sources, named in `V_source`:

- `reload-swiss-fill` (37 calibers, all rifle): derived from the fill ratios of the Reload Swiss load data guide
  2025 (charge, bulk density, fill ratio and the seated bullet of the master data), for calibers with at least 4
  charges. The derivation (`local/scripts/derive-capacity.ts`) and its result
  (`fixtures/calibration/capacity-rs.json`) are not in the repository; `build_csv.py` stops without that file.
  Reload Swiss's brass is one maker's brass: other makers and lots differ by a few percent.
- `estimate` (449 calibers, all handgun calibers among them): from the C.I.P. cartridge outline with typical brass
  thicknesses (`data/README.md`); for rifle calibers (C.I.P. Tab. I to III) times `CAPACITY_FACTOR` = 0.966, the
  median ratio of derived capacity to outline estimate over the derived calibers (2026-10-24: 34 calibers, 0.966;
  2026-10-25, with 270 WSM, 300 WSM and 300 PRC: 37 calibers, 0.964; the factor is kept, the difference of 0.2 % is
  far below the scatter). Leave-one-out over them, the factor lowers the rms deviation from 4.2 to 2.6 %.

**7 mm-08 Rem.** (`REJECTED_DERIVED` in `build_csv.py`, since 2026-10-24) takes the outline estimate, 55.6 grains;
from the fill ratios it would be 51.1, though its case is the .308 Win. case necked down (55.8 derived). The
derivation is right, but the guide's fill ratios for this caliber do not follow the bullets: all three bullets
give the same combustion chamber of about 42 grains, although their seated volumes differ by 2.8 grains, so the
derived capacity goes from 50.2 to 54.0 grains with the bullet. In consistent data it is the other way round
(.308 Win.: 54.1 … 54.9 grains for bullets seated 1.3 grains apart). Weaker signs of the same are in 444 Marlin,
6 XC, 6.5 PRC, 300 PRC, .338 Norma Mag. and 7.62 × 54 R; their derived values agree with the outline within 8 % and
are kept.

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

Figures of 2026-10-28, with the shipped master data (n = 0.9, friction acting on the bullet, the powder fits of
2026-10-28, see *Shipped fits*; the Vihtavuori fit with defined case capacities only, see *Pressure exponent*; Lovex
included):

| class | loads | V0 mean | V0 rms | loads with pressure | Pmax mean | Pmax rms |
|---|---|---|---|---|---|---|
| standard rifle | 7467 | −0.6 % | 3.4 % | 1308 | +1.6 % | 12.9 % |
| magnum rifle (case > 5 cm³) | 2123 | −1.3 % | 3.3 % | 347 | +2.7 % | 12.8 % |
| handgun (barrel < 300 mm) | 38 | +2.4 % | 8.0 % | — | — | — |

The measured sets (rs, rsk, sax, v-vihtavuori, v-barnes, v-sierra, lovex) were rebuilt on 2026-10-25 from the
current master data, so the jobs carry the case capacities of `data/calibers.csv`; with the caliber aliases and
the new bullets more loads find their caliber and bullet (standard rifle: 6311 → 7467 loads, 982 → 1308 with
pressure, Lovex included). The handgun row is unchanged.

**Handguns are not supported.** The app says so for every load with a barrel below 300 mm. The handgun row is
the model with rifle powders in handgun cartridges, which is what the app would calculate if asked. Its V0 is
too high on average (+2.4 %). This comes from the Vihtavuori fit: its maximum loads anchor the pressure through the
C.I.P. limit, and the case capacities of most handgun calibers are estimated (see *Pressure exponent*). Against the
fits of 2026-10-25 (friction on the gas only) the rifle V0 rms fell (standard 3.6 → 3.4 %) and the Pmax rms rose
(standard 12.3 → 12.9 %, magnum 11.5 → 12.8 %, mostly the Vihtavuori powders, see *Cross-validation*); in exchange
the low-fill bias, the dangerous direction, shrank (see *Bullet friction* and below). The 38 loads are the handgun loads of the sets with a
shipped powder (54) less those whose bullet matched by weight only (16), which `pnpm accuracy` leaves out; the
fill-ratio check of the set builder plays no part, since the handgun sources state no fill ratio. The earlier
handgun figures (59 loads, −2.9 % / 9.4 %) came from an older run and are not reproduced.

Since 2026-10-24 the handgun row is for information only: a change of the model or of the fits is judged by the
rifle rows, and "no class gets worse" applies to them only. Handgun support would be a project of its own, with
handgun powders, measured case capacities and its own acceptance figures.

The analyses below are those of the shipped fits: the cross-validations ran together with the refit of 2026-10-28,
on the same measured sets.

**Cross-validation.** `pnpm fit-powders --cv` fits every powder three times, each time without a third of the
calibers, and checks it on the calibers left out (all three folds together). The held-out figures are close to
those on the fitting loads, so the deviations are the limit of the model and not an effect of the fit (split of
the shipped fits, see *Pressure exponent*):

| powders (sets) | held-out loads | V0 rms held out (fit) | Pmax rms held out (fit) |
|---|---|---|---|
| Reload Swiss (rs) | 872 | 4.2 % (3.9 %) | 14.3 % (12.9 %) |
| Norma (sax) | 144 | 1.7 % (1.5 %) | 7.8 % (7.1 %) |
| Rottweil (sax) | 110 | 1.9 % (1.7 %) | 8.5 % (7.7 %) |
| Lovex (lovex, maximum loads) | 257 | 3.2 % (2.9 %) | 11.3 % (10.3 %) |
| Vihtavuori (v-vihtavuori, pressure from sax), defined capacities | 1132 | 3.9 % (3.4 %) | 11.7 % (9.9 %) |
| Vihtavuori 24N41 (all calibers, velocity only) | 38 | 3.6 % (3.6 %) | — |

The Vihtavuori powders are calculated too high held out (Pmax mean +7.5 %, before +0.5 %; mostly the fast N120,
N130 and N133): their fit rests on Vihtavuori's velocities, and a bullet braked by the friction needs more energy
for the same velocity. That is the safe direction.

**Systematic deviation (rifles, `pnpm accuracy --by`).** The error depends on the fill ratio (calculated with the
bullet seated): at 70 … 80 % the model is 2.2 % low in V0 and 5.5 % low in Pmax (85 loads with pressure), at
80 … 90 % 1.3 % low in V0 and nearly unbiased in Pmax (+0.5 %), at 90 … 100 % 0.7 % low in V0 and 2.2 % high in
Pmax (rms 3.0 % and 12.1 %), at 100 % and more (compressed charges) 0.7 % high in V0 and 5.0 % high in Pmax. Below
70 % there is a single load with pressure.

**Direction of the error.** The dangerous direction is the low one: below 80 % fill the calculated pressure is on
average too low (70 … 80 %: 5.5 %, held out below 80 %: 5.3 %), so the real pressure can be higher than shown;
from 80 % on the mean is unbiased or high, but the spread stays (see the laboratory figures under *Warnings of the
app*). Bullets of 300 gr and more are 1.9 % high in V0. Other weight classes show no trend in V0 (−1.1 … −0.2 %).

**Warnings of the app** (`lib/warnings.ts`). Their figures come from the held-out loads of the cross-validations of
the shipped fits (2026-10-28, friction acting on the bullet, pressure exponent 0.9, 1483 rifle loads of Reload Swiss, Sax and Lovex with measured
pressure; the fill ratio calculated as in the app, also for Sax and Lovex, which publish none). The comparison is
called "the makers' laboratory measurements" in the app: the loads were measured by Reload Swiss, Lovex and Sax, not
by this project.

Next to the result and in the report the notices stand in three levels (`resultNotices` in `lib/warnings.ts`, the
same for both):

- **Danger** (red): the calculated peak pressure above the C.I.P. maximum pressure; fill ratio below 85 %; a slow
  powder below 85 % fill; a jump below 1.5 mm with the start pressure not raised; a handgun.
- **Caution** (yellow): fill ratio 85 … 90 %; the calculated pressure below the C.I.P. maximum, but above it with
  the 95 % laboratory deviation (this applies to 54 % of the 870 published maximum loads of the tests, held out,
  and another 18 % are a danger already; of the 23 that were measured above the C.I.P. maximum, 12 get this caution
  and 11 the danger, none neither; since it fires on most maximum loads, it is a caution, not a danger); a powder that is not the
  shipped model; an estimated case capacity; a twist slower than the bullet maker's minimum.
- **Note** (grey, always shown): simulation, not load data, never above the makers' data; the laboratory figures at
  the fill ratio of the result from 90 % on (below, they stand in the fill ratio warning, so one figure says how far
  the real pressure was above the calculation); case, lot and seating about ±8 %; the source of the case capacity
  (unless it is estimated, which is a caution).

The whole ladder is checked, not only the step shown: the C.I.P. maximum at the step with the highest pressure, the
fill ratio at the most loosely filled step; the notice names the step's charge when another step is shown.

The laboratory figures are given only where they apply: for a powder whose burn values are those of a shipped fit
(master record with `fit_status` "fitted…", values unchanged), and for rifles. For an own powder, one taken from a
file with other values, or a changed one, the app says that the deviation is not known; for handguns the handgun
danger says that the pressure is not backed. They also refer to the default start pressure of the fits (rifle
250 bar): with a raised start pressure (800 bar for a short jump) the model's pressure is higher and the figures
are a rough guide only.

- Fill ratio: below 80 % the measured pressure was up to 34 % above the calculation in 19 of 20 loads (single loads
  up to 56 %), at 80 … 90 % up to 27 % (50 %), at 90 … 100 % up to 21 % (34 %), at 100 % and more up to 15 % (22 %).
  The quantiles hardly depend on single loads (±1 point without the most doubtful one), the maxima do. In the
  other direction: below 80 % the calculated pressure was on average 5 % too low, at 80 … 100 % it was unbiased
  (+0.6 %, 0.0 %), at 100 % and more 4.5 % too high.
- Slow powder below 85 % fill: risk of the secondary explosion effect, which no model calculates. A powder counts
  as slow by its peak pressure in a fixed reference load (`referencePressure` in `packages/solver`: the .308 Win.
  example with 43.06 grains), at or below 3470 bar: Vihtavuori N550, Reload Swiss RS60, Norma URP, Rottweil R904,
  Lovex S070 and slower. Until 0.3.0 the rule was Ba ≤ 0.55; Ba is comparable only at the same Q_ex and form
  function, so Lovex S070 (low Q_ex, high Ba, in Explosia's chart next to URP and R904) was missed and Norma 203B
  (in Vihtavuori's chart next to N140) was counted as slow. The bound lies in the gap between N550 (3439 bar) and
  Rottweil R907 (3497 bar); a test checks it against the shipped powders. Rottweil R903 (3366 bar) falls below it,
  although Explosia's chart puts it next to IMR4064, far faster than N550: the model ranks it too slow, which costs
  one warning too many, never one too few. It applies to own powders as well.
- Case capacity (±2 %), powder lot (Ba ±4 %, which matches Reload Swiss's lot tolerance of ±250 bar) and seating
  depth (±0.5 mm) change the peak pressure by about ±8 % (90 % of the combinations).
- Estimated case capacity (see *Case capacity*).

The Vihtavuori powders are fitted to Vihtavuori's velocities together with Sax's measured pressures (`fit_status`),
so the app no longer marks their pressure as not backed.

**Independent check.** The customer loads of the Reload Swiss load data guide 2025 (rifles) were not used for
fitting. Reload Swiss checks them for plausibility only, and their seating depth and pressure are not reliable, so
only the velocity V5 (at 5 m) is compared, with the bullet seated to the C.I.P. maximum cartridge length and the
shipped master data (bullets matched by type or maker, 689 loads; 2026-10-28, `pnpm accuracy` and
`local/scripts/accuracy-dist.ts`, sets rsk and rs):

| class | loads | V0 mean | V0 rms | within ±5 % |
|---|---|---|---|---|
| standard rifle, customer loads | 583 | −2.6 % | 4.7 % | 73 % |
| magnum rifle, customer loads | 106 | −2.3 % | 3.5 % | 83 % |
| same powders, laboratory loads (standard / magnum) | 684 / 188 | −0.7 / −1.7 % | 3.9 / 4.1 % | 81 / 80 % |

The velocity holds up on loads from real rifles with unknown seating: the rms is somewhat higher than on the
laboratory loads for standard rifles and lower for magnums. The model is about 2.5 % low on average against the
customers (median −2.9 % standard, −2.3 % magnum), about 1.3 points more than with the fits of 2026-10-25; V5 is a
few tenths of a percent below V0, so the true bias is a little larger.

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
