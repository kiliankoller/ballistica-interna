// Conversion of the unit strings used in .grtload files to SI.

type Linear = { factor: number; offset?: number };

const UNITS: Record<string, Linear> = {
  '': { factor: 1 },
  mm: { factor: 1e-3 },
  cm: { factor: 1e-2 },
  m: { factor: 1 },
  in: { factor: 0.0254 },
  inch: { factor: 0.0254 },
  mm2: { factor: 1e-6 },
  in2: { factor: 0.0254 ** 2 },
  cm3: { factor: 1e-6 },
  m3: { factor: 1 },
  g: { factor: 1e-3 },
  kg: { factor: 1 },
  grain: { factor: 64.79891e-6 },
  gr: { factor: 64.79891e-6 },
  lb: { factor: 0.45359237 },
  bar: { factor: 1e5 },
  Pa: { factor: 1 },
  MPa: { factor: 1e6 },
  psi: { factor: 6894.757293168 },
  'kJ/kg': { factor: 1e3 },
  'J/kg': { factor: 1 },
  'kg/m3': { factor: 1 },
  'g/cm3': { factor: 1e3 },
  // GRT labels the covolume "cm3/kg", but its values (about 1) are cm³/g.
  'cm3/kg': { factor: 1e-3 },
  'cm3/g': { factor: 1e-3 },
  Cel: { factor: 1 },
  degC: { factor: 1 },
  'm/s': { factor: 1 },
  'ft/s': { factor: 0.3048 },
  s: { factor: 1 },
  ms: { factor: 1e-3 },
  J: { factor: 1 },
  joule: { factor: 1 },
};

export function toSI(value: number, unit: string): number {
  const u = UNITS[unit];
  if (!u) throw new Error(`unknown unit "${unit}"`);
  return value * u.factor + (u.offset ?? 0);
}

export function fromSI(value: number, unit: string): number {
  const u = UNITS[unit];
  if (!u) throw new Error(`unknown unit "${unit}"`);
  return (value - (u.offset ?? 0)) / u.factor;
}
