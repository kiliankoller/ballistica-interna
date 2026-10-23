export type State = number[];
export type Derivative = (y: State) => State;

// Dormand–Prince 5(4) coefficients.
const A = [
  [],
  [1 / 5],
  [3 / 40, 9 / 40],
  [44 / 45, -56 / 15, 32 / 9],
  [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
  [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
];
const B5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0];
const B4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];

/** One Dormand–Prince step; returns the 5th-order solution and the scaled error norm (≤ 1 = accepted). */
export function dopriStep(f: Derivative, y: State, h: number, rtol: number, atol: number[]): { y: State; err: number } {
  const n = y.length;
  const k: State[] = [];
  for (let s = 0; s < 7; s++) {
    const ys = y.slice();
    const row = A[s]!;
    for (let j = 0; j < row.length; j++) {
      const c = row[j]!;
      if (c !== 0) for (let i = 0; i < n; i++) ys[i]! += h * c * k[j]![i]!;
    }
    k.push(f(ys));
  }
  const y5 = y.slice();
  let err = 0;
  for (let i = 0; i < n; i++) {
    let d5 = 0;
    let d4 = 0;
    for (let s = 0; s < 7; s++) {
      d5 += B5[s]! * k[s]![i]!;
      d4 += B4[s]! * k[s]![i]!;
    }
    y5[i]! += h * d5;
    const scale = atol[i]! + rtol * Math.max(Math.abs(y[i]!), Math.abs(y5[i]!));
    err = Math.max(err, Math.abs(h * (d5 - d4)) / scale);
  }
  return { y: y5, err: Number.isFinite(err) ? err : Infinity };
}

export function nextStep(h: number, err: number): number {
  const factor = err === 0 ? 5 : Math.min(5, Math.max(0.2, 0.9 * Math.pow(err, -0.2)));
  return h * factor;
}
