import type { LoadInput, ProjectileInput } from './types.ts';

/** Density of water at 21 °C [kg/m³], for case capacities in grains of water. */
export const WATER_DENSITY = 998.0;
export const GRAIN = 64.79891e-6; // kg

/** Volume of the bullet inside the case [m³]: a cylinder, corrected for a boat tail or a hollow base. */
export function bulletIntrusion(pr: ProjectileInput): number {
  const r = pr.diameter / 2;
  let v = Math.PI * r * r * pr.seatingDepth;
  if (pr.tailType !== 'flat' && pr.tailLength > 0 && pr.seatingDepth >= pr.tailLength) {
    const ra = (pr.tailDiameterA > 0 ? pr.tailDiameterA : pr.diameter) / 2;
    const rb = pr.tailDiameterB / 2;
    const cone = (Math.PI * pr.tailLength * (ra * ra + ra * rb + rb * rb)) / 3;
    // boat tail: the frustum replaces part of the cylinder; hollow base: the cavity adds volume
    v -= pr.tailType === 'boattail' ? Math.PI * r * r * pr.tailLength - cone : cone;
  }
  return v;
}

/** Combustion chamber: case capacity minus the seated bullet [m³]. */
export function chamberVolume(load: LoadInput): number {
  return load.cartridge.caseVolume - bulletIntrusion(load.projectile);
}

/** Load ratio ("Fill"): bulk volume of the charge over the combustion chamber. */
export function fillRatio(load: LoadInput): number {
  return load.propellant.charge / load.propellant.bulkDensity / chamberVolume(load);
}

/** Bullet base position from the bolt face at rest [m]. */
export function bulletStart(load: LoadInput): number {
  return load.cartridge.caseLength - load.projectile.seatingDepth;
}

export function caseCapacityGrainsH2O(caseVolume: number): number {
  return (caseVolume * WATER_DENSITY) / GRAIN;
}
