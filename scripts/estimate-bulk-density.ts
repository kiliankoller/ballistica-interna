// Estimates the bulk density of powders whose makers publish none, from the loads they mark as compressed.
//
//   pnpm bulk-density [--sets hodgdon,ramshot]   → fixtures/calibration/bulk-density.json
//
// A compressed load fills the space below the bullet completely, so the bulk density is at most charge / space;
// a load not marked compressed leaves room, so it is above charge / space. With r = charge / space of every load
// of a powder, the estimate is the value that separates the two groups best: the r that misclassifies the fewest
// loads (ties: the middle of the best range). Space below the bullet: chamberVolume of the solver (case capacity
// minus the part of the bullet inside the case). Needs loads of both kinds; the result is marked as estimated and
// counts as reliable when at most a quarter of the compressed loads falls on the wrong side. Checked locally
// against a component database: Hodgdon and IMR within −2 % (median), ±6 % (mean); the model uses the bulk
// density for the fill ratio only, not for pressure or velocity.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGrtLoad, toLoadInput } from '@ballistica-interna/grtload';
import { chamberVolume } from '@ballistica-interna/solver';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i]!.replace(/^--/, ''), process.argv[i + 1] ?? '');
const sets = (args.get('sets') || 'hodgdon,ramshot').split(',');
const root = join(import.meta.dirname, '..', 'fixtures');

interface Point {
  r: number;
  compressed: boolean;
}
const byPowder = new Map<string, { maker: string; name: string; points: Point[]; sets: Set<string> }>();
for (const set of sets) {
  const dir = join(root, 'runs', set);
  const measured = JSON.parse(readFileSync(join(dir, 'measured.json'), 'utf8')) as Record<string, { source?: string }>;
  const loads = JSON.parse(readFileSync(join(root, 'reference', `${set}.json`), 'utf8')) as { line: number; notes: string }[];
  const byLine = new Map(loads.map((l) => [l.line, l]));
  for (const [job, m] of Object.entries(measured)) {
    const line = Number(/line (\d+)/.exec(m.source ?? '')?.[1]);
    const src = byLine.get(line);
    if (!src) continue;
    const file = parseGrtLoad(readFileSync(join(dir, 'jobs', `${job}.grtload`), 'utf8'));
    const load = toLoadInput(file);
    const space = chamberVolume(load);
    if (!(space > 0)) continue;
    const maker = String(file.propellant.mname?.value ?? '');
    const name = String(file.propellant.pname?.value ?? '');
    const key = `${maker} ${name}`;
    const entry = byPowder.get(key) ?? { maker, name, points: [], sets: new Set<string>() };
    entry.points.push({ r: load.propellant.charge / space, compressed: /compressed/.test(src.notes) });
    entry.sets.add(set);
    byPowder.set(key, entry);
  }
}

const result: Record<string, unknown> = {};
const lines: string[] = [];
for (const [key, { maker, name, points, sets: from }] of [...byPowder].sort()) {
  const c = points.filter((p) => p.compressed).length;
  if (c < 2 || points.length - c < 2) continue;
  // candidate thresholds between neighbouring ratios: below → not compressed, at or above → compressed
  const rs = [...new Set(points.map((p) => p.r))].sort((a, b) => a - b);
  let best = Infinity;
  let range: [number, number] = [rs[0]!, rs[0]!];
  for (let i = 0; i <= rs.length; i++) {
    const t = i === 0 ? rs[0]! - 1 : i === rs.length ? rs[rs.length - 1]! + 1 : (rs[i - 1]! + rs[i]!) / 2;
    const wrong = points.filter((p) => (p.r >= t) !== p.compressed).length;
    if (wrong < best) [best, range] = [wrong, [t, t]];
    else if (wrong === best) range = [range[0], t];
  }
  const estimate = (range[0] + range[1]) / 2;
  // reliable when at most a quarter of the compressed loads (at least one) falls on the wrong side
  const reliable = best <= Math.max(1, c / 4);
  result[key] = { maker, name, bulkDensity: Math.round(estimate), loads: points.length, compressed: c, misclassified: best, reliable, sets: [...from] };
  lines.push(`${key.padEnd(28)} ${Math.round(estimate).toString().padStart(5)} kg/m³   ${points.length} loads, ${c} compressed, ${best} misclassified${reliable ? '' : '  (not reliable)'}`);
}
console.log(lines.join('\n'));
const out = join(root, 'calibration');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'bulk-density.json'), JSON.stringify(result, null, 1));
console.log(`${lines.length} powders → fixtures/calibration/bulk-density.json`);
