// The editable and computed rows of the three input panels.
import type { Quantity } from './units';

export type Section = 'caliber' | 'gun' | 'projectile' | 'propellant';

export interface FieldRow {
  /** i18n key below `field.` */
  key: string;
  /** Stored field (section + input name); absent for computed rows. */
  section?: Section;
  name?: string;
  quantity: Quantity;
  decimals: number;
  /** Shown in the "optional" group. */
  optional?: boolean;
  /** Computed rows read their SI value from the derived values of the load. */
  computed?: Exclude<keyof import('./compute').Derived, 'obt'>;
  options?: { value: string; label: string }[];
}

export const CALIBER_ROWS: FieldRow[] = [
  { key: 'grooveDiameter', section: 'caliber', name: 'Dz', quantity: 'diameter', decimals: 3 },
  { key: 'maxPressure', section: 'caliber', name: 'pMaxZul', quantity: 'pressure', decimals: 0 },
  { key: 'boreArea', section: 'caliber', name: 'Aeff', quantity: 'area', decimals: 3 },
  { key: 'caseLength', section: 'caliber', name: 'caselen', quantity: 'length', decimals: 2 },
  { key: 'caseCapacity', section: 'caliber', name: 'casevol', quantity: 'capacity', decimals: 2 },
  { key: 'overallLength', section: 'caliber', name: 'oal', quantity: 'length', decimals: 2 },
  { key: 'chamberVolume', quantity: 'volume', decimals: 4, computed: 'chamberVolume' },
  { key: 'sebert', section: 'caliber', name: 'sebert', quantity: 'none', decimals: 2 },
  { key: 'barrelLength', section: 'gun', name: 'xe', quantity: 'length', decimals: 2 },
  { key: 'bulletTravel', quantity: 'length', decimals: 2, computed: 'travel' },
  { key: 'gunMass', section: 'gun', name: 'mgun', quantity: 'gunMass', decimals: 2, optional: true },
  { key: 'twistLength', section: 'gun', name: 'twistlen', quantity: 'length', decimals: 2, optional: true },
];

export const PROJECTILE_ROWS: FieldRow[] = [
  { key: 'bulletDiameter', section: 'projectile', name: 'Dbul', quantity: 'diameter', decimals: 3 },
  { key: 'bulletMass', section: 'projectile', name: 'mp', quantity: 'bulletMass', decimals: 3 },
  { key: 'bulletLength', section: 'projectile', name: 'glen', quantity: 'length', decimals: 2 },
  { key: 'seatingDepth', section: 'projectile', name: 'gdepth', quantity: 'length', decimals: 2 },
  { key: 'tipLength', section: 'projectile', name: 'gtip', quantity: 'length', decimals: 2 },
  { key: 'jump', quantity: 'length', decimals: 2, computed: 'jump' },
  {
    key: 'tailType',
    section: 'projectile',
    name: 'gTailType',
    quantity: 'none',
    decimals: 0,
    options: [
      { value: '0', label: 'tail.flat' },
      { value: '1', label: 'tail.hollow' },
      { value: '2', label: 'tail.boattail' },
    ],
  },
  { key: 'tailLength', section: 'projectile', name: 'gtailh', quantity: 'length', decimals: 2 },
  { key: 'tailDiameterA', section: 'projectile', name: 'gTailDiaA', quantity: 'length', decimals: 2 },
  { key: 'tailDiameterB', section: 'projectile', name: 'gTailDiaB', quantity: 'length', decimals: 2 },
  { key: 'startPressure', section: 'projectile', name: 'gpressure', quantity: 'pressure', decimals: 0 },
  { key: 'g1bc', section: 'projectile', name: 'g1bc', quantity: 'none', decimals: 3, optional: true },
  { key: 'g7bc', section: 'projectile', name: 'g7bc', quantity: 'none', decimals: 3, optional: true },
];

export const PROPELLANT_ROWS: FieldRow[] = [
  { key: 'Qex', section: 'propellant', name: 'Qex', quantity: 'heat', decimals: 0 },
  { key: 'kappa', section: 'propellant', name: 'k', quantity: 'none', decimals: 4 },
  { key: 'Ba', section: 'propellant', name: 'Ba', quantity: 'none', decimals: 4 },
  { key: 'a0', section: 'propellant', name: 'a0', quantity: 'none', decimals: 4 },
  { key: 'z1', section: 'propellant', name: 'z1', quantity: 'none', decimals: 4 },
  { key: 'z2', section: 'propellant', name: 'z2', quantity: 'none', decimals: 4 },
  { key: 'materialDensity', section: 'propellant', name: 'pc', quantity: 'density', decimals: 0 },
  { key: 'bulkDensity', section: 'propellant', name: 'pcd', quantity: 'density', decimals: 0 },
  { key: 'temperature', section: 'propellant', name: 'pt', quantity: 'temperature', decimals: 0 },
  { key: 'charge', section: 'propellant', name: 'mc', quantity: 'chargeMass', decimals: 2 },
  { key: 'ladderSteps', section: 'propellant', name: 'laddercnt', quantity: 'none', decimals: 0 },
  { key: 'ladderStep', section: 'propellant', name: 'laddermc', quantity: 'chargeMass', decimals: 2 },
];
