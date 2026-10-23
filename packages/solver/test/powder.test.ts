import { describe, expect, it } from 'vitest';
import { brisance, defaultParams, formFunction, progressivity, vivacityAt, type PropellantInput } from '../src/index.ts';

// An invented powder with round values: sqrt(2 (κ − 1)) = 0.7, so Br = 0.7 · 1.0 · 4000 / 10000 = 0.28
const powder: PropellantInput = {
  Ba: 1.0,
  Qex: 4000e3,
  kappa: 1.245,
  a0: 0.5,
  a1: 0,
  z1: 0.4,
  z2: 0.8,
  covolume: 1e-3,
  materialDensity: 1600,
  bulkDensity: 950,
  referenceTemperature: 21,
  temperature: 21,
  tcc: 0,
  tch: 0,
  charge: 0,
};

describe('powder factors', () => {
  it('computes the brisance Br after the documented formula', () => {
    expect(brisance(powder)).toBeCloseTo(0.28, 9);
  });

  it('computes the progressivity Bp with the phase-1 form function at z1', () => {
    expect(progressivity(powder, defaultParams)).toBeCloseTo(0.28 * 1.2 ** defaultParams.phase1Exponent, 9);
  });
});

describe('form function', () => {
  const p = { ...powder, a0: 2, a1: -0.5, z1: 0.4, z2: 0.8 };

  it('starts at 1 and ends at 0', () => {
    expect(formFunction(0, p, defaultParams)).toBe(1);
    expect(formFunction(1, p, defaultParams)).toBe(0);
  });

  it('is continuous at z1 and z2', () => {
    for (const z of [p.z1, p.z2]) {
      expect(formFunction(z - 1e-9, p, defaultParams)).toBeCloseTo(formFunction(z, p, defaultParams), 6);
    }
  });
});

describe('powder temperature', () => {
  const at = (temperature: number, tcc = 0, tch = 0) => vivacityAt({ ...powder, temperature, tcc, tch }) / powder.Ba;

  it('uses the built-in rates without coefficients', () => {
    expect(at(21)).toBe(1);
    expect(at(-20)).toBeCloseTo(1 - 41 * 5.4e-4, 9);
    expect(at(60)).toBeCloseTo(1 + 39 * 1.0e-3, 9);
  });

  it('scales Ba weakly with an explicit coefficient, faster when cold for a positive tcc', () => {
    expect(at(-20, 0.002)).toBeCloseTo(1 + 0.0255 * 0.002 * 41, 9);
    expect(at(50, 0, 0.005)).toBeCloseTo(1 + 0.0268 * 0.005 * 29, 9);
  });

  it('ignores the built-in rate on a side without coefficient once the other side has one', () => {
    expect(at(-20, 0, 0.002)).toBe(1);
  });
});
