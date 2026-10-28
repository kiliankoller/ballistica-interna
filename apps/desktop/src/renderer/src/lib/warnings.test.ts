import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PropellantInput } from '@ballistica-interna/solver';
import { LOW_FILL, loadWarnings, lowFill, marginText, powderMatches, pressureMargin, resultNotices, slowPowder, type NoticeInput } from './warnings';

/** Burn values of the shipped powders by name (data/powders.csv: mname, pname, Ba, Qex, k, a0, a1, z1, z2, pc first). */
const shipped = new Map(
  readFileSync(join(import.meta.dirname, '..', '..', '..', '..', '..', '..', 'data', 'powders.csv'), 'utf8')
    .trim()
    .split('\n')
    .slice(1)
    .map((l) => l.split(','))
    .map(([, pname, Ba, Qex, k, a0, a1, z1, z2, pc]) => [
      pname!,
      { Ba: +Ba!, Qex: +Qex! * 1e3, kappa: +k!, a0: +a0!, a1: +a1!, z1: +z1!, z2: +z2!, materialDensity: +pc! } as PropellantInput,
    ]),
);
const slow = shipped.get('RS70')!;
const medium = shipped.get('RS40')!;

describe('warnings next to the result', () => {
  it('warns below a fill ratio of 90 %, not at or above it', () => {
    expect(LOW_FILL).toBe(0.9);
    expect(lowFill(0.65)).toBe(true);
    expect(lowFill(0.8999)).toBe(true);
    expect(lowFill(0.9)).toBe(false);
    expect(lowFill(1.02)).toBe(false);
  });

  it('does not warn without a usable fill ratio', () => {
    expect(lowFill(undefined)).toBe(false);
    expect(lowFill(NaN)).toBe(false);
    expect(lowFill(0)).toBe(false);
  });

  it('gives the 95 % quantile and the worst case of the tests by fill ratio', () => {
    expect(pressureMargin(0.75)).toEqual({ typical: 0.34, max: 0.56 });
    expect(pressureMargin(0.8)).toEqual({ typical: 0.27, max: 0.5 });
    expect(pressureMargin(0.9)).toEqual({ typical: 0.21, max: 0.34 });
    expect(pressureMargin(0.99)).toEqual({ typical: 0.21, max: 0.34 });
    expect(pressureMargin(1.05)).toEqual({ typical: 0.15, max: 0.22 });
    expect(pressureMargin(undefined)).toBeUndefined();
  });

  it('fills the margin text with both figures and the input spread', () => {
    expect(marginText({ typical: 0.23, max: 0.4 }, 3000e5)).toMatchObject({ pct: '23', bar: '3690', maxPct: '40', maxBar: '4200', spread: '8' });
  });

  it('warns of the secondary explosion effect only for slow powders below 85 %', () => {
    expect(loadWarnings(0.8, slow).slowPowderLowFill).toBe(true);
    expect(loadWarnings(0.8, medium).slowPowderLowFill).toBe(false);
    expect(loadWarnings(0.87, slow).slowPowderLowFill).toBe(false);
    expect(loadWarnings(0.8, undefined).slowPowderLowFill).toBe(false);
  });

  it('counts the slow powders of the master data as slow, the medium ones not', () => {
    // Lovex S070 burns like URP and R904 by Explosia's chart: its low Qex gives it a high Ba, not a high pressure;
    // Rottweil R903 (next to IMR4064 there) is ranked too slow by the model and warned about as well
    for (const p of ['R903', 'N550', 'N160', 'N165', 'N170', '24N41', 'N560', 'N570', 'RS60', 'RS62', 'RS70', 'RS76', 'RS80', '204', 'URP', 'R904', 'S070']) {
      expect(slowPowder(shipped.get(p)), p).toBe(true);
    }
    for (const p of ['N133', 'N140', 'N150', 'RS40', 'RS50', 'RS52', '202', '203B', 'R907', 'N540', 'S062', 'S065']) {
      expect(slowPowder(shipped.get(p)), p).toBe(false);
    }
  });

  it('combines them', () => {
    expect(loadWarnings(0.8, medium)).toEqual({ lowFill: true, veryLowFill: true, slowPowderLowFill: false, estimatedCapacity: false });
    expect(loadWarnings(0.87, medium)).toEqual({ lowFill: true, veryLowFill: false, slowPowderLowFill: false, estimatedCapacity: false });
    expect(loadWarnings(0.95, medium, 'estimate')).toEqual({ lowFill: false, veryLowFill: false, slowPowderLowFill: false, estimatedCapacity: true });
    expect(loadWarnings(0.95, medium, 'loadData').estimatedCapacity).toBe(false);
  });
});

describe('notices next to the result in three levels', () => {
  const step = (fill: number, bar: number, charge = 0.0029) => ({ charge, fill, maxPressure: bar * 1e5 });
  const base: NoticeInput = {
    steps: [step(0.95, 3000)], selected: 0, powder: medium, powderChecked: true, capacity: 'own', cipPressure: 4150e5, shortJump: null, handgun: false, slowTwist: null,
  };
  const notices = (i: Partial<NoticeInput>) => resultNotices({ ...base, ...i });
  const keys = (i: Partial<NoticeInput>, level: string) => notices(i).filter((n) => n.level === level).map((n) => n.key);

  it('always gives the note, with the laboratory figures at a fill ratio of 90 % or more', () => {
    expect(keys({}, 'danger')).toEqual([]);
    expect(keys({}, 'caution')).toEqual([]);
    expect(keys({}, 'note')).toEqual(['result.uncalibrated', 'result.pressureMargin', 'result.inputSpread', 'result.capacitySource.own']);
  });

  it('puts the figures into the fill ratio warning below 90 %: caution down to 85 %, danger below', () => {
    expect(notices({ steps: [step(0.87, 3000)] }).find((n) => n.key === 'result.lowFill')).toMatchObject({ level: 'caution', args: { fill: '87', limit: '90', pct: '27', maxPct: '50' } });
    expect(notices({ steps: [step(0.74, 2000)] }).find((n) => n.key === 'result.lowFill')).toMatchObject({ level: 'danger', args: { fill: '74', limit: '85', pct: '34', maxPct: '56' } });
    expect(keys({ steps: [step(0.74, 2000)] }, 'note')).not.toContain('result.pressureMargin');
  });

  it('shows a calculated pressure above the C.I.P. maximum as danger, without the caution saying the same', () => {
    expect(notices({ steps: [step(0.95, 4300)] }).find((n) => n.key === 'result.aboveCip')).toMatchObject({ level: 'danger', args: { p: '4300', pmax: '4150' } });
    expect(keys({ steps: [step(0.95, 4300)] }, 'caution')).toEqual([]);
    expect(keys({ steps: [step(0.95, 4150)] }, 'danger')).toEqual([]);
  });

  it('warns with caution when the laboratory deviation can carry the pressure over the C.I.P. maximum', () => {
    expect(keys({ steps: [step(0.95, 3800)] }, 'caution')).toEqual(['result.overPmax']);
    expect(keys({ steps: [step(0.95, 3300)] }, 'caution')).toEqual([]);
  });

  it('checks the whole ladder and names the step when it is not the one shown', () => {
    const ladder = [step(0.95, 4300, 0.0030), step(0.92, 3900, 0.0029), step(0.83, 2600, 0.0027)];
    const n = notices({ steps: ladder, selected: 1 });
    expect(n.find((x) => x.key === 'result.aboveCip')).toMatchObject({ level: 'danger', charge: '46.30' });
    expect(n.find((x) => x.key === 'result.lowFill')).toMatchObject({ level: 'danger', charge: '41.67', args: { fill: '83' } });
    expect(notices({ steps: ladder, selected: 0 }).find((x) => x.key === 'result.aboveCip')!.charge).toBeUndefined();
  });

  it('gives no laboratory figures for a powder that is not the shipped model, and says so', () => {
    expect(keys({ powderChecked: false }, 'caution')).toEqual(['result.powderUnchecked']);
    expect(keys({ powderChecked: false }, 'note')).not.toContain('result.pressureMargin');
    expect(keys({ powderChecked: false, steps: [step(0.95, 3800)] }, 'caution')).not.toContain('result.overPmax');
    expect(notices({ powderChecked: false, steps: [step(0.8, 2500)] }).find((n) => n.key.startsWith('result.lowFill'))!.key).toBe('result.lowFillPlain');
  });

  it('gives no rifle figures for a handgun', () => {
    expect(keys({ handgun: true }, 'danger')).toEqual(['result.handgun']);
    expect(keys({ handgun: true }, 'note')).not.toContain('result.pressureMargin');
    expect(keys({ handgun: true, steps: [step(0.95, 3800)] }, 'caution')).toEqual([]);
  });

  it('shows a short jump and a slow powder loosely filled as danger', () => {
    expect(notices({ shortJump: 1.2e-3 }).find((n) => n.key === 'result.shortJump')).toMatchObject({ level: 'danger', action: 'startPressure' });
    expect(keys({ steps: [step(0.8, 2500)], powder: slow }, 'danger')).toEqual(['result.lowFill', 'result.slowPowderLowFill']);
  });

  it('shows an estimated case capacity and a slow twist with caution, the capacity only once', () => {
    expect(keys({ capacity: 'estimate', slowTwist: { twist: 12, min: 10 } }, 'caution')).toEqual(['result.capacityEstimated', 'result.slowTwist']);
    expect(keys({ capacity: 'estimate' }, 'note')).not.toContain('result.capacitySource.estimate');
  });
});

describe('the shipped powder model', () => {
  const record = { fit_status: 'fitted: pressure and velocity measured', Ba: 0.6895, Qex: 3700, k: 1.23, a0: -0.47, a1: 0, z1: 0.518, z2: 0.779, pc: 1600 };
  const values = { Ba: '0.6895', Qex: '3700', k: '1.23', a0: '-0.47', a1: '0', z1: '0.518', z2: '0.779', pc: '1600' };

  it('is recognised by unchanged burn values of a fitted master record', () => {
    expect(powderMatches(values, record)).toBe(true);
    expect(powderMatches({ ...values, Ba: '0.70' }, record)).toBe(false);
    expect(powderMatches(values, { ...record, fit_status: '' })).toBe(false);
    expect(powderMatches(values, null)).toBe(false);
  });
});
