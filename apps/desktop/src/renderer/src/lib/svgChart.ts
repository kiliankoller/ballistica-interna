// Pressure, velocity and bullet energy over time as an SVG string (for the report: sharp in PDF).
import type { SimResult } from '@ballistica-interna/solver';
import { fmt } from './units';

export interface ChartLabels {
  pressure: string;
  velocity: string;
  pmaxAllowed: string;
  pmax15: string;
  pmax25: string;
  /** shown when the powder is still burning at muzzle exit */
  burnoutAfterMuzzle?: string;
  /** label of the burnout mark inside the barrel */
  burnout?: string;
}

/** Optional extras of the report chart. */
export interface ChartExtras {
  /** bullet mass [kg]: draws the bullet energy ½ m v² on an inner right axis */
  bulletMass?: number;
  /** phase limits of the form function: marked where the selected curve reaches them */
  z1?: number;
  z2?: number;
}

const niceStep = (range: number, ticks: number) => {
  const raw = range / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
};

export function chartSvg(curves: SimResult[], maxAllowed: number, labels: ChartLabels, width = 1000, height = 520, extras: ChartExtras = {}): string {
  const ok = curves.filter((c) => c.status === 'ok' && c.curve.length > 1);
  if (!ok.length) return '';
  const m = { l: 64, r: 64, t: 30, b: 40 };
  const w = width - m.l - m.r;
  const h = height - m.t - m.b;
  const tMax = Math.max(...ok.map((c) => c.barrelTime)) * 1e3;
  const pTop = Math.max(maxAllowed * 1.1, ...ok.map((c) => c.maxPressure * 1.1)) / 1e5;
  const vTop = Math.max(...ok.map((c) => c.muzzleVelocity)) * 1.1;
  const pStep = niceStep(pTop, 8);
  const pMax = Math.ceil(pTop / pStep) * pStep;
  const vStep = niceStep(vTop, 8);
  const vMax = Math.ceil(vTop / vStep) * vStep;
  const tStep = niceStep(tMax, 6);
  const X = (t: number) => m.l + (t / tMax) * w;
  const Yp = (p: number) => m.t + h - (p / pMax) * h;
  const Yv = (v: number) => m.t + h - (v / vMax) * h;
  const mass = extras.bulletMass ?? 0;
  const eTop = mass > 0 ? Math.max(...ok.map((c) => c.muzzleEnergy)) * 1.1 : 0;
  const eStep = eTop > 0 ? niceStep(eTop, 8) : 1;
  const eMax = eTop > 0 ? Math.ceil(eTop / eStep) * eStep : 1;
  const Ye = (e: number) => m.t + h - (e / eMax) * h;

  const parts: string[] = [];
  const band = (from: number, to: number, cls: string, label: string) => {
    const y1 = Yp(Math.min(to, pMax));
    const y2 = Yp(from);
    parts.push(`<rect x="${m.l}" y="${y1}" width="${w}" height="${Math.max(y2 - y1, 0)}" class="${cls}"/>`);
    parts.push(`<text x="${m.l + 6}" y="${y2 - 5}" class="band-lbl">${label}</text>`);
  };
  const pAllowed = maxAllowed / 1e5;
  if (pAllowed > 0) {
    band(pAllowed, pMax, 'b-over', labels.pmaxAllowed);
    band(pAllowed * 0.85, pAllowed, 'b-15', labels.pmax15);
    band(pAllowed * 0.75, pAllowed * 0.85, 'b-25', labels.pmax25);
  }
  for (let p = 0; p <= pMax + 1e-9; p += pStep) {
    parts.push(`<line x1="${m.l}" x2="${m.l + w}" y1="${Yp(p)}" y2="${Yp(p)}" class="grid"/>`);
    parts.push(`<text x="${m.l - 6}" y="${Yp(p) + 4}" text-anchor="end" class="tick p">${p.toFixed(0)}</text>`);
  }
  for (let v = 0; v <= vMax + 1e-9; v += vStep) {
    parts.push(`<text x="${m.l + w + 6}" y="${Yv(v) + 4}" class="tick v">${v.toFixed(0)}</text>`);
  }
  if (mass > 0) {
    for (let e = eStep; e <= eMax + 1e-9; e += eStep) {
      parts.push(`<text x="${m.l + w - 4}" y="${Ye(e) + 4}" text-anchor="end" class="tick e">${e.toFixed(0)}</text>`);
    }
  }
  for (let t = 0; t <= tMax + 1e-9; t += tStep) {
    parts.push(`<line y1="${m.t}" y2="${m.t + h}" x1="${X(t)}" x2="${X(t)}" class="grid"/>`);
    parts.push(`<text x="${X(t)}" y="${m.t + h + 18}" text-anchor="middle" class="tick">${fmt(t, 2)}</text>`);
  }
  ok.forEach((c, i) => {
    const pts = (f: (q: SimResult['curve'][number]) => number) =>
      c.curve.map((q) => `${X(q.t * 1e3).toFixed(1)},${f(q).toFixed(1)}`).join(' ');
    const op = i === 0 ? 1 : 0.45;
    parts.push(`<polyline points="${pts((q) => Yp(q.p / 1e5))}" class="pc" opacity="${op}"/>`);
    parts.push(`<polyline points="${pts((q) => Yv(q.v))}" class="vc" opacity="${op}"/>`);
    if (mass > 0) parts.push(`<polyline points="${pts((q) => Ye(0.5 * mass * q.v * q.v))}" class="ec" opacity="${op}"/>`);
  });
  const main = ok[0]!;
  // `row` 1 puts the label one line higher, so that marks close to each other stay readable
  const mark = (t: number, label: string, cls = 'mark', row = 0) => {
    parts.push(`<line x1="${X(t)}" x2="${X(t)}" y1="${m.t - row * 14}" y2="${m.t + h}" class="${cls}"/>`);
    parts.push(`<text x="${X(t)}" y="${m.t - 4 - row * 14}" text-anchor="middle" class="tick">${label}</text>`);
  };
  const timeAt = (z: number) => main.curve.find((q) => q.z >= z)?.t;
  for (const [z, label] of [[extras.z1, 'z1'], [extras.z2, 'z2']] as const) {
    const t = z && z < 1 ? timeAt(z) : undefined;
    if (t !== undefined) mark(t * 1e3, label, 'mark z', 1);
  }
  const burnedOut = 0.9995; // the burnt fraction reaches 1 only within the integration tolerance
  const tBurnout = main.burnt >= burnedOut ? timeAt(burnedOut) : undefined;
  if (tBurnout !== undefined) {
    if (labels.burnout) mark(tBurnout * 1e3, labels.burnout, 'mark z', 1);
  }
  else if (labels.burnoutAfterMuzzle) parts.push(`<text x="${m.l + w - 6}" y="${m.t + 14}" text-anchor="end" class="tick">${labels.burnoutAfterMuzzle}</text>`);
  mark(main.maxPressureTime * 1e3, 'Pmax');
  mark((main.barrelTime - main.bulletLeadTime) * 1e3, '10%');
  if (mass > 0) parts.push(`<text x="${m.l + w - 4}" y="${m.t - 16}" text-anchor="end" class="tick e" dx="-22">J</text>`);
  parts.push(`<text x="${m.l}" y="${m.t - 16}" text-anchor="middle" class="tick p">bar</text>`);
  parts.push(`<text x="${m.l + w}" y="${m.t - 16}" text-anchor="middle" class="tick v">m/s</text>`);
  parts.push(`<text x="${m.l + w}" y="${m.t + h + 34}" text-anchor="end" class="tick">ms</text>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" class="chart">
<style>.grid{stroke:#d0d4da;stroke-width:1}.tick{font:12px system-ui,sans-serif;fill:#555}.tick.p{fill:#c0392b}.tick.v{fill:#2d5bd3}
.tick.e{fill:#138a8a}
.pc{fill:none;stroke:#c0392b;stroke-width:2}.vc{fill:none;stroke:#2d5bd3;stroke-width:2}.ec{fill:none;stroke:#138a8a;stroke-width:2;stroke-dasharray:2 4;stroke-linecap:round}
.mark{stroke:#888;stroke-dasharray:6 4}.mark.z{stroke:#2e9b4f}
.b-over{fill:#e7b8d9}.b-15{fill:#f3d2c4}.b-25{fill:#d6e2f1}.band-lbl{font:11px system-ui,sans-serif;fill:#444}</style>
<rect x="${m.l}" y="${m.t}" width="${w}" height="${h}" fill="none" stroke="#999"/>
${parts.join('\n')}
</svg>`;
}
