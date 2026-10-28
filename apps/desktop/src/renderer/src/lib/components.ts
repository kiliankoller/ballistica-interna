// Takes a component record (master data or own library) over into a load file.
import { fromSI, toSI, type GrtLoadFile, type GrtSection } from '@ballistica-interna/grtload';
import { GRAIN, WATER_DENSITY } from '@ballistica-interna/solver';
import type { ComponentKind, DbRecord } from '../../../shared/api';
import { capacitySource } from './capacity';
import { defaultStartPressure } from './startPressure';

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0));
/** Numbers as text without float noise. */
const text = (v: number) => String(Number(v.toPrecision(12)));

function set(section: GrtSection, name: string, value: string) {
  const f = section[name];
  if (f) f.value = value;
}

/**
 * Stores a number given in `unit` (the unit of the component records: mm, g, bar, …) in the unit the load file uses
 * for that field, so that a file written with other units gets the same quantity.
 */
function setNum(section: GrtSection, name: string, value: number, unit: string) {
  const f = section[name];
  if (f) f.value = text(fromSI(toSI(value, unit), f.unit));
}

/** SI value of a stored field, NaN when empty or not a number. */
function si(section: GrtSection, name: string): number {
  const f = section[name];
  if (!f || f.value.trim() === '') return NaN;
  const v = Number(f.value);
  return Number.isFinite(v) ? toSI(v, f.unit) : NaN;
}

/**
 * The bullet diameter the load's caliber takes: C.I.P. G1 (maximum bullet diameter) of the chosen caliber, or
 * NaN when no caliber with that value is chosen.
 */
export function caliberBulletDiameter(file: GrtLoadFile): number {
  const g1 = Number(file.caliberfile.G1?.value);
  return file.caliber.CaliberName?.value && g1 > 0 ? g1 : NaN;
}

/**
 * Whether a bullet fits a caliber: at most G1 and not more than 0.06 mm below it (bullets are made a few
 * hundredths below the C.I.P. maximum; .308 and .311 bullets, 7.82 and 7.90 mm, stay apart).
 */
export function fitsCaliber(bulletDiameter: number, g1: number): boolean {
  return bulletDiameter <= g1 + 0.01 && bulletDiameter >= g1 - 0.06;
}

/**
 * i18n keys of the notes a master record needs next to it: an estimated bulk density or a fit on maximum loads only
 * (powders), a bullet length
 * missing or ambiguous, taken from JBM's length list (measured by Bryan Litz), an implausible maker value, or the
 * source of a caliber's case capacity (estimated from the outline or derived from load data).
 */
export function recordNotes(r: DbRecord): string[] {
  const notes: string[] = [];
  const flags = String(r.flags ?? '');
  if (/bulk density (estimated|not published)/.test(String(r.fit_status ?? ''))) notes.push('source.bulkEstimated');
  if (/fitted with all calibers/.test(String(r.fit_status ?? ''))) notes.push('source.fitAllCalibers');
  if (/\(maximum loads\)/.test(String(r.fit_status ?? ''))) notes.push('source.maxLoadsOnly');
  if (/length_missing|length_ambiguous/.test(flags) || (r.glen !== undefined && !(Number(r.glen) > 0) && 'gdia' in r)) {
    notes.push('source.lengthMissing');
  } else if (r.length_source === 'jbm-litz') notes.push('source.lengthJbmLitz');
  else if (r.length_source === 'jbm') notes.push('source.lengthJbm');
  if (/implausible_/.test(flags)) notes.push('source.implausible');
  if (r.V_source === 'estimate' || r.V_estimated === 'yes') notes.push('source.capacityEstimated');
  else if (r.V_source === 'reload-swiss-fill') notes.push('source.capacityLoadData');
  return notes;
}

/** Minimum twist the maker states for a bullet [mm per turn] ("min. twist 1:10\"" in the note), or null. */
export function minTwistOf(r: DbRecord): number | null {
  const m = /min\.? twist 1:(\d+(?:[.,]\d+)?)/i.exec(String(r.note ?? ''));
  return m ? Number(m[1]!.replace(',', '.')) * 25.4 : null;
}

const caliberLabel = (r: DbRecord) => str(r.cipname) + (str(r.altname) ? ` (${str(r.altname)})` : '');

export function applyCaliber(file: GrtLoadFile, r: DbRecord): void {
  file.caliberfile = {};
  for (const [name, value] of Object.entries(r)) {
    if (name === 'id' || name === 'geloescht') continue;
    file.caliberfile[name] = { name, value: typeof value === 'number' ? value.toFixed(2) : str(value), unit: '', type: '', descr: '' };
  }
  const c = file.caliber;
  set(c, 'CaliberName', caliberLabel(r));
  setNum(c, 'caselen', num(r.L3), 'mm');
  setNum(c, 'oal', num(r.L6), 'mm');
  // capacity V is given in grains of water
  setNum(c, 'casevol', (num(r.V) * GRAIN) / WATER_DENSITY, 'm3');
  setNum(c, 'Dz', num(r.c_Z) || num(r.G1), 'mm');
  setNum(c, 'Aeff', num(r.c_Q), 'mm2');
  setNum(c, 'pMaxZul', num(r.Pmax), 'bar');
  if (num(r.sebert) > 0) setNum(c, 'sebert', num(r.sebert), '');
  // start pressure by gun (rifle, auto pistol, revolver), see lib/startPressure.ts
  setNum(file.projectile, 'gpressure', defaultStartPressure(file), 'bar');
  syncSeatingDepth(file, 'oal');
  file.title = loadTitle(file);
}

export function applyProjectile(file: GrtLoadFile, r: DbRecord): void {
  const p = file.projectile;
  set(p, 'ProjectileName', `${str(r.mname)}, ${str(r.pname)}, ${str(r.caliber)}, ${num(r.gmass).toFixed(2)} grain`);
  set(p, 'mname', str(r.mname));
  set(p, 'pname', str(r.pname));
  set(p, 'lotid', str(r.lotid));
  setNum(p, 'Dbul', num(r.gdia), 'mm');
  setNum(p, 'mp', num(r.gmass), 'gr');
  // a bullet without a published length keeps the field empty (the load check asks for it), not 0
  if (num(r.glen) > 0) setNum(p, 'glen', num(r.glen), 'mm');
  else set(p, 'glen', '');
  if (num(r.gtip) > 0) setNum(p, 'gtip', num(r.gtip), 'mm');
  else set(p, 'gtip', '');
  setNum(p, 'gpressure', num(r.gpressure) > 0 ? num(r.gpressure) : defaultStartPressure(file), 'bar');
  setNum(p, 'gfriction', num(r.gfriction), 'bar');
  // a record with a boat tail length but no base type (Berger) is a boat tail
  const tailType = r.gtailtype === null || r.gtailtype === undefined || r.gtailtype === '' ? (num(r.gtailh) > 0 ? 2 : 0) : num(r.gtailtype);
  set(p, 'gTailType', text(tailType));
  setNum(p, 'gtailh', num(r.gtailh), 'mm');
  setNum(p, 'gTailDiaA', num(r.gtaildiaA), 'mm');
  setNum(p, 'gTailDiaB', num(r.gtaildiaB), 'mm');
  set(p, 'g1bc', text(num(r.g1bc)));
  set(p, 'g7bc', text(num(r.g7bc)));
  set(p, 'gUBCS', str(r.gUBCS));
  syncSeatingDepth(file, 'oal');
  file.title = loadTitle(file);
}

export function applyPropellant(file: GrtLoadFile, r: DbRecord): void {
  const w = file.propellant;
  for (const name of ['mname', 'pname', 'lotid', 'imageUuid', 'imageDetailUuid']) set(w, name, str(r[name]));
  // units of the component records
  const units: Record<string, string> = { Qex: 'kJ/kg', eta: 'cm3/g', pc: 'kg/m3', pcd: 'kg/m3', pt: 'Cel' };
  for (const name of ['Ba', 'Qex', 'k', 'a0', 'a1', 'z1', 'z2', 'eta', 'pc', 'pcd', 'pt', 'tcc', 'tch']) setNum(w, name, num(r[name]), units[name] ?? '');
  file.title = loadTitle(file);
}

/** Keeps OAL = case length + bullet length − seating depth after one of them changed. */
export function syncSeatingDepth(file: GrtLoadFile, changed: 'oal' | 'gdepth'): void {
  const caselen = si(file.caliber, 'caselen');
  const glen = si(file.projectile, 'glen');
  if (!(caselen > 0 && glen > 0)) return;
  if (changed === 'oal') {
    const oal = si(file.caliber, 'oal');
    if (oal > 0) setNum(file.projectile, 'gdepth', Math.max(caselen + glen - oal, 0), 'm');
  } else {
    const depth = si(file.projectile, 'gdepth');
    if (Number.isFinite(depth)) setNum(file.caliber, 'oal', caselen + glen - depth, 'm');
  }
}

/** SI value of a stored field converted to `factor` units (e.g. 1e-3 for mm), 0 when empty. */
function field(section: GrtSection, name: string, factor: number): number {
  const f = section[name];
  if (!f || f.value === '' || !Number.isFinite(Number(f.value))) return 0;
  return Number((toSI(Number(f.value), f.unit) / factor).toPrecision(12));
}

/**
 * The component of a load as a record with the field names of the component records, so that it can be
 * stored in the user's library and taken over again like a database record.
 */
export function recordFromLoad(kind: ComponentKind, file: GrtLoadFile, label: string): DbRecord {
  if (kind === 'caliber') {
    const r: DbRecord = {};
    for (const [name, v] of Object.entries(file.caliberfile)) r[name] = v.value !== '' && Number.isFinite(Number(v.value)) ? Number(v.value) : v.value;
    const c = file.caliber;
    return {
      ...r,
      cipname: label,
      altname: '',
      L3: field(c, 'caselen', 1e-3),
      V: Number(((field(c, 'casevol', 1) * WATER_DENSITY) / GRAIN).toPrecision(12)),
      // the master value's source stays only while the copy keeps that value (lib/capacity.ts)
      V_source: { estimate: 'estimate', loadData: 'reload-swiss-fill', own: 'own' }[capacitySource(file)],
      V_estimated: '',
      c_Z: field(c, 'Dz', 1e-3),
      c_Q: field(c, 'Aeff', 1e-6),
      Pmax: field(c, 'pMaxZul', 1e5),
      sebert: field(c, 'sebert', 1),
    };
  }
  if (kind === 'projectile') {
    const p = file.projectile;
    const dia = field(p, 'Dbul', 1e-3);
    return {
      mname: p.mname?.value ?? '',
      pname: label,
      lotid: p.lotid?.value ?? '',
      caliber: `.${Math.round((dia / 25.4) * 1000)}`,
      gdia: dia,
      glen: field(p, 'glen', 1e-3),
      gtip: field(p, 'gtip', 1e-3) || null,
      gmass: Number((field(p, 'mp', 1) / GRAIN).toPrecision(12)),
      gpressure: field(p, 'gpressure', 1e5),
      gfriction: field(p, 'gfriction', 1e5),
      gtailtype: field(p, 'gTailType', 1),
      gtailh: field(p, 'gtailh', 1e-3),
      gtaildiaA: field(p, 'gTailDiaA', 1e-3),
      gtaildiaB: field(p, 'gTailDiaB', 1e-3),
      g1bc: field(p, 'g1bc', 1),
      g7bc: field(p, 'g7bc', 1),
      gUBCS: p.gUBCS?.value ?? '',
    };
  }
  const w = file.propellant;
  return {
    mname: w.mname?.value ?? '',
    pname: label,
    lotid: w.lotid?.value ?? '',
    Ba: field(w, 'Ba', 1),
    Qex: field(w, 'Qex', 1e3),
    k: field(w, 'k', 1),
    a0: field(w, 'a0', 1),
    a1: field(w, 'a1', 1),
    z1: field(w, 'z1', 1),
    z2: field(w, 'z2', 1),
    eta: field(w, 'eta', 1e-3),
    pc: field(w, 'pc', 1),
    pcd: field(w, 'pcd', 1),
    pt: field(w, 'pt', 1),
    tcc: field(w, 'tcc', 1),
    tch: field(w, 'tch', 1),
    imageUuid: w.imageUuid?.value ?? '',
    imageDetailUuid: w.imageDetailUuid?.value ?? '',
  };
}

/** The load's powder as shown: maker, name and, if given, the lot in parentheses. */
export function powderLabel(file: GrtLoadFile): string {
  const w = file.propellant;
  return [w.mname?.value, w.pname?.value].filter(Boolean).join(' ') + (w.lotid?.value ? ` (${w.lotid.value})` : '');
}

export function loadTitle(file: GrtLoadFile): string {
  const w = file.propellant;
  const powder = [w.mname?.value, w.pname?.value].filter(Boolean).join(' ');
  return [file.caliber.CaliberName?.value, file.projectile.ProjectileName?.value, powder].filter(Boolean).join(' ');
}
