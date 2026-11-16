// QuickLOAD load files (.dat, "name=value" lines in Latin-1): reading and finding their components in the master
// data. Used by the main process (which has the database) and, for the field values, by the renderer.
import type { DbRecord } from './api';

/** The fields of a QuickLOAD file (the first of each name; values trimmed, not converted). */
export type QuickLoadValues = Record<string, string>;

export function parseQuickLoad(text: string): QuickLoadValues {
  const v: QuickLoadValues = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^(\w+)=(.*)$/.exec(line);
    if (m && !(m[1]! in v)) v[m[1]!] = m[2]!.trim();
  }
  return v;
}

/** Whether a text is a QuickLOAD load file (the cartridge, bullet and powder fields are present). */
export function isQuickLoad(v: QuickLoadValues): boolean {
  return 'pattyp' in v && 'bultyp' in v && 'pulver' in v;
}

/** Positive number of a QuickLOAD field, NaN when empty, 0 or not a number. */
export function qlNumber(v: QuickLoadValues, name: string): number {
  const x = Number((v[name] ?? '').replace(',', '.'));
  return Number.isFinite(x) && x > 0 ? x : NaN;
}

export const INCH = 25.4; // mm

/**
 * A cartridge name reduced for comparing: lower case, without "(CIP)", "mm" and punctuation; a decimal comma or
 * point between digits stays a point ("8,5 x 63" and "8.5 x 63" → "8.5x63", ".375 H.& H. Mag." → "375hhmag").
 */
export function caliberKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(cip\)/g, '')
    .replace(/(\d)[.,](\d)/g, '$1\u0000$2')
    .replace(/(^|[^a-z])mm\b/g, '$1')
    .replace(/[^a-z0-9\u0000äöüß]/g, '')
    .replace(/\u0000/g, '.');
}

/**
 * The master caliber of a QuickLOAD cartridge name: the same reduced name (C.I.P. name or other name), otherwise
 * the longest master name the QuickLOAD name starts with, followed by a word ("7 x 57 mm Mauser" → "7 x 57").
 * null when none or more than one fit.
 */
export function matchCaliber(qlName: string, calibers: DbRecord[]): DbRecord | null {
  const key = caliberKey(qlName);
  if (!key) return null;
  const keys = (r: DbRecord) => [r.cipname, r.altname].map((n) => caliberKey(String(n ?? ''))).filter(Boolean);
  const exact = calibers.filter((r) => keys(r).includes(key));
  if (exact.length) return exact.length === 1 ? exact[0]! : null;
  let best: DbRecord[] = [];
  let bestLen = 0;
  for (const r of calibers) {
    for (const k of keys(r)) {
      if (!(key.startsWith(k) && /^[a-zäöüß]/.test(key.slice(k.length)))) continue;
      if (k.length > bestLen) (best = [r]), (bestLen = k.length);
      else if (k.length === bestLen && !best.includes(r)) best.push(r);
    }
  }
  return best.length === 1 ? best[0]! : null;
}

const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * The master powder of a QuickLOAD powder name: maker and name ("Norma 202", "Vihtavuori N160"), or a name with
 * letters and digits after nothing but a maker word ("RS 60", "ReloadSwiss RS 60"). null when none or ambiguous.
 */
export function matchPowder(qlName: string, powders: DbRecord[]): DbRecord | null {
  const key = alnum(qlName);
  if (!key) return null;
  const full = powders.filter((r) => alnum(`${r.mname ?? ''}${r.pname ?? ''}`) === key);
  if (full.length) return full.length === 1 ? full[0]! : null;
  const byName = powders.filter((r) => {
    const p = alnum(String(r.pname ?? ''));
    return /[a-z]/.test(p) && /\d/.test(p) && key.endsWith(p) && /^[a-z]*$/.test(key.slice(0, key.length - p.length));
  });
  return byName.length === 1 ? byName[0]! : null;
}

/** Bullet makers by the QuickLOAD bullet name (maker name of the master data). */
export const BULLET_MAKERS: [RegExp, string][] = [
  [/\bAERO\b/i, 'Styria Arms'], [/Hornady/i, 'Hornady'], [/Nosler/i, 'Nosler'], [/Barnes/i, 'Barnes'],
  [/Sierra/i, 'Sierra'], [/Berger/i, 'Berger'], [/Lapua/i, 'Lapua'], [/Norma/i, 'Norma'], [/\bSAX\b/i, 'Sax'],
  [/Speer/i, 'Speer'], [/\bRWS\b/i, 'RWS'], [/Brenneke/i, 'Brenneke'], [/Swift/i, 'Swift'], [/Swiss Jagd/i, 'Swiss Jagd'],
  [/Lehigh/i, 'Lehigh'], [/Woodleigh/i, 'Woodleigh'], [/\bGECO\b/i, 'GECO'], [/Peregrine/i, 'Peregrine'],
];

export const bulletMaker = (qlName: string) => BULLET_MAKERS.find(([re]) => re.test(qlName))?.[1] ?? '';

/** The bullet's name without the caliber and weight in front and the "smax" note at the end. */
export function bulletName(bultyp: string): string {
  return bultyp.replace(/^\.\d+,\s*(\d+(\.\d+)?,\s*)?/, '').replace(/,?\s*-\s*smax:.*$/, '').trim();
}

/**
 * The master bullet of a QuickLOAD bullet among the bullets of about its diameter and weight (`near`): by part
 * number, else by a distinctive product word of exactly one bullet of the maker; AERO bullets (named by weight)
 * by the nearest length. null when not safe.
 */
export function matchBullet(bultyp: string, length: number, near: DbRecord[]): DbRecord | null {
  const maker = bulletMaker(bultyp);
  const parts = bultyp.match(/\d{4,}/g) ?? [];
  const byPart = near.filter((r) => parts.some((p) => String(r.part_number ?? '').replace(/\D/g, '').endsWith(p)));
  if (byPart.length === 1) return byPart[0]!;
  if (!maker) return null;
  // a distinctive product word (Ecostrike, Partition …; not "Match" or "BTHP")
  const words = (bultyp.match(/[A-Za-z]{6,}/g) ?? []).filter((w) => !BULLET_MAKERS.some(([re]) => re.test(w)));
  const byWord = near.filter((r) => r.mname === maker && words.some((w) => String(r.pname).toLowerCase().includes(w.toLowerCase())));
  if (byWord.length === 1) return byWord[0]!;
  if (maker !== 'Styria Arms' || !(length > 0)) return null;
  const own = near.filter((r) => r.mname === maker && /^AERO SB \d/.test(String(r.pname)) && Number(r.glen) > 0);
  if (!own.length) return null;
  const hsd = /HSD/i.test(bultyp);
  const fit = own.filter((r) => /HSD/i.test(String(r.pname)) === hsd);
  const pool = fit.length ? fit : own;
  return pool.reduce((a, b) => (Math.abs(Number(a.glen) - length) <= Math.abs(Number(b.glen) - length) ? a : b));
}

/** A QuickLOAD file read by the main process with the master records found for it (null: not found). */
export interface QuickLoadImport {
  path: string;
  values: QuickLoadValues;
  caliber: DbRecord | null;
  projectile: DbRecord | null;
  propellant: DbRecord | null;
  /** Not a QuickLOAD load file (the cartridge, bullet or powder field is missing). */
  invalid?: boolean;
}
