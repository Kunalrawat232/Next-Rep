// What the Progress screens show beyond one exercise's records: how often the person trained each week, and
// how an exercise's top weight has moved. Pure: no React, network or storage.
import type { SessionBest } from '../records';
import type { Unit } from '../schemas';
import { toDisplay, unitLabel } from '../units';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type WeekCount = {
  /** The Monday the week starts on, as a local date, YYYY-MM-DD. */
  start: string;
  /** "12 Oct". */
  label: string;
  workouts: number;
};

/** The Monday on or before a day, at local midnight. */
function mondayOf(date: Date): Date {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day;
}

const keyOf = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * How many workouts the person did in each of the last 8 weeks (Monday to Sunday, device time zone),
 * oldest first, the current week last. A workout is counted in the week of its first set, and only workouts
 * with a set count. Weeks before the first workout are left out, so a new user does not see a row of empty
 * bars; an empty list means nothing was logged in the period.
 */
/** How many weeks the weekly chart looks back, this week included. */
const WEEKS = 8;

export function workoutsPerWeek(
  sets: { workoutId: string; loggedAt: string }[],
  now: Date,
): WeekCount[] {
  const firstSet = new Map<string, number>();
  for (const set of sets) {
    const time = new Date(set.loggedAt).getTime();
    if (Number.isNaN(time)) continue;
    const known = firstSet.get(set.workoutId);
    if (known === undefined || time < known) firstSet.set(set.workoutId, time);
  }
  const perWeek = new Map<string, number>();
  for (const time of firstSet.values()) {
    const key = keyOf(mondayOf(new Date(time)));
    perWeek.set(key, (perWeek.get(key) ?? 0) + 1);
  }
  const thisWeek = mondayOf(now);
  const all: WeekCount[] = [];
  for (let back = WEEKS - 1; back >= 0; back--) {
    const start = new Date(thisWeek);
    start.setDate(start.getDate() - 7 * back);
    all.push({
      start: keyOf(start),
      label: `${start.getDate()} ${MONTHS[start.getMonth()]}`,
      workouts: perWeek.get(keyOf(start)) ?? 0,
    });
  }
  const first = all.findIndex((week) => week.workouts > 0);
  return first === -1 ? [] : all.slice(first);
}

/**
 * The best top set of each week, oldest first: the heaviest, and on a tie the one with more reps. Someone who
 * trains an exercise twice a week with a different weight each day would otherwise see a zigzag, and a fall
 * whenever the lighter day came last, so charts and trends use this when there are at least two weeks.
 */
function weeklyBests(points: SessionBest[], unit: Unit): SessionBest[] {
  const hundredths = (kg: number) => Math.round(toDisplay(kg, unit) * 100);
  const best = new Map<string, SessionBest>();
  for (const point of points) {
    const date = new Date(point.at);
    if (Number.isNaN(date.getTime())) continue;
    const key = keyOf(mondayOf(date));
    const top = best.get(key);
    if (
      !top ||
      hundredths(point.totalKg) > hundredths(top.totalKg) ||
      (hundredths(point.totalKg) === hundredths(top.totalKg) && point.reps > top.reps)
    )
      best.set(key, point);
  }
  return [...best.values()].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/** What to draw for an exercise: its best set of each week, or each session when it has been trained in only one week. */
export function chartPoints(points: SessionBest[], unit: Unit): SessionBest[] {
  const weekly = weeklyBests(points, unit);
  return weekly.length >= 2 ? weekly : points;
}

/** Round steps for a chart's axis, so its numbers read 35, 40, 45, not 39, 43, 47. */
const AXIS_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 250, 500];

/**
 * The range and tick marks for a chart axis around `values`, with `pad` of room on each side: ticks on round
 * numbers (never below 0), at most about five gaps. A chart of reps or weights has the same need.
 */
export function niceAxis(
  values: number[],
  pad: number,
): { min: number; max: number; ticks: number[] } {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return { min: 0, max: 1, ticks: [0, 1] };
  const low = Math.max(0, Math.min(...finite) - pad);
  const high = Math.max(...finite) + pad;
  const step = AXIS_STEPS.find((s) => (high - low) / s <= 5) ?? 1000;
  const min = Math.max(0, Math.floor(low / step) * step);
  const max = Math.ceil(high / step) * step;
  const ticks: number[] = [];
  for (let tick = min; tick <= max + step / 2; tick += step) ticks.push(tick);
  return { min, max, ticks };
}

export type Trend = {
  /** Change in the top weight from the first point to the latest, in the shown unit, to 2 decimals (1.25 Kg is 1.25, not 1.3). */
  change: number;
  sessions: number;
  /** When the first session was. */
  since: string;
};

/** How an exercise's top weight moved over the points drawn (see `chartPoints`), or null with fewer than two to compare. */
export function trendOf(points: SessionBest[], unit: Unit): Trend | null {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last || points.length < 2) return null;
  const change =
    Math.round((toDisplay(last.totalKg, unit) - toDisplay(first.totalKg, unit)) * 100) / 100;
  return { change, sessions: points.length, since: first.at };
}

/** "+10 Kg since 14 Sep", "-2.5 Kg since 14 Sep" or "Same weight since 14 Sep". */
export function trendText(trend: Trend, unit: Unit): string {
  const date = new Date(trend.since);
  const when = Number.isNaN(date.getTime())
    ? 'the start'
    : `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  if (trend.change === 0) return `Same weight since ${when}`;
  const sign = trend.change > 0 ? '+' : '-';
  return `${sign}${Math.abs(trend.change)} ${unitLabel(unit)} since ${when}`;
}
