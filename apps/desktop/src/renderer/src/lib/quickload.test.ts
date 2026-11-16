import { describe, expect, it } from 'vitest';
import { toSI } from '@ballistica-interna/grtload';
import { parseQuickLoad } from '../../../shared/quickload';
import { loadFromQuickLoad } from './quickload';

const dat = [
  'pattyp=.300 WSM (CIP)',
  'bultyp=.308, 180, Brenneke TOG',
  'pulver=Norma MRP',
  'buldia=0.308',
  'bulgew=180',
  'bullen=1.25',
  'hullen=2.1',
  'patlan=2.86',
  'volful=79.5',
  'kalzug=0.308',
  'wirkqu=48.4',
  'maxzul=440',
  'mulbc1=0.35',
  'laflen=24',
  'powwht=62.5',
  'powtmp=-5',
].join('\r\n');

const si = (f: { value: string; unit: string } | undefined) => toSI(Number(f!.value), f!.unit);

describe('loadFromQuickLoad', () => {
  it('builds caliber and bullet from the file when not in the master data and leaves the powder to choose', () => {
    const q = loadFromQuickLoad({ path: '/x/My load.dat', values: parseQuickLoad(dat), caliber: null, projectile: null, propellant: null });
    expect(q.name).toBe('My load');
    expect(q.components.caliber).toMatchObject({ from: 'quickload', label: '300 WSM' });
    expect(q.components.projectile).toMatchObject({ from: 'quickload', label: 'Brenneke TOG 180 gr' });
    expect(q.components.propellant).toMatchObject({ from: 'missing', label: 'Norma MRP' });
    const f = q.file;
    expect(f.caliber.CaliberName!.value).toBe('300 WSM');
    expect(si(f.propellant.mc)).toBeCloseTo(62.5 * 64.79891e-6, 9);
    expect(si(f.gun.xe)).toBeCloseTo(24 * 0.0254, 9);
    expect(si(f.caliber.oal)).toBeCloseTo(2.86 * 0.0254, 9);
    expect(si(f.caliber.pMaxZul)).toBeCloseTo(4400e5, 0);
    expect(Number(f.propellant.pt!.value)).toBe(-5);
    // seating depth follows from case length + bullet length − OAL
    expect(si(f.projectile.gdepth)).toBeCloseTo((2.1 + 1.25 - 2.86) * 0.0254, 9);
  });

  it('takes master records and lays the file values over them', () => {
    const caliber = { id: 1, cipname: '308 Win.', L3: 51.18, L6: 71.12, V: 56, V_source: 'estimate', c_Z: 7.82, G1: 7.85, c_Q: 47.5, Pmax: 4150, tab: 1, source_name: 'C.I.P.' };
    const propellant = { id: 2, mname: 'Reload Swiss', pname: 'RS60', Ba: 0.6, Qex: 3900, k: 1.23, a0: 0.1, a1: 0, z1: 0.5, z2: 0.8, pc: 1600, pcd: 900, pt: 21, tcc: 0, tch: 0, fit_status: 'fitted', source_name: 'fit' };
    const q = loadFromQuickLoad({ path: 'C:\\a\\b.dat', values: parseQuickLoad(dat.replace('Norma MRP', 'RS 60')), caliber, projectile: null, propellant });
    expect(q.components.caliber).toMatchObject({ from: 'master', label: '308 Win.', source: 'C.I.P.' });
    // the file's capacity replaces the estimated one: no note about it
    expect(q.components.caliber.notes).not.toContain('source.capacityEstimated');
    expect(q.components.propellant.from).toBe('master');
    expect(q.powderRecord).toBe(propellant);
    expect(Number(q.file.propellant.Ba!.value)).toBe(0.6);
    expect(Number(q.file.propellant.pt!.value)).toBe(-5);
    expect(si(q.file.caliber.caselen)).toBeCloseTo(2.1 * 0.0254, 9);
    expect(q.file.caliberfile.V_source!.value).toBe('own');
  });
});
