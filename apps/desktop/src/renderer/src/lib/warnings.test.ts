import { describe, expect, it } from 'vitest';
import { LOW_FILL, loadWarnings, lowFill, pressureMargin } from './warnings';

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
    expect(loadWarnings(0.8, 0.52).slowPowderLowFill).toBe(false);
    expect(loadWarnings(0.87, 0.46).slowPowderLowFill).toBe(false);
    expect(loadWarnings(0.8, undefined).slowPowderLowFill).toBe(false);
  });

  it('combines them', () => {
    expect(loadWarnings(0.8, 0.52)).toEqual({ lowFill: true, veryLowFill: true, slowPowderLowFill: false, estimatedCapacity: false });
    expect(loadWarnings(0.87, 0.52)).toEqual({ lowFill: true, veryLowFill: false, slowPowderLowFill: false, estimatedCapacity: false });
    expect(loadWarnings(0.95, 0.52, 'estimate')).toEqual({ lowFill: false, veryLowFill: false, slowPowderLowFill: false, estimatedCapacity: true });
    expect(loadWarnings(0.95, 0.52, 'loadData').estimatedCapacity).toBe(false);
  });
});
