import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PropellantInput } from '@ballistica-interna/solver';
import { LOW_FILL, loadWarnings, lowFill, pressureMargin, slowPowder } from './warnings';

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

  it('gives the worst case of the tests by fill ratio', () => {
    expect(pressureMargin(0.8)).toBe(0.67);
    expect(pressureMargin(0.9)).toBe(0.4);
    expect(pressureMargin(0.99)).toBe(0.4);
    expect(pressureMargin(1.05)).toBe(0.3);
    expect(pressureMargin(undefined)).toBeUndefined();
  });

  it('warns of the secondary explosion effect only for slow powders below 85 %', () => {
    expect(loadWarnings(0.8, slow).slowPowderLowFill).toBe(true);
    expect(loadWarnings(0.8, medium).slowPowderLowFill).toBe(false);
    expect(loadWarnings(0.87, slow).slowPowderLowFill).toBe(false);
    expect(loadWarnings(0.8, undefined).slowPowderLowFill).toBe(false);
  });

  it('counts the slow powders of the master data as slow, the medium ones not', () => {
    // Lovex S070 burns like URP and R904 by Explosia's chart: its low Qex gives it a high Ba, not a high pressure
    for (const p of ['N550', 'N160', 'N165', 'N170', '24N41', 'N560', 'N570', 'RS60', 'RS62', 'RS70', 'RS76', 'RS80', '204', 'URP', 'R904', 'S070']) {
      expect(slowPowder(shipped.get(p)), p).toBe(true);
    }
    for (const p of ['N133', 'N140', 'N150', 'RS40', 'RS50', 'RS52', '202', '203B', 'R903', 'S062', 'S065']) {
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
