import { describe, expect, it } from 'vitest';
import { SetSchema, WorkoutSchema } from './schemas';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const set = (over: Record<string, unknown> = {}) => ({
  id: id(1),
  workoutId: id(2),
  exerciseId: id(3),
  totalKg: 60,
  barKg: 20,
  perSideKg: 20,
  inputMode: 'per_side',
  reps: 8,
  source: 'tap',
  rawTranscript: null,
  loggedAt: '2026-10-10T10:00:00.000Z',
  ...over,
});
const workout = (over: Record<string, unknown> = {}) => ({
  id: id(2),
  gymId: null,
  startedAt: '2026-10-10T10:00:00.000Z',
  endedAt: null,
  notes: null,
  ...over,
});

describe('timestamps', () => {
  const times: [string, boolean][] = [
    ['2026-10-10T10:00:00.000Z', true],
    ['2026-10-10T10:00:00Z', true], // no milliseconds
    ['2026-10-10T10:00:00+00:00', true], // Postgres style
    ['2026-10-10T10:00:00.123456+00:00', true], // microseconds
    ['2026-10-10T15:30:00+05:30', true],
    ['2026-10-10T10:00:00', false], // no zone
    ['2026-10-10 10:00:00+00:00', false], // space instead of T
    ['2026-10-10', false],
    ['', false],
    ['not a date', false],
    ['2026-13-10T10:00:00Z', false],
    ['2026-02-30T10:00:00Z', false],
    ['2026-10-10T25:00:00Z', false],
    ['2026-10-10T24:00:00.000Z', false],
  ];
  it.each(times)('loggedAt %j is accepted: %s', (loggedAt, ok) => {
    expect(SetSchema.safeParse(set({ loggedAt })).success).toBe(ok);
  });
});

describe('set numbers', () => {
  const rows: [string, Record<string, unknown>, boolean][] = [
    ['reps 1', { reps: 1 }, true],
    ['reps 100', { reps: 100 }, true],
    ['reps 0', { reps: 0 }, false],
    ['reps 101', { reps: 101 }, false],
    ['reps 8.5', { reps: 8.5 }, false],
    ['reps as string', { reps: '8' }, false],
    ['reps NaN', { reps: NaN }, false],
    [
      'total 0 with no breakdown',
      { totalKg: 0, barKg: null, perSideKg: null, inputMode: 'tap' },
      true,
    ],
    [
      'total 500 with no breakdown',
      { totalKg: 500, barKg: null, perSideKg: null, inputMode: 'total' },
      true,
    ],
    ['total 500.01', { totalKg: 500.01, barKg: null, perSideKg: null, inputMode: 'total' }, false],
    ['total -0.01', { totalKg: -0.01, barKg: null, perSideKg: null, inputMode: 'total' }, false],
    [
      'total Infinity',
      { totalKg: Infinity, barKg: null, perSideKg: null, inputMode: 'total' },
      false,
    ],
    ['total as string', { totalKg: '60' }, false],
    ['bar 100 per side 200 total 500', { totalKg: 500, barKg: 100, perSideKg: 200 }, true],
    ['bar 100.01', { totalKg: 120.01, barKg: 100.01, perSideKg: 10 }, false],
    ['per side 250 on 0 bar', { totalKg: 500, barKg: 0, perSideKg: 250 }, true],
    ['per side 250.01', { totalKg: 500, barKg: 0, perSideKg: 250.01 }, false],
    ['total disagrees with bar + 2 x side', { totalKg: 61 }, false],
    [
      'total off by float noise only',
      { totalKg: 22.5 + 0.1 + 0.2 - 0.3, barKg: 0, perSideKg: 11.25 },
      true,
    ],
    ['per_side mode without bar', { barKg: null }, false],
    ['per_side mode without per side', { perSideKg: null }, false],
    ['total mode with bar and no per side', { inputMode: 'total', perSideKg: null }, true],
    ['unknown input mode', { inputMode: 'half' }, false],
    ['unknown source', { source: 'whisper' }, false],
    ['source gemini', { source: 'gemini' }, true],
    ['transcript 500 chars', { rawTranscript: 'a'.repeat(500) }, true],
    ['transcript 501 chars', { rawTranscript: 'a'.repeat(501) }, false],
    ['transcript hinglish', { rawTranscript: 'bench sattar kilo aath reps' }, true],
    ['id not a uuid', { id: 'abc' }, false],
    ['workoutId missing', { workoutId: undefined }, false],
  ];
  it.each(rows)('%s -> accepted: %s', (_l, over, ok) => {
    expect(SetSchema.safeParse(set(over)).success).toBe(ok);
  });

  it('does not let a server-only field such as deletedAt through into parsed data', () => {
    const parsed = SetSchema.parse(set({ deletedAt: '2026-10-10T10:00:00Z' }));
    expect('deletedAt' in parsed).toBe(false);
  });
});

describe('workouts', () => {
  const rows: [string, Record<string, unknown>, boolean][] = [
    ['open workout', {}, true],
    ['ended same instant', { endedAt: '2026-10-10T10:00:00.000Z' }, true],
    ['ended one ms before start', { endedAt: '2026-10-10T09:59:59.999Z' }, false],
    [
      'ended before start across offsets',
      { startedAt: '2026-10-10T10:00:00+00:00', endedAt: '2026-10-10T10:00:00+05:30' },
      false,
    ],
    [
      'ended after start across offsets',
      { startedAt: '2026-10-10T10:00:00+05:30', endedAt: '2026-10-10T10:00:00+00:00' },
      true,
    ],
    ['gym id not a uuid', { gymId: 'home' }, false],
    ['notes 1000', { notes: 'x'.repeat(1000) }, true],
    ['notes 1001', { notes: 'x'.repeat(1001) }, false],
    ['notes emoji and devanagari', { notes: 'अच्छा दिन 💪' }, true],
    ['undefined gymId', { gymId: undefined }, false],
  ];
  it.each(rows)('%s -> accepted: %s', (_l, over, ok) => {
    expect(WorkoutSchema.safeParse(workout(over)).success).toBe(ok);
  });
});
