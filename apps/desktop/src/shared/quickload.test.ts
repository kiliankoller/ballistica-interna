import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { DbRecord } from './api';
import { bulletName, caliberKey, isQuickLoad, matchCaliber, matchPowder, parseQuickLoad, qlNumber } from './quickload';

describe('parseQuickLoad', () => {
  it('keeps the first value of each name and reads decimal commas', () => {
    const v = parseQuickLoad('pattyp=.308 Win. (CIP)\r\nbultyp=.308, 165, AERO SB\r\npulver=RS 60\r\npowwht=45,5\r\npowwht=1\r\n');
    expect(isQuickLoad(v)).toBe(true);
    expect(qlNumber(v, 'powwht')).toBe(45.5);
    expect(qlNumber(v, 'missing')).toBeNaN();
    expect(isQuickLoad(parseQuickLoad('a=1'))).toBe(false);
  });
  it('strips caliber, weight and smax from the bullet name', () => {
    expect(bulletName('.308, 165, Hornady BTHP Match 30631, - smax: 3.5')).toBe('Hornady BTHP Match 30631');
  });
});

describe('caliberKey', () => {
  it('treats spelling differences alike', () => {
    expect(caliberKey('8.5 x 63')).toBe(caliberKey('8,5 x 63'));
    expect(caliberKey('.375 H.& H. Mag.')).toBe(caliberKey('375 H&H Mag.'));
    expect(caliberKey('7 mm Blaser Mag')).toBe(caliberKey('7 mm Blaser Mag.'));
  });
});

const dbPath = join(import.meta.dirname, '..', '..', '..', '..', 'data', 'build', 'ballisticainterna.db');

// against the shipped master data (pnpm data); the names are those of real QuickLOAD files
describe.skipIf(!existsSync(dbPath))('matching against the master data', () => {
  const db = new DatabaseSync(dbPath, { readOnly: true } as ConstructorParameters<typeof DatabaseSync>[1]);
  const all = (t: string) => db.prepare(`select * from ${t} where geloescht = 0`).all() as DbRecord[];
  const calibers = all('caliber');
  const powders = all('propellant');

  it('finds the calibers', () => {
    const expected: Record<string, string | null> = {
      '8 x 68 S': '8 x 68 S',
      '.308 Win. (CIP)': '308 Win.',
      '7 mm Blaser Mag': '7 mm Blaser Mag.',
      '.30-06 Spring.  (CIP)': '30-06 Spring.',
      '.375 H.& H. Mag.': '375 H&H Mag.',
      '.300 WSM (CIP)': null,
      '.338 Blaser Mag': '338 Blaser Mag.',
      '8.5 x 63': '8,5 x 63',
      '7 x 57 mm Mauser': '7 x 57',
      '5.6 x 50 R Mag.': '5,6 x 50 R Mag.',
    };
    for (const [ql, cip] of Object.entries(expected)) expect([ql, matchCaliber(ql, calibers)?.cipname ?? null]).toEqual([ql, cip]);
  });

  it('finds the powders with a fit and no other', () => {
    const expected: Record<string, string | null> = {
      'RS 60': 'Reload Swiss RS60',
      'ReloadSwiss RS 52': 'Reload Swiss RS52',
      'Norma 202': 'Norma 202',
      'Norma 203B': 'Norma 203B',
      'Norma URP': 'Norma URP',
      'Vihtavuori N140': 'Vihtavuori N140',
      'Norma MRP': null,
      'Somchem S355': null,
      'Alliant Reloder-17': null,
      'Accurate 2200': null,
    };
    for (const [ql, name] of Object.entries(expected)) {
      const r = matchPowder(ql, powders);
      expect([ql, r ? `${r.mname} ${r.pname}` : null]).toEqual([ql, name]);
    }
  });
});
