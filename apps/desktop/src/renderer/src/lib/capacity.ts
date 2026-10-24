// Where the case capacity of a load comes from. The capacity is a large uncertainty of a load: the master data
// estimates it from the C.I.P. outline where no load data gives it (about 3 % rms), and brass of different makers
// and lots differs by as much (docs/MODEL.md#case-capacity).
import type { GrtLoadFile } from '@ballistica-interna/grtload';
import { GRAIN, WATER_DENSITY } from '@ballistica-interna/solver';

/** estimate: from the C.I.P. outline; loadData: derived from a maker's published fill ratios; own: entered by the user. */
export type CapacitySource = 'estimate' | 'loadData' | 'own';

/**
 * Source of the load's case capacity: the master value (caliberfile.V, V_source) while the load uses it, else the
 * user's own value. Files of older versions mark the estimate as V_estimated = yes; a caliber without a master
 * value (own caliber, a file of another program) counts as own.
 */
export function capacitySource(file: GrtLoadFile): CapacitySource {
  const cf = file.caliberfile;
  const master = Number(cf.V?.value);
  const used = Number(file.caliber.casevol?.value); // cm³
  if (!(master > 0) || !(used > 0)) return 'own';
  const usedGrains = (used * 1e-6 * WATER_DENSITY) / GRAIN;
  if (Math.abs(usedGrains / master - 1) > 0.002) return 'own';
  const source = String(cf.V_source?.value ?? '');
  if (source === 'reload-swiss-fill') return 'loadData';
  if (source === 'estimate' || String(cf.V_estimated?.value ?? '') === 'yes') return 'estimate';
  return 'own';
}

