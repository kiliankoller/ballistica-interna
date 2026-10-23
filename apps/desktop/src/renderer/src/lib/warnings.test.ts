import { describe, expect, it } from 'vitest';
import { LOW_FILL, loadWarnings, lowFill, pressureNotBacked } from './warnings';

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

  it('marks the pressure of Vihtavuori powders as not backed', () => {
    expect(pressureNotBacked('Vihtavuori')).toBe(true);
    expect(pressureNotBacked('VIHTAVUORI')).toBe(true);
    expect(pressureNotBacked('Norma')).toBe(false);
    expect(pressureNotBacked(undefined)).toBe(false);
  });

  it('combines both', () => {
    expect(loadWarnings(0.7, 'Vihtavuori')).toEqual({ lowFill: true, pressureNotBacked: true });
    expect(loadWarnings(0.95, 'Reload Swiss')).toEqual({ lowFill: false, pressureNotBacked: false });
  });
});
