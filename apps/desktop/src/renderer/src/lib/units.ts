// Display units: conversion between SI and what the user sees, per quantity.
import { GRAIN, WATER_DENSITY } from '@ballistica-interna/solver';

export interface Unit {
  id: string;
  label: string;
  toSI: (v: number) => number;
  fromSI: (v: number) => number;
}

const linear = (id: string, label: string, factor: number): Unit => ({
  id,
  label,
  toSI: (v) => v * factor,
  fromSI: (v) => v / factor,
});

const IN = 0.0254;
const H2O_GRAIN = GRAIN / WATER_DENSITY; // m³ of water per grain

export const QUANTITIES = {
  length: [linear('mm', 'mm', 1e-3), linear('in', 'in', IN)],
  diameter: [linear('in', 'in', IN), linear('mm', 'mm', 1e-3)],
  area: [linear('mm2', 'mm²', 1e-6), linear('in2', 'in²', IN * IN)],
  capacity: [linear('grH2O', 'grain H2O', H2O_GRAIN), linear('cm3', 'cm³', 1e-6)],
  volume: [linear('cm3', 'cm³', 1e-6), linear('grH2O', 'grain H2O', H2O_GRAIN)],
  pressure: [linear('bar', 'bar', 1e5), linear('psi', 'psi', 6894.757293168), linear('MPa', 'MPa', 1e6)],
  bulletMass: [linear('g', 'g', 1e-3), linear('gr', 'grain', GRAIN)],
  chargeMass: [linear('gr', 'grain', GRAIN), linear('g', 'g', 1e-3)],
  gunMass: [linear('kg', 'kg', 1), linear('lb', 'lb', 0.45359237)],
  heat: [linear('kJ/kg', 'kJ/kg', 1e3)],
  density: [linear('kg/m3', 'kg/m³', 1), linear('g/cm3', 'g/cm³', 1e3)],
  temperature: [
    linear('C', '°C', 1),
    { id: 'F', label: '°F', toSI: (v) => ((v - 32) * 5) / 9, fromSI: (v) => (v * 9) / 5 + 32 },
  ],
  velocity: [linear('m/s', 'm/s', 1), linear('ft/s', 'ft/s', 0.3048)],
  energy: [linear('J', 'J', 1), linear('ftlbf', 'ft·lbf', 1.3558179483)],
  time: [linear('ms', 'ms', 1e-3)],
  none: [linear('', '', 1)],
} satisfies Record<string, Unit[]>;

export type Quantity = keyof typeof QUANTITIES;

export function unitsOf(q: Quantity): Unit[] {
  return QUANTITIES[q];
}

export function unitOf(q: Quantity, id?: string): Unit {
  const list = QUANTITIES[q];
  return list.find((u) => u.id === id) ?? list[0]!;
}

/** Formats a number for display with a fixed number of decimals. */
export function fmt(v: number | undefined, decimals: number): string {
  return v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(decimals);
}
