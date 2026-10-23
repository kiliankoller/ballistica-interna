// Start pressure (shot start) a load gets when its caliber or bullet is taken from a list, unless the bullet
// record names its own: rifles 250 bar; handgun cartridges (C.I.P. table 4) by gun: auto pistols 290 bar,
// revolvers 150 bar (the cylinder gap acts like a long jump). Fitted on the measured handgun loads (Lovex, Reload
// Swiss, Hodgdon, Ramshot: median −7.5 % → +0.3 %, decided 2026-10-20); the user can change it per load.
import type { GrtLoadFile } from '@ballistica-interna/grtload';

export const RIFLE_START_PRESSURE = 250;
export const PISTOL_START_PRESSURE = 290;
export const REVOLVER_START_PRESSURE = 150;

/** Cartridges of auto pistols by name; the other handgun cartridges count as revolver cartridges. */
export const AUTO_PISTOL = /auto|luger|para|browning|sig|acp|gap|super|40 s&w|10 mm|9 x 1\d|9 x 2\d|makarov|tokarev|mauser|fn|steyr|glisenti|nambu|bergmann|naa|5[.,]7|7[.,]65|7[.,]62 x 25|7[.,]63/i;

/** Default start pressure [bar] for the load's caliber (C.I.P. table and name in the caliber record). */
export function defaultStartPressure(file: GrtLoadFile): number {
  const handgun = file.caliberfile.tab?.value?.startsWith('4');
  if (!handgun) return RIFLE_START_PRESSURE;
  return AUTO_PISTOL.test(file.caliber.CaliberName?.value ?? '') ? PISTOL_START_PRESSURE : REVOLVER_START_PRESSURE;
}
