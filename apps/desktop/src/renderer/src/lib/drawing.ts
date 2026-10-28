// Cartridge and chamber drawings from the C.I.P. dimensions of the caliber record, as SVG strings
// (shared by the window and the report). Upright like a technical drawing: case head at the bottom.
import { fmt } from './units';
import type { GrtSection } from '@ballistica-interna/grtload';

const n = (s: GrtSection, k: string) => Number(s[k]?.value ?? 0) || 0;

export interface CipRow {
  key: string;
  value: string;
  unit: string;
}

/** The C.I.P. values shown next to the drawing. */
export function cipTable(cf: GrtSection, capacityGrains: string): CipRow[] {
  const rows: CipRow[] = [];
  const add = (key: string, unit: string, decimals = 2, label = key) => {
    const v = n(cf, key);
    if (v) rows.push({ key: label, value: fmt(v, decimals), unit });
  };
  add('Pmax', 'bar', 0);
  add('PK', 'bar', 0);
  add('PE', 'bar', 0);
  add('EE', 'J', 0);
  if (n(cf, 'c_Q')) rows.push({ key: 'Q', value: fmt(n(cf, 'c_Q'), 3), unit: 'mm²' });
  if (capacityGrains) rows.push({ key: 'V', value: capacityGrains, unit: 'gr H2O' });
  for (const k of ['E', 'E1', 'Emin', 'f', 'G1', 'H1', 'H2', 'L1', 'L2', 'L3', 'L6', 'M', 'P1', 'P2', 'R', 'R1', 'r1min', 'r2', 'S']) add(k, 'mm');
  add('alpha', '°', 1);
  return rows;
}

/** The chamber values (prefix c_ in the record). */
export function chamberTable(cf: GrtSection): CipRow[] {
  const rows: CipRow[] = [];
  const add = (key: string, unit: string, decimals = 2) => {
    const v = n(cf, `c_${key}`);
    if (v) rows.push({ key: key.replace(/_$/, ''), value: fmt(v, decimals), unit });
  };
  for (const k of ['L1', 'L2', 'L3', 'P1', 'P2', 'H1', 'H2', 'R1', 'E', 'G1', 'G', 'i_', 'F', 'Z', 'N', 'u_', 'S']) add(k, k === 'N' ? '' : 'mm', k === 'N' ? 0 : 2);
  add('alpha', '°', 1);
  add('alpha1', '′', 1);
  return rows;
}

type Profile = [x: number, d: number][]; // position along the axis [mm], diameter [mm]

interface Dim {
  label: string;
  x: number;
}

interface DiaLabel {
  label: string;
  x: number;
  d: number;
}

interface Part {
  profile: Profile;
  fill: string;
  stroke: string;
  /** closed solid (cartridge) or open contour (chamber wall) */
  solid: boolean;
}

const GRADIENTS = `<defs>
<linearGradient id="brass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7d5a1e"/><stop offset=".45" stop-color="#e8c97a"/><stop offset="1" stop-color="#8a6422"/></linearGradient>
<linearGradient id="copper" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7a3c1e"/><stop offset=".45" stop-color="#f0a77c"/><stop offset="1" stop-color="#8a4421"/></linearGradient>
<pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#8a8f98" stroke-width="2"/></pattern>
</defs>`;

/** Upright drawing: the axis is vertical, x = 0 (case head) at the bottom. */
function render(parts: Part[], length: number, maxD: number, dims: Dim[], dias: DiaLabel[]): string {
  const s = 10; // px per mm
  // the diameter labels sit left of the drawing: about 11 px per character of the 19 px font
  const labelWidth = Math.max(0, ...dias.map((d) => d.label.length * 11));
  const margin = { l: Math.max(150, labelWidth + 50), r: 150, t: 30, b: 30 };
  const W = maxD * s + margin.l + margin.r;
  const H = length * s + margin.t + margin.b;
  const cx = margin.l + (maxD * s) / 2;
  const Y = (x: number) => margin.t + (length - x) * s;
  const R = (d: number) => (d / 2) * s;

  const path = (p: Profile, solid: boolean) => {
    const right = p.map(([x, d]) => `${(cx + R(d)).toFixed(1)},${Y(x).toFixed(1)}`);
    const left = [...p].reverse().map(([x, d]) => `${(cx - R(d)).toFixed(1)},${Y(x).toFixed(1)}`);
    return solid ? `M${right.join(' L')} L${left.join(' L')} Z` : `M${right.join(' L')} M${left.join(' L')}`;
  };
  const shapes = parts
    .map((p) =>
      p.solid
        ? `<path d="${path(p.profile, true)}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="2"/>`
        : `<path d="${path(p.profile, false)}" fill="none" stroke="${p.stroke}" stroke-width="3"/>`,
    )
    .join('');

  // length dimensions on the right, stacked outwards
  const baseX = cx + R(maxD) + 20;
  const lengths = dims
    .map((d, i) => {
      const x = baseX + 26 + i * 26;
      return (
        `<line x1="${cx + 4}" y1="${Y(d.x)}" x2="${x + 6}" y2="${Y(d.x)}" class="ext"/>` +
        `<line x1="${x}" y1="${Y(0)}" x2="${x}" y2="${Y(d.x)}" class="dim" marker-start="url(#arr)" marker-end="url(#arr)"/>` +
        `<text x="${x - 5}" y="${(Y(0) + Y(d.x)) / 2}" class="lbl" transform="rotate(-90 ${x - 5} ${(Y(0) + Y(d.x)) / 2})" text-anchor="middle">${d.label}</text>`
      );
    })
    .join('');
  // diameter labels on the left with leader lines
  const diameters = dias
    .map((d) => {
      const y = Y(d.x);
      return (
        `<line x1="${cx - R(d.d)}" y1="${y}" x2="${margin.l - 30}" y2="${y}" class="ext"/>` +
        `<text x="${margin.l - 34}" y="${y + 7}" class="lbl" text-anchor="end">${d.label}</text>`
      );
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W + dims.length * 26} ${H}" class="drawing-svg">${GRADIENTS}
<defs><marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
<style>.dim{stroke:currentColor;stroke-width:1.5}.ext{stroke:currentColor;stroke-width:1;stroke-dasharray:5 4;opacity:.7}.lbl{fill:currentColor;font:600 19px system-ui,sans-serif}.axis{stroke:currentColor;stroke-width:1;stroke-dasharray:16 5 3 5;opacity:.5}</style>
<line x1="${cx}" y1="${Y(length) - 12}" x2="${cx}" y2="${Y(0) + 12}" class="axis"/>
${shapes}${lengths}${diameters}</svg>`;
}

/**
 * Cartridge with the seated bullet. Lengths in mm; `caseLength` is the load's (measured) case length,
 * the C.I.P. maximum is used without it. Returns null without C.I.P. data.
 */
export function cartridgeSvg(cf: GrtSection, bulletLength: number, seatingDepth: number, caseLength = 0): string | null {
  const L1 = n(cf, 'L1');
  const L2 = n(cf, 'L2');
  const L3 = caseLength > 0 ? caseLength : n(cf, 'L3');
  const L6 = n(cf, 'L6');
  const P1 = n(cf, 'P1');
  if (!(L3 > 0 && P1 > 0)) return null;
  const P2 = n(cf, 'P2') || P1;
  const H1 = n(cf, 'H1') || P2;
  const H2 = n(cf, 'H2') || H1;
  const G1 = n(cf, 'G1') || H2 - 0.8;
  const R1 = n(cf, 'R1') || P1;
  const rim = n(cf, 'R') || 1.2;
  const E = n(cf, 'E') || rim + 2;
  const E1 = n(cf, 'E1') || R1 * 0.85;
  const shoulder = L1 > 0 ? L1 : L3 * 0.75;
  const neck = L2 > 0 ? L2 : L3 * 0.85;

  const caseProfile: Profile = [
    [0, R1],
    [rim, R1],
    [rim + 0.3, E1],
    [E - 0.8, E1],
    [E, P1],
    [shoulder, P2],
    [neck, H1],
    [L3, H2],
  ];
  const base = seatingDepth > 0 ? L3 - seatingDepth : L3 - G1;
  const tip = bulletLength > 0 ? base + bulletLength : Math.max(L6, L3 + G1);
  const ogive = Math.min(Math.max(tip - L3, G1), 3.2 * G1);
  const ogiveStart = tip - ogive;
  const bulletProfile: Profile = [[base, G1], [ogiveStart, G1]];
  for (let i = 1; i <= 12; i++) {
    const f = i / 12; // tangent ogive approximated by a circle arc
    bulletProfile.push([ogiveStart + f * ogive, Math.max(G1 * Math.sqrt(1 - f * f), 0.5)]);
  }
  return render(
    [
      { profile: bulletProfile, fill: 'url(#copper)', stroke: '#5a2a10', solid: true },
      { profile: caseProfile, fill: 'url(#brass)', stroke: '#5c4310', solid: true },
    ],
    tip,
    Math.max(R1, P1),
    [
      { label: `L1 ${fmt(shoulder, 2)}`, x: shoulder },
      { label: `L2 ${fmt(neck, 2)}`, x: neck },
      { label: `L3 ${fmt(L3, 2)}`, x: L3 },
      { label: `L6 ${fmt(tip, 2)}`, x: tip },
    ],
    [
      { label: `ØR1 ${fmt(R1, 2)}`, x: rim / 2, d: R1 },
      { label: `ØP1 ${fmt(P1, 2)}`, x: E + 1, d: P1 },
      { label: `ØP2 ${fmt(P2, 2)}`, x: shoulder, d: P2 },
      { label: `ØH ${fmt(H1, 2)}`, x: (neck + L3) / 2, d: H1 },
      { label: `ØG1 ${fmt(G1, 2)}`, x: L3 + 2, d: G1 },
    ],
  );
}

/** Chamber (cartridge seat, freebore and leade into the bore). Returns null without chamber data. */
export function chamberSvg(cf: GrtSection): string | null {
  const L1 = n(cf, 'c_L1');
  const L2 = n(cf, 'c_L2');
  const L3 = n(cf, 'c_L3');
  const P1 = n(cf, 'c_P1');
  if (!(L3 > 0 && P1 > 0)) return null;
  const P2 = n(cf, 'c_P2') || P1;
  const H1 = n(cf, 'c_H1') || P2;
  const H2 = n(cf, 'c_H2') || H1;
  const R1 = n(cf, 'c_R1') || P1 + 0.1;
  const G1 = n(cf, 'c_G1') || H2 - 0.8; // freebore diameter
  const F = n(cf, 'c_F') || G1 - 0.2; // bore (land) diameter
  const Z = n(cf, 'c_Z') || G1; // groove diameter
  const freebore = n(cf, 'c_i_') || 1.5;
  const leadeAngle = (n(cf, 'c_alpha1') || 60) / 60; // minutes of arc → degrees
  const leade = Math.min(Math.max((G1 - F) / 2 / Math.tan((leadeAngle * Math.PI) / 180), 1), 12);
  const end = L3 + freebore + leade + 8;
  const wall: Profile = [
    [0, R1],
    [n(cf, 'c_E') || 1.5, R1],
    [n(cf, 'c_E') || 1.5, P1],
    [L1 || L3 * 0.75, P2],
    [L2 || L3 * 0.85, H1],
    [L3, H2],
    [L3, G1],
    [L3 + freebore, G1],
    [L3 + freebore + leade, F],
    [end, F],
  ];
  return render(
    [{ profile: wall, fill: 'none', stroke: 'currentColor', solid: false }],
    end,
    R1 + 4,
    [
      { label: `L1 ${fmt(L1 || 0, 2)}`, x: L1 || L3 * 0.75 },
      { label: `L2 ${fmt(L2 || 0, 2)}`, x: L2 || L3 * 0.85 },
      { label: `L3 ${fmt(L3, 2)}`, x: L3 },
    ],
    [
      { label: `ØP1 ${fmt(P1, 2)}`, x: 6, d: P1 },
      { label: `ØP2 ${fmt(P2, 2)}`, x: L1 || L3 * 0.75, d: P2 },
      { label: `ØH ${fmt(H1, 2)}`, x: ((L2 || L3 * 0.85) + L3) / 2, d: H1 },
      { label: `ØG ${fmt(G1, 2)}`, x: L3 + freebore / 2, d: G1 },
      { label: `ØF/Z ${fmt(F, 2)}/${fmt(Z, 2)}`, x: end - 3, d: F },
    ],
  );
}
