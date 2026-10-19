import { describe, expect, it } from 'vitest';
import type { SessionBest } from '../records';
import { chartPoints, trendOf, trendText, weeklyBests, workoutsPerWeek } from '.';

/** Local noon, so the day is the same in any time zone. */
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).toISOString();
const set = (workoutId: string, when: string) => ({ workoutId, loggedAt: when });
// Monday 19 Oct 2026.
const NOW = new Date(2026, 9, 19, 9);

describe('workoutsPerWeek', () => {
  it('counts a workout once, in the week of its first set, with weeks running Monday to Sunday', () => {
    const weeks = workoutsPerWeek(
      [
        set('a', at(2026, 10, 12)), // Monday
        set('a', at(2026, 10, 12)),
        set('b', at(2026, 10, 18)), // Sunday of the same week
        set('c', at(2026, 10, 19)), // Monday, the next week
      ],
      NOW,
    );
    expect(weeks.at(-2)).toMatchObject({ start: '2026-10-12', label: '12 Oct', workouts: 2 });
    expect(weeks.at(-1)).toMatchObject({ start: '2026-10-19', label: '19 Oct', workouts: 1 });
  });

  it('fills a week with no workout with zero, but drops the weeks before the first workout', () => {
    const weeks = workoutsPerWeek([set('a', at(2026, 9, 28)), set('b', at(2026, 10, 12))], NOW);
    expect(weeks.map((w) => w.workouts)).toEqual([1, 0, 1, 0]);
    expect(weeks[0]!.start).toBe('2026-09-28');
  });

  it('shows at most the number of weeks asked for, the current one last', () => {
    // The July workout is outside the four weeks, so it is not shown; the one in September is.
    const sets = [
      set('old', at(2026, 7, 6)),
      set('a', at(2026, 9, 29)),
      set('b', at(2026, 10, 14)),
    ];
    const weeks = workoutsPerWeek(sets, NOW, 4);
    expect(weeks).toHaveLength(4);
    expect(weeks.at(-1)!.start).toBe('2026-10-19');
    expect(weeks[0]!.start).toBe('2026-09-28');
  });

  it('is empty when nothing was logged in the period, and ignores a set with a bad date', () => {
    expect(workoutsPerWeek([], NOW)).toEqual([]);
    expect(workoutsPerWeek([set('a', 'not a date')], NOW)).toEqual([]);
    expect(workoutsPerWeek([set('old', at(2025, 1, 6))], NOW)).toEqual([]);
  });
});

const point = (when: string, totalKg: number): SessionBest => ({
  workoutId: when,
  setId: when,
  at: when,
  totalKg,
  reps: 8,
});

describe('trendOf', () => {
  it('is the change from the first session to the latest, in the shown unit', () => {
    const points = [
      point(at(2026, 9, 14), 40),
      point(at(2026, 9, 21), 42.5),
      point(at(2026, 10, 12), 50),
    ];
    expect(trendOf(points, 'kg')).toMatchObject({ change: 10, sessions: 3 });
    expect(trendOf(points, 'lb')!.change).toBe(22);
  });

  it('is null with fewer than two sessions', () => {
    expect(trendOf([], 'kg')).toBeNull();
    expect(trendOf([point(at(2026, 9, 14), 40)], 'kg')).toBeNull();
  });

  it('keeps a quarter-plate change as it is, instead of rounding 1.25 to 1.3', () => {
    expect(trendOf([point(at(2026, 9, 14), 40), point(at(2026, 9, 21), 41.25)], 'kg')!.change).toBe(
      1.25,
    );
  });

  it('can be a fall or no change', () => {
    expect(trendOf([point(at(2026, 9, 14), 50), point(at(2026, 9, 21), 47.5)], 'kg')!.change).toBe(
      -2.5,
    );
    expect(trendOf([point(at(2026, 9, 14), 50), point(at(2026, 9, 21), 50)], 'kg')!.change).toBe(0);
  });
});

describe('trendText', () => {
  const trend = (change: number, since = at(2026, 9, 14)) => ({ change, sessions: 3, since });
  it('says the change with its unit and the start', () => {
    expect(trendText(trend(10), 'kg')).toBe('+10 Kg since 14 Sep');
    expect(trendText(trend(-2.5), 'lb')).toBe('-2.5 Lb since 14 Sep');
    expect(trendText(trend(0), 'kg')).toBe('Same weight since 14 Sep');
  });

  it('copes with a date it cannot read', () => {
    expect(trendText(trend(5, 'nope'), 'kg')).toBe('+5 Kg since the start');
  });
});

describe('weeklyBests and chartPoints', () => {
  // Two sessions a week: a heavy day and a light day, the light one last.
  const twice = [
    point(at(2026, 10, 5), 10), // Monday
    point(at(2026, 10, 8), 5), // Thursday
    point(at(2026, 10, 12), 10),
    point(at(2026, 10, 15), 5),
  ];

  it('keeps the heaviest set of each week, so a lighter day does not look like a fall', () => {
    const weekly = weeklyBests(twice, 'kg');
    expect(weekly.map((p) => p.totalKg)).toEqual([10, 10]);
    expect(trendOf(chartPoints(twice, 'kg'), 'kg')!.change).toBe(0);
    // Per session the same history ends 5 Kg lower than it began.
    expect(trendOf(twice, 'kg')!.change).toBe(-5);
  });

  it('breaks a tie in a week by reps, and keeps the weeks in order', () => {
    const a = { ...point(at(2026, 10, 6), 40), reps: 8 };
    const b = { ...point(at(2026, 10, 9), 40), reps: 10 };
    const earlier = point(at(2026, 9, 29), 35);
    expect(weeklyBests([a, b, earlier], 'kg')).toEqual([earlier, b]);
  });

  it('uses each session when the exercise was only trained in one week', () => {
    const sameWeek = [point(at(2026, 10, 12), 40), point(at(2026, 10, 14), 42.5)];
    expect(chartPoints(sameWeek, 'kg')).toEqual(sameWeek);
  });

  it('ignores a point with a bad date', () => {
    expect(weeklyBests([point('nope', 40)], 'kg')).toEqual([]);
  });
});
