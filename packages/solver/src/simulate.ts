import { bulletStart, chamberVolume } from './geometry.ts';
import { dopriStep, nextStep, type State } from './integrator.ts';
import { defaultParams } from './params.ts';
import { formFunction, vivacityAt } from './powder.ts';
import type { CurvePoint, LoadInput, ModelParams, SimResult } from './types.ts';

const BAR = 1e5;

/**
 * Lumped-parameter interior ballistics:
 *   burn law        dz/dt = Ba(T)·φ(z)·p[bar]
 *   energy (Résal)  p·Vfree = f·mc·z − (κ−1)·(½·m·v² + W)      f = (κ−1)·Qex·(1 − heatLoss)
 *                   W = (pr·A + (1 − h)·Ff)·x + We,  Ff = bulletFriction·length·diameter (work against friction,
 *                   the share h of its heat returned to the gas, default 0), We = A·∫pe·(1 − x/le)dx over the first
 *                   le of travel (engraving, default off)
 *   free volume     Vfree = V0 + A·x − mc·(1−z)/ρc − b·mc·z     (Noble–Abel covolume b)
 *   momentum        m·dv/dt = A·(p − pr − pe·(1 − x/le)) − k·Ff,  m = mp + sebert·mc  (k = frictionInMomentum, default 1)
 * Time zero is shot start: the gas has reached the start pressure ps and the bullet begins to move.
 */
export function simulate(load: LoadInput, params: ModelParams = defaultParams): SimResult {
  const { cartridge: ca, gun, projectile: pr, propellant: pw } = load;
  const empty: SimResult = {
    status: 'invalid-input',
    curve: [],
    maxPressure: 0,
    maxPressureTime: 0,
    muzzlePressure: 0,
    muzzleVelocity: 0,
    muzzleEnergy: 0,
    barrelTime: 0,
    bulletLeadTime: 0,
    burnt: 0,
    travel: 0,
    efficiency: 0,
  };

  const A = ca.boreArea;
  const mc = pw.charge;
  const mp = pr.mass;
  const kappa = pw.kappa;
  const V0 = chamberVolume(load);
  const travel = gun.barrelLength - bulletStart(load);
  const values = [A, mc, mp, kappa, V0, travel, pw.Ba, pw.Qex, pw.materialDensity, pr.startPressure];
  if (!values.every((v) => Number.isFinite(v) && v > 0) || kappa <= 1) {
    return { ...empty, message: 'missing or non-positive input' };
  }
  if (mc / pw.materialDensity >= V0) {
    return { ...empty, status: 'charge-too-high', message: 'the solid powder does not fit into the chamber' };
  }

  const theta = kappa - 1;
  const f = theta * pw.Qex * (1 - params.heatLoss);
  // the covolume follows the material density; the powder's own eta is not used
  const b = params.covolumeFactor / pw.materialDensity;
  const rhoC = pw.materialDensity;
  const m = mp + ca.sebert * mc;
  const pr0 = params.boreResistance;
  const friction = params.bulletFriction * pr.length * pr.diameter;
  const frictionLoss = friction * (1 - params.frictionHeatReturn);
  const frictionForce = params.frictionInMomentum * friction;
  const pe = params.engravingResistance;
  const le = params.engravingLength;
  // engraving: resistance pe·(1 − x/le) over the first le of travel, and its work
  const engraving = (x: number) => (pe > 0 && x < le ? pe * (1 - x / le) : 0);
  const engravingWork = (x: number) => (pe > 0 ? A * pe * (x < le ? x - (x * x) / (2 * le) : le / 2) : 0);
  const Ba = vivacityAt(pw) * Math.pow(pw.Ba / params.vivacityReference, params.vivacityExponent);
  const ps = pr.startPressure;
  // burn rate pressure term [bar]: p itself for n = 1, else 1000 bar · (p / 1000 bar)ⁿ
  const n = params.burnPressureExponent;
  const burnPressure = (p: number) => (n === 1 ? p / BAR : 1000 * Math.pow(p / (1000 * BAR), n));

  const freeVolume = (x: number, z: number) => V0 + A * x - (mc * (1 - z)) / rhoC - b * mc * z;
  // a covolume above the solid volume makes the free volume shrink as the powder burns; if the bullet has not
  // moved far enough when it reaches zero, the pressure equation has no solution (reported, not shown as p = 0)
  let noVolume = false;
  const meanPressure = (y: State) => {
    const [x, v, z] = y as [number, number, number];
    const energy = f * mc * z - theta * (0.5 * m * v * v + (pr0 * A + frictionLoss) * x + engravingWork(x));
    const vol = freeVolume(x, z);
    return vol > 0 ? Math.max(energy, 0) / vol : 0;
  };
  // Lagrange gradient: breech pressure relative to the space-mean pressure
  const breechFactor = (1 + mc / (2 * mp)) / (1 + mc / (3 * mp));
  const reported = (p: number) => (params.reportedPressure === 'breech' ? p * breechFactor : p);

  const derivative = (y: State): State => {
    const [x, v, z] = y as [number, number, number];
    const p = meanPressure(y);
    let a = (A * (p - pr0 - engraving(x)) - frictionForce) / m;
    if (v <= 0 && a < 0) a = 0;
    const dz = z >= 1 ? 0 : Ba * formFunction(z, pw, params) * burnPressure(p);
    return [v, a, dz];
  };

  // burnt fraction at shot start: the gas of z0 alone fills the chamber at ps
  const z0 = (ps * (V0 - mc / rhoC)) / (f * mc - ps * mc * (1 / rhoC - b));
  if (!(z0 >= 0 && z0 < 1)) return { ...empty, status: 'bullet-stuck', message: 'start pressure not reachable' };

  const atol = [1e-9, 1e-6, 1e-10];
  const curve: CurvePoint[] = [];
  const record = (t: number, y: State) => {
    if (freeVolume(y[0]!, Math.min(y[2]!, 1)) <= 0) noVolume = true;
    curve.push({ t, x: y[0]!, v: y[1]!, z: Math.min(y[2]!, 1), p: reported(meanPressure(y)) });
  };

  let y: State = [0, 0, z0];
  let t = 0;
  let h = 1e-8;
  record(t, y);
  for (let guard = 0; ; guard++) {
    if (guard > 1_000_000 || t > 0.05) return { ...empty, status: 'bullet-stuck', curve, message: 'bullet does not leave the barrel' };
    h = Math.min(h, params.maxStep);
    const step = dopriStep(derivative, y, h, params.tolerance, atol);
    if (step.err > 1) {
      h = nextStep(h, step.err);
      continue;
    }
    step.y[2] = Math.min(step.y[2]!, 1);
    if (step.y[0]! >= travel) {
      // bisect the step length that ends exactly at the muzzle
      let lo = 0;
      let hi = h;
      let end = step.y;
      for (let i = 0; i < 60; i++) {
        const mid = 0.5 * (lo + hi);
        const s = dopriStep(derivative, y, mid, params.tolerance, atol).y;
        if (s[0]! >= travel) {
          hi = mid;
          end = s;
        } else lo = mid;
      }
      t += hi;
      y = end;
      record(t, y);
      break;
    }
    t += h;
    y = step.y;
    record(t, y);
    if (noVolume) return { ...empty, status: 'charge-too-high', curve, message: 'the powder gas does not fit into the chamber (covolume)' };
    if (y[1]! <= 0 && y[2]! >= 1 && derivative(y)[1]! <= 0) {
      return { ...empty, status: 'bullet-stuck', curve, message: 'bullet stops in the barrel' };
    }
    h = nextStep(h, step.err);
  }

  let peak = curve[0]!;
  for (const c of curve) if (c.p > peak.p) peak = c;
  const last = curve[curve.length - 1]!;
  const threshold = 0.1 * peak.p;
  let t10 = 0;
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1]!;
    const c = curve[i]!;
    if (a.p < threshold && c.p >= threshold) {
      t10 = a.t + ((threshold - a.p) / (c.p - a.p)) * (c.t - a.t);
      break;
    }
  }
  const energy = 0.5 * mp * last.v * last.v;
  return {
    status: 'ok',
    curve,
    maxPressure: peak.p,
    maxPressureTime: peak.t,
    muzzlePressure: last.p,
    muzzleVelocity: last.v,
    muzzleEnergy: energy,
    barrelTime: last.t,
    bulletLeadTime: last.t - t10,
    burnt: last.z,
    travel,
    efficiency: energy / (pw.Qex * mc),
  };
}
