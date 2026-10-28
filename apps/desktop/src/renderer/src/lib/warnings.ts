// Warnings next to the result that depend on the load: a low fill ratio (the model then calculates the pressure
// too low, docs/MODEL.md#accuracy), a slow powder loosely filled (secondary explosion effect), a case capacity
// estimated from the C.I.P. outline instead of measured (lib/capacity.ts), and how far the measured pressure has
// exceeded the calculation in the makers' laboratory measurements (held out). resultNotices() sorts them into three levels: danger (the real pressure
// can be far higher), caution and the note that is always shown.
import { GRAIN, referencePressure, type PropellantInput } from '@ballistica-interna/solver';
import type { CapacitySource } from './capacity';
import { fmt } from './units';

/** Fill ratio (bulk volume of the charge over the combustion chamber) below which the pressure is warned about. */
export const LOW_FILL = 0.9;
/** Fill ratio below which the warning is shown as a danger. */
export const VERY_LOW_FILL = 0.85;
/**
 * Powders whose peak pressure in the solver's reference load (referencePressure: .308 Win., fixed charge) stays at
 * or below this count as slow (Vihtavuori N550, Reload Swiss RS60, Norma URP, Rottweil R904, Lovex S070 and slower):
 * loosely filled they risk the secondary explosion effect (SEE). The model ranks the powders, not Ba alone, since Ba
 * is comparable only at the same Qex and form function (Lovex: low Qex, high Ba). The bound lies in the gap between
 * N550 (3439 bar) and Rottweil R907 (3497 bar); warnings.test.ts checks it against the shipped powders. Rottweil
 * R903 (3366 bar) falls below it, although Explosia's chart puts it next to IMR4064: the model ranks it too slow,
 * which costs one warning too many, never one too few.
 */
export const SLOW_PRESSURE = 3470e5;

/** Whether the powder counts as slow (see SLOW_PRESSURE); false without usable burn values. */
export function slowPowder(powder: Parameters<typeof referencePressure>[0] | undefined): boolean {
  if (!powder || !(powder.Ba > 0) || !(powder.Qex > 0)) return false;
  const p = referencePressure(powder);
  return Number.isFinite(p) && p <= SLOW_PRESSURE;
}

/**
 * How far the measured peak pressure exceeded the calculated one in the makers' laboratory measurements, by fill ratio (the lower bound of the
 * band, as a fraction): in 19 of 20 loads at most `typical` (95 % quantile), in single loads up to `max`. Held-out
 * loads of the cross-validations of the shipped fits (refit of 2026-10-28, friction acting on the bullet, pressure exponent 0.9; 1483 rifle loads of
 * Reload Swiss, Sax and Lovex with measured pressure, fill ratio calculated as here; docs/MODEL.md#accuracy,
 * local/scripts/margin-quantiles.ts).
 */
export const PRESSURE_MARGIN: { from: number; typical: number; max: number }[] = [
  { from: 0, typical: 0.34, max: 0.56 },
  { from: 0.8, typical: 0.27, max: 0.5 },
  { from: LOW_FILL, typical: 0.21, max: 0.34 },
  { from: 1.0, typical: 0.15, max: 0.22 },
];
/** Spread of the peak pressure from case capacity (±2 %), powder lot (Ba ±4 %) and seating depth (±0.5 mm), 90 %. */
export const INPUT_SPREAD = 0.08;

const valid = (fill: number | undefined): fill is number => fill !== undefined && Number.isFinite(fill) && fill > 0;

/** Whether the calculated pressure is probably too low because of a low fill ratio (fill as a fraction). */
export function lowFill(fill: number | undefined): boolean {
  return valid(fill) && fill < LOW_FILL;
}

/** How far the measured pressure exceeded the calculation in the laboratory measurements at this fill ratio (fraction), see PRESSURE_MARGIN. */
export function pressureMargin(fill: number | undefined): { typical: number; max: number } | undefined {
  if (!valid(fill)) return undefined;
  const { typical, max } = [...PRESSURE_MARGIN].reverse().find((b) => fill >= b.from)!;
  return { typical, max };
}

/** Values of the text result.pressureMargin for a margin and the calculated peak pressure [Pa]. */
export function marginText(m: { typical: number; max: number }, maxPressure: number) {
  return {
    pct: fmt(m.typical * 100, 0), bar: fmt((maxPressure * (1 + m.typical)) / 1e5, 0),
    maxPct: fmt(m.max * 100, 0), maxBar: fmt((maxPressure * (1 + m.max)) / 1e5, 0), spread: fmt(INPUT_SPREAD * 100, 0),
  };
}

export interface LoadWarnings {
  lowFill: boolean;
  /** Fill ratio below VERY_LOW_FILL: lowFill shown as a danger. */
  veryLowFill: boolean;
  /** Slow powder below VERY_LOW_FILL: secondary explosion effect. */
  slowPowderLowFill: boolean;
  estimatedCapacity: boolean;
}

/** fill as a fraction, powder the burn values of the load's powder. */
export function loadWarnings(fill: number | undefined, powder: PropellantInput | undefined, capacity: CapacitySource = 'own'): LoadWarnings {
  const veryLowFill = valid(fill) && fill < VERY_LOW_FILL;
  return {
    lowFill: lowFill(fill),
    veryLowFill,
    slowPowderLowFill: veryLowFill && slowPowder(powder),
    estimatedCapacity: capacity === 'estimate',
  };
}

/** Level of a notice next to the result: danger (red), caution (yellow), note (grey, always shown). */
export type NoticeLevel = 'danger' | 'caution' | 'note';

export interface Notice {
  level: NoticeLevel;
  /** i18n key of the text and its values. */
  key: string;
  args?: Record<string, string>;
  /** Charge of the ladder step the notice is about [grain, formatted], when it is not the step shown. */
  charge?: string;
  /** A button next to the text: set the start pressure advised for a short jump. */
  action?: 'startPressure';
}

/** One step of the load: the charge or a step of the ladder. */
export interface NoticeStep {
  /** Charge [kg]. */
  charge: number;
  /** Fill ratio as a fraction. */
  fill: number | undefined;
  /** Calculated peak pressure [Pa]; NaN without a result. */
  maxPressure: number;
}

export interface NoticeInput {
  /** The load's charge and the steps of the ladder; `selected` is the step shown. */
  steps: NoticeStep[];
  selected: number;
  powder: PropellantInput | undefined;
  /** The powder's burn values are those of a shipped fit (master data, unchanged): the test figures apply to it. */
  powderChecked: boolean;
  capacity: CapacitySource;
  /** C.I.P. maximum pressure of the caliber [Pa]; 0 if unknown. */
  cipPressure: number;
  /** Jump [m] when it is short and the start pressure not raised (lib/jump.ts), else null. */
  shortJump: number | null;
  handgun: boolean;
  /** Twist and the bullet maker's minimum twist [in] when the twist is too slow, else null. */
  slowTwist: { twist: number; min: number } | null;
}

/**
 * The notices of a result, danger first, the note last (it is always there). The whole ladder is checked: the
 * C.I.P. maximum at the step with the highest pressure, the fill ratio at the most loosely filled step. The figures
 * of the laboratory comparison (PRESSURE_MARGIN) are given only where they apply: a shipped powder model, a rifle.
 */
export function resultNotices(i: NoticeInput): Notice[] {
  const figures = i.powderChecked && !i.handgun;
  const ok = (s: NoticeStep) => Number.isFinite(s.maxPressure) && s.maxPressure > 0;
  const shown = i.steps[i.selected];
  // the charge of a step other than the one shown, so that the text says which step it is about
  const at = (s: NoticeStep | undefined) => (s && s !== shown ? fmt(s.charge / GRAIN, 2) : undefined);
  const highest = i.steps.filter(ok).reduce<NoticeStep | undefined>((a, s) => (!a || s.maxPressure > a.maxPressure ? s : a), undefined);
  const loosest = i.steps.filter((s) => valid(s.fill)).reduce<NoticeStep | undefined>((a, s) => (!a || s.fill! < a.fill! ? s : a), undefined);
  const out: Notice[] = [];

  const aboveCip = !!highest && i.cipPressure > 0 && highest.maxPressure > i.cipPressure;
  if (aboveCip) out.push({ level: 'danger', key: 'result.aboveCip', args: { p: fmt(highest.maxPressure / 1e5, 0), pmax: fmt(i.cipPressure / 1e5, 0) }, charge: at(highest) });
  const w = loadWarnings(loosest?.fill, i.powder, i.capacity);
  if (loosest && w.lowFill) {
    const m = pressureMargin(loosest.fill);
    const margin = figures && m && ok(loosest) ? marginText(m, loosest.maxPressure) : undefined;
    const args = { fill: fmt(loosest.fill! * 100, 0), limit: fmt((w.veryLowFill ? VERY_LOW_FILL : LOW_FILL) * 100, 0), ...margin };
    out.push({ level: w.veryLowFill ? 'danger' : 'caution', key: margin ? 'result.lowFill' : 'result.lowFillPlain', args, charge: at(loosest) });
  }
  if (w.slowPowderLowFill) out.push({ level: 'danger', key: 'result.slowPowderLowFill', charge: at(loosest) });
  if (i.shortJump !== null) out.push({ level: 'danger', key: 'result.shortJump', args: { jump: fmt(i.shortJump * 1e3, 1) }, action: 'startPressure' });
  if (i.handgun) out.push({ level: 'danger', key: 'result.handgun' });
  const mh = highest && pressureMargin(highest.fill);
  if (figures && !aboveCip && highest && mh && i.cipPressure > 0 && highest.maxPressure * (1 + mh.typical) > i.cipPressure) {
    out.push({ level: 'caution', key: 'result.overPmax', args: { pct: fmt(mh.typical * 100, 0), pmax: fmt(i.cipPressure / 1e5, 0) }, charge: at(highest) });
  }
  if (!i.powderChecked && !i.handgun) out.push({ level: 'caution', key: 'result.powderUnchecked' });
  if (w.estimatedCapacity) out.push({ level: 'caution', key: 'result.capacityEstimated' });
  if (i.slowTwist) out.push({ level: 'caution', key: 'result.slowTwist', args: { twist: fmt(i.slowTwist.twist, 1), min: fmt(i.slowTwist.min, 1) } });

  out.push({ level: 'note', key: 'result.uncalibrated' });
  // the figures of the step shown; below 90 % they stand in the fill ratio warning
  const ms = shown && pressureMargin(shown.fill);
  if (figures && shown && ms && ok(shown) && !lowFill(shown.fill)) out.push({ level: 'note', key: 'result.pressureMargin', args: marginText(ms, shown.maxPressure) });
  out.push({ level: 'note', key: 'result.inputSpread', args: { spread: fmt(INPUT_SPREAD * 100, 0) } });
  // an estimated capacity is already a caution
  if (!w.estimatedCapacity) out.push({ level: 'note', key: `result.capacitySource.${i.capacity}` });
  return out;
}

/** Burn values that decide whether a powder is the shipped model (see powderMatches). */
const BURN_VALUES = ['Ba', 'Qex', 'k', 'a0', 'a1', 'z1', 'z2', 'pc'];

/**
 * Whether the load's powder is the shipped powder model: the master record is a fit (fit_status "fitted…") and the
 * load carries its burn values unchanged. `values` are the load's stored fields by name, as text.
 */
export function powderMatches(values: Record<string, string | undefined>, record: Record<string, unknown> | null | undefined): boolean {
  if (!record || !/^fitted/.test(String(record.fit_status ?? ''))) return false;
  return BURN_VALUES.every((name) => {
    const a = Number(values[name] ?? NaN);
    const b = Number(record[name] ?? 0);
    return Number.isFinite(a) && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
  });
}
