// Optimal Barrel Time (OBT) after C. Long, "Optimal Barrel Time" (2003), master model:
//   OBT [ms] = (A·N + B)·L + C·N + D,   L = barrel length from the bolt face [in], N = node number,
// with one coefficient set for odd and one for even N. Half nodes (N + ½) use the set of N (barrel 520 mm:
// node 5 → 1.04962 ms, 5 ½ → 1.09334 ms, 4 ½ → 0.98863 ms).

const INCH = 0.0254;

const ODD = { A: 4.42642857e-3, B: 2.84942857e-2, C: -3.18785714e-3, D: 2.91180952e-2 };
const EVEN = { A: 4.40803571e-3, B: 2.68380952e-2, C: -2.40148810e-3, D: 4.39015873e-2 };

export interface ObtNode {
  /** Node number; x.5 for a half node. */
  node: number;
  /** Barrel time of the node [s]. */
  time: number;
}

/** Barrel time [s] of OBT node `node` (whole or half) for a barrel length [m] from the bolt face. */
export function obtTime(barrelLength: number, node: number): number {
  const set = Math.abs(Math.floor(node)) % 2 === 1 ? ODD : EVEN;
  const L = barrelLength / INCH;
  return ((set.A * node + set.B) * L + set.C * node + set.D) * 1e-3;
}

/** All nodes (with half nodes unless disabled) whose barrel time lies in [from, to] seconds. */
export function obtNodes(barrelLength: number, from: number, to: number, halfNodes = true): ObtNode[] {
  const nodes: ObtNode[] = [];
  for (let n = 0; n <= 100; n += halfNodes ? 0.5 : 1) {
    const time = obtTime(barrelLength, n);
    if (time > to) break;
    if (time >= from) nodes.push({ node: n, time });
  }
  return nodes;
}

/** The node closest to a bullet lead time [s], shown next to the BLT. */
export function nearestObtNode(barrelLength: number, leadTime: number, halfNodes = true): ObtNode | undefined {
  if (!(barrelLength > 0 && leadTime > 0)) return undefined;
  const nodes = obtNodes(barrelLength, 0, leadTime * 2 + 1e-3, halfNodes);
  let best: ObtNode | undefined;
  for (const n of nodes) if (!best || Math.abs(n.time - leadTime) < Math.abs(best.time - leadTime)) best = n;
  return best;
}

/** Node label: "#5" or "#5 ½". */
export function obtNodeLabel(node: number): string {
  return Number.isInteger(node) ? `#${node}` : `#${Math.floor(node)} ½`;
}
