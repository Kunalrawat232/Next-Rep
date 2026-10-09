import { vi } from 'vitest';
import type { Exercise } from '../domain/exercises';
import type { ExerciseService } from '../features/exercises/types';
import type { Failure } from '../lib/result';

export const customExercise = (over: Partial<Exercise> = {}): Exercise => ({
  id: 'custom-1',
  name: 'Zercher squat',
  equipmentType: 'barbell',
  bodyPart: 'lower',
  muscle: null,
  aliases: ['zercher'],
  tier: 'custom',
  ...over,
});

/** An in-memory ExerciseService for tests. `failNext` makes the next call of one method fail. */
export function createFakeExerciseService(initial: Exercise[] = []) {
  let custom = [...initial];
  const failures = new Map<keyof ExerciseService, Failure>();
  const fail = (method: keyof ExerciseService) => {
    const reason = failures.get(method);
    failures.delete(method);
    return reason ? ({ status: 'error', reason } as const) : null;
  };

  const service = {
    listCustom: vi.fn<ExerciseService['listCustom']>(
      async () => fail('listCustom') ?? { status: 'ok', value: [...custom] },
    ),
    create: vi.fn<ExerciseService['create']>(async (_user, id, input) => {
      const failed = fail('create');
      if (failed) return failed;
      custom = custom.filter((e) => e.id !== id);
      custom.push({ id, ...input, muscle: null, tier: 'custom' });
      return { status: 'ok', value: undefined };
    }),
  } satisfies ExerciseService;

  return {
    service,
    failNext: (method: keyof ExerciseService, reason: Failure = 'unknown') =>
      void failures.set(method, reason),
    current: () => custom,
  };
}
