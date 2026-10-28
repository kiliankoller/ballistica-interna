import { describe, expect, it } from 'vitest';
import { defaultParams, simulate, withParams, type LoadInput } from '../src/index.ts';

const GRAIN = 64.79891e-6;
// a .308 Win load with round values
const load = (grains: number): LoadInput => ({
  cartridge: { caseVolume: 55.8 * GRAIN / 998, caseLength: 51.18e-3, boreArea: 47.51e-6, grooveDiameter: 7.82e-3, maxPressure: 4150e5, sebert: 0.5 },
  gun: { barrelLength: 0.6, twistLength: 0.279, gunMass: 4 },
  projectile: { diameter: 7.82e-3, mass: 165 * GRAIN, length: 31e-3, seatingDepth: 8e-3, startPressure: 250e5, tailType: 'flat', tailLength: 0, tailDiameterA: 0, tailDiameterB: 0 },
  propellant: {
    Ba: 0.52, Qex: 3950e3, kappa: 1.23, a0: 0.5, a1: 0, z1: 0.5, z2: 0.78, covolume: 0.75e-3, materialDensity: 1600, bulkDensity: 950,
    referenceTemperature: 21, temperature: 21, tcc: 0, tch: 0, charge: grains * GRAIN,
  },
});

describe('pressure exponent of the burn rate', () => {
  it('is 0.9 by default', () => {
    expect(simulate(load(44), withParams({ burnPressureExponent: 0.9 })).maxPressure).toBe(simulate(load(44), defaultParams).maxPressure);
  });

  it('lets the peak pressure rise less with the charge below 1', () => {
    const rise = (n: number) => {
      const params = withParams({ burnPressureExponent: n });
      return simulate(load(46), params).maxPressure / simulate(load(40), params).maxPressure;
    };
    expect(rise(0.85)).toBeLessThan(rise(1));
  });
});

describe('consistent friction and engraving', () => {
  it('lets the friction act on the bullet by default, without heat return or engraving', () => {
    const a = simulate(load(44), withParams({ frictionInMomentum: 1, frictionHeatReturn: 0, engravingResistance: 0 }));
    const b = simulate(load(44), defaultParams);
    expect(a.maxPressure).toBe(b.maxPressure);
    expect(a.muzzleVelocity).toBe(b.muzzleVelocity);
  });

  it('raises the pressure with an engraving resistance, a low charge relatively more', () => {
    const gain = (grains: number) => simulate(load(grains), withParams({ engravingResistance: 300e5, engravingLength: 0.006 })).maxPressure / simulate(load(grains), defaultParams).maxPressure;
    expect(gain(36)).toBeGreaterThan(1);
    expect(gain(36)).toBeGreaterThan(gain(46));
  });

  it('slows the bullet when the friction acts in its momentum', () => {
    expect(simulate(load(44), withParams({ frictionInMomentum: 1 })).muzzleVelocity).toBeLessThan(simulate(load(44), withParams({ frictionInMomentum: 0 })).muzzleVelocity);
  });
});
