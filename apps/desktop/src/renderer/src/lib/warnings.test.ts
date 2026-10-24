import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOW_FILL, SLOW_BA, loadWarnings, lowFill, pressureMargin } from './warnings';

/** Ba of the shipped powders by name (data/powders.csv: mname, pname, Ba first). */
const shippedBa = new Map(
  readFileSync(join(import.meta.dirname, '..', '..', '..', '..', '..', '..', 'data', 'powders.csv'), 'utf8')
    .trim()
    .split('\n')
    .slice(1)
    .map((l) => l.split(','))
    .map(([, pname, Ba]) => [pname!, Number(Ba)]),
);

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
    expect(pressureMargin(0.8)).toBe(0.8);
    expect(pressureMargin(0.9)).toBe(0.45);
    expect(pressureMargin(0.99)).toBe(0.45);
    expect(pressureMargin(1.05)).toBe(0.31);
    expect(pressureMargin(undefined)).toBeUndefined();
  });

  it('warns of the secondary explosion effect only for slow powders below 85 %', () => {
    expect(loadWarnings(0.8, 0.46).slowPowderLowFill).toBe(true);
    expect(loadWarnings(0.8, 0.6).slowPowderLowFill).toBe(false);
    expect(loadWarnings(0.87, 0.46).slowPowderLowFill).toBe(false);
    expect(loadWarnings(0.8, undefined).slowPowderLowFill).toBe(false);
  });

  it('counts the slow powders of the master data as slow, the medium ones not', () => {
    for (const p of ['N160', 'N165', 'N170', '24N41', 'N560', 'N570', 'RS62', 'RS70', 'RS76', 'RS80', '204']) {
      expect(shippedBa.get(p), p).toBeLessThanOrEqual(SLOW_BA);
    }
    for (const p of ['N133', 'N140', 'N150', 'RS40', 'RS50', '202']) {
      expect(shippedBa.get(p), p).toBeGreaterThan(SLOW_BA);
    }
  });

  it('combines them', () => {
    expect(loadWarnings(0.8, 0.6)).toEqual({ lowFill: true, veryLowFill: true, slowPowderLowFill: false, estimatedCapacity: false });
    expect(loadWarnings(0.87, 0.6)).toEqual({ lowFill: true, veryLowFill: false, slowPowderLowFill: false, estimatedCapacity: false });
    expect(loadWarnings(0.95, 0.6, 'estimate')).toEqual({ lowFill: false, veryLowFill: false, slowPowderLowFill: false, estimatedCapacity: true });
    expect(loadWarnings(0.95, 0.6, 'loadData').estimatedCapacity).toBe(false);
  });
});
