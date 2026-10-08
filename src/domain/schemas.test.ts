import { describe, expect, it } from 'vitest';
import { SetSchema, WorkoutSchema } from './schemas';

const ids = {
  id: '11111111-1111-4111-8111-111111111111',
  workoutId: '22222222-2222-4222-8222-222222222222',
  exerciseId: '33333333-3333-4333-8333-333333333333',
};
const validSet = {
  ...ids,
  totalKg: 60,
  barKg: 15,
  perSideKg: 22.5,
  inputMode: 'per_side',
  reps: 8,
  source: 'voice',
  rawTranscript: 'bench sixty',
  loggedAt: '2026-10-08T10:00:00Z',
};

describe('SetSchema', () => {
  it('accepts a consistent per-side set', () => {
    expect(SetSchema.safeParse(validSet).success).toBe(true);
  });

  it('accepts a tap set without a bar breakdown', () => {
    const tap = {
      ...validSet,
      totalKg: 62.5,
      barKg: null,
      perSideKg: null,
      inputMode: 'tap',
      source: 'tap',
      rawTranscript: null,
    };
    expect(SetSchema.safeParse(tap).success).toBe(true);
  });

  it.each([
    { name: 'reps 0', patch: { reps: 0 } },
    { name: 'reps 101', patch: { reps: 101 } },
    {
      name: 'total 501 kg',
      patch: { totalKg: 501, barKg: null, perSideKg: null, inputMode: 'total' },
    },
    {
      name: 'negative total',
      patch: { totalKg: -1, barKg: null, perSideKg: null, inputMode: 'total' },
    },
    { name: 'total inconsistent with bar + 2 x per side', patch: { totalKg: 61 } },
    { name: 'per_side mode without a bar', patch: { barKg: null } },
    { name: 'per_side mode without per-side weight', patch: { perSideKg: null } },
    { name: 'non-uuid id', patch: { id: 'not-a-uuid' } },
    { name: 'bad timestamp', patch: { loggedAt: 'yesterday' } },
    { name: 'transcript over 500 chars', patch: { rawTranscript: 'x'.repeat(501) } },
  ])('rejects $name', ({ patch }) => {
    expect(SetSchema.safeParse({ ...validSet, ...patch }).success).toBe(false);
  });
});

describe('WorkoutSchema', () => {
  const workout = {
    id: ids.id,
    gymId: null,
    startedAt: '2026-10-08T10:00:00Z',
    endedAt: null,
    notes: null,
  };

  it('accepts an in-progress workout', () => {
    expect(WorkoutSchema.safeParse(workout).success).toBe(true);
  });

  it('rejects a workout that ends before it starts', () => {
    expect(WorkoutSchema.safeParse({ ...workout, endedAt: '2026-10-08T09:00:00Z' }).success).toBe(
      false,
    );
  });
});
