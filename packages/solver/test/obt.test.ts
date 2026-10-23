import { describe, expect, it } from 'vitest';
import { nearestObtNode, obtNodeLabel, obtTime } from '../src/index.ts';

describe('optimal barrel time', () => {
  it('follows the worked example of the OBT paper (24 in, node 4: 1.101 ms)', () => {
    expect(obtTime(24 * 0.0254, 4) * 1e3).toBeCloseTo(1.101, 2);
  });

  it('gives the node times of the master model for a 520 mm barrel (whole and half nodes)', () => {
    expect(obtTime(0.52, 5) * 1e3).toBeCloseTo(1.049625, 5);
    expect(obtTime(0.52, 5.5) * 1e3).toBeCloseTo(1.093341, 5);
    expect(obtTime(0.52, 4.5) * 1e3).toBeCloseTo(0.988629, 5);
    expect(obtTime(0.52, 6) * 1e3).toBeCloseTo(1.120391, 5);
    expect(obtTime(0.7, 4) * 1e3).toBeCloseTo(1.259852, 5);
  });

  it('picks the node closest to the bullet lead time', () => {
    const n = nearestObtNode(0.52, 1.0691e-3)!;
    expect(n.node).toBe(5);
    expect(obtNodeLabel(n.node)).toBe('#5');
    expect(obtNodeLabel(nearestObtNode(0.25, 0.70127e-3)!.node)).toBe('#9 ½');
  });
});
