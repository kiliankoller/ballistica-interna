import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGrtLoad } from '@ballistica-interna/grtload';
import { compute } from './compute';

const example = () => parseGrtLoad(readFileSync(join(import.meta.dirname, '..', '..', '..', '..', '..', '..', 'docs', 'examples', 'R8_AERO_V2_OR.grtload'), 'utf8'));

describe('compute', () => {
  it('simulates the example load', () => {
    const c = compute(example());
    expect(c.issues).toEqual([]);
    // the example has a ladder of five steps
    expect(c.steps).toHaveLength(5);
    expect(c.steps.every((s) => s.result.status === 'ok')).toBe(true);
  });

  it('gives the ladder steps, at most ten', () => {
    const f = example();
    f.propellant.laddercnt!.value = '12';
    f.propellant.laddermc!.value = '0.05';
    expect(compute(f).steps).toHaveLength(10);
  });

  it('names a ladder count that is no number instead of silently calculating nothing', () => {
    const f = example();
    f.propellant.laddercnt!.value = 'drei';
    expect(compute(f).issues.map((i) => i.name)).toEqual(['laddercnt']);
  });

  it('calculates the load charge alone when the ladder count is empty', () => {
    const f = example();
    f.propellant.laddercnt!.value = '';
    expect(compute(f).steps).toHaveLength(1);
  });
});
