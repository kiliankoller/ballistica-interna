// Warnings next to the result that depend on the load: a low fill ratio (the model then calculates the pressure
// too low, docs/MODEL.md#accuracy), a slow powder loosely filled (secondary explosion effect), a case capacity
// estimated from the C.I.P. outline instead of measured (lib/capacity.ts), and how far the measured pressure has
// exceeded the calculation in the tests.
import { referencePressure, type PropellantInput } from '@ballistica-interna/solver';
import type { CapacitySource } from './capacity';

/** Fill ratio (bulk volume of the charge over the combustion chamber) below which the pressure is warned about. */
export const LOW_FILL = 0.9;
/** Fill ratio below which the warning is shown as a danger. */
export const VERY_LOW_FILL = 0.85;
/**
 * Powders whose peak pressure in the solver's reference load (referencePressure: .308 Win., fixed charge) stays at
 * or below this count as slow (Vihtavuori N550, Reload Swiss RS60, Norma URP, Rottweil R904, Lovex S070 and slower):
 * loosely filled they risk the secondary explosion effect (SEE). The model ranks the powders, not Ba alone, since Ba
 * is comparable only at the same Qex and form function (Lovex: low Qex, high Ba). The bound lies in the gap between
 * N550 (3188 bar) and Rottweil R903 (3325 bar); warnings.test.ts checks it against the shipped powders.
 */
export const SLOW_PRESSURE = 3250e5;

/** Whether the powder counts as slow (see SLOW_PRESSURE); false without usable burn values. */
export function slowPowder(powder: Parameters<typeof referencePressure>[0] | undefined): boolean {
  if (!powder || !(powder.Ba > 0) || !(powder.Qex > 0)) return false;
  const p = referencePressure(powder);
  return Number.isFinite(p) && p <= SLOW_PRESSURE;
}

/**
 * Worst case of the tests: how far the measured peak pressure exceeded the calculated one, by fill ratio (the
 * lower bound of the band, as a fraction). Held-out loads of the cross-validations of the shipped fits (refit of
 * 2026-10-25, pressure exponent 0.9; 1488 rifle loads of Reload Swiss, Sax and Lovex with measured pressure,
 * docs/MODEL.md#accuracy): below 90 % fill 67 % above, 90 to 100 % 40 % above, above 100 % 30 % above.
 */
export const PRESSURE_MARGIN: { from: number; margin: number }[] = [
  { from: 0, margin: 0.67 },
  { from: LOW_FILL, margin: 0.4 },
  { from: 1.0, margin: 0.3 },
];

const valid = (fill: number | undefined): fill is number => fill !== undefined && Number.isFinite(fill) && fill > 0;

/** Whether the calculated pressure is probably too low because of a low fill ratio (fill as a fraction). */
export function lowFill(fill: number | undefined): boolean {
  return valid(fill) && fill < LOW_FILL;
}

/** How far the measured pressure exceeded the calculation in the tests at this fill ratio (fraction), see PRESSURE_MARGIN. */
export function pressureMargin(fill: number | undefined): number | undefined {
  if (!valid(fill)) return undefined;
  return [...PRESSURE_MARGIN].reverse().find((b) => fill >= b.from)!.margin;
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
