import { describe, expect, it } from 'vitest';
import { fmt, parseInput, setDecimalComma } from './units';

describe('parseInput', () => {
  it('takes a decimal point or comma', () => {
    expect(parseInput('43.06')).toBe(43.06);
    expect(parseInput(' 43,06 ')).toBe(43.06);
  });

  it('tells a cleared field from text that is no number', () => {
    expect(parseInput('')).toBe('');
    expect(parseInput('  ')).toBe('');
    expect(parseInput('abc')).toBeNull();
    expect(parseInput('—')).toBeNull();
  });
});

describe('fmt', () => {
  it('shows a decimal comma when switched on (German), a point otherwise', () => {
    expect(fmt(43.056, 2)).toBe('43.06');
    setDecimalComma(true);
    try {
      expect(fmt(43.056, 2)).toBe('43,06');
      expect(fmt(3641.2, 0)).toBe('3641');
      expect(fmt(NaN, 1)).toBe('—');
      // what the field shows is taken back as the same value
      expect(parseInput(fmt(0.5163, 4))).toBe(0.5163);
    } finally {
      setDecimalComma(false);
    }
  });
});
