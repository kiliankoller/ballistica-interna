import { describe, expect, it } from 'vitest';
import { checkComponent, componentLabel, recordFromValues } from './componentFields';

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

describe('recordFromValues', () => {
  it('takes a decimal comma in number fields only, text fields stay as typed', () => {
    const values = { cipname: '6,5 x 57', altname: '', L3: '57', L6: '82,3', G1: '6,72', c_Z: '', c_Q: '33.6', V: '55', Pmax: '4400', sebert: '' };
    const r = recordFromValues('caliber', null, values);
    expect(r.cipname).toBe('6,5 x 57');
    expect(r.L6).toBe(82.3);
    expect(r.G1).toBe(6.72);
    expect(r.c_Z).toBeNull();
  });

  it('keeps the other fields of the source record and names the origin of a copy', () => {
    const r = recordFromValues('projectile', { id: 7, source_name: 'x', gtailtype: 2, mname: 'Old' }, { mname: 'Hornady, Inc.' }, 'Hornady ELD-X');
    expect(r).toMatchObject({ mname: 'Hornady, Inc.', gtailtype: 2, origin: 'Hornady ELD-X' });
    expect('id' in r || 'source_name' in r).toBe(false);
  });
});
