// The printable report of a load (A4 portrait), as a self-contained HTML string.
import { GRAIN, caseCapacityGrainsH2O } from '@ballistica-interna/solver';
import { APP_NAME } from '../../../shared/api';
import logo from '../assets/logo.svg?raw';
import { selectedStep, type LoadDoc } from '../stores/loads';
import { cartridgeSvg, cipTable } from './drawing';
import { chartSvg, type ChartLabels } from './svgChart';
import { fmt } from './units';
import { capacitySource } from './capacity';
import { loadWarnings, pressureMargin } from './warnings';

type T = (key: string, args?: Record<string, unknown>) => string;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function reportHtml(doc: LoadDoc, t: T, locale: string): string {
  const { file, result } = doc;
  const load = result.load;
  const step = selectedStep(doc);
  const r = step?.result;
  const d = step?.derived;
  const capacitySrc = capacitySource(file);
  const warn = loadWarnings(d?.fill, load?.propellant, capacitySrc);
  const margin = pressureMargin(d?.fill);
  const date = new Date().toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const charge = step ? step.charge / GRAIN : NaN;
  const powder = [file.propellant.mname?.value, file.propellant.pname?.value].filter(Boolean).join(' ');
  const lot = file.propellant.lotid?.value ? ` (${file.propellant.lotid.value})` : '';
  const capacity = load ? caseCapacityGrainsH2O(load.cartridge.caseVolume) : NaN;
  const mm = (v: number | undefined) => `${fmt(v === undefined ? undefined : v * 1e3, 2)} mm`;
  const ladderSteps = Number(file.propellant.laddercnt?.value) || 1;
  const ladderStep = ladderSteps > 1 ? (Number(file.propellant.laddermc?.value) || 0) * 1e-3 / GRAIN : 0;
  const fileName = doc.path ? doc.path.split(/[\\/]/).pop()! : doc.name;

  const loadRows: [string, string][] = [
    [t('report.caliber'), file.caliber.CaliberName?.value ?? ''],
    [t('report.projectile'), file.projectile.ProjectileName?.value ?? ''],
    [t('report.charge'), `${fmt(charge, 2)} grain, ${powder}${lot}`],
    [t('report.ladderStep'), ladderSteps > 1 ? `${fmt(ladderStep, 2)} grain × ${ladderSteps}` : fmt(0, 2)],
    [t('report.seatingDepth'), mm(load?.projectile.seatingDepth)],
    [t('report.bulletLength'), mm(load?.projectile.length)],
    [t('report.caseCapacity'), `${fmt(capacity, 2)} grain H2O (${t(`report.capacitySource.${capacitySrc}`)})`],
    [t('report.caseLength'), mm(load?.cartridge.caseLength)],
    [t('report.overallLength'), `${fmt(Number(file.caliber.oal?.value), 2)} mm`],
    [t('report.cbto'), ''],
  ];

  const ok = r?.status === 'ok';
  const results: [string, string][][] = ok && r && d
    ? [
        [
          ['Pmax', `${fmt(r.maxPressure / 1e5, 0)} bar`],
          ['P0', `${fmt(r.muzzlePressure / 1e5, 0)} bar`],
          ['V0', `${fmt(r.muzzleVelocity, 0)} m/s`],
          ['BT', `${fmt(r.barrelTime * 1e3, 4)} ms`],
          ['BLT', `${fmt(r.bulletLeadTime * 1e3, 4)} ms`],
          ['OBT', d.obt ? `${fmt(d.obt.time * 1e3, 4)} ms` : '—'],
        ],
        [
          ['Fill', `${fmt(d.fill * 100, 1)} %`],
          ['Burnt', `${fmt(r.burnt * 100, 1)} %`],
          ['E0', `${fmt(r.muzzleEnergy, 0)} J`],
          ['Recoil', `${fmt(d.recoilEnergy, 0)} J`],
          ['IPSC/BDS', fmt(d.ipsc, 0)],
          ['MIP', fmt(d.mip, 0)],
        ],
      ]
    : [];

  const drawing = cartridgeSvg(file.caliberfile, load?.projectile.length ? load.projectile.length * 1e3 : 0, load ? load.projectile.seatingDepth * 1e3 : 0, load ? load.cartridge.caseLength * 1e3 : 0) ?? '';
  const cf = file.caliberfile;
  const title = [cf.cipname?.value, cf.altname?.value ? `(${cf.altname.value})` : '', cf.standard?.value ? `– ${cf.standard.value}` : ''].filter(Boolean).join(' ');
  const cip = cipTable(file.caliberfile, Number(file.caliberfile.V?.value) ? Number(file.caliberfile.V!.value).toFixed(2) : '');
  const chartLabels: ChartLabels = {
    pressure: t('chart.pressure'),
    velocity: t('chart.velocity'),
    pmaxAllowed: t('chart.pmaxAllowed'),
    pmax15: t('chart.pmax15'),
    pmax25: t('chart.pmax25'),
    burnout: t('chart.burnout'),
    burnoutAfterMuzzle: t('chart.burnoutAfterMuzzle'),
  };
  // the selected step first: the chart draws it strongest and marks its Pmax and 10 % times
  const curves = [...result.steps].sort((a, b) => (a === step ? -1 : b === step ? 1 : 0)).map((s) => s.result);
  // the chart fills the lower part of the page (width:height of the free space)
  const chart = load
    ? chartSvg(curves, load.cartridge.maxPressure, chartLabels, 1000, 850, { bulletMass: load.projectile.mass, z1: load.propellant.z1, z2: load.propellant.z2 })
    : '';
  const ladder =
    result.steps.length > 1
      ? `<p class="cap">${esc(t('report.ladder'))}</p><table class="res lad"><tr class="h"><th>${esc(t('ladder.charge'))}</th><th>Pmax</th><th>V0</th><th>E0</th><th>BT</th><th>${esc(t('ladder.burnt'))}</th></tr>` +
        result.steps
          .map((s) =>
            s.result.status === 'ok'
              ? `<tr${s === step ? ' class="sel"' : ''}><td>${fmt(s.charge / GRAIN, 2)} gr</td><td>${fmt(s.result.maxPressure / 1e5, 0)} bar</td><td>${fmt(s.result.muzzleVelocity, 0)} m/s</td><td>${fmt(s.result.muzzleEnergy, 0)} J</td><td>${fmt(s.result.barrelTime * 1e3, 3)} ms</td><td>${fmt(s.result.burnt * 100, 1)} %</td></tr>`
              : `<tr><td>${fmt(s.charge / GRAIN, 2)} gr</td><td colspan="5">${esc(t(`result.status.${s.result.status}`))}</td></tr>`,
          )
          .join('') +
        '</table>'
      : '';

  const table = (rows: [string, string][]) => rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
  const resultTable = results
    .map((row) => `<tr class="h">${row.map(([k]) => `<th>${esc(k)}</th>`).join('')}</tr><tr>${row.map(([, v]) => `<td>${esc(v)}</td>`).join('')}</tr>`)
    .join('');

  return `<style>
@page{size:A4;margin:0}
*{box-sizing:border-box}
body{margin:0;font:10px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1d1f23;background:#fff}
.page{width:210mm;height:296mm;overflow:hidden;padding:10mm 12mm 8mm;display:flex;flex-direction:column;gap:2.5mm}
header{display:flex;justify-content:space-between;align-items:center;color:#555;font-size:8.5px}
header .brand{display:flex;align-items:center;gap:2mm;font-size:10px;font-weight:600;color:#2a2e33}
header .brand svg{width:7mm;height:7mm}
h1{font-size:22px;font-weight:400;margin:0 0 0 3mm}
.file{background:#e3e8ef;padding:1.2mm 3mm;font-size:9.5px;border:1px solid #c9d0da}
.file b{display:inline-block;width:22mm}
.file i{font-weight:600}
.top{display:grid;grid-template-columns:57% 1fr;gap:4mm;align-items:start}
table{border-collapse:collapse;width:100%}
.data th,.data td{border:1px solid #c9d0da;padding:.55mm 2mm;text-align:center;font-weight:400}
.data th{width:30%}
.data .cap th{background:#e3e8ef;font-weight:700}
.res th,.res td{border:1px solid #c9d0da;padding:.55mm 1mm;text-align:center}
.res tr.h th{background:#e3e8ef}
.res .cap th{text-align:left;border:none;padding:1.5mm 0 .5mm;background:none}
.lad{margin-top:1mm}.lad td,.lad th{padding:.4mm 1mm;font-size:8.5px}.lad tr.sel td{font-weight:700;background:#eef4ff}
.side{display:flex;gap:2mm;border:1px solid #c9d0da;padding:1.5mm}
.drawing{flex:1;min-width:0;color:#333}
.drawing .ttl{font-size:8px;color:#444;margin-bottom:1mm}
.drawing svg{width:100%;height:72mm}
.cip{width:auto;align-self:start}
.cip td{padding:.1mm 1.2mm;border-bottom:1px dotted #ccc;font-size:7.5px;white-space:nowrap}
.cip td:first-child{color:#b03030}
.chart{width:100%;height:auto;flex:1;min-height:0}
.warn{margin-top:3mm;border:1px solid #c0392b;color:#7b241c;background:#fdf2f0;padding:2mm 3mm;font-size:9px}
footer{margin-top:auto;display:flex;justify-content:space-between;gap:6mm;color:#555;font-size:8.5px}
footer .note{font-style:italic}
</style>
<div class="page">
<header><span class="brand">${logo}${esc(APP_NAME)}</span><span>${esc(date)}</span></header>
<h1>${esc(fileName)}</h1>
<div class="file"><b>${esc(t('report.file'))}:</b> <i>"${esc(doc.path ?? t('unsaved'))}"</i></div>
<div class="top">
  <div>
    <table class="data"><tr class="cap"><th colspan="2">${esc(t('report.loadData'))}</th></tr>${table(loadRows)}</table>
    <table class="res"><tr class="cap"><th colspan="6">${esc(t('report.results'))} ${esc(fmt(charge, 2))} grain</th></tr>${resultTable}</table>
    ${ladder}
  </div>
  <div class="side">
    <div class="drawing"><div class="ttl">${esc(title)}</div>${drawing}</div>
    <table class="cip">${cip.map((c) => `<tr><td>${c.key}</td><td>${c.value} ${c.unit}</td></tr>`).join('')}</table>
  </div>
</div>
${chart}
<div class="warn">${esc(t('report.warning'))}${
  warn.lowFill ? ` ${esc(t('result.lowFill', { fill: fmt((d?.fill ?? 0) * 100, 0) }))}` : ''
}${warn.slowPowderLowFill ? ` ${esc(t('result.slowPowderLowFill'))}` : ''}${
  warn.estimatedCapacity ? ` ${esc(t('result.capacityEstimated'))}` : ''
}${margin !== undefined && r?.status === 'ok' ? ` ${esc(t('result.pressureMargin', { pct: fmt(margin * 100, 0), bar: fmt((r.maxPressure * (1 + margin)) / 1e5, 0) }))}` : ''}</div>
<footer><span class="note">${esc(t('report.disclaimer'))}</span><span>${esc(t('report.page'))} 1</span></footer>
</div>`;
}
