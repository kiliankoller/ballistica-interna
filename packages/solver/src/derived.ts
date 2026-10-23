import { GRAIN } from './geometry.ts';
import type { LoadInput, SimResult } from './types.ts';

const FT = 0.3048;

/** IPSC power factor: bullet mass [gr] × velocity [ft/s] / 1000. */
export function ipscFactor(bulletMass: number, velocity: number): number {
  return ((bulletMass / GRAIN) * (velocity / FT)) / 1000;
}

/** Bullet momentum in units of 0.01 N·s (= mass [g] × velocity [m/s] / 10). */
export function momentumIndex(bulletMass: number, velocity: number): number {
  return bulletMass * velocity * 100;
}

export interface Recoil {
  /** Recoil impulse [N·s]. */
  impulse: number;
  /** Free recoil velocity [m/s]. */
  velocity: number;
  /** Free recoil energy [J]. */
  energy: number;
}

/**
 * Free recoil: the momentum of bullet and carried charge (Sebert share) at muzzle exit plus the impulse of the
 * rest of the gas, which leaves at vg = sqrt(v² + p0 · V / (3 mc)) with the muzzle pressure p0 and the volume
 * behind the bullet V (case capacity + bore up to the muzzle).
 */
export function freeRecoil(load: LoadInput, result: SimResult): Recoil | undefined {
  const gunMass = load.gun.gunMass;
  if (!(gunMass > 0)) return undefined;
  const v = result.muzzleVelocity;
  const mc = load.propellant.charge;
  const volume = load.cartridge.caseVolume + load.cartridge.boreArea * result.travel;
  const gasVelocity = Math.sqrt(v * v + (result.muzzlePressure * volume) / (3 * mc));
  const impulse = (load.projectile.mass + load.cartridge.sebert * mc) * v + mc * gasVelocity;
  const velocity = impulse / gunMass;
  return { impulse, velocity, energy: 0.5 * gunMass * velocity * velocity };
}
