const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/**
 * "Today", "Yesterday", or "Mon 5 Oct" (with the year when it is not this year), in the device's
 * time zone. `now` is passed in so the result never depends on the clock. Anything that is not a
 * date gives "Unknown date".
 */
export function dayLabel(iso: string, now: Date): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  const days = Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  const label = `${DAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? label : `${label} ${date.getFullYear()}`;
}

/** Whole minutes between start and end; null when either is not a date or the end is before the start. */
export function durationMinutes(startedAt: string, endedAt: string | null): number | null {
  if (endedAt === null) return null;
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  return Number.isNaN(ms) || ms < 0 ? null : Math.round(ms / 60_000);
}

/** "45 min", "1 h 05 min", "2 h". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest === 0
    ? `${minutes / 60} h`
    : `${Math.floor(minutes / 60)} h ${String(rest).padStart(2, '0')} min`;
}

type Logged = { exerciseId: string; loggedAt: string };

/** Sets grouped by exercise, in the order each exercise was first done; sets within an exercise by time. */
export function groupByExercise<T extends Logged>(sets: T[]): { exerciseId: string; sets: T[] }[] {
  const byTime = [...sets].sort((a, b) =>
    a.loggedAt < b.loggedAt ? -1 : a.loggedAt > b.loggedAt ? 1 : 0,
  );
  const groups = new Map<string, T[]>();
  for (const set of byTime) {
    const group = groups.get(set.exerciseId);
    if (group) group.push(set);
    else groups.set(set.exerciseId, [set]);
  }
  return [...groups].map(([exerciseId, grouped]) => ({ exerciseId, sets: grouped }));
}
