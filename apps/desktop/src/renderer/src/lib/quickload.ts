// A load from a QuickLOAD file: caliber, bullet and powder from the master data where found, overwritten by every
// value the QuickLOAD file has (case capacity, lengths, weight, BC, charge, barrel length, powder temperature, Pmax).
// The powder keeps our fit: QuickLOAD's burn values belong to another form function. The start pressure stays ours.
import { fromSI, newGrtLoad, toSI, type GrtLoadFile, type GrtSection } from '@ballistica-interna/grtload';
import { GRAIN, WATER_DENSITY } from '@ballistica-interna/solver';
import type { ComponentKind, DbRecord } from '../../../shared/api';
import { bulletMaker, bulletName, INCH, qlNumber, type QuickLoadImport, type QuickLoadValues } from '../../../shared/quickload';
import { applyCaliber, applyProjectile, applyPropellant, loadTitle, minTwistOf, recordNotes, syncSeatingDepth } from './components';

/** Where a component of the imported load came from. */
export interface ImportedComponent {
  /** master: the master record (with the file's values over it); quickload: built from the file; missing: not set */
  from: 'master' | 'quickload' | 'missing';
  /** the component as named in the load (master) or in the QuickLOAD file */
  label: string;
  /** name of the master record's source */
  source?: string;
  /** i18n keys of notes on the master record that still apply after the file's values */
  notes: string[];
}

/** A line of the import summary. */
export interface ImportRow {
  file: string;
  /** null: the file was not a QuickLOAD load file */
  components: Record<ComponentKind, ImportedComponent> | null;
}

export interface QuickLoadLoad {
  file: GrtLoadFile;
  /** name of the QuickLOAD file without folder and extension */
  name: string;
  components: Record<ComponentKind, ImportedComponent>;
  minTwist: number | null;
  powderRecord: DbRecord | null;
}

const fileBase = (path: string) => path.replace(/^.*[\\/]/, '').replace(/\.dat$/i, '');

function setNum(section: GrtSection, name: string, value: number, unit: string) {
  const f = section[name];
  if (f && Number.isFinite(value)) f.value = String(Number(fromSI(toSI(value, unit), f.unit).toPrecision(12)));
}

/** The cartridge name without "(CIP)" and the leading point of inch calibers. */
const cartridgeName = (v: QuickLoadValues) => (v.pattyp ?? '').replace(/\s*\(CIP\)\s*$/i, '').replace(/^\./, '').trim();

export function loadFromQuickLoad(q: QuickLoadImport): QuickLoadLoad {
  const v = q.values;
  const n = (name: string) => qlNumber(v, name);
  const file = newGrtLoad();

  let caliber: ImportedComponent;
  if (q.caliber) {
    applyCaliber(file, q.caliber);
    // the file's capacity replaces an estimated one
    const notes = recordNotes(q.caliber).filter((k) => !(n('volful') > 0 && k.startsWith('source.capacity')));
    caliber = { from: 'master', label: file.caliber.CaliberName?.value ?? '', source: String(q.caliber.source_name ?? ''), notes };
  } else {
    const name = cartridgeName(v);
    applyCaliber(file, { cipname: name, L3: n('hullen') * INCH, L6: n('patlan') * INCH, V: n('volful'), c_Z: n('kalzug') * INCH, G1: n('buldia') * INCH, c_Q: n('wirkqu'), Pmax: n('maxzul') * 10, tab: '1' });
    caliber = { from: 'quickload', label: name, notes: [] };
  }

  const dia = n('buldia') * INCH;
  const mass = n('bulgew');
  const len = n('bullen') * INCH;
  let projectile: ImportedComponent;
  if (q.projectile) {
    applyProjectile(file, q.projectile);
    const notes = recordNotes(q.projectile).filter((k) => !(len > 0 && k.startsWith('source.length')));
    projectile = { from: 'master', label: `${q.projectile.mname ?? ''} ${q.projectile.pname ?? ''}`.trim(), source: String(q.projectile.source_name ?? ''), notes };
  } else {
    const ql = bulletName(v.bultyp ?? '');
    const maker = bulletMaker(v.bultyp ?? '');
    const pname = maker && ql.toLowerCase().startsWith(maker.toLowerCase()) ? ql.slice(maker.length).trim() : ql;
    const label = Number.isFinite(mass) ? `${pname} ${Math.round(mass)} gr` : pname;
    applyProjectile(file, { mname: maker, pname: label, caliber: (v.bultyp ?? '').split(',')[0] ?? '', gdia: dia, gmass: mass, glen: len, g1bc: n('mulbc1') || 0 });
    projectile = { from: 'quickload', label: `${maker} ${label}`.trim(), notes: [] };
  }

  let propellant: ImportedComponent;
  if (q.propellant) {
    applyPropellant(file, q.propellant);
    propellant = { from: 'master', label: `${q.propellant.mname ?? ''} ${q.propellant.pname ?? ''}`.trim(), source: String(q.propellant.source_name ?? ''), notes: recordNotes(q.propellant) };
  } else {
    propellant = { from: 'missing', label: v.pulver ?? '', notes: [] };
  }

  // the file's values win over the master data
  const c = file.caliber;
  const p = file.projectile;
  setNum(c, 'caselen', n('hullen') * INCH, 'mm');
  // grains of water, converted as the app does; the report then names it the own value, not the master's
  setNum(c, 'casevol', (n('volful') * GRAIN) / WATER_DENSITY, 'm3');
  if (n('volful') > 0 && file.caliberfile.V_source) file.caliberfile.V_source.value = 'own';
  setNum(c, 'Dz', n('kalzug') * INCH, 'mm');
  setNum(c, 'Aeff', n('wirkqu'), 'mm2');
  setNum(c, 'pMaxZul', n('maxzul') * 10, 'bar');
  setNum(c, 'sebert', n('sebert'), '');
  if (v.pmetho && c.method) c.method.value = v.pmetho;
  setNum(p, 'Dbul', dia, 'mm');
  setNum(p, 'mp', mass, 'gr');
  setNum(p, 'glen', len, 'mm');
  setNum(p, 'g1bc', n('mulbc1'), '');
  setNum(c, 'oal', n('patlan') * INCH, 'mm');
  syncSeatingDepth(file, 'oal');
  setNum(file.gun, 'xe', n('laflen') * INCH, 'mm');
  setNum(file.propellant, 'mc', n('powwht'), 'gr');
  // the temperature may be 0 °C or below
  const temp = Number((v.powtmp ?? '').replace(',', '.'));
  if (v.powtmp && Number.isFinite(temp)) setNum(file.propellant, 'pt', temp, 'Cel');
  const name = fileBase(q.path);
  file.title = `${name} – ${loadTitle(file)}`;
  return {
    file,
    name,
    components: { caliber, projectile, propellant },
    minTwist: q.projectile ? minTwistOf(q.projectile) : null,
    powderRecord: q.propellant,
  };
}
