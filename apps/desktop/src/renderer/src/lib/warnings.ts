// Warnings next to the result that depend on the load: a low fill ratio (the model then calculates the pressure
// too low, docs/MODEL.md#accuracy), a slow powder loosely filled (secondary explosion effect), a case capacity
// estimated from the C.I.P. outline instead of measured (lib/capacity.ts), and how far the measured pressure has
// exceeded the calculation in the tests.
import type { CapacitySource } from './capacity';

/** Fill ratio (bulk volume of the charge over the combustion chamber) below which the pressure is warned about. */
export const LOW_FILL = 0.9;
/** Fill ratio below which the warning is shown as a danger. */
export const VERY_LOW_FILL = 0.85;
/**
 * Powders at or below this vivacity Ba count as slow (about N160, RS70 and H4350 and slower): loosely filled they
 * risk the secondary explosion effect (SEE). Ba also depends on the form function, so the bound is approximate.
 */
export const SLOW_BA = 0.47;

/**
 * Worst case of the tests: how far the measured peak pressure exceeded the calculated one, by fill ratio (the
 * lower bound of the band, as a fraction). Held-out loads of the cross-validation of 2026-10-23 (1220 rifle loads
 * of Reload Swiss and Sax with measured pressure, docs/MODEL.md#accuracy): below 90 % fill 3402 bar measured
 * against 1889 calculated, 90 to 100 % 2814 against 1939, above 100 % 2613 against 1988.
 */
export const PRESSURE_MARGIN: { from: number; margin: number }[] = [
  { from: 0, margin: 0.8 },
  { from: LOW_FILL, margin: 0.45 },
  { from: 1.0, margin: 0.31 },
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

/** fill as a fraction, Ba the powder's vivacity. */
export function loadWarnings(fill: number | undefined, Ba: number | undefined, capacity: CapacitySource = 'own'): LoadWarnings {
  const veryLowFill = valid(fill) && fill < VERY_LOW_FILL;
  return {
    lowFill: lowFill(fill),
    veryLowFill,
    slowPowderLowFill: veryLowFill && Ba !== undefined && Ba > 0 && Ba <= SLOW_BA,
    estimatedCapacity: capacity === 'estimate',
  };
}
