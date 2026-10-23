import { vi } from 'vitest';
import type { Unit } from '../domain/schemas';
import type { Failure } from '../lib/result';
import type { ProfileService } from '../features/settings/types';

/** An in-memory ProfileService. `failNext` makes the next call of one method fail. */
export function createFakeProfileService(initial: Unit | null = null) {
  let saved: Unit | null = initial;
  const failures: Partial<Record<keyof ProfileService, Failure[]>> = {};
  const next = (method: keyof ProfileService) => failures[method]?.shift();
  const holds: Partial<Record<keyof ProfileService, Promise<void>>> = {};

  const service = {
    getUnit: vi.fn<ProfileService['getUnit']>(async () => {
      const answer = saved; // what the server had when the request was made
      await holds.getUnit;
      const reason = next('getUnit');
      return reason ? { status: 'error', reason } : { status: 'ok', value: answer };
    }),
    setUnit: vi.fn<ProfileService['setUnit']>(async (_userId, unit) => {
      await holds.setUnit;
      const reason = next('setUnit');
      if (reason) return { status: 'error', reason };
      saved = unit;
      return { status: 'ok', value: undefined };
    }),
  } satisfies ProfileService;

  return {
    service,
    saved: () => saved,
    /** Changes what the server has, as if another device had saved a unit. */
    setSaved: (unit: Unit | null) => void (saved = unit),
    /** Holds the next calls to a method open until the returned function is called. */
    hold: (method: keyof ProfileService) => {
      let release: () => void = () => undefined;
      holds[method] = new Promise<void>((resolve) => {
        release = () => {
          delete holds[method];
          resolve();
        };
      });
      return release;
    },
    failNext: (method: keyof ProfileService, reason: Failure = 'offline', times = 1) => {
      failures[method] = [...(failures[method] ?? []), ...Array<Failure>(times).fill(reason)];
    },
  };
}
