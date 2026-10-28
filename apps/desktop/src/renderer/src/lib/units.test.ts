import { describe, expect, it } from 'vitest';
import { parseInput } from './units';

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
