import { useCallback, useEffect, useState } from 'react';
import type { Gym } from '../../domain/gyms';
import { useGymService } from '../gyms';
import { useLogStore } from '../sync';

export type MyGym =
  | { status: 'loading' }
  /** `gym` is null when the user has not set one up yet. */
  | { status: 'ready'; gym: Gym | null; fromCache: boolean }
  | { status: 'error' };

/**
 * The user's gym, for starting a workout and for the places that show its bars. The gym is managed online,
 * so the answer is saved on the device each time it loads, and the saved copy is used when there is no
 * connection.
 */
export function useMyGym(): { catalog: MyGym; reload: () => void; saved: (gym: Gym) => void } {
  const service = useGymService();
  const store = useLogStore();
  const [catalog, setCatalog] = useState<MyGym>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    (async () => {
      const result = await service.get().catch(() => null);
      if (result?.status === 'ok') {
        await store.saveGym(result.value).catch(() => undefined);
        if (current) setCatalog({ status: 'ready', gym: result.value, fromCache: false });
        return;
      }
      const cached = await store.cachedGym().catch(() => null);
      if (!current) return;
      setCatalog(
        cached ? { status: 'ready', gym: cached.gym, fromCache: true } : { status: 'error' },
      );
    })();
    return () => {
      current = false;
    };
  }, [service, store, attempt]);

  const reload = useCallback(() => {
    setCatalog({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  /** Records a gym the screen has just created, so it is used at once and kept for offline use. */
  const saved = useCallback(
    (gym: Gym) => {
      setCatalog({ status: 'ready', gym, fromCache: false });
      void store.saveGym(gym).catch(() => undefined);
    },
    [store],
  );

  return { catalog, reload, saved };
}
