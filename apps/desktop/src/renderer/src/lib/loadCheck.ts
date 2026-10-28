// Checks the input fields of a load before the simulation: every missing or unusable field at once, with the
// row it is entered in, so the results can name it as the panel does and the panel can mark it.
import { toSI, type GrtLoadFile } from '@ballistica-interna/grtload';
import { caliberBulletDiameter, fitsCaliber } from './components';
import { CALIBER_ROWS, PROJECTILE_ROWS, PROPELLANT_ROWS, type Section } from './fields';

export interface LoadIssue {
  section: Section;
  name: string;
  /** i18n key below `field.` of the row the field is entered in */
  label: string;
  /** i18n key of the problem */
  problem: 'check.missing' | 'check.notNumber' | 'check.notPositive' | 'check.z2BelowZ1' | 'check.bulletNotFitting';
}

type Rule = [Section, string, 'positive' | 'number', required: boolean];

/**
 * The fields the simulation reads (packages/grtload toLoadInput); required ones have no fallback there. The
 * covolume eta is not checked: the model derives it from the material density (solver simulate.ts).
 */
const RULES: Rule[] = [
  ['caliber', 'Dz', 'positive', true],
  ['caliber', 'pMaxZul', 'positive', true],
  ['caliber', 'Aeff', 'positive', true],
  ['caliber', 'caselen', 'positive', true],
  ['caliber', 'casevol', 'positive', true],
  ['caliber', 'sebert', 'number', true],
  ['gun', 'xe', 'positive', true],
  ['gun', 'mgun', 'number', false],
  ['gun', 'twistlen', 'number', false],
  ['projectile', 'Dbul', 'positive', true],
  ['projectile', 'mp', 'positive', true],
  ['projectile', 'glen', 'positive', true],
  ['projectile', 'gdepth', 'number', true],
  ['projectile', 'gTailType', 'number', false],
  ['projectile', 'gtailh', 'number', false],
  ['projectile', 'gTailDiaA', 'number', false],
  ['projectile', 'gTailDiaB', 'number', false],
  ['projectile', 'gpressure', 'number', false],
  ['propellant', 'Qex', 'positive', true],
  ['propellant', 'k', 'positive', true],
  ['propellant', 'Ba', 'positive', true],
  ['propellant', 'a0', 'number', true],
  ['propellant', 'a1', 'number', false],
  ['propellant', 'z1', 'number', true],
  ['propellant', 'z2', 'number', true],
  ['propellant', 'pc', 'positive', true],
  ['propellant', 'pcd', 'positive', true],
  ['propellant', 'pt', 'number', false],
  ['propellant', 'tcc', 'number', false],
  ['propellant', 'tch', 'number', false],
  ['propellant', 'mc', 'positive', true],
  // load ladder (compute.ts): steps and charge step
  ['propellant', 'laddercnt', 'number', false],
  ['propellant', 'laddermc', 'number', false],
];

const ROWS = [...CALIBER_ROWS, ...PROJECTILE_ROWS, ...PROPELLANT_ROWS];
/** Fields the panels do not show (taken over with the component) */
const HIDDEN_LABELS: Record<string, string> = { a1: 'a1' };

function labelOf(section: Section, name: string): string {
  return ROWS.find((r) => r.section === section && r.name === name)?.key ?? HIDDEN_LABELS[name] ?? name;
}

export function checkLoad(file: GrtLoadFile): LoadIssue[] {
  const out: LoadIssue[] = [];
  const add = (section: Section, name: string, problem: LoadIssue['problem']) => out.push({ section, name, label: labelOf(section, name), problem });
  for (const [section, name, kind, required] of RULES) {
    const raw = file[section][name]?.value.trim() ?? '';
    if (raw === '') {
      if (required) add(section, name, 'check.missing');
      continue;
    }
    const v = Number(raw);
    if (!Number.isFinite(v)) add(section, name, 'check.notNumber');
    else if (kind === 'positive' && v <= 0) add(section, name, 'check.notPositive');
  }
  const [z1, z2] = ['z1', 'z2'].map((n) => Number(file.propellant[n]?.value || NaN));
  if (z1! > z2!) add('propellant', 'z2', 'check.z2BelowZ1');
  // a bullet of another diameter (e.g. after changing the caliber)
  const g1 = caliberBulletDiameter(file);
  const dbul = file.projectile.Dbul;
  const bullet = dbul?.value ? toSI(Number(dbul.value), dbul.unit) * 1e3 : NaN;
  if (Number.isFinite(g1) && bullet > 0 && !fitsCaliber(bullet, g1)) add('projectile', 'Dbul', 'check.bulletNotFitting');
  return out;
}
