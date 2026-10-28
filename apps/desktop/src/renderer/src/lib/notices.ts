// The notices of a load's result (lib/warnings.ts, resultNotices) from the open document, for the result panel and
// the report alike.
import { capacitySource } from './capacity';
import { SHORT_JUMP, SHORT_JUMP_START_PRESSURE } from './jump';
import { powderMatches, resultNotices, type Notice, type NoticeLevel } from './warnings';
import type { LoadDoc } from '../stores/loads';

export function noticesOf(doc: LoadDoc): Notice[] {
  const steps = doc.result.steps;
  const selected = Math.min(doc.focus, Math.max(steps.length - 1, 0));
  const load = doc.result.load;
  const jump = steps[0]?.derived?.jump ?? NaN;
  const start = load?.projectile.startPressure ?? NaN;
  const twist = load?.gun.twistLength ?? 0;
  const min = doc.minTwist;
  const values = Object.fromEntries(Object.entries(doc.file.propellant).map(([k, f]) => [k, f?.value]));
  return resultNotices({
    steps: steps.map((s) => ({ charge: s.charge, fill: s.derived?.fill, maxPressure: s.result.status === 'ok' ? s.result.maxPressure : NaN })),
    selected,
    powder: load?.propellant,
    powderChecked: powderMatches(values, doc.powderRecord),
    capacity: capacitySource(doc.file),
    cipPressure: load?.cartridge.maxPressure ?? 0,
    // jump below 1.5 mm with a start pressure below 800 bar: the real pressure can be far higher
    shortJump: Number.isFinite(jump) && jump < SHORT_JUMP && start < SHORT_JUMP_START_PRESSURE - 1e5 ? jump : null,
    // handgun: barrel below 300 mm, as in the accuracy script
    handgun: (load?.gun.barrelLength ?? 1) < 0.3,
    // the gun's twist is longer than the bullet maker's minimum
    slowTwist: min && twist > 0 && twist * 1e3 > min + 0.5 ? { twist: twist / 0.0254, min: min / 25.4 } : null,
  });
}

/** The notices grouped by level, danger first; levels without a notice are left out. */
export function noticeGroups(notices: Notice[]): { level: NoticeLevel; items: Notice[] }[] {
  return (['danger', 'caution', 'note'] as const).map((level) => ({ level, items: notices.filter((n) => n.level === level) })).filter((g) => g.items.length);
}
