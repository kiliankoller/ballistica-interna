import type { ModelParams, PropellantInput } from './types.ts';

/**
 * Three-phase form function φ(z) of the burn law dz/dt = Ba·φ(z)·p[bar], with φ(0) = 1.
 *   phase 1, progressive         z < z1:   φ = (1 + a0·z)^n
 *   phase 2, primary degressive  z1..z2:   φ = φ(z1) + a1·(z − z1)
 *   phase 3, secondary degressive z > z2:  φ = φ(z2)·((1 − z)/(1 − z2))^q
 */
export function formFunction(z: number, pw: PropellantInput, mp: ModelParams): number {
  if (z >= 1) return 0;
  const zz = Math.max(z, 0);
  const phase1 = (s: number) => Math.pow(Math.max(1 + pw.a0 * s, 0), mp.phase1Exponent);
  if (zz < pw.z1) return phase1(zz);
  const phi1 = phase1(pw.z1);
  const ze = mp.phase2End;
  const fall = ze > pw.z1 ? (s: number) => (ze - s) / (ze - pw.z1) : () => 1;
  const phase2 = (s: number) => Math.max(phi1 * fall(s) + pw.a1 * (s - pw.z1), 0);
  if (zz < pw.z2) return phase2(zz);
  return phase2(pw.z2) * Math.pow((1 - zz) / (1 - pw.z2), mp.phase3Exponent);
}

/**
 * Vivacity at the powder temperature: with both coefficients 0 built-in rates per kelvin apply; otherwise the coefficient of
 * the side the temperature is on scales Ba by 1 + k · coefficient · |ΔT|, much weaker than the
 * documented definition tcc = (Ba(21 °C) − Ba(−20 °C)) / 41 K suggests, and a positive tcc makes the
 * powder faster when cold. A side whose coefficient is 0 then has no effect.
 */
export function vivacityAt(pw: PropellantInput): number {
  const dT = pw.temperature - pw.referenceTemperature;
  if (dT === 0) return pw.Ba;
  if (pw.tcc === 0 && pw.tch === 0) return pw.Ba * (1 + (dT < 0 ? DEFAULT_COLD : DEFAULT_HOT) * dT);
  return pw.Ba * (1 + (dT < 0 ? EXPLICIT_COLD * pw.tcc : EXPLICIT_HOT * pw.tch) * Math.abs(dT));
}

/** Relative change of Ba per kelvin below / above the reference temperature when no coefficient is given. */
const DEFAULT_COLD = 5.4e-4;
const DEFAULT_HOT = 1.0e-3;
/** Relative change of Ba per unit of an explicit coefficient and kelvin. */
const EXPLICIT_COLD = 0.0255;
const EXPLICIT_HOT = 0.0268;

const sqrt2kappa = (pw: PropellantInput) => Math.sqrt(2 * (pw.kappa - 1));

/** Brisance factor Br (documented formula; Qex in kJ/kg). */
export function brisance(pw: PropellantInput): number {
  return (sqrt2kappa(pw) * pw.Ba * (pw.Qex / 1000)) / 10000;
}

/** Progressivity factor Bp (documented formula; Qex in kJ/kg). */
export function progressivity(pw: PropellantInput, mp: ModelParams): number {
  return (sqrt2kappa(pw) * pw.Ba * formFunction(pw.z1, pw, mp) * (pw.Qex / 1000)) / 10000;
}

/** Combined factor Brp: quadratic mean of Br and Bp. */
export function brisanceProgressivity(pw: PropellantInput, mp: ModelParams): number {
  const br = brisance(pw);
  const bp = progressivity(pw, mp);
  return Math.sqrt((br * br + bp * bp) / 2);
}
