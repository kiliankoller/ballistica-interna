<script setup lang="ts">
// Pressure, velocity and bullet energy over time (uPlot), with the pressure bands of the permitted maximum
// and marks (10 % Pmax, Pmax, z1, z2, OBT) on the selected curve.
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { SimResult } from '@ballistica-interna/solver';
import { fmt } from '../lib/units';

export interface ChartCurve {
  result: SimResult;
  /** focus: the selected step; step: another ladder step; compare: another load */
  role: 'focus' | 'step' | 'compare';
  color?: string;
}

/** Marks and the energy curve of the focus curve. */
export interface ChartMarks {
  /** bullet mass [kg]: energy curve ½ m v² */
  bulletMass?: number;
  z1?: number;
  z2?: number;
  /** OBT node time [s] */
  obt?: number;
}

const props = defineProps<{ curves: ChartCurve[]; maxAllowed: number; marks?: ChartMarks }>();
const { t } = useI18n();
const host = ref<HTMLDivElement>();
let plot: uPlot | null = null;
let observer: ResizeObserver | null = null;

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** All curves on one time grid (uPlot shares the x values). */
function data(curves: SimResult[], energyOf: SimResult | undefined, mass: number): uPlot.AlignedData {
  const tMax = Math.max(...curves.map((c) => c.barrelTime));
  const n = 400;
  const xs = Array.from({ length: n + 1 }, (_, i) => (i / n) * tMax);
  const at = (c: SimResult, key: 'p' | 'v', time: number) => {
    const pts = c.curve;
    if (time > c.barrelTime) return null;
    let j = 1;
    while (j < pts.length - 1 && pts[j]!.t < time) j++;
    const a = pts[j - 1]!;
    const b = pts[j]!;
    const w = b.t > a.t ? (time - a.t) / (b.t - a.t) : 0;
    const v = a[key] + w * (b[key] - a[key]);
    return key === 'p' ? v / 1e5 : v;
  };
  const series: (number | null)[][] = [];
  for (const c of curves) {
    series.push(xs.map((x) => at(c, 'p', x)));
    series.push(xs.map((x) => at(c, 'v', x)));
  }
  if (energyOf)
    series.push(
      xs.map((x) => {
        const v = at(energyOf, 'v', x);
        return v === null ? null : 0.5 * mass * v * v;
      }),
    );
  return [xs.map((x) => x * 1e3), ...series];
}

/** Vertical marks on the focus curve, with labels in the top margin (z marks one row higher). */
function marksPlugin(focus: SimResult | undefined): uPlot.Plugin {
  return {
    hooks: {
      draw: (u) => {
        if (!focus) return;
        const dpr = devicePixelRatio;
        const timeAt = (z: number) => focus.curve.find((q) => q.z >= z)?.t;
        const list: [number | undefined, string, string, number][] = [
          [focus.barrelTime - focus.bulletLeadTime, '10%', '#888', 0],
          [focus.maxPressureTime, 'Pmax', '#888', 0],
          [props.marks?.obt, 'OBT', '#b07a10', 0],
        ];
        for (const [z, label] of [[props.marks?.z1, 'z1'], [props.marks?.z2, 'z2']] as const)
          if (z && z < 1) list.push([timeAt(z), label, '#2e9b4f', 1]);
        const ctx = u.ctx;
        const { top, height } = u.bbox;
        ctx.save();
        ctx.font = `${10 * dpr}px system-ui`;
        ctx.textAlign = 'center';
        for (const [time, label, color, row] of list) {
          if (time === undefined || !(time > 0) || time > focus.barrelTime) continue;
          const x = u.valToPos(time * 1e3, 'x', true);
          ctx.strokeStyle = color;
          ctx.setLineDash([5 * dpr, 4 * dpr]);
          ctx.lineWidth = dpr;
          ctx.beginPath();
          ctx.moveTo(x, top);
          ctx.lineTo(x, top + height);
          ctx.stroke();
          ctx.fillStyle = color;
          ctx.fillText(label, x, top - (4 + row * 12) * dpr);
        }
        ctx.restore();
      },
    },
  };
}

function bandsPlugin(): uPlot.Plugin {
  return {
    hooks: {
      drawClear: (u) => {
        const pAllowed = props.maxAllowed / 1e5;
        if (!(pAllowed > 0)) return;
        const ctx = u.ctx;
        const { left, width, top } = u.bbox;
        const band = (from: number, to: number, color: string, label: string) => {
          const y1 = Math.max(u.valToPos(to, 'p', true), top);
          const y2 = u.valToPos(from, 'p', true);
          ctx.fillStyle = color;
          ctx.fillRect(left, y1, width, y2 - y1);
          ctx.fillStyle = css('--el-text-color-secondary');
          ctx.font = `${11 * devicePixelRatio}px system-ui`;
          ctx.fillText(label, left + 6 * devicePixelRatio, y2 - 5 * devicePixelRatio);
        };
        band(pAllowed, pAllowed * 2, 'rgba(190,60,140,0.22)', t('chart.pmaxAllowed'));
        band(pAllowed * 0.85, pAllowed, 'rgba(210,110,70,0.20)', t('chart.pmax15'));
        band(pAllowed * 0.75, pAllowed * 0.85, 'rgba(90,130,200,0.18)', t('chart.pmax25'));
      },
    },
  };
}

function build() {
  plot?.destroy();
  plot = null;
  const shown = props.curves.filter((c) => c.result.status === 'ok' && c.result.curve.length > 1);
  if (!host.value || !shown.length) return;
  const curves = shown.map((c) => c.result);
  const focus = shown.find((c) => c.role === 'focus')?.result;
  const mass = props.marks?.bulletMass ?? 0;
  const energyOf = mass > 0 ? focus : undefined;
  const axisColor = css('--el-text-color-secondary');
  const gridColor = css('--el-border-color-lighter');
  const series: uPlot.Series[] = [{ label: 'ms', value: (_u, v) => (v == null ? '—' : v.toFixed(3)) }];
  for (const c of shown) {
    const alpha = c.role === 'step' ? 0.35 : 1;
    const dash = c.role === 'compare' ? [6, 4] : undefined;
    const width = c.role === 'focus' ? 2.2 : 1.5;
    const p = c.color ?? `rgba(220,80,80,${alpha})`;
    const v = c.color ?? `rgba(80,120,230,${alpha})`;
    series.push({ label: t('chart.pressure'), scale: 'p', stroke: p, width, dash, value: (_u, x) => (x == null ? '—' : `${x.toFixed(0)} bar`) });
    series.push({ label: t('chart.velocity'), scale: 'v', stroke: v, width, dash: c.role === 'compare' ? [2, 3] : undefined, value: (_u, x) => (x == null ? '—' : `${x.toFixed(0)} m/s`) });
  }
  if (energyOf)
    series.push({
      label: t('chart.energy'),
      scale: 'e',
      stroke: 'rgb(19,138,138)',
      width: 1.8,
      dash: [2, 4],
      value: (_u, x) => (x == null ? '—' : `${x.toFixed(0)} J`),
    });
  // whole numbers without the thousands separator of the system locale (uPlot's default)
  const whole = (_u: uPlot, splits: number[]) => splits.map((v) => fmt(v, 0));
  const pTop = Math.max(props.maxAllowed / 1e5, ...curves.map((c) => c.maxPressure / 1e5)) * 1.1;
  plot = new uPlot(
    {
      width: host.value.clientWidth,
      height: host.value.clientHeight,
      series,
      legend: { show: false },
      cursor: { drag: { x: false, y: false } },
      scales: {
        x: { time: false },
        p: { range: [0, pTop] },
        v: { range: (_u, _min, max) => [0, max * 1.1] },
        e: { range: (_u, _min, max) => [0, max * 1.1] },
      },
      padding: [26, 0, 0, 0],
      axes: [
        { stroke: axisColor, grid: { stroke: gridColor }, label: 'ms', size: 40, values: (_u, splits) => splits.map((v) => fmt(v, 2)) },
        { scale: 'p', stroke: 'rgb(220,80,80)', grid: { stroke: gridColor }, label: 'bar', size: 56, values: whole },
        { scale: 'v', side: 1, stroke: 'rgb(80,120,230)', grid: { show: false }, label: 'm/s', size: 56, values: whole },
        ...(energyOf ? [{ scale: 'e', side: 1, stroke: 'rgb(19,138,138)', grid: { show: false }, label: 'J', size: 56, values: whole }] : []),
      ],
      plugins: [bandsPlugin(), marksPlugin(focus)],
    },
    data(curves, energyOf, mass),
    host.value,
  );
}

// the axis and grid colours come from the theme: rebuild after main.ts has switched it
const scheme = window.matchMedia('(prefers-color-scheme: dark)');
const rebuildForTheme = () => requestAnimationFrame(build);

onMounted(() => {
  build();
  observer = new ResizeObserver(() => {
    if (plot && host.value) plot.setSize({ width: host.value.clientWidth, height: host.value.clientHeight });
  });
  if (host.value) observer.observe(host.value);
  scheme.addEventListener('change', rebuildForTheme);
});
onBeforeUnmount(() => {
  scheme.removeEventListener('change', rebuildForTheme);
  observer?.disconnect();
  plot?.destroy();
});
watch(() => [props.curves, props.maxAllowed, props.marks], build);
</script>

<template>
  <div ref="host" class="chart" />
</template>

<style scoped>
.chart {
  width: 100%;
  height: 100%;
  min-height: 260px;
}
</style>
