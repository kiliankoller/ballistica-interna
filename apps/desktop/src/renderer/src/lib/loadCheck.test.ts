import { describe, expect, it } from 'vitest';
import { newGrtLoad } from '@ballistica-interna/grtload';
import { checkLoad } from './loadCheck';

describe('checkLoad', () => {
  it('names every missing field of a new load with the row it is entered in', () => {
    const issues = checkLoad(newGrtLoad());
    const charge = issues.find((i) => i.name === 'mc');
    expect(charge).toEqual({ section: 'propellant', name: 'mc', label: 'charge', problem: 'check.missing' });
    expect(issues.find((i) => i.name === 'glen')?.label).toBe('bulletLength');
    // fields with a default value are not reported
    expect(issues.some((i) => i.name === 'xe' || i.name === 'sebert')).toBe(false);
  });

  it('does not ask for the covolume eta, which the model does not use', () => {
    const f = newGrtLoad();
    f.propellant.eta!.value = '0';
    expect(checkLoad(f).some((i) => i.name === 'eta')).toBe(false);
  });

  it('reports values that are not numbers, not positive or out of order', () => {
    const f = newGrtLoad();
    f.propellant.mc!.value = '0';
    f.projectile.mp!.value = 'abc';
    f.propellant.z1!.value = '0.6';
    f.propellant.z2!.value = '0.4';
    const problem = (name: string) => checkLoad(f).find((i) => i.name === name)?.problem;
    expect(problem('mc')).toBe('check.notPositive');
    expect(problem('mp')).toBe('check.notNumber');
    expect(problem('z2')).toBe('check.z2BelowZ1');
  });
});

describe('bullet fit', () => {
  it('keeps .308 and .311 bullets apart and accepts bullets a few hundredths below G1', async () => {
    const { fitsCaliber } = await import('./components');
    expect(fitsCaliber(7.82, 7.85)).toBe(true); // .308 Win.
    expect(fitsCaliber(7.9, 7.85)).toBe(false); // .311 in .308 Win.
    expect(fitsCaliber(7.82, 7.92)).toBe(false); // .308 in 7,62 x 39
    expect(fitsCaliber(7.21, 7.25)).toBe(true); // 7 x 64
    expect(fitsCaliber(9.25, 9.3)).toBe(true); // 9,3 x 62
  });

  it('reports a bullet that does not fit the chosen caliber', () => {
    const f = newGrtLoad();
    f.caliber.CaliberName!.value = '308 Win.';
    f.caliberfile.G1 = { name: 'G1', value: '7.85', unit: '', type: '', descr: '' };
    f.projectile.Dbul!.value = '9.3';
    expect(checkLoad(f).find((i) => i.name === 'Dbul')?.problem).toBe('check.bulletNotFitting');
  });
});
