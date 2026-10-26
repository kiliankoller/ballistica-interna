import { defaultParams } from './params.ts';
import { simulate } from './simulate.ts';
import type { LoadInput, ModelParams, PropellantInput } from './types.ts';

/**
 * The reference load that ranks powders by speed: the documentation's example (.308 Win., 168 gr bullet, 520 mm
 * barrel) with a fixed charge of 43.06 grains (2.790 g). Only the burn values of the powder change, so its peak
 * pressure orders the powders independently of how Ba, Qex and the form function share the work in a fit.
 */
const REFERENCE: LoadInput = {
  cartridge: { caseVolume: 3.6165323517e-6, caseLength: 0.05118, boreArea: 4.751e-5, grooveDiameter: 0.00782, maxPressure: 4.15e8, sebert: 0.5 },
  gun: { barrelLength: 0.52, twistLength: 0.279, gunMass: 4.2 },
  projectile: {
    diameter: 0.00782, mass: 0.01069182015, length: 0.03465, seatingDepth: 0.01616, startPressure: 2.5e7,
    tailType: 'flat', tailLength: 0, tailDiameterA: 0, tailDiameterB: 0,
  },
  propellant: {
    Ba: 0.5, Qex: 3.9e6, kappa: 1.23, a0: 1, a1: 0, z1: 0.5, z2: 0.8, covolume: 0, materialDensity: 1600, bulkDensity: 950,
    referenceTemperature: 21, temperature: 21, tcc: 0, tch: 0, charge: 0.0027902410646,
  },
};

/** Peak pressure (Pa) of the powder in the reference load; NaN if the calculation fails. */
export function referencePressure(
  powder: Pick<PropellantInput, 'Ba' | 'Qex' | 'kappa' | 'a0' | 'a1' | 'z1' | 'z2'> & Partial<Pick<PropellantInput, 'materialDensity'>>,
  params: ModelParams = defaultParams,
): number {
  const { Ba, Qex, kappa, a0, a1, z1, z2, materialDensity } = powder;
  const load: LoadInput = {
    ...REFERENCE,
    propellant: { ...REFERENCE.propellant, Ba, Qex, kappa, a0, a1, z1, z2, materialDensity: materialDensity || REFERENCE.propellant.materialDensity },
  };
  const r = simulate(load, params);
  return r.status === 'ok' ? r.maxPressure : NaN;
}
