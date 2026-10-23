// Compares the model with measured loads: the makers' laboratory data and own measurements.
//   pnpm reference          every measured set in fixtures/runs/ and every own case in fixtures/
//   pnpm reference <name>   one set or case
//
// A measured set is fixtures/runs/<set>/{jobs/*.grtload, measured.json}: one load per job with the measured peak
// pressure (bar, may be null for velocity-only data) and muzzle velocity, built from a maker's published data.
// An own case is fixtures/<case>/{load.grtload, expected.json} whose "measured" object holds own measurements
// (chronograph, pressure).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGrtLoad, toLoadInput } from '@ballistica-interna/grtload';
import { defaultParams, fillRatio, simulate, type LoadInput } from '@ballistica-interna/solver';

const fixtures = join(import.meta.dirname, '..', 'fixtures');
const only = process.argv[2];
const readLoad = (path: string): LoadInput => toLoadInput(parseGrtLoad(readFileSync(path, 'utf8')));
const dev = (got: number, want: number) => ((got - want) / want) * 100;
const fmt = (v: number, digits = 4) => (Number.isFinite(v) ? v.toFixed(digits) : '—');

/** An own load with own measurements (expected.json → measured). */
function compareCase(name: string) {
  const dir = join(fixtures, name);
  const measured = (JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf8')) as { measured?: Record<string, unknown> }).measured;
  if (!measured) return;
  const load = readLoad(join(dir, 'load.grtload'));
  const r = simulate(load, defaultParams);
  const actual: Record<string, number> = { maxPressure_bar: r.maxPressure / 1e5, muzzleVelocity_ms: r.muzzleVelocity };
  console.log(`\n${name}: own measurement (${String(measured.source ?? '')}), model status ${r.status}`);
  console.log('quantity'.padEnd(22), 'measured'.padStart(10), 'model'.padStart(10), 'dev %'.padStart(8));
  for (const [key, want] of Object.entries(measured)) {
    if (typeof want !== 'number' || actual[key] === undefined) continue;
    console.log(key.padEnd(22), String(want).padStart(10), fmt(actual[key]!, 1).padStart(10), fmt(dev(actual[key]!, want), 2).padStart(8));
  }
}

interface Measured {
  match?: string;
  fill_pct?: number | null;
  maxPressure_bar: number | null;
  muzzleVelocity_ms: number;
}

type Acc = { n: number; pn: number; p: number; v: number; pp: number; vv: number };
const acc = (): Acc => ({ n: 0, pn: 0, p: 0, v: 0, pp: 0, vv: 0 });
/** a load without a measured pressure counts for V0 alone (pn: loads with pressure) */
function add(a: Acc, dp: number, dv: number) {
  a.n++;
  if (Number.isFinite(dp)) {
    a.pn++;
    a.p += dp;
    a.pp += dp * dp;
  }
  a.v += dv;
  a.vv += dv * dv;
}
const line = (a: Acc) =>
  `${String(a.n).padStart(5)} ${fmt(a.p / a.pn, 1).padStart(6)} ${fmt(Math.sqrt(a.pp / a.pn), 1).padStart(6)} ${fmt(a.v / a.n, 1).padStart(6)} ${fmt(Math.sqrt(a.vv / a.n), 1).padStart(6)}`;
const summary = new Map<string, Acc>();

/** The model against the measured peak pressure and velocity of a set, grouped by class and bullet match. */
function compareMeasured(set: string) {
  const dir = join(fixtures, 'runs', set);
  const measured = JSON.parse(readFileSync(join(dir, 'measured.json'), 'utf8')) as Record<string, Measured>;
  const groups = new Map<string, Acc>();
  const worst: { job: string; dp: number; dv: number }[] = [];
  let offGeometry = 0;
  for (const [job, m] of Object.entries(measured)) {
    // a bullet matched by its weight alone may be quite another bullet (a lead bullet replaced by a long
    // monolithic one, seated far too deep): such loads are left out
    if (m.match === 'weight') continue;
    const load = readLoad(join(dir, 'jobs', `${job}.grtload`));
    // the published fill ratio checks the chamber: a wrong bullet length or seating depth shows here
    if (m.fill_pct && Math.abs((fillRatio(load) * 100) / m.fill_pct - 1) > 0.05) {
      offGeometry++;
      continue;
    }
    const r = simulate(load, defaultParams);
    if (r.status !== 'ok') continue;
    const dp = m.maxPressure_bar ? dev(r.maxPressure / 1e5, m.maxPressure_bar) : NaN;
    const dv = dev(r.muzzleVelocity, m.muzzleVelocity_ms);
    const cls = load.gun.barrelLength < 0.3 ? 'handgun' : 'rifle';
    for (const key of [`${cls} all`, `${cls} bullet ${m.match ?? '?'}`]) {
      const g = groups.get(key) ?? acc();
      add(g, dp, dv);
      groups.set(key, g);
    }
    const s = summary.get(`${set} ${cls}`) ?? acc();
    add(s, dp, dv);
    summary.set(`${set} ${cls}`, s);
    worst.push({ job, dp, dv });
  }
  console.log(`\n${set}: measured values     Δ = calculated − measured in %`);
  console.log(`${offGeometry} jobs left out: fill ratio more than 5 % off the published one (chamber geometry)`);
  console.log(''.padEnd(22), '    n  Pmax mean/rms   V0 mean/rms');
  for (const [key, g] of [...groups].sort(([a], [b]) => a.localeCompare(b))) console.log(key.padEnd(22), line(g));
  const byP = worst.some((w) => Number.isFinite(w.dp));
  worst.sort((a, b) => (byP ? Math.abs(b.dp || 0) - Math.abs(a.dp || 0) : Math.abs(b.dv) - Math.abs(a.dv)));
  console.log(byP ? 'largest pressure deviations:' : 'largest velocity deviations:');
  for (const w of worst.slice(0, 8)) console.log(' ', w.job.padEnd(44), `ΔPmax ${fmt(w.dp, 1)}  ΔV0 ${fmt(w.dv, 1)}`);
}

for (const name of readdirSync(fixtures)) {
  if (name === 'runs' || (only && name !== only)) continue;
  if (existsSync(join(fixtures, name, 'expected.json'))) compareCase(name);
}
const runsDir = join(fixtures, 'runs');
if (existsSync(runsDir)) {
  for (const set of readdirSync(runsDir).sort()) {
    if (only && set !== only) continue;
    if (existsSync(join(runsDir, set, 'measured.json'))) compareMeasured(set);
  }
}

if (summary.size > 1) {
  console.log('\nsummary                       n  Pmax mean/rms   V0 mean/rms');
  for (const [key, a] of summary) console.log(key.padEnd(22), line(a));
}
