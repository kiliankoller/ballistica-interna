// Fits general model parameters to reference data and checks that the result carries over to other powders.
// Runs locally; only parameters that act through the database values of a powder are fitted (no per-powder
// factors), so a result applies to any powder in the database.
//
//   pnpm calibrate [options]
//     --sets rs,lovex            measured sets (fixtures/runs/<set>/measured.json)
//     --fit a,b,...              parameters to fit (default: vivacityExponent,phase2End,covolumeFactor,gauge)
//     --sample n                 at most n loads per set (evenly spread), for speed
//     --iter n                   iterations of the simplex search (default 120)
//     --folds k                  cross-validation over powders: fit on k−1 parts, check on the remaining one
//     --class rifle|handgun      only loads of this class (barrel shorter than 300 mm = handgun)
//
// Measured pressures (C.I.P. gauge) are compared as gauge · model Pmax; `gauge` is fitted with the rest.
// Score per load: (ΔPmax / 5 %)² + (ΔV0 / 2 %)², the accuracy goal. Report: fixtures/calibration/<time>.md
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGrtLoad, toLoadInput } from '@ballistica-interna/grtload';
import { defaultParams, simulate, type LoadInput, type ModelParams } from '@ballistica-interna/solver';

interface Case {
  set: string;
  job: string;
  powder: string;
  handgun: boolean;
  measured: boolean;
  load: LoadInput;
  p: number; // reference peak pressure [bar]
  v: number; // reference muzzle velocity [m/s]
}

type Name = keyof ModelParams | 'gauge';
/** Search range of each parameter that may be fitted. */
const ranges: Partial<Record<Name, [number, number]>> = {
  vivacityExponent: [-0.3, 0.3],
  phase2End: [0, 1.2], // below z1 means: plateau
  phase3Exponent: [0, 1.5],
  phase1Exponent: [0.2, 0.6],
  covolumeFactor: [0.8, 1.6],
  bulletFriction: [0, 6e6],
  heatLoss: [-0.1, 0.15],
  gauge: [0.8, 1.3],
};

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i]!.replace(/^--/, ''), process.argv[i + 1] ?? '');
const sets = (args.get('sets') ?? 'rs').split(',');
const fit = (args.get('fit') ?? 'vivacityExponent,phase2End,covolumeFactor,gauge').split(',') as Name[];
const sample = Number(args.get('sample') ?? 0);
const iterations = Number(args.get('iter') ?? 120);
const folds = Number(args.get('folds') ?? 0);
const onlyClass = args.get('class');
for (const n of fit) if (!ranges[n]) throw new Error(`cannot fit "${n}"; one of ${Object.keys(ranges).join(', ')}`);

const runs = join(import.meta.dirname, '..', 'fixtures', 'runs');

function loadSet(set: string): Case[] {
  const dir = join(runs, set);
  const out: Case[] = [];
  const measuredFile = join(dir, 'measured.json');
  const read = (job: string) => {
    const file = parseGrtLoad(readFileSync(join(dir, 'jobs', `${job}.grtload`), 'utf8'));
    return { load: toLoadInput(file), powder: `${file.propellant.mname?.value ?? ''} ${file.propellant.pname?.value ?? ''}`.trim() };
  };
  if (existsSync(measuredFile)) {
    const measured = JSON.parse(readFileSync(measuredFile, 'utf8')) as Record<string, { maxPressure_bar: number; muzzleVelocity_ms: number; match?: string }>;
    for (const [job, m] of Object.entries(measured)) {
      // a bullet matched by its weight alone may be quite another bullet (a lead bullet replaced by a long
      // monolithic one, seated far too deep): such loads are left out
      if (m.match === 'weight') continue;
      const { load, powder } = read(job);
      out.push({ set, job, powder, handgun: load.gun.barrelLength < 0.3, measured: true, load, p: m.maxPressure_bar, v: m.muzzleVelocity_ms });
    }
  }
  if (sample > 0 && out.length > sample) {
    const step = out.length / sample;
    return Array.from({ length: sample }, (_, i) => out[Math.floor(i * step)]!);
  }
  return out;
}

const cases = sets.flatMap(loadSet).filter((c) => !onlyClass || (onlyClass === 'handgun') === c.handgun);
if (!cases.length) throw new Error('no reference data in the given sets');

type Values = Partial<Record<Name, number>>;
const start: Values = Object.fromEntries(fit.map((n) => [n, n === 'gauge' ? 1 : (defaultParams[n as keyof ModelParams] as number)]));

interface Stats {
  n: number;
  failed: number;
  score: number;
  p: number;
  v: number;
  pp: number;
  vv: number;
}
function evaluate(values: Values, subset: Case[]): { all: Stats; groups: Map<string, Stats> } {
  const params: ModelParams = { ...defaultParams };
  for (const [k, v] of Object.entries(values)) if (k !== 'gauge') (params as unknown as Record<string, number>)[k] = v!;
  const gauge = values.gauge ?? 1;
  const empty = (): Stats => ({ n: 0, failed: 0, score: 0, p: 0, v: 0, pp: 0, vv: 0 });
  const all = empty();
  const groups = new Map<string, Stats>();
  for (const c of subset) {
    const keys = [`${c.set} ${c.handgun ? 'handgun' : 'rifle'}`];
    const r = simulate(c.load, params);
    const targets = [all, ...keys.map((k) => groups.get(k) ?? (groups.set(k, empty()), groups.get(k)!))];
    if (r.status !== 'ok') {
      for (const t of targets) {
        t.failed++;
        t.score += 100; // a load the model cannot shoot counts like a 50 % miss
      }
      continue;
    }
    const dp = ((r.maxPressure / 1e5) * (c.measured ? gauge : 1) / c.p - 1) * 100;
    const dv = (r.muzzleVelocity / c.v - 1) * 100;
    for (const t of targets) {
      t.n++;
      t.score += (dp / 5) ** 2 + (dv / 2) ** 2;
      t.p += dp;
      t.v += dv;
      t.pp += dp * dp;
      t.vv += dv * dv;
    }
  }
  return { all, groups };
}
const meanScore = (s: Stats) => s.score / Math.max(s.n + s.failed, 1);

/** Nelder–Mead on the parameters scaled to [0, 1] within their ranges. */
function minimise(subset: Case[], log: (s: string) => void): Values {
  const toValues = (x: number[]): Values =>
    Object.fromEntries(fit.map((n, i) => {
      const [lo, hi] = ranges[n]!;
      return [n, lo + Math.min(Math.max(x[i]!, 0), 1) * (hi - lo)];
    }));
  const toUnit = (v: Values) => fit.map((n) => {
    const [lo, hi] = ranges[n]!;
    return (v[n]! - lo) / (hi - lo);
  });
  const f = (x: number[]) => meanScore(evaluate(toValues(x), subset).all);
  const d = fit.length;
  let simplex = [toUnit(start)];
  for (let i = 0; i < d; i++) {
    const x = [...simplex[0]!];
    x[i] = x[i]! + (x[i]! < 0.85 ? 0.15 : -0.15);
    simplex.push(x);
  }
  let scores = simplex.map(f);
  for (let it = 0; it < iterations; it++) {
    const order = scores.map((s, i) => [s, i] as const).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
    simplex = order.map((i) => simplex[i]!);
    scores = order.map((i) => scores[i]!);
    if (it % 10 === 0) log(`  iteration ${it}: score ${scores[0]!.toFixed(3)}  ${fmtValues(toValues(simplex[0]!))}`);
    if (scores[d]! - scores[0]! < 1e-4) break;
    const centroid = Array.from({ length: d }, (_, j) => simplex.slice(0, d).reduce((s, x) => s + x[j]!, 0) / d);
    const along = (t: number) => centroid.map((c, j) => c + t * (simplex[d]![j]! - c));
    const reflected = along(-1);
    const fr = f(reflected);
    if (fr < scores[0]!) {
      const expanded = along(-2);
      const fe = f(expanded);
      [simplex[d], scores[d]] = fe < fr ? [expanded, fe] : [reflected, fr];
    } else if (fr < scores[d - 1]!) {
      [simplex[d], scores[d]] = [reflected, fr];
    } else {
      const contracted = along(0.5);
      const fc = f(contracted);
      if (fc < scores[d]!) [simplex[d], scores[d]] = [contracted, fc];
      else {
        for (let i = 1; i <= d; i++) {
          simplex[i] = simplex[i]!.map((x, j) => simplex[0]![j]! + 0.5 * (x - simplex[0]![j]!));
          scores[i] = f(simplex[i]!);
        }
      }
    }
  }
  const best = scores.indexOf(Math.min(...scores));
  return toValues(simplex[best]!);
}

const fmt = (v: number, digits = 1) => (Number.isFinite(v) ? v.toFixed(digits) : '—');
const fmtValues = (v: Values) => Object.entries(v).map(([k, x]) => `${k} ${Number(x!.toPrecision(4))}`).join(', ');
function table(title: string, base: Values, fitted: Values, subset: Case[]): string[] {
  const a = evaluate(base, subset);
  const b = evaluate(fitted, subset);
  const row = (name: string, s: Stats, t: Stats) => {
    const cell = (x: Stats) => (x.n ? `${fmt(x.p / x.n)} / ${fmt(Math.sqrt(x.pp / x.n))} | ${fmt(x.v / x.n)} / ${fmt(Math.sqrt(x.vv / x.n))} | ${fmt(meanScore(x), 2)}` : '— | — | —');
    return `| ${name} | ${s.n + s.failed} | ${cell(s)} | ${cell(t)} |`;
  };
  const lines = [
    `### ${title}`,
    '',
    '| group | loads | today: Pmax mean / rms % | V0 mean / rms % | score | fitted: Pmax mean / rms % | V0 mean / rms % | score |',
    '|---|---|---|---|---|---|---|---|',
    row('all', a.all, b.all),
  ];
  for (const k of [...a.groups.keys()].sort()) lines.push(row(k, a.groups.get(k)!, b.groups.get(k)!));
  return [...lines, ''];
}

const report: string[] = [
  `# Calibration ${new Date().toISOString()}`,
  '',
  `Sets: ${sets.join(', ')} (${cases.length} loads, ${new Set(cases.map((c) => c.powder)).size} powders). Fitted: ${fit.join(', ')}.`,
  'Δ = model − reference; score = mean of (ΔPmax / 5 %)² + (ΔV0 / 2 %)² (below 1: within the goal on average).',
  '',
];
const log = (s: string) => console.log(s);
const today: Values = Object.fromEntries(fit.map((n) => [n, n === 'gauge' ? 1 : (defaultParams[n as keyof ModelParams] as number)]));

log(`fitting on all ${cases.length} loads ...`);
const best = minimise(cases, log);
report.push(`## Fit on all loads`, '', `Result: ${fmtValues(best)}`, '', ...table('All loads', today, best, cases));

if (folds > 1) {
  // powders in a fixed order, dealt into the folds, so that a fold never sees the powders it is checked on
  const powders = [...new Set(cases.map((c) => c.powder))].sort();
  report.push(`## Cross-validation over powders (${folds} folds)`, '');
  for (let k = 0; k < folds; k++) {
    const held = new Set(powders.filter((_, i) => i % folds === k));
    const train = cases.filter((c) => !held.has(c.powder));
    const test = cases.filter((c) => held.has(c.powder));
    log(`fold ${k + 1}/${folds}: fitting without ${[...held].join(', ')} ...`);
    const v = minimise(train, log);
    report.push(`Fold ${k + 1}: fitted without ${[...held].join(', ')} → ${fmtValues(v)}`, '', ...table(`Fold ${k + 1}, checked on the held-out powders`, today, v, test));
  }
}

const outDir = join(import.meta.dirname, '..', 'fixtures', 'calibration');
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
writeFileSync(join(outDir, `${stamp}.md`), report.join('\n'));
writeFileSync(join(outDir, `${stamp}.json`), JSON.stringify({ sets, fit, sample, best }, null, 1));
console.log(report.join('\n'));
console.log(`\nreport: fixtures/calibration/${stamp}.md`);
