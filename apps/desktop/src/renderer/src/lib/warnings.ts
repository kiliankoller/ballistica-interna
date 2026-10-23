// Warnings next to the result that depend on the load: a low fill ratio (the model then calculates the pressure
// too low, docs/MODEL.md#accuracy) and powders whose pressure is not backed by measurements.

/** Fill ratio (bulk volume of the charge over the combustion chamber) below which the pressure is warned about. */
export const LOW_FILL = 0.9;

/** Whether the calculated pressure is probably too low because of a low fill ratio (fill as a fraction). */
export function lowFill(fill: number | undefined): boolean {
  return fill !== undefined && Number.isFinite(fill) && fill > 0 && fill < LOW_FILL;
}

/**
 * Powders of Vihtavuori: their model is fitted to measured velocities, the pressure is anchored at the C.I.P.
 * maximum of the published maximum loads (fit_status in data/powders.csv), not measured. The load file carries
 * the maker's name only, so the maker decides (also for own copies of those master records).
 */
export function pressureNotBacked(powderMaker: string | undefined): boolean {
  return /vihtavuori/i.test(powderMaker ?? '');
}

export interface LoadWarnings {
  lowFill: boolean;
  pressureNotBacked: boolean;
}

export function loadWarnings(fill: number | undefined, powderMaker: string | undefined): LoadWarnings {
  return { lowFill: lowFill(fill), pressureNotBacked: pressureNotBacked(powderMaker) };
}
