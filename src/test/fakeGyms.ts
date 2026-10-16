import { vi } from 'vitest';
import type { Gym } from '../domain/gyms';
import type { GymResult, GymService } from '../features/gyms/types';

export const sampleGym = (over: Partial<Gym> = {}): Gym => ({
  id: 'g1',
  barbellKg: 15,
  bars: [],
  ...over,
});

/**
 * An in-memory GymService for tests, holding the user's one gym (or none). Methods are spies; `failNext`
 * makes the next call of one method fail. Like the unique index on the server, saving under a different id
 * while a gym exists is a `conflict`.
 */
export function createFakeGymService(initial: Gym | null = null) {
  let gym = initial;
  const failures = new Map<keyof GymService, 'offline' | 'conflict' | 'unknown'>();
  const fail = (method: keyof GymService): GymResult<never> | null => {
    const reason = failures.get(method);
    failures.delete(method);
    return reason ? { status: 'error', reason } : null;
  };

  const service = {
    get: vi.fn<GymService['get']>(async () => fail('get') ?? { status: 'ok', value: gym }),
    save: vi.fn<GymService['save']>(async (_user, id, input) => {
      const failed = fail('save');
      if (failed) return failed;
      if (gym && gym.id !== id) return { status: 'error', reason: 'conflict' };
      gym = {
        id,
        barbellKg: input.barbellKg,
        bars: input.bars.map((bar, i) => ({ id: bar.id ?? `bar-${i}`, ...bar })),
      };
      return { status: 'ok', value: undefined };
    }),
  } satisfies GymService;

  return {
    service,
    failNext: (method: keyof GymService, reason: 'offline' | 'conflict' | 'unknown' = 'unknown') =>
      void failures.set(method, reason),
    current: () => gym,
  };
}
