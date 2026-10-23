// QA pass: week boundaries, year ends, daylight saving, ties, unit rounding and odd dates for the progress maths.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SessionBest } from '../records';
import { chartPoints, trendOf, trendText, workoutsPerWeek } from '.';

const local = (y: number, m: number, d: number, h = 12, min = 0) =>
  new Date(y, m - 1, d, h, min).toISOString();
const set = (workoutId: string, loggedAt: string) => ({ workoutId, loggedAt });
const best = (at: string, totalKg: number, reps = 8, id = at): SessionBest => ({
  workoutId: id,
  setId: id,
  at,
  totalKg,
  reps,
});

/** Runs a block under another time zone, then puts the original back. Node reads TZ again when it changes. */
function inZone(zone: string, body: () => void) {
  describe(`in ${zone}`, () => {
    beforeAll(() => {
      vi.stubEnv('TZ', zone);
    });
    afterAll(() => {
      vi.unstubAllEnvs();
    });
    it('is really running in that zone', () => {
      // Guards the DST tests below: if TZ were ignored they would pass in any zone for the wrong reason.
      expect(new Date(2026, 6, 1).getTimezoneOffset()).not.toBe(
        new Date(2026, 0, 1).getTimezoneOffset(),
      );
    });
    body();
  });
}

describe('workoutsPerWeek at week and year edges', () => {
  it.each([
    // [first set, now, expected week start of that set]
    ['Sunday 23:59 belongs to the week that began on Monday', [2026, 10, 18, 23, 59], '2026-10-12'],
    ['Monday 00:00 starts a new week', [2026, 10, 19, 0, 0], '2026-10-19'],
    ['Monday 00:01 is that Monday', [2026, 10, 19, 0, 1], '2026-10-19'],
    ['a week crossing the new year starts in December', [2026, 1, 2, 10, 0], '2025-12-29'],
    ['1 Jan 2026 (Thursday) is in the week of 29 Dec', [2026, 1, 1, 0, 0], '2025-12-29'],
    ['a leap day is placed in its Monday week', [2028, 2, 29, 12, 0], '2028-02-28'],
  ] as const)('%s', (_name, [y, m, d, h, min], start) => {
    const now = new Date(y, m - 1, d + 1, 9);
    const weeks = workoutsPerWeek([set('a', local(y, m, d, h, min))], now);
    expect(weeks[0]).toMatchObject({ start, workouts: 1 });
    expect(weeks.filter((w) => w.workouts > 0)).toHaveLength(1);
  });

  it('labels weeks across a year boundary with the December date, and lists them in order', () => {
    const now = new Date(2026, 0, 14, 9); // Wednesday
    const weeks = workoutsPerWeek([set('a', local(2025, 12, 16))], now);
    expect(weeks.map((w) => w.start)).toEqual([
      '2025-12-15',
      '2025-12-22',
      '2025-12-29',
      '2026-01-05',
      '2026-01-12',
    ]);
    expect(weeks.map((w) => w.label)).toEqual(['15 Dec', '22 Dec', '29 Dec', '5 Jan', '12 Jan']);
  });

  it('counts a workout that runs past midnight on Sunday in the week of its first set', () => {
    const weeks = workoutsPerWeek(
      [set('late', local(2026, 10, 18, 23, 50)), set('late', local(2026, 10, 19, 0, 20))],
      new Date(2026, 9, 19, 9),
    );
    expect(weeks.map((w) => [w.start, w.workouts])).toEqual([
      ['2026-10-12', 1],
      ['2026-10-19', 0],
    ]);
  });

  it('uses the earliest set of a workout even when sets arrive out of order', () => {
    const weeks = workoutsPerWeek(
      [set('w', local(2026, 10, 20)), set('w', local(2026, 10, 14))],
      new Date(2026, 9, 25, 9),
    );
    expect(weeks.map((w) => [w.start, w.workouts])).toEqual([
      ['2026-10-12', 1],
      ['2026-10-19', 0],
    ]);
  });

  it('keeps sets with identical times in different workouts as separate workouts', () => {
    const when = local(2026, 10, 14);
    const weeks = workoutsPerWeek(
      [set('a', when), set('b', when), set('b', when)],
      new Date(2026, 9, 14, 20),
    );
    expect(weeks).toEqual([{ start: '2026-10-12', label: '12 Oct', workouts: 2 }]);
  });

  it('does not count a workout that starts after now (clock set back, or a bad import)', () => {
    const now = new Date(2026, 9, 14, 9);
    expect(workoutsPerWeek([set('future', local(2026, 11, 20))], now)).toEqual([]);
  });

  it('puts a workout exactly 8 weeks back out of range and 7 weeks back at the start', () => {
    const now = new Date(2026, 9, 19, 9); // Monday
    expect(workoutsPerWeek([set('a', local(2026, 8, 24))], now)).toEqual([]); // 8 weeks back
    const weeks = workoutsPerWeek([set('a', local(2026, 8, 31))], now); // 7 weeks back
    expect(weeks).toHaveLength(8);
    expect(weeks[0]).toMatchObject({ start: '2026-08-31', workouts: 1 });
  });

  it.each(['', 'NaN', '2026-13-45', 'yesterday', '0000-00-00T99:99'])(
    'ignores the unreadable time %j without dropping a good workout',
    (bad) => {
      const weeks = workoutsPerWeek(
        [set('bad', bad), set('good', local(2026, 10, 14))],
        new Date(2026, 9, 14, 20),
      );
      expect(weeks).toEqual([{ start: '2026-10-12', label: '12 Oct', workouts: 1 }]);
    },
  );

  it('handles an invalid "now" by showing nothing instead of throwing', () => {
    expect(() =>
      workoutsPerWeek([set('a', local(2026, 10, 14))], new Date(Number.NaN)),
    ).not.toThrow();
  });

  it('does not change its input', () => {
    const sets = [set('b', local(2026, 10, 14)), set('a', local(2026, 10, 13))];
    const copy = structuredClone(sets);
    workoutsPerWeek(sets, new Date(2026, 9, 19));
    expect(sets).toEqual(copy);
  });

  it('copes with thousands of sets quickly', () => {
    const sets = Array.from({ length: 50_000 }, (_, i) =>
      set(`w${i % 500}`, local(2026, 10, 12 + (i % 7))),
    );
    const started = Date.now();
    const weeks = workoutsPerWeek(sets, new Date(2026, 9, 19));
    expect(weeks[0]!.workouts).toBe(500);
    expect(Date.now() - started).toBeLessThan(1500);
  });
});

// Weeks are built with calendar-day arithmetic, so a 23 or 25 hour day must not shift or duplicate a week.
for (const zone of ['Europe/London', 'America/New_York', 'Australia/Sydney']) {
  inZone(zone, () => {
    it('keeps eight distinct Mondays across every daylight-saving change of the year', () => {
      for (const month of [0, 2, 3, 9, 10]) {
        for (const day of [1, 8, 15, 22, 29]) {
          const now = new Date(2026, month, day, 12);
          const weeks = workoutsPerWeek(
            [set('a', new Date(2026, month, day - 49).toISOString())],
            now,
          );
          const starts = weeks.map((w) => w.start);
          expect(new Set(starts).size).toBe(starts.length);
          for (const start of starts) {
            const [y, m, d] = start.split('-').map(Number) as [number, number, number];
            expect(new Date(y, m - 1, d).getDay()).toBe(1);
          }
          for (let i = 1; i < starts.length; i++) {
            const [y0, m0, d0] = starts[i - 1]!.split('-').map(Number) as [number, number, number];
            const [y1, m1, d1] = starts[i]!.split('-').map(Number) as [number, number, number];
            expect(new Date(y1, m1 - 1, d1 - 7).getTime()).toBe(new Date(y0, m0 - 1, d0).getTime());
          }
        }
      }
    });

    it('counts a set logged just after local midnight on the day clocks change in its own week', () => {
      // A Sunday and the following Monday morning around the last Sunday of March and October.
      for (const [y, m, d] of [
        [2026, 3, 29],
        [2026, 10, 25],
        [2026, 3, 8],
        [2026, 11, 1],
        [2026, 4, 5],
        [2026, 10, 4],
      ] as const) {
        const sunday = new Date(y, m - 1, d, 12);
        if (sunday.getDay() !== 0) continue;
        const sets = [set('sun', local(y, m, d, 0, 30)), set('mon', local(y, m, d + 1, 0, 30))];
        const weeks = workoutsPerWeek(sets, new Date(y, m - 1, d + 3, 9));
        expect(weeks.map((w) => w.workouts)).toEqual([1, 1]);
      }
    });
  });
}

describe('chartPoints edge cases', () => {
  it('is empty for no points, and a single point stays as it is', () => {
    expect(chartPoints([], 'kg')).toEqual([]);
    const one = [best(local(2026, 10, 14), 60)];
    expect(chartPoints(one, 'kg')).toEqual(one);
  });

  it('treats 31 Dec and 2 Jan as one week but 31 Dec and 5 Jan as two', () => {
    // Wed 31 Dec and Fri 2 Jan are the same week: one week, so each session is drawn.
    const sameWeek = [best(local(2025, 12, 31), 50), best(local(2026, 1, 2), 55)];
    expect(chartPoints(sameWeek, 'kg')).toEqual(sameWeek);
    // Wed 31 Dec and Mon 5 Jan are two weeks: the weekly best of each.
    const twoWeeks = [best(local(2025, 12, 31), 50), best(local(2026, 1, 5), 45)];
    expect(chartPoints(twoWeeks, 'kg')).toEqual(twoWeeks);
  });

  it('keeps the first of two sets with the same weight, reps and time', () => {
    const when = local(2026, 10, 14);
    const first = best(when, 60, 8, 'first');
    const second = best(when, 60, 8, 'second');
    const earlier = best(local(2026, 10, 6), 50);
    expect(chartPoints([earlier, first, second], 'kg')).toEqual([earlier, first]);
  });

  it('compares a week in the shown unit: 60 Kg and 60.01 Kg are the same 132.3 Lb, so reps decide', () => {
    const earlier = best(local(2026, 10, 6), 50);
    const a = best(local(2026, 10, 13), 60, 5, 'a');
    const b = best(local(2026, 10, 14), 60.01, 3, 'b');
    expect(chartPoints([earlier, a, b], 'lb')[1]).toBe(a);
    expect(chartPoints([earlier, a, b], 'kg')[1]).toBe(b);
  });

  it('does not depend on the order the points arrive in', () => {
    const points = [
      best(local(2026, 10, 14), 62.5),
      best(local(2026, 10, 6), 50),
      best(local(2026, 10, 8), 55),
      best(local(2026, 10, 21), 65),
    ];
    const forward = chartPoints(points, 'kg').map((p) => p.totalKg);
    const backward = chartPoints([...points].reverse(), 'kg').map((p) => p.totalKg);
    expect(forward).toEqual([55, 62.5, 65]);
    expect(backward).toEqual(forward);
  });

  it('skips points with an unreadable time when drawing weeks, and never returns them among weekly points', () => {
    const a = best(local(2026, 10, 6), 50);
    const b = best(local(2026, 10, 14), 55);
    const junk = best('not a date', 99);
    const drawn = chartPoints([a, junk, b], 'kg');
    expect(drawn).toEqual([a, b]);
  });

  it('does not change its input', () => {
    const points = [best(local(2026, 10, 14), 55), best(local(2026, 10, 6), 50)];
    const copy = structuredClone(points);
    chartPoints(points, 'kg');
    expect(points).toEqual(copy);
  });
});

describe('trendOf and trendText in lb and with odd values', () => {
  it.each([
    // [first kg, last kg, change shown in lb]
    [40, 41.25, 2.7], // 88.2 -> 90.9
    [100, 101.25, 2.7], // 220.5 -> 223.2: the shown weights differ by 2.7
    [60, 60, 0],
    [60, 60.01, 0], // both show as 132.3 Lb
    [45.36, 40.82, -10], // 100 Lb to 90 Lb as typed
  ])('%s Kg to %s Kg is %s Lb as shown', (first, last, change) => {
    const result = trendOf([best(local(2026, 9, 14), first), best(local(2026, 9, 21), last)], 'lb');
    expect(result!.change).toBe(change);
  });

  it('is exactly the difference of the two numbers on the screen, never a rounded raw difference', () => {
    // 20 Kg is 44.1 Lb and 21.25 Kg is 46.9 Lb: 2.8 on screen, while the raw difference rounds to 2.8 too; 22.5 -> 49.6 gives 5.5.
    const result = trendOf([best(local(2026, 9, 14), 20), best(local(2026, 9, 21), 22.5)], 'lb');
    expect(result!.change).toBe(Math.round((49.6 - 44.1) * 10) / 10);
  });

  it('is not -0 for no change, and says "Same weight"', () => {
    const result = trendOf([best(local(2026, 9, 14), 50.001), best(local(2026, 9, 21), 50)], 'kg')!;
    expect(Object.is(result.change, -0)).toBe(false);
    expect(trendText(result, 'kg')).toBe(`Same weight since 14 Sep`);
  });

  it('uses the first and last points as given, not the heaviest or the earliest', () => {
    const result = trendOf(
      [best(local(2026, 9, 14), 50), best(local(2026, 9, 21), 90), best(local(2026, 9, 28), 55)],
      'kg',
    )!;
    expect(result).toMatchObject({ change: 5, sessions: 3, since: local(2026, 9, 14) });
  });

  it('shows 2-decimal changes without trailing zeros, and the right unit and sign', () => {
    expect(trendText({ change: 1.25, sessions: 2, since: local(2026, 9, 14) }, 'kg')).toBe(
      '+1.25 Kg since 14 Sep',
    );
    expect(trendText({ change: -0.5, sessions: 2, since: local(2026, 1, 1) }, 'lb')).toBe(
      '-0.5 Lb since 1 Jan',
    );
    expect(trendText({ change: 10, sessions: 2, since: local(2025, 12, 31) }, 'kg')).toBe(
      '+10 Kg since 31 Dec',
    );
  });

  it('copes with a single point, an empty list and a bad start date', () => {
    expect(trendOf([best(local(2026, 9, 14), 50)], 'lb')).toBeNull();
    expect(trendOf([], 'lb')).toBeNull();
    const result = trendOf([best('garbage', 50), best(local(2026, 9, 21), 55)], 'kg')!;
    expect(trendText(result, 'kg')).toBe('+5 Kg since the start');
  });
});
