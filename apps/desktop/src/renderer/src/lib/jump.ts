// Free travel of the bullet to the lands ("rotationsloser Geschossweg", jump). With a jump below about 1.5 mm the
// start pressure should be set to about 800 bar, for every kind of bullet; else the real pressure can be up to
// 1000 bar above the calculated one (note of Styria Arms in the AERO price list, about QuickLOAD; the measured
// loads show the same direction: the model's pressure falls by about 1 % per mm the bullet sits closer).
import type { GrtLoadFile } from '@ballistica-interna/grtload';

/** Jump below which the start pressure should be raised [m], and the start pressure then advised [Pa]. */
export const SHORT_JUMP = 1.5e-3;
export const SHORT_JUMP_START_PRESSURE = 800e5;

/**
 * Jump [m]: the end of the cylindrical freebore of the C.I.P. chamber (L3 + G) minus the point where the bullet
 * reaches full diameter (cartridge length − tip length). The bullet touches the leade a little further in, so
 * the real jump is somewhat longer: the warning comes rather too early than too late. NaN without the C.I.P.
 * chamber (L3, G) of the caliber or without the tip length of the bullet.
 */
export function jumpOf(file: GrtLoadFile): number {
  const mm = (v: string | undefined) => (v === undefined || v === '' ? NaN : Number(v));
  const freeboreEnd = mm(file.caliberfile.c_L3?.value) + mm(file.caliberfile.c_G?.value);
  const tip = mm(file.projectile.gtip?.value);
  const oal = mm(file.caliber.oal?.value);
  if (!(freeboreEnd > 0 && tip > 0 && oal > 0)) return NaN;
  return (freeboreEnd - (oal - tip)) * 1e-3;
}
