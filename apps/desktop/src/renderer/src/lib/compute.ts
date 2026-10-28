// Simulation of a load and the values derived from it.
import { toLoadInput, toSI, type GrtLoadFile } from '@ballistica-interna/grtload';
import { jumpOf } from './jump';
import {
  bulletStart,
  chamberVolume,
  defaultParams,
  fillRatio,
  freeRecoil,
  ipscFactor,
  momentumIndex,
  nearestObtNode,
  simulate,
  type ObtNode,
  type LoadInput,
  type SimResult,
} from '@ballistica-interna/solver';
import { checkLoad, type LoadIssue } from './loadCheck';

export interface Derived {
  chamberVolume: number;
  travel: number;
  fill: number;
  ipsc: number;
  mip: number;
  recoilEnergy: number;
  muzzleRpm: number;
  /** Free travel of the bullet to the lands [m] (NaN without tip length or chamber data), see lib/jump.ts. */
  jump: number;
  /** OBT node closest to the bullet lead time (with half nodes) */
  obt?: ObtNode;
}

/** One curve: the load's charge (step 0) or a reduced charge of the ladder. */
export interface Step {
  charge: number;
  result: SimResult;
  derived: Derived;
}

export interface Computation {
  load: LoadInput | null;
  error?: string;
  /** Missing or unusable input fields; the load is not simulated while there are any. */
  issues: LoadIssue[];
  /** Step 0 is the load's charge; further steps exist when the ladder is enabled. */
  steps: Step[];
}

export function derive(load: LoadInput, result: SimResult, jump = NaN): Derived {
  const v = result.muzzleVelocity;
  return {
    chamberVolume: chamberVolume(load),
    travel: load.gun.barrelLength - bulletStart(load),
    fill: fillRatio(load),
    ipsc: ipscFactor(load.projectile.mass, v),
    mip: momentumIndex(load.projectile.mass, v),
    recoilEnergy: freeRecoil(load, result)?.energy ?? NaN,
    muzzleRpm: load.gun.twistLength > 0 ? (v / load.gun.twistLength) * 60 : NaN,
    jump,
    obt: result.status === 'ok' ? nearestObtNode(load.gun.barrelLength, result.bulletLeadTime) : undefined,
  };
}

export function compute(file: GrtLoadFile): Computation {
  const issues = checkLoad(file);
  if (issues.length) return { load: null, steps: [], issues };
  let load: LoadInput;
  try {
    load = toLoadInput(file);
  } catch (e) {
    return { load: null, steps: [], issues, error: e instanceof Error ? e.message : String(e) };
  }
  // 1 … 10 steps; an empty or unusable count is one step (the load's charge)
  const count = Math.min(Math.max(Math.round(Number(file.propellant.laddercnt?.value)) || 1, 1), 10);
  const stepField = file.propellant.laddermc;
  const stepMass = stepField ? toSI(Number(stepField.value), stepField.unit) : 0;
  const steps: Step[] = [];
  for (let i = 0; i < (stepMass > 0 ? count : 1); i++) {
    const charge = load.propellant.charge - i * stepMass;
    if (charge <= 0) break;
    const stepLoad = { ...load, propellant: { ...load.propellant, charge } };
    const result = simulate(stepLoad, defaultParams);
    steps.push({ charge, result, derived: derive(stepLoad, result, jumpOf(file)) });
  }
  return { load, steps, issues };
}
