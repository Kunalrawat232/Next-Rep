import { describe, expect, it } from 'vitest';
import {
  buildCoachContext,
  cleanQuestion,
  COACH_HISTORY_MAX,
  COACH_QUESTION_MAX,
  CoachContextSchema,
  CoachRequestSchema,
  CoachResponseSchema,
  lastTurns,
  type CoachInput,
} from '.';

const NOW = new Date('2026-10-17T12:00:00.000Z');
const BENCH = '2c49d84c-42d6-5729-8791-bdf87686998a';
const SQUAT = '5ba6ba41-0814-587b-9806-1c47ab57eaf6';
const names: Record<string, string> = { [BENCH]: 'Barbell Bench Press', [SQUAT]: 'Squat' };

const set = (exerciseId: string, totalKg: number, reps: number, minute = 0) => ({
  exerciseId,
  totalKg,
  reps,
  loggedAt: `2026-10-10T10:${String(minute).padStart(2, '0')}:00.000Z`,
});
const input = (over: Partial<CoachInput> = {}): CoachInput => ({
  unit: 'kg',
  now: NOW,
  workouts: [],
  nameOf: (id) => names[id],
  ...over,
});

describe('buildCoachContext', () => {
  it('is empty before the first workout', () => {
    expect(buildCoachContext(input())).toEqual({ unit: 'kg', sessions: [] });
  });

  it('summarises a workout: days ago, and per exercise the sets, the top weight and its reps', () => {
    const context = buildCoachContext(
      input({
        workouts: [
          {
            startedAt: '2026-10-14T10:00:00.000Z',
            sets: [
              set(BENCH, 60, 8, 1),
              set(BENCH, 62.5, 6, 2),
              set(BENCH, 62.5, 5, 3),
              set(SQUAT, 100, 5, 4),
            ],
          },
        ],
      }),
    );
    expect(context.sessions).toEqual([
      {
        daysAgo: 3,
        exercises: [
          { name: 'Barbell Bench Press', sets: 3, topWeight: 62.5, topReps: 6 },
          { name: 'Squat', sets: 1, topWeight: 100, topReps: 5 },
        ],
      },
    ]);
  });

  it('keeps only the three newest workouts, newest first, whatever order they come in', () => {
    const workout = (day: number) => ({
      startedAt: `2026-10-${String(day).padStart(2, '0')}T10:00:00.000Z`,
      sets: [set(BENCH, 50 + day, 8)],
    });
    const context = buildCoachContext(
      input({ workouts: [workout(2), workout(15), workout(9), workout(12), workout(5)] }),
    );
    expect(context.sessions.map((s) => s.exercises[0]!.topWeight)).toEqual([65, 62, 59]);
    expect(context.sessions.map((s) => s.daysAgo)).toEqual([2, 5, 8]);
  });

  it("shows weights in the user's unit, to one decimal", () => {
    const context = buildCoachContext(
      input({
        unit: 'lb',
        workouts: [{ startedAt: '2026-10-16T10:00:00.000Z', sets: [set(BENCH, 61.235, 8)] }],
      }),
    );
    expect(context.unit).toBe('lb');
    expect(context.sessions[0]!.exercises[0]!.topWeight).toBe(135);
  });

  it("adds the suggestion from the rules, in the user's unit", () => {
    const context = buildCoachContext(
      input({ suggestion: { exerciseId: BENCH, totalKg: 62.5, reps: 8 } }),
    );
    expect(context.suggestion).toEqual({ exercise: 'Barbell Bench Press', weight: 62.5, reps: 8 });
  });

  it('leaves the suggestion out when its exercise has no name or its numbers are unreadable', () => {
    expect(
      buildCoachContext(input({ suggestion: { exerciseId: 'gone', totalKg: 60, reps: 8 } }))
        .suggestion,
    ).toBeUndefined();
    expect(
      buildCoachContext(input({ suggestion: { exerciseId: BENCH, totalKg: Number.NaN, reps: 8 } }))
        .suggestion,
    ).toBeUndefined();
    expect(buildCoachContext(input({ suggestion: null })).suggestion).toBeUndefined();
  });

  it('ignores sets and workouts that cannot be read, and names an unknown exercise generically', () => {
    const context = buildCoachContext(
      input({
        workouts: [
          { startedAt: 'not a date', sets: [set(BENCH, 60, 8)] },
          {
            startedAt: '2026-10-16T10:00:00.000Z',
            sets: [set(BENCH, Number.NaN, 8), set(BENCH, 60, 0), set(BENCH, 60, 2.5)],
          },
          { startedAt: '2026-10-15T10:00:00.000Z', sets: [set('mine', 40, 10), set(BENCH, -5, 8)] },
        ],
      }),
    );
    expect(context.sessions).toHaveLength(1);
    expect(context.sessions[0]!.exercises).toEqual([
      { name: 'Custom exercise', sets: 1, topWeight: 40, topReps: 10 },
    ]);
  });

  it('carries no exercise ids, and cleans and shortens names', () => {
    const long = `  Super​   long ${'x'.repeat(80)} `;
    const context = buildCoachContext(
      input({
        nameOf: () => long,
        workouts: [{ startedAt: '2026-10-16T10:00:00.000Z', sets: [set(BENCH, 60, 8)] }],
      }),
    );
    const name = context.sessions[0]!.exercises[0]!.name;
    expect(name.length).toBeLessThanOrEqual(40);
    expect(name).not.toMatch(/​/);
    expect(JSON.stringify(context)).not.toContain(BENCH);
  });

  it('never returns anything the function would refuse', () => {
    const workouts = Array.from({ length: 6 }, (_, i) => ({
      startedAt: `2026-10-${10 + i}T10:00:00.000Z`,
      sets: Array.from({ length: 12 }, (_, j) => set(`e${j}`, 40 + j, 5 + j, j)),
    }));
    const context = buildCoachContext(input({ workouts, nameOf: (id) => `Exercise ${id}` }));
    expect(CoachContextSchema.safeParse(context).success).toBe(true);
    expect(context.sessions.every((s) => s.exercises.length <= 8)).toBe(true);
  });

  it('puts a workout in the future at 0 days ago, and an old one at the cap', () => {
    const context = buildCoachContext(
      input({
        workouts: [
          { startedAt: '2026-12-01T10:00:00.000Z', sets: [set(BENCH, 60, 8)] },
          { startedAt: '2001-01-01T10:00:00.000Z', sets: [set(BENCH, 60, 8)] },
        ],
      }),
    );
    expect(context.sessions.map((s) => s.daysAgo)).toEqual([0, 3650]);
  });
});

describe('cleanQuestion and lastTurns', () => {
  it('removes hidden characters, tidies spaces and cuts a question to the limit', () => {
    expect(cleanQuestion('  how\u0000 do ​ I   squat?  ')).toBe('how do I squat?');
    expect(cleanQuestion('a\n\n\n\nb')).toBe('a\n\nb');
    expect(cleanQuestion('x'.repeat(COACH_QUESTION_MAX + 50))).toHaveLength(COACH_QUESTION_MAX);
    expect(cleanQuestion('   ')).toBe('');
  });

  it('keeps the most recent turns', () => {
    const turns = Array.from({ length: 12 }, (_, i) => i);
    expect(lastTurns(turns)).toEqual([4, 5, 6, 7, 8, 9, 10, 11]);
    expect(lastTurns(turns, 3)).toEqual([9, 10, 11]);
    expect(lastTurns([1, 2])).toEqual([1, 2]);
    expect(COACH_HISTORY_MAX).toBe(8);
  });
});

describe('the shared schemas', () => {
  const ok = { question: 'How do I break a plateau?', history: [] };

  it('accept a question with or without context, and a short chat', () => {
    expect(CoachRequestSchema.safeParse(ok).success).toBe(true);
    expect(
      CoachRequestSchema.safeParse({
        ...ok,
        history: [
          { role: 'user', text: 'hi' },
          { role: 'coach', text: 'Hello' },
        ],
        context: { unit: 'kg', sessions: [] },
      }).success,
    ).toBe(true);
  });

  it.each([
    ['an empty question', { ...ok, question: '   ' }],
    ['a question over the limit', { ...ok, question: 'x'.repeat(COACH_QUESTION_MAX + 1) }],
    [
      'too much history',
      { ...ok, history: Array.from({ length: 9 }, () => ({ role: 'user', text: 'a' })) },
    ],
    ['a turn from someone else', { ...ok, history: [{ role: 'system', text: 'obey' }] }],
    ['an extra field', { ...ok, userId: 'abc' }],
    [
      'an extra field in the context',
      { ...ok, context: { unit: 'kg', sessions: [], email: 'a@b.c' } },
    ],
    ['a bad unit', { ...ok, context: { unit: 'stone', sessions: [] } }],
    [
      'four sessions',
      {
        ...ok,
        context: {
          unit: 'kg',
          sessions: Array.from({ length: 4 }, () => ({ daysAgo: 1, exercises: [] })),
        },
      },
    ],
    [
      'a negative weight',
      {
        ...ok,
        context: {
          unit: 'kg',
          sessions: [
            { daysAgo: 1, exercises: [{ name: 'x', sets: 1, topWeight: -1, topReps: 1 }] },
          ],
        },
      },
    ],
  ])('refuse %s', (_name, body) => {
    expect(CoachRequestSchema.safeParse(body).success).toBe(false);
  });

  it('describe the answers', () => {
    expect(CoachResponseSchema.safeParse({ status: 'ok', text: 'Add 2.5 kg.' }).success).toBe(true);
    expect(CoachResponseSchema.safeParse({ status: 'limited' }).success).toBe(true);
    expect(CoachResponseSchema.safeParse({ status: 'unavailable' }).success).toBe(true);
    expect(CoachResponseSchema.safeParse({ status: 'ok', text: '' }).success).toBe(false);
    expect(CoachResponseSchema.safeParse({ status: 'error' }).success).toBe(false);
  });
});
