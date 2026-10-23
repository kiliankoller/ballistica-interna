import { describe, expect, it } from 'vitest';
import { checkComponent, componentLabel } from './componentFields';

const caliber = { cipname: '308 Win.', L3: 51.18, L6: 71.12, G1: 7.85, c_Q: 47.51, V: 56.2, Pmax: 4150 };

describe('component editor checks', () => {
  it('accepts a complete caliber', () => {
    expect(checkComponent('caliber', caliber)).toEqual([]);
  });

  it('names missing and implausible fields', () => {
    const problems = checkComponent('caliber', { ...caliber, V: null, Pmax: 41500 });
    expect(problems.map((p) => p[0]).sort()).toEqual(['Pmax', 'V']);
  });

  it('checks relations between fields', () => {
    const powder = { mname: 'Own', pname: 'P1', Qex: 3900, k: 1.23, Ba: 0.5, a0: 1, z1: 0.8, z2: 0.5, pc: 1600, pcd: 950 };
    expect(checkComponent('propellant', powder).map((p) => p[0])).toEqual(['z2']);
    const bullet = { mname: 'Own', pname: 'B', gdia: 7.82, gmass: 150, glen: 5 };
    expect(checkComponent('projectile', bullet).map((p) => p[0])).toEqual(['glen']);
  });

  it('labels like the component choice', () => {
    expect(componentLabel('caliber', caliber)).toBe('308 Win.');
    expect(componentLabel('propellant', { mname: 'Reload Swiss', pname: 'RS52' })).toBe('Reload Swiss RS52');
  });
});
