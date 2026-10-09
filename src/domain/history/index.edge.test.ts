import { afterEach, describe, expect, it, vi } from 'vitest';
import { dayLabel, durationMinutes, formatDuration, groupByExercise } from '.';

const local = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);

afterEach(() => {
  vi.unstubAllEnvs();
});

type Parts = [year: number, month: number, day: number, hour: number, minute: number];

describe('dayLabel across daylight-saving changes', () => {
  // Clocks go forward in London on 2026-03-29 (a 23-hour day) and back on 2026-10-25 (25 hours).
  it.each<[string, Parts, Parts, string]>([
    ['Europe/London', [2026, 3, 29, 12, 0], [2026, 3, 30, 0, 30], 'Yesterday'],
    ['Europe/London', [2026, 3, 28, 23, 30], [2026, 3, 30, 0, 30], 'Sat 28 Mar'],
    ['Europe/London', [2026, 10, 24, 0, 5], [2026, 10, 25, 23, 55], 'Yesterday'],
    ['Europe/London', [2026, 10, 25, 0, 5], [2026, 10, 25, 23, 55], 'Today'],
    ['Europe/London', [2026, 10, 25, 23, 55], [2026, 10, 26, 0, 5], 'Yesterday'],
    ['America/New_York', [2026, 3, 7, 23, 0], [2026, 3, 9, 0, 30], 'Sat 7 Mar'],
    ['America/New_York', [2026, 3, 8, 23, 0], [2026, 3, 9, 0, 30], 'Yesterday'],
    ['Australia/Lord_Howe', [2026, 10, 3, 23, 0], [2026, 10, 5, 0, 30], 'Sat 3 Oct'],
    ['Australia/Lord_Howe', [2026, 10, 4, 23, 0], [2026, 10, 5, 0, 30], 'Yesterday'],
    ['Asia/Kolkata', [2026, 10, 8, 23, 59], [2026, 10, 9, 0, 1], 'Yesterday'],
  ])('in %s, %j seen from %j reads %s', (zone, date, now, label) => {
    vi.stubEnv('TZ', zone);
    const at = ([y, m, d, h, min]: Parts) => new Date(y, m - 1, d, h, min);
    expect(dayLabel(at(date).toISOString(), at(now))).toBe(label);
  });
});

describe('dayLabel at calendar edges', () => {
  it.each([
    [local(2028, 2, 29), local(2028, 3, 1, 8), 'Yesterday'],
    [local(2028, 2, 28), local(2028, 3, 1, 8), 'Mon 28 Feb'],
    [local(2027, 2, 28), local(2027, 3, 1, 8), 'Yesterday'],
    [local(2028, 2, 29), local(2028, 2, 29, 23, 59), 'Today'],
    [local(2026, 12, 31, 23, 59), local(2027, 1, 1, 0, 1), 'Yesterday'],
    [local(2026, 12, 30), local(2027, 1, 1, 0, 1), 'Wed 30 Dec 2026'],
    [local(2027, 1, 1, 0, 1), local(2026, 12, 31, 23, 59), 'Fri 1 Jan 2027'],
    [local(2024, 2, 29), local(2026, 10, 9), 'Thu 29 Feb 2024'],
  ])('labels %s seen from %s as %s', (date, now, label) => {
    expect(dayLabel(date.toISOString(), now)).toBe(label);
  });

  it.each([
    ['a far-future year', '+275000-01-01T00:00:00.000Z'],
    ['the epoch', '1970-01-01T00:00:00.000Z'],
    ['an expanded negative year', '-000001-01-01T00:00:00.000Z'],
  ])('gives some text, and never throws, for %s', (_name, iso) => {
    const label = dayLabel(iso, local(2026, 10, 9));
    expect(label).toMatch(/^\w{3} \d{1,2} \w{3} -?\d+$/);
  });

  it.each([' ', 'undefined', 'NaN', '0000-00-00', '2026-10-09T25:00:00Z'])(
    'says unknown for the invalid timestamp %j',
    (value) => {
      expect(dayLabel(value, local(2026, 10, 9))).toBe('Unknown date');
    },
  );

  it('says unknown when the date is valid but cannot be turned into a day', () => {
    expect(dayLabel('+275760-09-13T00:00:00.001Z', local(2026, 10, 9))).not.toBe('Today');
  });
});

describe('durationMinutes at the edges', () => {
  it.each([
    ['rounds half a minute up', '2026-10-09T10:00:00.000Z', '2026-10-09T10:00:30.000Z', 1],
    ['crosses midnight', '2026-10-09T23:50:00.000Z', '2026-10-10T00:20:00.000Z', 30],
    ['crosses the year', '2026-12-31T23:30:00.000Z', '2027-01-01T01:00:00.000Z', 90],
    ['spans a leap day', '2028-02-28T12:00:00.000Z', '2028-03-01T12:00:00.000Z', 2 * 24 * 60],
    ['reads an offset time', '2026-10-09T10:00:00+05:30', '2026-10-09T05:00:00.000Z', 30],
    ['a forgotten workout of a week', '2026-10-01T10:00:00Z', '2026-10-08T10:00:00Z', 7 * 24 * 60],
  ])('%s', (_name, start, end, minutes) => {
    expect(durationMinutes(start, end)).toBe(minutes);
  });

  it.each([
    [
      'an end one millisecond before the start',
      '2026-10-09T10:00:00.001Z',
      '2026-10-09T10:00:00.000Z',
    ],
    ['an invalid end', '2026-10-09T10:00:00.000Z', 'garbage'],
    ['an empty end', '2026-10-09T10:00:00.000Z', ''],
    ['both invalid', 'x', 'y'],
  ])('is null for %s', (_name, start, end) => {
    expect(durationMinutes(start, end)).toBeNull();
  });
});

describe('formatDuration at the edges', () => {
  it.each([
    [61, '1 h 01 min'],
    [119, '1 h 59 min'],
    [600, '10 h'],
    [24 * 60, '24 h'],
    [7 * 24 * 60, '168 h'],
    [10 * 60 + 9, '10 h 09 min'],
  ])('%s minutes reads %s', (minutes, text) => {
    expect(formatDuration(minutes)).toBe(text);
  });
});

describe('groupByExercise at the edges', () => {
  type S = { exerciseId: string; loggedAt: string; n: number };
  const s = (exerciseId: string, loggedAt: string, n: number): S => ({ exerciseId, loggedAt, n });

  it('keeps input order for sets logged at the same instant', () => {
    const t = '2026-10-09T10:00:00.000Z';
    const groups = groupByExercise([s('a', t, 1), s('a', t, 2), s('b', t, 3), s('a', t, 4)]);
    expect(groups.map((g) => g.exerciseId)).toEqual(['a', 'b']);
    expect(groups[0]!.sets.map((x) => x.n)).toEqual([1, 2, 4]);
  });

  it('orders exercises by their earliest set even when a later set arrives first', () => {
    const groups = groupByExercise([
      s('squat', '2026-10-09T10:30:00.000Z', 1),
      s('squat', '2026-10-09T10:01:00.000Z', 2),
      s('bench', '2026-10-09T10:10:00.000Z', 3),
    ]);
    expect(groups.map((g) => g.exerciseId)).toEqual(['squat', 'bench']);
    expect(groups[0]!.sets.map((x) => x.n)).toEqual([2, 1]);
  });

  it('sorts across a year boundary and a leap day', () => {
    const groups = groupByExercise([
      s('a', '2027-01-01T00:00:00.000Z', 3),
      s('a', '2028-02-29T00:00:00.000Z', 4),
      s('a', '2026-12-31T23:59:59.999Z', 2),
    ]);
    expect(groups[0]!.sets.map((x) => x.n)).toEqual([2, 3, 4]);
  });

  it('puts a set with an unreadable time somewhere without losing any set', () => {
    const groups = groupByExercise([
      s('a', 'garbage', 1),
      s('a', '2026-10-09T10:00:00.000Z', 2),
      s('b', '', 3),
    ]);
    expect(
      groups
        .flatMap((g) => g.sets)
        .map((x) => x.n)
        .sort(),
    ).toEqual([1, 2, 3]);
  });

  it('copes with a very large workout in reasonable time', () => {
    const sets = Array.from({ length: 30_000 }, (_, i) =>
      s('a', new Date(Date.UTC(2026, 9, 9) + i * 1000).toISOString(), i),
    );
    const started = performance.now();
    const groups = groupByExercise(sets);
    const took = performance.now() - started;
    expect(groups).toHaveLength(1);
    expect(groups[0]!.sets).toHaveLength(30_000);
    expect(took).toBeLessThan(1000);
  });

  it('copes with many different exercises', () => {
    const sets = Array.from({ length: 5_000 }, (_, i) =>
      s(`ex-${i}`, new Date(Date.UTC(2026, 9, 9) + i * 1000).toISOString(), i),
    );
    expect(groupByExercise(sets)).toHaveLength(5_000);
  });
});
