import type { GrtField, GrtLoadFile, GrtSection } from './parse.ts';
import { grtEncode } from './write.ts';

type FieldDef = [name: string, unit: string, type: string, descr: string, value?: string];
type InputSection = 'caliber' | 'gun' | 'projectile' | 'propellant';

/** The <input> fields of each section, in the order of the format. */
export const GRT_FIELDS: Record<InputSection, FieldDef[]> = {
  caliber: [
    ['CaliberName', '', 'string', 'caliber name'],
    ['oal', 'mm', 'decimal', 'cartridge overall length'],
    ['caselen', 'mm', 'decimal', 'case length'],
    ['casevol', 'cm3', 'decimal', 'case volume'],
    ['Dz', 'mm', 'decimal', 'groove caliber'],
    ['Aeff', 'mm2', 'decimal', 'effektive area'],
    ['pMaxZul', 'bar', 'decimal', 'maximum allowed pressure'],
    ['method', '', 'string', 'cartridge test method', 'Piezo CIP'],
    ['sebert', '', 'decimal', 'Sebert factor', '0.5'],
    ['ps', 'bar', 'decimal', 'initial gas pressure', '250'],
    ['shotshell', '', 'boolean', 'true if shotshell', 'false'],
  ],
  gun: [
    ['GunName', '', 'string', 'gun name'],
    ['xe', 'mm', 'decimal', 'barrel length', '600'],
    ['twistlen', 'mm', 'decimal', 'twist length', '0'],
    ['mgun', 'kg', 'decimal', 'gun weight', '0'],
    ['gjump', 'mm', 'decimal', 'bullet jump distance', '0'],
    ['gjumpUnlock', '', 'boolean', 'unlocked bullet jump', 'false'],
  ],
  projectile: [
    ['ProjectileName', '', 'string', 'projectile name'],
    ['mname', '', 'string', 'projectile manufacturer'],
    ['pname', '', 'string', 'projectile product name'],
    ['lotid', '', 'string', 'projectile lot-id'],
    ['Dbul', 'mm', 'decimal', 'projectile diameter'],
    ['mp', 'g', 'decimal', 'projectile weight'],
    ['gdepth', 'mm', 'decimal', 'bullet seating depth'],
    ['glen', 'mm', 'decimal', 'projectile overall length'],
    ['gpressure', 'bar', 'decimal', 'initial gas pressure', '250'],
    ['gtailh', 'mm', 'decimal', 'projectile tail length', '0'],
    ['gTailDiaA', 'mm', 'decimal', 'projectile tail diameter A', '0'],
    ['gTailDiaB', 'mm', 'decimal', 'projectile tail diameter B', '0'],
    ['gTailType', '', 'decimal', 'projectile base type', '0'],
    ['g1bc', '', 'decimal', 'G1 ballistic coefficient', '0'],
    ['g7bc', '', 'decimal', 'G7 ballistic coefficient', '0'],
    ['gUBCS', '', 'string', 'UBCS-Code (Universal Bullet Classification Scheme)'],
    // BallisticaInterna: length from the tip to the full diameter, for the free travel to the lands (jump)
    ['gtip', 'mm', 'decimal', 'bullet tip length (tip to full diameter)'],
    ['gfriction', 'bar', 'decimal', 'special bullet resistance inside the barrel', '0'],
    ['gfrictionUnlock', '', 'boolean', 'unlocked friction', 'false'],
    ['mode', '', 'string', '', '0'],
  ],
  propellant: [
    ['mname', '', 'string', 'propellant manufacturer'],
    ['pname', '', 'string', 'propellant product name'],
    ['lotid', '', 'string', 'propellant lot-id'],
    ['Ba', '', 'decimal', 'vivacity coefficient'],
    ['Qex', 'kJ/kg', 'decimal', 'specific explosive heat'],
    ['k', '', 'decimal', 'ratio of the specific heat of the powder gases'],
    ['a0', '', 'decimal', 'prog/deg coefficient'],
    ['a1', '', 'decimal', 'prog/deg coefficient', '0'],
    ['z1', '', 'decimal', 'burn-up limit z1'],
    ['z2', '', 'decimal', 'burn-up limit z2'],
    ['eta', 'cm3/kg', 'decimal', 'covolume of the powder gases', '1'],
    ['pc', 'kg/m3', 'decimal', 'material density'],
    ['pcd', 'kg/m3', 'decimal', 'bulk density'],
    ['pt', 'Cel', 'decimal', 'temperature normal', '21'],
    ['tcc', '', 'decimal', 'cold temperature coefficient', '0'],
    ['tch', '', 'decimal', 'hot temperature coefficient', '0'],
    ['mc', 'g', 'decimal', 'propellant mass'],
    ['laddercnt', '', 'decimal', 'ladder steps (1 to 10, below 2: disabled)', '1'],
    ['laddermc', 'g', 'decimal', 'ladder step propellant mass', '0'],
    ['imageUuid', '', 'string', 'propellant picture uuid'],
    ['imageDetailUuid', '', 'string', 'propellant detail picture uuid'],
  ],
};

const SECTIONS: InputSection[] = ['caliber', 'gun', 'projectile', 'propellant'];

function emptySection(defs: FieldDef[]): GrtSection {
  const out: GrtSection = {};
  for (const [name, unit, type, descr, value = ''] of defs) out[name] = { name, value, unit, type, descr };
  return out;
}

/** Adds the inputs of the format a file lacks (e.g. an older file without the tip length), with their defaults. */
export function completeFields(file: GrtLoadFile): GrtLoadFile {
  for (const name of SECTIONS) {
    for (const [field, unit, type, descr, value = ''] of GRT_FIELDS[name]) {
      if (!file[name][field]) file[name][field] = { name: field, value, unit, type, descr };
    }
  }
  return file;
}

/** A new load with the default values of the format. */
export function newGrtLoad(version = '2021.2030-NIGHTLY'): GrtLoadFile {
  return {
    version,
    title: '',
    caliber: emptySection(GRT_FIELDS.caliber),
    caliberfile: {},
    gun: emptySection(GRT_FIELDS.gun),
    projectile: emptySection(GRT_FIELDS.projectile),
    propellant: emptySection(GRT_FIELDS.propellant),
  };
}

const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** GRT writes the test method unencoded, every other value URL-encoded. */
const RAW_VALUES = new Set(['method']);

function inputLine(f: GrtField): string {
  const value = RAW_VALUES.has(f.name) ? attr(f.value) : grtEncode(f.value);
  return `      <input name="${attr(f.name)}" value="${value}" unit="${attr(f.unit)}" type="${attr(f.type)}" descr="${attr(f.descr)}" />`;
}

/** Fields in the order of the format, then any further fields of the file. */
function ordered(section: GrtSection, defs: FieldDef[]): GrtField[] {
  const known = defs.map(([name]) => section[name]).filter((f): f is GrtField => f !== undefined);
  const extra = Object.values(section).filter((f) => !defs.some(([name]) => name === f.name));
  // an empty tip length is left out: files of GRT versions without the field have none
  return [...known, ...extra].filter((f) => !(f.name === 'gtip' && f.value === ''));
}

export function serializeGrtLoad(file: GrtLoadFile): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>',
    `<GordonsReloadingTool version='${attr(file.version)}'>`,
    '  <InnerBallistikInput>',
    `    <title>${grtEncode(file.title)}</title>`,
    '    <config name="CurveFocusIdx" value="0" unit="" type="integer" descr="selected ladder curve for display" />',
  ];
  for (const name of SECTIONS) {
    lines.push(`    <${name}>`, ...ordered(file[name], GRT_FIELDS[name]).map(inputLine), `    </${name}>`);
    if (name === 'caliber') {
      lines.push('    <caliberfile>');
      for (const v of Object.values(file.caliberfile)) lines.push(`      <var name="${attr(v.name)}" value="${grtEncode(v.value)}" />`);
      lines.push('    </caliberfile>');
    }
  }
  lines.push('    <appendix>', '    </appendix>', '  </InnerBallistikInput>', '</GordonsReloadingTool>');
  // line ends and missing final newline as GRT writes them
  return lines.join('\r\n');
}
