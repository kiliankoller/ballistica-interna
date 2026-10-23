import { describe, expect, it } from 'vitest';
import { newGrtLoad, toLoadInput, type GrtLoadFile } from '@ballistica-interna/grtload';
import { applyCaliber, applyProjectile, applyPropellant, recordFromLoad } from './components';

function sampleLoad(): GrtLoadFile {
  const f = newGrtLoad();
  const set = (section: 'caliber' | 'gun' | 'projectile' | 'propellant', values: Record<string, string>) => {
    for (const [k, v] of Object.entries(values)) f[section][k]!.value = v;
  };
  set('caliber', { CaliberName: 'Test', caselen: '51', casevol: '3.62', Dz: '7.8232', Aeff: '47.51', pMaxZul: '4150', sebert: '0.5', oal: '70' });
  set('gun', { xe: '520' });
  set('projectile', { mname: 'Maker', pname: 'Bullet', Dbul: '7.8232', mp: '10.692', glen: '34.65', gdepth: '15.65', gpressure: '200', g1bc: '0.44' });
  set('propellant', { mname: 'Powder', pname: 'P1', Ba: '0.5163', Qex: '3920', k: '1.2309', a0: '1.4103', z1: '0.5147', z2: '0.8321', pc: '1600', pcd: '950', mc: '2.79' });
  f.caliberfile = { L1: { name: 'L1', value: '39.62', unit: '', type: '', descr: '' }, L6: { name: 'L6', value: '71.12', unit: '', type: '', descr: '' } };
  return f;
}

describe('own components', () => {
  it('give back the same load values after storing and applying them', () => {
    const source = sampleLoad();
    const target = sampleLoad();
    for (const name of ['caselen', 'casevol', 'Dz', 'Aeff', 'pMaxZul']) target.caliber[name]!.value = '1';
    for (const name of ['mp', 'glen', 'Dbul']) target.projectile[name]!.value = '1';
    for (const name of ['Ba', 'Qex', 'z1']) target.propellant[name]!.value = '1';
    target.caliber.oal!.value = '70';

    applyCaliber(target, recordFromLoad('caliber', source, 'My .308'));
    applyProjectile(target, recordFromLoad('projectile', source, 'My bullet'));
    applyPropellant(target, recordFromLoad('propellant', source, 'My powder'));

    const a = toLoadInput(source);
    const b = toLoadInput(target);
    const same = (x: number, y: number, what: string) => expect(Math.abs(x / y - 1), what).toBeLessThan(1e-9);
    for (const [k, v] of Object.entries(a.cartridge)) same((b.cartridge as unknown as Record<string, number>)[k]!, v as number, k);
    same(b.projectile.mass, a.projectile.mass, 'mass');
    same(b.projectile.length, a.projectile.length, 'length');
    same(b.projectile.diameter, a.projectile.diameter, 'diameter');
    expect(b.propellant.Ba).toBe(a.propellant.Ba);
    expect(b.propellant.Qex).toBe(a.propellant.Qex);
    expect(b.propellant.z1).toBe(a.propellant.z1);
    expect(target.caliber.CaliberName?.value).toBe('My .308');
    expect(target.caliberfile.L1?.value).toBe('39.62');
  });
});
