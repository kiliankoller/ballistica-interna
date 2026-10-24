import { describe, expect, it } from 'vitest';
import { newGrtLoad } from '@ballistica-interna/grtload';
import { applyProjectile, recordNotes } from './components';

describe('notes on master records', () => {
  it('asks to measure a bullet whose length is missing or ambiguous', () => {
    expect(recordNotes({ gdia: 7.82, glen: null, flags: 'jbm_no_match length_missing', length_source: '' })).toEqual(['source.lengthMissing']);
    expect(recordNotes({ gdia: 7.82, glen: null, flags: 'length_ambiguous', length_source: '' })).toEqual(['source.lengthMissing']);
  });

  it('names a length from JBM, and Bryan Litz where he measured it', () => {
    expect(recordNotes({ gdia: 7.82, glen: 31.2, flags: '', length_source: 'jbm' })).toEqual(['source.lengthJbm']);
    expect(recordNotes({ gdia: 7.82, glen: 31.2, flags: '', length_source: 'jbm-litz' })).toEqual(['source.lengthJbmLitz']);
    expect(recordNotes({ gdia: 7.82, glen: 31.2, flags: '', length_source: 'maker' })).toEqual([]);
  });

  it('warns about implausible maker values and estimated bulk densities', () => {
    expect(recordNotes({ gdia: 7.2, glen: 38.5, flags: 'implausible_weight', length_source: 'maker' })).toEqual(['source.implausible']);
    expect(recordNotes({ pname: 'R902', fit_status: 'fitted: …; bulk density not published: typical value 950 kg/m³' })).toEqual(['source.bulkEstimated']);
  });

  it('names a powder fit that differs from the others of its maker', () => {
    expect(recordNotes({ pname: '24N41', fit_status: 'fitted: …; fitted with all calibers, unlike the other Vihtavuori powders' })).toEqual(['source.fitAllCalibers']);
  });

  it('leaves the length of a bullet without one empty instead of 0', () => {
    const f = newGrtLoad();
    applyProjectile(f, { mname: 'Hornady', pname: '10mm 180 gr FMJ-FP', caliber: '.400', gdia: 10.16, gmass: 180, glen: null });
    expect(f.projectile.glen!.value).toBe('');
  });
});

describe('minimum twist', () => {
  it('reads the maker\'s minimum twist from the note', async () => {
    const { minTwistOf } = await import('./components');
    expect(minTwistOf({ note: 'min. twist 1:10"' })).toBeCloseTo(254, 6);
    expect(minTwistOf({ note: '' })).toBeNull();
  });
});

describe('bullet base', () => {
  it('takes a bullet with a boat tail length but no base type as a boat tail', () => {
    const f = newGrtLoad();
    applyProjectile(f, { mname: 'Berger', pname: 'x', caliber: '.308', gdia: 7.82, gmass: 208, glen: 40, gtailh: 5.51, gtailtype: '' });
    expect(f.projectile.gTailType!.value).toBe('2');
    applyProjectile(f, { mname: 'Sierra', pname: 'y', caliber: '.308', gdia: 7.82, gmass: 150, glen: 28, gtailh: null, gtailtype: '' });
    expect(f.projectile.gTailType!.value).toBe('0');
  });
});
