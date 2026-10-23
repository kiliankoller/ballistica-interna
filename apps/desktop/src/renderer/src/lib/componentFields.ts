// The fields of an own caliber, projectile or propellant in the component editor: database field name, label,
// unit, whether the simulation needs it, and the plausible range (the same limits as the master data checks in
// tools/master-data/build_db.py). Values are in the units of the component records (mm, grains, bar, …).
import type { ComponentKind, DbRecord } from '../../../shared/api';

export interface ComponentField {
  key: string;
  /** i18n key below "field." */
  label: string;
  unit?: string;
  text?: boolean;
  required?: boolean;
  min?: number;
  max?: number;
}

export const COMPONENT_FIELDS: Record<ComponentKind, ComponentField[]> = {
  caliber: [
    { key: 'cipname', label: 'name', text: true, required: true },
    { key: 'altname', label: 'altName', text: true },
    { key: 'L3', label: 'caseLength', unit: 'mm', required: true, min: 5, max: 150 },
    { key: 'L6', label: 'overallLength', unit: 'mm', required: true, min: 5, max: 200 },
    { key: 'G1', label: 'bulletDiameter', unit: 'mm', required: true, min: 1.5, max: 30 },
    { key: 'c_Z', label: 'grooveDiameter', unit: 'mm', min: 1.5, max: 30 },
    { key: 'c_Q', label: 'boreArea', unit: 'mm²', required: true, min: 2, max: 700 },
    { key: 'V', label: 'caseCapacity', unit: 'gr H₂O', required: true, min: 0.5, max: 1200 },
    { key: 'Pmax', label: 'maxPressure', unit: 'bar', required: true, min: 300, max: 7000 },
    { key: 'sebert', label: 'sebert', min: 0, max: 1 },
  ],
  projectile: [
    { key: 'mname', label: 'maker', text: true, required: true },
    { key: 'pname', label: 'name', text: true, required: true },
    { key: 'gdia', label: 'bulletDiameter', unit: 'mm', required: true, min: 2, max: 25 },
    { key: 'gmass', label: 'bulletMass', unit: 'gr', required: true, min: 5, max: 1500 },
    { key: 'glen', label: 'bulletLength', unit: 'mm', required: true, min: 2, max: 100 },
    { key: 'gtip', label: 'tipLength', unit: 'mm', min: 0, max: 60 },
    { key: 'gtailh', label: 'tailLength', unit: 'mm', min: 0, max: 30 },
    { key: 'gtaildiaA', label: 'tailDiameterA', unit: 'mm', min: 0, max: 25 },
    { key: 'gtaildiaB', label: 'tailDiameterB', unit: 'mm', min: 0, max: 25 },
    { key: 'g1bc', label: 'g1bc', min: 0, max: 1.3 },
    { key: 'g7bc', label: 'g7bc', min: 0, max: 0.7 },
    { key: 'gpressure', label: 'startPressure', unit: 'bar', min: 10, max: 1500 },
  ],
  propellant: [
    { key: 'mname', label: 'maker', text: true, required: true },
    { key: 'pname', label: 'name', text: true, required: true },
    { key: 'Qex', label: 'Qex', unit: 'kJ/kg', required: true, min: 2500, max: 6000 },
    { key: 'k', label: 'kappa', required: true, min: 1.1, max: 1.4 },
    { key: 'Ba', label: 'Ba', required: true, min: 0.05, max: 10 },
    { key: 'a0', label: 'a0', required: true, min: -2, max: 6 },
    { key: 'z1', label: 'z1', required: true, min: 0.01, max: 0.99 },
    { key: 'z2', label: 'z2', required: true, min: 0.01, max: 0.99 },
    { key: 'pc', label: 'materialDensity', unit: 'kg/m³', required: true, min: 1000, max: 2000 },
    { key: 'pcd', label: 'bulkDensity', unit: 'kg/m³', required: true, min: 250, max: 1150 },
    { key: 'tcc', label: 'tcc' },
    { key: 'tch', label: 'tch' },
  ],
};

/** The record's label as the component choice shows it. */
export function componentLabel(kind: ComponentKind, r: DbRecord): string {
  if (kind === 'caliber') return String(r.cipname ?? '');
  return `${String(r.mname ?? '')} ${String(r.pname ?? '')}`.trim();
}

/** Problems of a record: [field key, message key, params]; empty when it can be used in a simulation. */
export function checkComponent(kind: ComponentKind, r: DbRecord): [string, string, Record<string, unknown>][] {
  const out: [string, string, Record<string, unknown>][] = [];
  const num = (k: string) => (r[k] === null || r[k] === undefined || r[k] === '' ? null : Number(r[k]));
  for (const f of COMPONENT_FIELDS[kind]) {
    const v = r[f.key];
    const empty = v === null || v === undefined || String(v).trim() === '';
    if (empty) {
      if (f.required) out.push([f.key, 'editor.required', {}]);
      continue;
    }
    if (f.text) continue;
    const n = Number(v);
    if (!Number.isFinite(n)) out.push([f.key, 'editor.notNumber', {}]);
    else if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) out.push([f.key, 'editor.range', { min: f.min, max: f.max }]);
  }
  // relations between fields
  if (kind === 'caliber') {
    const [L3, L6] = [num('L3'), num('L6')];
    if (L3 && L6 && L6 < 0.8 * L3) out.push(['L6', 'editor.overallShort', {}]);
  } else if (kind === 'propellant') {
    const [z1, z2] = [num('z1'), num('z2')];
    if (z1 !== null && z2 !== null && z1 > z2) out.push(['z2', 'editor.z2BelowZ1', {}]);
  } else {
    const [dia, len] = [num('gdia'), num('glen')];
    if (dia && len && len < dia) out.push(['glen', 'editor.lengthBelowDiameter', {}]);
  }
  return out;
}
