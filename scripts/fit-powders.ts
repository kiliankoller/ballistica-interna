// Own powder models: fits a powder's burn values to a maker's measured loads only and checks them on loads of
// calibers not used for fitting.
//
//   pnpm fit-powders [--set rs] [--iter 150] [--powders RS50,RS52] [--datasheet] [--regularise 0.5]
//     --set a,b: several sets together (e.g. v-vihtavuori,sax: velocities of the maker and another source's pressures);
//       --sample applies per set, the cross-validation reports every set as well
//     [--start-pressure 250]
//     --start-pressure bar: start pressure of every bullet; default the app's by gun (rifle 250, auto pistol 290,
//       revolver 150 bar); the bullet records of the measured sets carry values up to 750 bar (monolithic
//       bullets) that push the model's pressure far too high
//     --start-pressure-scale x: the start pressure by gun times x (model work)
//     --pressure-weight w: weight of the pressure deviation in the score (default 1: ΔPmax/5 %; w 2.5: as strict as V0)
//     --class handgun|rifle: only the loads of handguns (barrel below 300 mm) or of rifles
//     --defined-capacity: only the loads of calibers whose case capacity is not an estimate (data/calibers.csv,
//       V_source other than "estimate")
//     --params name=value,…: model parameters other than the defaults (model work, e.g. engravingResistance=3e7)
//     --sample n: at most n loads per powder (evenly spread), for speed with large sets
//     --fold k: the third of the calibers (0, 1 or 2; default 2) held out for the check
//     --cv: cross-validation: all three folds in turn; reports the held-out loads of all folds together (report
//       powders-cv-<time>.md; the fitted values of the fold-2 split are not written)
//     --datasheet: Qex from the makers' datasheets (fixtures/open-db/components.db, powder_datasheet), not fitted
//     --regularise w: adds w · ((a0 − 1)/2)² + ((z1 − 0.5)/0.2)² + ((z2 − 0.8)/0.1)² to the score (typical shape)
// Velocity-only sets (no measured pressure, e.g. v-vihtavuori): the pressure is anchored by the makers' own limit:
// a published maximum load is developed up to the C.I.P. maximum pressure, so the model's Pmax of such a load
// should lie between 80 and 105 % of the caliber's C.I.P. Pmax; outside, (distance / 5 %)² is added.
//
// Own model per powder: Ba, a0, z1, z2 and Qex (3400 … 4400 kJ/kg) fitted; k = 1.23 and pc = 1600 kg/m³
// (typical nitrocellulose powders); pcd from the published fill ratios, else from the datasheet.
// Calibers are dealt into thirds: two thirds fit, one third checks. Score per load: (ΔPmax/5 %)² + (ΔV0/2 %)².
// Report: fixtures/calibration/powders-<time>.md
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { parseGrtLoad, toLoadInput } from '@ballistica-interna/grtload';
import { chamberVolume, simulate, withParams, type LoadInput } from '@ballistica-interna/solver';
import { AUTO_PISTOL, PISTOL_START_PRESSURE, REVOLVER_START_PRESSURE, RIFLE_START_PRESSURE } from '../apps/desktop/src/renderer/src/lib/startPressure';

interface Case {
  set: string;
  job: string;
  caliber: string;
  maker: string;
  load: LoadInput;
  p: number | null;
  v: number;
  fill: number | null;
  /** a published maximum load (job name ending in _max) */
  max: boolean;
}

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i]!.replace(/^--/, '');
  const value = process.argv[i + 1];
  if (value === undefined || value.startsWith('--')) args.set(key, '');
  else args.set(key, value), i++;
}
const sets = (args.get('set') ?? 'rs').split(',');
const set = sets.join('+');
const iterations = Number(args.get('iter') ?? 150);
const only = args.get('powders')?.split(',');
const useDatasheet = args.has('datasheet');
const regularise = Number(args.get('regularise') ?? 0);
const onlyClass = args.get('class');
const definedCapacity = args.has('defined-capacity');
const crossValidate = args.has('cv');
const foldArg = Number(args.get('fold') ?? 2);
const pressureWeight = Number(args.get('pressure-weight') ?? 1);
const modelOverrides = Object.fromEntries((args.get('params') || '').split(',').filter(Boolean).map((kv) => [kv.split('=')[0]!, Number(kv.split('=')[1])]));
const modelParams = withParams(modelOverrides);
const sample = Number(args.get('sample') ?? 0); // at most this many loads per powder, evenly spread
const fixedStartPressure = args.has('start-pressure') ? Number(args.get('start-pressure')) * 1e5 : null;
const startPressureScale = Number(args.get('start-pressure-scale') ?? 1);
// the app's default by gun, as in scripts/accuracy.ts (handgun: barrel below 300 mm)
const gunStartPressure = (load: LoadInput, caliber: string) =>
  (load.gun.barrelLength < 0.3 ? (AUTO_PISTOL.test(caliber) ? PISTOL_START_PRESSURE : REVOLVER_START_PRESSURE) : RIFLE_START_PRESSURE) * 1e5;
const datasheetQex = new Map<string, number>();
const datasheetBulk = new Map<string, number>();
const sheetDb = join(import.meta.dirname, '..', 'fixtures', 'open-db', 'components.db');
if (useDatasheet && existsSync(sheetDb)) {
  const db = new DatabaseSync(sheetDb, { readOnly: true } as ConstructorParameters<typeof DatabaseSync>[1]);
  for (const r of db.prepare('select name, qex_j_g, bulk_density_g_l from powder_datasheet where qex_j_g is not null').all() as { name: string; qex_j_g: number; bulk_density_g_l: number | null }[]) {
    datasheetQex.set(r.name.replace(/\s/g, ''), r.qex_j_g * 1e3);
    if (r.bulk_density_g_l) datasheetBulk.set(r.name.replace(/\s/g, ''), r.bulk_density_g_l);
  }
}

// the folds go by caliber, so the same caliber must have the same name in every set
const caliberKey = (name: string) => decodeURIComponent(name).toLowerCase().replace(/,/g, '.').replace(/[^a-z0-9]/g, '');
// calibers with a case capacity that is not an estimate; the loads name them "cipname (altname)"
const capacityDefined = new Set<string>();
if (definedCapacity) {
  const lines = readFileSync(join(import.meta.dirname, '..', 'data', 'calibers.csv'), 'utf8').trim().split('\n');
  const head = lines[0]!.split(',');
  for (const l of lines.slice(1)) {
    const f = l.match(/("[^"]*"|[^,]*)(,|$)/g)!.map((x) => x.replace(/,$/, '').replace(/^"|"$/g, ''));
    const r = Object.fromEntries(head.map((h, i) => [h, f[i] ?? ''])) as Record<string, string>;
    if (r.V && r.V_source && r.V_source !== 'estimate') capacityDefined.add(caliberKey(r.cipname!));
  }
}
const byPowder = new Map<string, Case[]>();
for (const one of sets) {
  const dir = join(import.meta.dirname, '..', 'fixtures', 'runs', one);
  const measured = JSON.parse(readFileSync(join(dir, 'measured.json'), 'utf8')) as Record<
    string,
    { maxPressure_bar: number | null; muzzleVelocity_ms: number; fill_pct?: number | null; match?: string }
  >;
  const ofSet = new Map<string, Case[]>();
  for (const [job, m] of Object.entries(measured)) {
    // a bullet matched by its weight alone may be quite another bullet (a lead bullet replaced by a long
    // monolithic one, seated far too deep): such loads are left out
    if (m.match === 'weight') continue;
    const file = parseGrtLoad(readFileSync(join(dir, 'jobs', `${job}.grtload`), 'utf8'));
    const powder = decodeURIComponent(String(file.propellant.pname?.value ?? '')).replace(/\s/g, '');
    if (only && !only.includes(powder)) continue;
    const list = ofSet.get(powder) ?? [];
    const load = toLoadInput(file);
    if (onlyClass && (load.gun.barrelLength < 0.3 ? 'handgun' : 'rifle') !== onlyClass) continue;
    const caliber = decodeURIComponent(String(file.caliber.CaliberName?.value ?? ''));
    if (definedCapacity && !capacityDefined.has(caliberKey(caliber.replace(/ \(.*$/, '')))) continue;
    load.projectile.startPressure = fixedStartPressure ?? gunStartPressure(load, caliber) * startPressureScale;
    list.push({ set: one, job, caliber: caliberKey(caliber), maker: decodeURIComponent(String(file.propellant.mname?.value ?? '')), load, p: m.maxPressure_bar ?? null, v: m.muzzleVelocity_ms, fill: m.fill_pct ?? null, max: job.endsWith('_max') });
    ofSet.set(powder, list);
  }
  for (const [powder, all] of ofSet) {
    const cases = sample > 0 && all.length > sample ? Array.from({ length: sample }, (_, i) => all[Math.floor((i * all.length) / sample)]!) : all;
    byPowder.set(powder, [...(byPowder.get(powder) ?? []), ...cases]);
  }
}

type Stats = { n: number; failed: number; score: number; pp: number; vv: number; p: number; v: number; pn: number; anchor: number[] };
function evaluate(cases: Case[], adapt: (l: LoadInput) => LoadInput): Stats {
  const s: Stats = { n: 0, failed: 0, score: 0, pp: 0, vv: 0, p: 0, v: 0, pn: 0, anchor: [] };
  for (const c of cases) {
    const r = simulate(adapt(c.load), modelParams);
    if (r.status !== 'ok') {
      s.failed++;
      s.score += 100;
      continue;
    }
    const dv = (r.muzzleVelocity / c.v - 1) * 100;
    s.n++;
    s.score += (dv / 2) ** 2;
    s.vv += dv * dv;
    s.v += dv;
    if (c.p) {
      const dp = (r.maxPressure / 1e5 / c.p - 1) * 100;
      s.score += (pressureWeight * dp / 5) ** 2;
      s.pp += dp * dp;
      s.p += dp;
      s.pn++;
    } else if (c.max && c.load.cartridge.maxPressure > 0) {
      const ratio = r.maxPressure / c.load.cartridge.maxPressure;
      s.anchor.push(ratio);
      if (ratio > 1.05) s.score += ((ratio - 1.05) / 0.05) ** 2;
      if (ratio < 0.8) s.score += ((0.8 - ratio) / 0.05) ** 2;
    }
  }
  return s;
}
const mean = (s: Stats) => s.score / Math.max(s.n + s.failed, 1);

/** Nelder–Mead in the unit cube (values outside are clamped by the caller's mapping). */
function nelderMead(f: (x: number[]) => number, x0: number[], iter: number): number[] {
  const d = x0.length;
  let simplex = [x0, ...x0.map((_, i) => x0.map((x, j) => (i === j ? x + (x < 0.8 ? 0.15 : -0.15) : x)))];
  let scores = simplex.map(f);
  for (let it = 0; it < iter; it++) {
    const order = scores.map((s, i) => [s, i] as const).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
    simplex = order.map((i) => simplex[i]!);
    scores = order.map((i) => scores[i]!);
    if (scores[d]! - scores[0]! < 1e-4) break;
    const c = Array.from({ length: d }, (_, j) => simplex.slice(0, d).reduce((s, x) => s + x[j]!, 0) / d);
    const along = (t: number) => c.map((cj, j) => cj + t * (simplex[d]![j]! - cj));
    const r = along(-1);
    const fr = f(r);
    if (fr < scores[0]!) {
      const e = along(-2);
      const fe = f(e);
      [simplex[d], scores[d]] = fe < fr ? [e, fe] : [r, fr];
    } else if (fr < scores[d - 1]!) [simplex[d], scores[d]] = [r, fr];
    else {
      const k = along(0.5);
      const fk = f(k);
      if (fk < scores[d]!) [simplex[d], scores[d]] = [k, fk];
      else
        for (let i = 1; i <= d; i++) {
          simplex[i] = simplex[i]!.map((x, j) => simplex[0]![j]! + 0.5 * (x - simplex[0]![j]!));
          scores[i] = f(simplex[i]!);
        }
    }
  }
  return simplex[scores.indexOf(Math.min(...scores))]!;
}

const clamp = (x: number) => Math.min(Math.max(x, 0), 1);
/** Unit cube → own powder values: Ba log-scaled 0.1 … 10, a0 −1 … 5, z1 0.05 … 0.95, z2 between z1 and 0.99. */
function own(x: number[], pcd: number, qex?: number) {
  const z1 = 0.05 + 0.9 * clamp(x[2]!);
  return {
    Ba: 0.1 * Math.pow(100, clamp(x[0]!)),
    a0: -1 + 6 * clamp(x[1]!),
    z1,
    z2: z1 + (0.99 - z1) * clamp(x[3]!),
    Qex: qex ?? (3400 + 1000 * clamp(x[4]!)) * 1e3,
    kappa: 1.23,
    materialDensity: 1600,
    bulkDensity: pcd,
  };
}
const shapePenalty = (v: { a0: number; z1: number; z2: number }) =>
  regularise * (((v.a0 - 1) / 2) ** 2 + ((v.z1 - 0.5) / 0.2) ** 2 + ((v.z2 - 0.8) / 0.1) ** 2);
const withPowder = (values: Partial<LoadInput['propellant']>) => (l: LoadInput): LoadInput => ({ ...l, propellant: { ...l.propellant, ...values } });

const report: string[] = [
  `# Own powder models (${set}, ${new Date().toISOString()}${useDatasheet ? ', Qex from datasheets' : ''}${regularise ? `, regularised ${regularise}` : ''}${onlyClass ? `, ${onlyClass} loads` : ''}${definedCapacity ? ', defined case capacities only' : ''}${Object.keys(modelOverrides).length ? `, ${args.get('params')}` : ''}, start pressure ${fixedStartPressure === null ? `by gun${startPressureScale !== 1 ? ` × ${startPressureScale}` : ''}` : `${fixedStartPressure / 1e5} bar`})`,
  '',
  'Checked on calibers not used for fitting. Δ = model − measured; score = mean (ΔPmax/5 %)² + (ΔV0/2 %)².',
  '',
  '| powder | loads fit / check | Pmax mean / rms | V0 mean / rms | score | values |',
  '|---|---|---|---|---|---|',
];
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]! : NaN);
const cell = (s: Stats) =>
  `${s.pn ? `${(s.p / s.pn).toFixed(1)} / ${Math.sqrt(s.pp / s.pn).toFixed(1)}` : `max. loads at ${(median(s.anchor) * 100).toFixed(0)} % of C.I.P.`} | ${(s.v / s.n).toFixed(1)} / ${Math.sqrt(s.vv / s.n).toFixed(1)} | ${mean(s).toFixed(2)}${s.failed ? ` (${s.failed} failed)` : ''}`;
if (crossValidate) {
  report.splice(2, report.length - 2,
    '',
    'Cross-validation: every third caliber in turn is held out, the powder is fitted on the rest and checked on the held-out calibers; all folds together. Δ = model − measured, in %.',
    '',
    '| powder | held-out loads | Pmax mean / rms (held out) | V0 mean / rms (held out) | Pmax rms (fit) | V0 rms (fit) |',
    '|---|---|---|---|---|---|');
}
const total = { n: 0, score: 0 };
const fitted: Record<string, unknown> = {};

/** Fits one powder on the calibers outside the fold and checks it on the calibers of the fold. */
function fitFold(powder: string, cases: Case[], fold: number) {
  const calibers = [...new Set(cases.map((c) => c.caliber))].sort();
  const held = new Set(calibers.filter((_, i) => i % 3 === fold));
  const train = cases.filter((c) => !held.has(c.caliber));
  const test = cases.filter((c) => held.has(c.caliber));
  if (train.length < 6 || test.length < 2) return null;
  // bulk density from the published fill ratios of the training loads (median)
  const pcds = train.filter((c) => c.fill).map((c) => c.load.propellant.charge / ((c.fill! / 100) * chamberVolume(c.load))).sort((a, b) => a - b);
  // without published fill ratios (velocity-only sets) the datasheet's bulk density
  const pcd = pcds[Math.floor(pcds.length / 2)] ?? datasheetBulk.get(powder) ?? 950;
  const qex = useDatasheet ? datasheetQex.get(powder) : undefined;
  // own model: coarse scan of Ba first, then the simplex on all five values (four with the datasheet's Qex)
  let x0 = [0.5, 0.33, 0.5, 0.5, 0.5];
  let bestScan = Infinity;
  for (let u = 0; u <= 1.0001; u += 0.05) {
    const x = [u, 0.33, 0.5, 0.5, 0.5];
    const s = mean(evaluate(train, withPowder(own(x, pcd, qex)))) + shapePenalty(own(x, pcd, qex));
    if (s < bestScan) [bestScan, x0] = [s, x];
  }
  const x = nelderMead((y) => mean(evaluate(train, withPowder(own(y, pcd, qex)))) + shapePenalty(own(y, pcd, qex)), x0, iterations);
  const values = own(x, pcd, qex);
  const bySet = new Map(sets.map((one) => [one, evaluate(test.filter((c) => c.set === one), withPowder(values))]));
  return { train, test, pcd, values, mine: evaluate(test, withPowder(values)), inSample: evaluate(train, withPowder(values)), bySet };
}

const sum = (a: Stats, b: Stats): Stats => ({
  n: a.n + b.n, failed: a.failed + b.failed, score: a.score + b.score, pp: a.pp + b.pp, vv: a.vv + b.vv,
  p: a.p + b.p, v: a.v + b.v, pn: a.pn + b.pn, anchor: [...a.anchor, ...b.anchor],
});
const empty = (): Stats => ({ n: 0, failed: 0, score: 0, pp: 0, vv: 0, p: 0, v: 0, pn: 0, anchor: [] });
const cv = { held: empty(), fit: empty() };
const cvBySet = new Map(sets.map((one) => [one, empty()]));
const rms = (ss: number, n: number) => (n ? Math.sqrt(ss / n).toFixed(1) : '–');
// every held-out load of the cross-validation, for the distribution of the deviations (powders-cv-<time>.loads.json)
const heldLoads: { set: string; job: string; powder: string; caliber: string; max: boolean; cip_bar: number; p_bar: number | null; p_calc_bar: number; v: number; v_calc: number; fill_pct: number | null }[] = [];

for (const [powder, cases] of [...byPowder].sort()) {
  if (useDatasheet && datasheetQex.get(powder) === undefined) {
    console.log(`${powder}: no datasheet, left out`);
    continue;
  }
  if (crossValidate) {
    let held = empty();
    let fit = empty();
    let folds = 0;
    for (const fold of [0, 1, 2]) {
      const r = fitFold(powder, cases, fold);
      if (!r) continue;
      held = sum(held, r.mine);
      for (const c of r.test) {
        const one = simulate(withPowder(r.values)(c.load), modelParams);
        if (one.status !== 'ok') continue;
        heldLoads.push({
          set: c.set, job: c.job, powder: `${c.maker} ${powder}`, caliber: c.caliber, max: c.max, cip_bar: c.load.cartridge.maxPressure / 1e5,
          p_bar: c.p, p_calc_bar: one.maxPressure / 1e5, v: c.v, v_calc: one.muzzleVelocity, fill_pct: c.fill,
        });
      }
      for (const [one, st] of r.bySet) cvBySet.set(one, sum(cvBySet.get(one)!, st));
      fit = sum(fit, r.inSample);
      folds++;
    }
    if (folds < 3) {
      console.log(`${powder}: too few loads (${cases.length})`);
      continue;
    }
    cv.held = sum(cv.held, held);
    cv.fit = sum(cv.fit, fit);
    const row = `| ${powder} | ${held.n} | ${held.pn ? `${(held.p / held.pn).toFixed(1)} / ${rms(held.pp, held.pn)}` : '–'} | ${(held.v / held.n).toFixed(1)} / ${rms(held.vv, held.n)} | ${held.pn ? rms(fit.pp, fit.pn) : '–'} | ${rms(fit.vv, fit.n)} |`;
    report.push(row);
    console.log(row);
    continue;
  }
  const r = fitFold(powder, cases, foldArg);
  if (!r) {
    console.log(`${powder}: too few loads (${cases.length})`);
    continue;
  }
  const { train, test, pcd, values, mine } = r;
  total.n += test.length;
  total.score += mine.score;
  const shown = `Ba ${values.Ba.toFixed(3)}, a0 ${values.a0.toFixed(2)}, z1 ${values.z1.toFixed(2)}, z2 ${values.z2.toFixed(2)}, Qex ${(values.Qex / 1e3).toFixed(0)}, pcd ${pcd.toFixed(0)}`;
  report.push(`| ${powder} | ${train.length} / ${test.length} | ${cell(mine)} | ${shown} |`);
  const handgunShare = cases.filter((c) => c.load.gun.barrelLength < 0.3).length / cases.length;
  fitted[powder] = { ...values, maker: cases[0]!.maker, handgun_share: handgunShare, score_check: mean(mine), loads_fit: train.length, loads_check: test.length };
  console.log(report[report.length - 1]);
}
if (crossValidate) {
  report.push('', `All powders: held out V0 mean ${(cv.held.v / cv.held.n).toFixed(1)} %, rms ${rms(cv.held.vv, cv.held.n)} % (fit ${rms(cv.fit.vv, cv.fit.n)} %)${cv.held.pn ? `; Pmax mean ${(cv.held.p / cv.held.pn).toFixed(1)} %, rms ${rms(cv.held.pp, cv.held.pn)} % (fit ${rms(cv.fit.pp, cv.fit.pn)} %)` : ''}; ${cv.held.n} loads.`);
  if (sets.length > 1)
    for (const [one, st] of cvBySet)
      report.push(`- ${one}: held out ${st.n} loads, V0 mean ${(st.v / st.n).toFixed(1)} %, rms ${rms(st.vv, st.n)} %${st.pn ? `; Pmax mean ${(st.p / st.pn).toFixed(1)} %, rms ${rms(st.pp, st.pn)} % (${st.pn} loads)` : ''}`);
} else report.push('', `Overall score on the check loads: ${(total.score / total.n).toFixed(2)}.`);

const outDir = join(import.meta.dirname, '..', 'fixtures', 'calibration');
mkdirSync(outDir, { recursive: true });
const file = join(outDir, `powders-${crossValidate ? 'cv-' : ''}${new Date().toISOString().replace(/[:.]/g, '-')}.md`);
writeFileSync(file, report.join('\n'));
if (crossValidate) writeFileSync(file.replace(/\.md$/, '.loads.json'), JSON.stringify(heldLoads));
if (!crossValidate) writeFileSync(file.replace(/\.md$/, '.json'), JSON.stringify({ set, class: onlyClass ?? null, params: { ...modelOverrides, ...(pressureWeight !== 1 ? { pressureWeight } : {}), ...(startPressureScale !== 1 ? { startPressureScale } : {}) }, datasheet: useDatasheet, regularise, startPressure_bar: fixedStartPressure === null ? 'by gun' : fixedStartPressure / 1e5, fitted }, null, 1));
console.log(report.slice(crossValidate && sets.length > 1 ? -1 - sets.length : -1).join('\n'), `\nreport: ${file}`);
