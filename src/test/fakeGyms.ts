import { vi } from 'vitest';
import type { Gym } from '../domain/gyms';
import type { GymResult, GymService } from '../features/gyms/types';

export const sampleGym = (over: Partial<Gym> = {}): Gym => ({
  id: 'g1',
  name: 'Home gym',
  barbellKg: 15,
  isDefault: true,
  createdAt: '2026-10-01T10:00:00Z',
  bars: [],
  ...over,
});

/** An in-memory GymService for tests. Methods are spies; `failNext` makes the next call of one method fail. */
export function createFakeGymService(initial: Gym[] = []) {
  let gyms = [...initial];
  const failures = new Map<keyof GymService, 'offline' | 'conflict' | 'unknown'>();
  const fail = (method: keyof GymService): GymResult<never> | null => {
    const reason = failures.get(method);
    failures.delete(method);
    return reason ? { status: 'error', reason } : null;
  };
  let counter = 0;

  const service = {
    list: vi.fn<GymService['list']>(async () => fail('list') ?? { status: 'ok', value: [...gyms] }),
    create: vi.fn<GymService['create']>(async (_user, id, input, makeDefault) => {
      const failed = fail('create');
      if (failed) return failed;
      counter += 1;
      gyms = gyms.filter((gym) => gym.id !== id);
      gyms.push({
        id,
        name: input.name,
        barbellKg: input.barbellKg,
        isDefault: makeDefault,
        createdAt: new Date(2026, 9, 10, 10, counter).toISOString(),
        bars: input.bars.map((bar, i) => ({
          id: bar.id ?? `bar-${counter}-${i}`,
          ...bar,
          kind: bar.kind,
        })),
      });
      return { status: 'ok', value: undefined };
    }),
    update: vi.fn<GymService['update']>(async (_user, gymId, input) => {
      const failed = fail('update');
      if (failed) return failed;
      gyms = gyms.map((gym) =>
        gym.id === gymId
          ? {
              ...gym,
              name: input.name,
              barbellKg: input.barbellKg,
              bars: input.bars.map((bar, i) => ({ id: bar.id ?? `bar-${i}`, ...bar })),
            }
          : gym,
      );
      return { status: 'ok', value: undefined };
    }),
    remove: vi.fn<GymService['remove']>(async (gymId) => {
      const failed = fail('remove');
      if (failed) return failed;
      gyms = gyms.filter((gym) => gym.id !== gymId);
      return { status: 'ok', value: undefined };
    }),
    setDefault: vi.fn<GymService['setDefault']>(async (gymId) => {
      const failed = fail('setDefault');
      if (failed) return failed;
      gyms = gyms.map((gym) => ({ ...gym, isDefault: gym.id === gymId }));
      return { status: 'ok', value: undefined };
    }),
  } satisfies GymService;

  return {
    service,
    failNext: (method: keyof GymService, reason: 'offline' | 'conflict' | 'unknown' = 'unknown') =>
      void failures.set(method, reason),
    current: () => gyms,
  };
}
