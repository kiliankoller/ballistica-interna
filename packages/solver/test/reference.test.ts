import { describe, expect, it } from 'vitest';
import { referencePressure } from '../src/index.ts';

const powder = { Ba: 0.55, Qex: 3.9e6, kappa: 1.23, a0: 1, a1: 0, z1: 0.5, z2: 0.8 };

describe('reference load', () => {
  it('ranks a livelier powder above a slower one', () => {
    expect(referencePressure({ ...powder, Ba: 0.7 })).toBeGreaterThan(referencePressure(powder));
  });

  it('counts the energy of the powder, not Ba alone', () => {
    expect(referencePressure({ ...powder, Qex: 3.4e6 })).toBeLessThan(referencePressure(powder));
  });

  it('gives a peak pressure in the range of a rifle load', () => {
    const p = referencePressure(powder) / 1e5;
    expect(p).toBeGreaterThan(2000);
    expect(p).toBeLessThan(6000);
  });
});
