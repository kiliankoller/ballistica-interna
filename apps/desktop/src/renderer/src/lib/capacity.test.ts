import { describe, expect, it } from 'vitest';
import { newGrtLoad, type GrtLoadFile } from '@ballistica-interna/grtload';
import { GRAIN, WATER_DENSITY } from '@ballistica-interna/solver';
import { capacitySource } from './capacity';
import { recordFromLoad, recordNotes } from './components';

const cm3 = (grains: number) => String((grains * GRAIN * 1e6) / WATER_DENSITY);
const cell = (name: string, value: string) => ({ name, value, unit: '', type: '', descr: '' });

function sampleLoad(V: string, source: Record<string, string>, used = Number(V)): GrtLoadFile {
  const f = newGrtLoad();
  const set = (section: 'caliber' | 'gun' | 'projectile' | 'propellant', values: Record<string, string>) => {
    for (const [k, v] of Object.entries(values)) f[section][k]!.value = v;
  };
  set('caliber', { CaliberName: 'Test', caselen: '51', casevol: cm3(used), Dz: '7.8232', Aeff: '47.51', pMaxZul: '4150', sebert: '0.5', oal: '70' });
  set('gun', { xe: '520' });
  set('projectile', { mname: 'Maker', pname: 'Bullet', Dbul: '7.8232', mp: '10.692', glen: '34.65', gdepth: '15.65', gpressure: '250', g1bc: '0.44' });
  set('propellant', { mname: 'Powder', pname: 'P1', Ba: '0.5163', Qex: '3920', k: '1.2309', a0: '1.4103', z1: '0.5147', z2: '0.8321', pc: '1600', pcd: '950', mc: '2.79' });
  f.caliberfile = { V: cell('V', V), ...Object.fromEntries(Object.entries(source).map(([k, v]) => [k, cell(k, v)])) };
  return f;
}

describe('source of the case capacity', () => {
  it('is the master source while the load uses the master value', () => {
    expect(capacitySource(sampleLoad('55.8', { V_source: 'estimate' }))).toBe('estimate');
    expect(capacitySource(sampleLoad('55.8', { V_source: 'reload-swiss-fill' }))).toBe('loadData');
    // files of older versions
    expect(capacitySource(sampleLoad('57.8', { V_estimated: 'yes' }))).toBe('estimate');
  });

  it('is own once the user enters another value, or without a master value', () => {
    expect(capacitySource(sampleLoad('55.8', { V_source: 'estimate' }, 54.1))).toBe('own');
    expect(capacitySource(sampleLoad('', {}, 54.1))).toBe('own');
  });

  it('stays in an own copy only while the copy keeps the master value', () => {
    expect(recordFromLoad('caliber', sampleLoad('55.8', { V_source: 'estimate' }), 'Copy').V_source).toBe('estimate');
    const measured = recordFromLoad('caliber', sampleLoad('55.8', { V_source: 'estimate' }, 54.1), 'Copy');
    expect(measured.V_source).toBe('own');
    expect(recordNotes(measured)).not.toContain('source.capacityEstimated');
  });

  it('is named next to a master caliber', () => {
    expect(recordNotes({ cipname: 'x', V: 55.8, V_source: 'estimate' })).toContain('source.capacityEstimated');
    expect(recordNotes({ cipname: 'x', V: 55.8, V_source: 'reload-swiss-fill' })).toContain('source.capacityLoadData');
  });
});
