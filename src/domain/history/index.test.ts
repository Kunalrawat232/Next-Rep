import { describe, expect, it } from 'vitest';
import { dayLabel, durationMinutes, formatDuration, groupByExercise, topSet } from '.';

// Dates are built in local time, so the tests do not depend on the machine's time zone.
const local = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);
const NOW = local(2026, 10, 9, 15);

describe('dayLabel', () => {
  it.each([
    [local(2026, 10, 9, 0, 1), 'Today'],
    [local(2026, 10, 9, 23, 59), 'Today'],
    [local(2026, 10, 8, 23, 59), 'Yesterday'],
    [local(2026, 10, 8, 0, 0), 'Yesterday'],
    [local(2026, 10, 7, 23, 59), 'Wed 7 Oct'],
    [local(2026, 1, 1), 'Thu 1 Jan'],
    [local(2025, 12, 31), 'Wed 31 Dec 2025'],
    [local(2026, 10, 10), 'Sat 10 Oct'],
  ])('labels %s as %s', (date, label) => {
    expect(dayLabel(date.toISOString(), NOW)).toBe(label);
  });

  it('counts calendar days, not 24-hour spans, across midnight', () => {
    expect(dayLabel(local(2026, 10, 8, 23, 50).toISOString(), local(2026, 10, 9, 0, 10))).toBe(
      'Yesterday',
    );
  });

  it.each(['', 'not a date', '2026-13-45'])('says unknown for %j', (value) => {
    expect(dayLabel(value, NOW)).toBe('Unknown date');
  });
});

describe('durationMinutes', () => {
  it.each([
    ['2026-10-09T10:00:00.000Z', '2026-10-09T10:45:00.000Z', 45],
    ['2026-10-09T10:00:00.000Z', '2026-10-09T10:00:29.000Z', 0],
    ['2026-10-09T10:00:00.000Z', '2026-10-09T10:00:30.000Z', 1],
    ['2026-10-09T10:00:00.000Z', '2026-10-09T12:05:00.000Z', 125],
    ['2026-10-09T10:00:00.000Z', '2026-10-09T10:00:00.000Z', 0],
  ])('%s to %s is %s min', (start, end, minutes) => {
    expect(durationMinutes(start, end)).toBe(minutes);
  });

  it('is null for an open workout, an end before the start, or a bad date', () => {
    expect(durationMinutes('2026-10-09T10:00:00.000Z', null)).toBeNull();
    expect(durationMinutes('2026-10-09T10:00:00.000Z', '2026-10-09T09:00:00.000Z')).toBeNull();
    expect(durationMinutes('nope', '2026-10-09T09:00:00.000Z')).toBeNull();
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0 min'],
    [45, '45 min'],
    [59, '59 min'],
    [60, '1 h'],
    [65, '1 h 05 min'],
    [125, '2 h 05 min'],
    [180, '3 h'],
  ])('%s minutes reads %s', (minutes, text) => {
    expect(formatDuration(minutes)).toBe(text);
  });
});

describe('groupByExercise', () => {
  const set = (exerciseId: string, loggedAt: string) => ({ exerciseId, loggedAt });

  it('groups by exercise in the order each was first done, sets by time', () => {
    const sets = [
      set('squat', '2026-10-09T10:20:00Z'),
      set('bench', '2026-10-09T10:00:00Z'),
      set('squat', '2026-10-09T10:05:00Z'),
      set('bench', '2026-10-09T10:10:00Z'),
    ];
    const groups = groupByExercise(sets);
    expect(groups.map((g) => g.exerciseId)).toEqual(['bench', 'squat']);
    expect(groups[0]!.sets.map((s) => s.loggedAt)).toEqual([
      '2026-10-09T10:00:00Z',
      '2026-10-09T10:10:00Z',
    ]);
    expect(groups[1]!.sets.map((s) => s.loggedAt)).toEqual([
      '2026-10-09T10:05:00Z',
      '2026-10-09T10:20:00Z',
    ]);
  });

  it('is empty for no sets, and does not change its input', () => {
    expect(groupByExercise([])).toEqual([]);
    const input = [set('b', '2026-10-09T10:10:00Z'), set('a', '2026-10-09T10:00:00Z')];
    const copy = [...input];
    groupByExercise(input);
    expect(input).toEqual(copy);
  });
});

describe('topSet', () => {
  it('finds the heaviest set and counts the sets at that weight', () => {
    const sets = [{ totalKg: 50 }, { totalKg: 60 }, { totalKg: 60 }, { totalKg: 55 }];
    expect(topSet(sets)).toEqual({ top: sets[1], count: 2 });
  });

  it('compares in hundredths, so 60 and 60.001 are the same weight', () => {
    expect(topSet([{ totalKg: 60 }, { totalKg: 60.001 }])?.count).toBe(2);
  });

  it('has no top set for no sets', () => {
    expect(topSet([])).toBeNull();
  });
});
