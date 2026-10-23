import { describe, expect, it } from 'vitest';
import { newGrtLoad } from '@ballistica-interna/grtload';
import { jumpOf } from './jump';

describe('jump', () => {
  it('is the freebore end of the C.I.P. chamber minus the cartridge length plus the tip length', () => {
    const f = newGrtLoad();
    f.caliberfile.c_L3 = { name: 'c_L3', value: '51.44', unit: '', type: '', descr: '' };
    f.caliberfile.c_G = { name: 'c_G', value: '6.98', unit: '', type: '', descr: '' };
    f.caliber.oal!.value = '70.00';
    f.projectile.gtip!.value = '12.80';
    expect(jumpOf(f) * 1e3).toBeCloseTo(51.44 + 6.98 - (70 - 12.8), 6);
  });

  it('is unknown without the tip length or the chamber', () => {
    const f = newGrtLoad();
    f.caliber.oal!.value = '70.00';
    expect(jumpOf(f)).toBeNaN();
  });
});
