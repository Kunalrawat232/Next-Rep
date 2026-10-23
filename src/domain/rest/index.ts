/** Rest timer rules. Times are milliseconds since the epoch; lengths are whole seconds. */

export const REST_PRESETS = [60, 90, 120, 180] as const;
/** The rest that starts after a set until the person picks another one. */
export const REST_DEFAULT = 90;
export const REST_MIN_CUSTOM = 30;
export const REST_MAX = 900;
export const REST_EXTEND = 30;
/** A rest that ended longer ago than this is not shown as "Rest over" any more. */
export const REST_STALE_AFTER = 3600;

/** When a rest that starts now and lasts `seconds` ends. */
export function startRest(now: number, seconds: number): number {
  return now + seconds * 1000;
}

/** Whole seconds left, rounded up so the last second shows as 0:01 and never 0:00 early. */
export function remainingSeconds(endsAt: number, now: number): number {
  const left = Math.ceil((endsAt - now) / 1000);
  // Never more than the longest rest, so a clock set back does not show an hour of rest.
  return Number.isFinite(left) ? Math.min(REST_MAX, Math.max(0, left)) : 0;
}

export function isRestOver(endsAt: number, now: number): boolean {
  return now >= endsAt;
}

/** Adds time to a rest, counted from now if it is already over, and never leaving more than the longest rest to go. */
export function extendRest(endsAt: number, now: number): number {
  return Math.min(Math.max(endsAt, now) + REST_EXTEND * 1000, now + REST_MAX * 1000);
}

/** A stored end time that cannot be a real rest: further ahead than the longest rest, or over for more than an hour. */
export function isRestStale(endsAt: number, now: number): boolean {
  return (
    !Number.isFinite(endsAt) ||
    endsAt > now + REST_MAX * 1000 ||
    now - endsAt > REST_STALE_AFTER * 1000
  );
}

/** `m:ss`, as in 1:24. */
export function formatRest(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export type CustomRest = { ok: true; seconds: number } | { ok: false; message: string };

/** A length typed by the user: whole seconds from 30 to 900. */
export function parseCustomRest(text: string): CustomRest {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed))
    return { ok: false, message: 'Enter the rest in whole seconds, such as 75.' };
  const seconds = Number(trimmed);
  if (seconds < REST_MIN_CUSTOM || seconds > REST_MAX)
    return { ok: false, message: `Rest must be ${REST_MIN_CUSTOM} to ${REST_MAX} seconds.` };
  return { ok: true, seconds };
}
