import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { caseCapacityGrainsH2O, GRAIN, ipscFactor, momentumIndex, simulate } from '@ballistica-interna/solver';
import { parseGrtLoad, toLoadInput } from '../src/index.ts';

// local reference case (fixtures/ is not part of the repository)
const fixture = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'r8-aero-v2', 'load.grtload');
const present = existsSync(fixture);
const file = present ? parseGrtLoad(readFileSync(fixture, 'utf8')) : undefined!;
const load = present ? toLoadInput(file) : undefined!;

describe.skipIf(!present)('.grtload parsing (R8_AERO_V2)', () => {
  it('reads and URL-decodes the header', () => {
    expect(file.version).toBe('2021.2030-NIGHTLY');
    expect(file.title).toContain('.308 Win.');
    expect(file.propellant.pname?.value).toBe('RS 52');
  });

  it('converts to SI units', () => {
    expect(load.cartridge.caseVolume).toBeCloseTo(3.621759e-6, 11);
    expect(load.projectile.mass).toBeCloseTo(10.692e-3, 9);
    expect(load.propellant.Qex).toBe(3920e3);
    expect(load.gun.barrelLength).toBeCloseTo(0.52, 9);
  });

  it('matches the report values that do not depend on the model', () => {
    expect(load.propellant.charge / GRAIN).toBeCloseTo(43.06, 2);
    expect(caseCapacityGrainsH2O(load.cartridge.caseVolume)).toBeCloseTo(55.78, 2);
    // IPSC and the momentum index follow from the reported muzzle velocity
    expect(Math.round(ipscFactor(load.projectile.mass, 791))).toBe(428);
    expect(Math.floor(momentumIndex(load.projectile.mass, 790.6))).toBe(845);
  });

  it('simulates the load', () => {
    const r = simulate(load);
    expect(r.status).toBe('ok');
    expect(r.muzzleVelocity).toBeGreaterThan(500);
    expect(r.maxPressure).toBeGreaterThan(1000e5);
  });
});
