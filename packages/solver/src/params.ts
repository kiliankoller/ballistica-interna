import type { ModelParams } from './types.ts';

export const defaultParams: ModelParams = {
  // Exponent of the phase-1 form function, chosen so that it matches the documented progressivity factor Bp.
  phase1Exponent: 0.3571,
  phase2End: 0,
  vivacityExponent: 0,
  vivacityReference: 0.5,
  phase3Exponent: 2 / 3,
  heatLoss: 0,
  // covolume b = covolumeFactor / pc (0.75 cm³/g at pc 1600 kg/m³), a typical value for nitrocellulose powders
  covolumeFactor: 1.2,
  // bullet friction against the bore, as an energy loss of the gas (see ModelParams.bulletFriction)
  bulletFriction: 2.848e6,
  boreResistance: 0,
  reportedPressure: 'mean',
  tolerance: 1e-8,
  maxStep: 2e-6,
};

export function withParams(overrides: Partial<ModelParams> = {}): ModelParams {
  return { ...defaultParams, ...overrides };
}
