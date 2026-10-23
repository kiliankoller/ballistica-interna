import { XMLParser } from 'fast-xml-parser';
import type { LoadInput, TailType } from '@ballistica-interna/solver';
import { toSI } from './units.ts';

/** One <input> or <var> entry of a .grtload section, values URL-decoded. */
export interface GrtField {
  name: string;
  value: string;
  unit: string;
  type: string;
  descr: string;
}

export interface GrtSection {
  [name: string]: GrtField;
}

export interface GrtLoadFile {
  version: string;
  title: string;
  caliber: GrtSection;
  caliberfile: GrtSection;
  gun: GrtSection;
  projectile: GrtSection;
  propellant: GrtSection;
}

const decode = (s: unknown) => decodeURIComponent(String(s ?? ''));
const asArray = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

function section(node: Record<string, unknown> | undefined, tag: 'input' | 'var'): GrtSection {
  const out: GrtSection = {};
  for (const e of asArray(node?.[tag] as Record<string, unknown> | Record<string, unknown>[] | undefined)) {
    const name = String(e.name);
    out[name] = {
      name,
      value: decode(e.value),
      unit: String(e.unit ?? ''),
      type: String(e.type ?? ''),
      descr: String(e.descr ?? ''),
    };
  }
  return out;
}

export function parseGrtLoad(xml: string): GrtLoadFile {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', parseAttributeValue: false });
  const doc = parser.parse(xml) as Record<string, any>;
  const root = doc.GordonsReloadingTool;
  const ib = root?.InnerBallistikInput;
  if (!ib) throw new Error('not a .grtload file: <GordonsReloadingTool><InnerBallistikInput> missing');
  return {
    version: String(root.version ?? ''),
    title: decode(ib.title),
    caliber: section(ib.caliber, 'input'),
    caliberfile: section(ib.caliberfile, 'var'),
    gun: section(ib.gun, 'input'),
    projectile: section(ib.projectile, 'input'),
    propellant: section(ib.propellant, 'input'),
  };
}

function num(s: GrtSection, name: string, fallback?: number): number {
  const f = s[name];
  if (!f || f.value === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`field "${name}" missing`);
  }
  return toSI(Number(f.value), f.unit);
}

const TAIL_TYPES: Record<number, TailType> = { 0: 'flat', 1: 'hollow', 2: 'boattail' };

/** The solver input of a load file (SI units). */
export function toLoadInput(file: GrtLoadFile): LoadInput {
  const { caliber: c, gun: g, projectile: p, propellant: w } = file;
  return {
    cartridge: {
      caseVolume: num(c, 'casevol'),
      caseLength: num(c, 'caselen'),
      boreArea: num(c, 'Aeff'),
      grooveDiameter: num(c, 'Dz'),
      maxPressure: num(c, 'pMaxZul'),
      sebert: num(c, 'sebert'),
    },
    gun: {
      barrelLength: num(g, 'xe'),
      twistLength: num(g, 'twistlen', 0),
      gunMass: num(g, 'mgun', 0),
    },
    projectile: {
      diameter: num(p, 'Dbul'),
      mass: num(p, 'mp'),
      length: num(p, 'glen'),
      seatingDepth: num(p, 'gdepth'),
      startPressure: num(p, 'gpressure', num(c, 'ps', 0)),
      tailType: TAIL_TYPES[num(p, 'gTailType', 0)] ?? 'flat',
      tailLength: num(p, 'gtailh', 0),
      tailDiameterA: num(p, 'gTailDiaA', 0),
      tailDiameterB: num(p, 'gTailDiaB', 0),
    },
    propellant: {
      Ba: num(w, 'Ba'),
      Qex: num(w, 'Qex'),
      kappa: num(w, 'k'),
      a0: num(w, 'a0'),
      a1: num(w, 'a1', 0),
      z1: num(w, 'z1'),
      z2: num(w, 'z2'),
      // not used by the model (it follows the material density); master powders carry none
      covolume: num(w, 'eta', 0),
      materialDensity: num(w, 'pc'),
      bulkDensity: num(w, 'pcd'),
      referenceTemperature: 21,
      temperature: num(w, 'pt', 21),
      tcc: num(w, 'tcc', 0),
      tch: num(w, 'tch', 0),
      charge: num(w, 'mc'),
    },
  };
}
