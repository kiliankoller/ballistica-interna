// Accuracy of what BallisticaInterna ships: the master data powder models (data/powders.csv) against the measured loads
// of every set in fixtures/runs, per class of cartridge, so that the app can state measured figures.
//
//   pnpm accuracy [--by]
//     --by: also the deviation by fill ratio, bullet weight and powder (rifles only, since only rifle powders ship)
//
// Every load whose powder is in the master data is calculated with the master data values instead of the set's
// own ones, with the app's default start pressure (rifle 250, auto pistol 290, revolver 150 bar). Classes: handgun (barrel below
// 300 mm), magnum rifle (case capacity above 5.0 cm³, about 77 grains of water) and standard rifle. Loads used to
// fit a powder are included (two thirds of the calibers of the fitting set), so the figures are slightly
// optimistic for the fitting sets; the velocity-only sets of other makers are independent.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGrtLoad, toLoadInput } from '@ballistica-interna/grtload';
import { chamberVolume, defaultParams, simulate } from '@ballistica-interna/solver';
import { AUTO_PISTOL, PISTOL_START_PRESSURE, REVOLVER_START_PRESSURE, RIFLE_START_PRESSURE } from '../apps/desktop/src/renderer/src/lib/startPressure';

const root = join(import.meta.dirname, '..');
const csv = readFileSync(join(root, 'data', 'powders.csv'), 'utf8').trim().split('\n');
const head = csv[0]!.match(/("[^"]*"|[^,]*)(,|$)/g)!.map((x) => x.replace(/,$/, ''));
const models = new Map<string, Record<string, string>>();
for (const line of csv.slice(1)) {
  const f = line.match(/("[^"]*"|[^,]*)(,|$)/g)!.map((x) => x.replace(/,$/, '').replace(/^"|"$/g, ''));
  const r = Object.fromEntries(head.map((h, i) => [h, f[i] ?? '']));
  models.set(`${r.mname!.replace(/\s/g, '')}|${r.pname!.replace(/\s/g, '')}`, r);
}

type Acc = { n: number; v: number; vv: number; pn: number; p: number; pp: number };
const acc = (): Acc => ({ n: 0, v: 0, vv: 0, pn: 0, p: 0, pp: 0 });
const groups = new Map<string, Acc>();
const by = process.argv.includes('--by');
const rows: { powder: string; fill: number; grains: number; dv: number; dp: number | null }[] = [];
const runs = join(root, 'fixtures', 'runs');
for (const set of existsSync(runs) ? readdirSync(runs).sort() : []) {
  const file = join(runs, set, 'measured.json');
  if (!existsSync(file)) continue;
  const measured = JSON.parse(readFileSync(file, 'utf8')) as Record<string, { maxPressure_bar: number | null; muzzleVelocity_ms: number; match?: string }>;
  for (const [job, m] of Object.entries(measured)) {
    // a bullet matched by its weight alone may be quite another bullet (a lead bullet replaced by a long
    // monolithic one, seated far too deep): such loads are left out
    if (m.match === 'weight') continue;
    const grt = parseGrtLoad(readFileSync(join(runs, set, 'jobs', `${job}.grtload`), 'utf8'));
    const model = models.get(`${String(grt.propellant.mname?.value).replace(/\s/g, '')}|${String(grt.propellant.pname?.value).replace(/\s/g, '')}`);
    if (!model) continue;
    const load = toLoadInput(grt);
    // the app's default start pressure: rifle, auto pistol or revolver (lib/startPressure.ts)
    const handgun = load.gun.barrelLength < 0.3;
    load.projectile.startPressure =
      (handgun ? (AUTO_PISTOL.test(String(grt.caliber.CaliberName?.value ?? '')) ? PISTOL_START_PRESSURE : REVOLVER_START_PRESSURE) : RIFLE_START_PRESSURE) * 1e5;
    Object.assign(load.propellant, {
      Ba: Number(model.Ba), Qex: Number(model.Qex) * 1e3, kappa: Number(model.k), a0: Number(model.a0), a1: Number(model.a1 || 0),
      z1: Number(model.z1), z2: Number(model.z2), materialDensity: Number(model.pc), bulkDensity: Number(model.pcd),
    });
    const r = simulate(load, defaultParams);
    if (r.status !== 'ok') continue;
    const cls = load.gun.barrelLength < 0.3 ? 'handgun' : load.cartridge.caseVolume > 5.0e-6 ? 'magnum rifle' : 'standard rifle';
    if (by && !handgun) {
      rows.push({
        powder: `${grt.propellant.mname?.value} ${grt.propellant.pname?.value}`,
        fill: (load.propellant.charge / (Number(model.pcd) * chamberVolume(load))) * 100,
        grains: load.projectile.mass / 64.79891e-6,
        dv: (r.muzzleVelocity / m.muzzleVelocity_ms - 1) * 100,
        dp: m.maxPressure_bar ? (r.maxPressure / 1e5 / m.maxPressure_bar - 1) * 100 : null,
      });
    }
    for (const key of [`${cls} (all sets)`, `${cls} – ${set}`]) {
      const a = groups.get(key) ?? acc();
      const dv = (r.muzzleVelocity / m.muzzleVelocity_ms - 1) * 100;
      a.n++;
      a.v += dv;
      a.vv += dv * dv;
      if (m.maxPressure_bar) {
        const dp = (r.maxPressure / 1e5 / m.maxPressure_bar - 1) * 100;
        a.pn++;
        a.p += dp;
        a.pp += dp * dp;
      }
      groups.set(key, a);
    }
  }
}
const f = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '—').padStart(6);
console.log('class / set                              n   V0 mean   rms |  n p  Pmax mean   rms');
for (const [k, a] of [...groups].sort(([x], [y]) => x.localeCompare(y))) {
  console.log(`${k.padEnd(36)} ${String(a.n).padStart(5)} ${f(a.v / a.n)} ${f(Math.sqrt(a.vv / a.n))} | ${String(a.pn).padStart(4)} ${f(a.p / a.pn)} ${f(Math.sqrt(a.pp / a.pn))}`);
}

if (by) {
  const table = (title: string, key: (r: (typeof rows)[number]) => string | null, min = 1) => {
    const g = new Map<string, Acc>();
    for (const r of rows) {
      const k = key(r);
      if (k === null) continue;
      const a = g.get(k) ?? acc();
      a.n++;
      a.v += r.dv;
      a.vv += r.dv * r.dv;
      if (r.dp !== null) {
        a.pn++;
        a.p += r.dp;
        a.pp += r.dp * r.dp;
      }
      g.set(k, a);
    }
    console.log(`\n${title}`);
    console.log('                                         n   V0 mean   rms |  n p  Pmax mean   rms');
    for (const [k, a] of [...g].sort(([x], [y]) => x.localeCompare(y, undefined, { numeric: true })).filter(([, a]) => a.n >= min)) {
      console.log(`${k.padEnd(36)} ${String(a.n).padStart(5)} ${f(a.v / a.n)} ${f(Math.sqrt(a.vv / a.n))} | ${String(a.pn).padStart(4)} ${f(a.p / a.pn)} ${f(Math.sqrt(a.pp / a.pn))}`);
    }
  };
  const bin = (x: number, edges: number[], unit: string) => {
    const i = edges.findIndex((e) => x < e);
    const lo = i === 0 ? null : edges[(i === -1 ? edges.length : i) - 1];
    const hi = i === -1 ? null : edges[i];
    return `${String(i === -1 ? edges.length : i).padStart(2, '0')}: ${lo === null ? `< ${hi}` : hi === null ? `≥ ${lo}` : `${lo} … ${hi}`} ${unit}`;
  };
  table('Rifles by fill ratio (charge / bulk density / case volume with the bullet seated)', (r) => bin(r.fill, [60, 70, 80, 90, 100], '%'));
  table('Rifles by bullet weight', (r) => bin(r.grains, [100, 130, 160, 190, 230, 300], 'gr'));
  table('Rifles by powder (30 loads or more)', (r) => r.powder, 30);
}
