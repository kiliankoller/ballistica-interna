import { describe, expect, it } from 'vitest';
import { newGrtLoad } from '@ballistica-interna/grtload';
import { applyCaliber } from './components';
import { defaultStartPressure } from './startPressure';

const loadWith = (cipname: string, tab: number) => {
  const f = newGrtLoad();
  applyCaliber(f, { cipname, tab, L3: 20, L6: 30, G1: 9, c_Q: 63, V: 13, Pmax: 2350 });
  return f;
};

describe('default start pressure', () => {
  it('gives rifles 250 bar', () => {
    expect(defaultStartPressure(loadWith('308 Win.', 1))).toBe(250);
  });

  it('gives auto pistol cartridges 290 bar and revolver cartridges 150 bar', () => {
    for (const name of ['9 mm Luger', '45 Auto', '357 SIG', '40 S&W', '38 Super Auto', '10 mm Auto', '9 mm Browning court']) {
      expect(defaultStartPressure(loadWith(name, 4))).toBe(290);
    }
    for (const name of ['38 Special', '357 Magnum', '44 Rem. Mag.', '45 Colt', '500 S&W Mag.', '32 S&W Long']) {
      expect(defaultStartPressure(loadWith(name, 4))).toBe(150);
    }
  });

  it('is set when the caliber is taken', () => {
    expect(loadWith('9 mm Luger', 4).projectile.gpressure!.value).toBe('290');
  });
});
