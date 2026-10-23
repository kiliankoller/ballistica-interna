import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { completeFields, newGrtLoad, parseGrtLoad, serializeGrtLoad, toLoadInput } from '../src/index.ts';

const fixture = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'r8-aero-v2', 'load.grtload');

describe('serializeGrtLoad', () => {
  it('writes a new load that parses back', () => {
    const file = newGrtLoad();
    file.title = 'Test (1)';
    file.propellant.mc!.value = '2.5';
    file.caliberfile.L1 = { name: 'L1', value: '39.62', unit: '', type: '', descr: '' };
    const back = parseGrtLoad(serializeGrtLoad(file));
    expect(back.title).toBe('Test (1)');
    expect(back.propellant.mc?.value).toBe('2.5');
    expect(back.caliberfile.L1?.value).toBe('39.62');
    // an empty tip length is not written (as in files of GRT versions without the field)
    expect(Object.keys(back.projectile)).toEqual(Object.keys(file.projectile).filter((k) => k !== 'gtip'));
  });

  it.skipIf(!existsSync(fixture))('writes a file of GRT unchanged byte for byte', () => {
    const xml = readFileSync(fixture, 'utf8');
    expect(serializeGrtLoad(completeFields(parseGrtLoad(xml)))).toBe(xml);
  });

  it.skipIf(!existsSync(fixture))('round-trips a .grtload file without loss', () => {
    const xml = readFileSync(fixture, 'utf8');
    const file = parseGrtLoad(xml);
    const again = parseGrtLoad(serializeGrtLoad(file));
    expect(again).toEqual(file);
    expect(toLoadInput(again)).toEqual(toLoadInput(file));
  });
});
