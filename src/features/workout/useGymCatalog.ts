import { useCallback, useEffect, useState } from 'react';
import type { Gym } from '../../domain/gyms';
import { useGymService } from '../gyms';
import { useLogStore } from '../sync';

export type GymCatalog =
  | { status: 'loading' }
  | { status: 'ready'; gyms: Gym[]; fromCache: boolean }
  | { status: 'error' };

/**
 * The user's gyms for starting a workout. Gyms are managed online, so the list is saved on the
 * device each time it loads, and the saved copy is used when there is no connection.
 */
export function useGymCatalog(): { catalog: GymCatalog; reload: () => void } {
  const service = useGymService();
  const store = useLogStore();
  const [catalog, setCatalog] = useState<GymCatalog>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    (async () => {
      const result = await service.list().catch(() => null);
      if (result?.status === 'ok') {
        await store.saveGyms(result.value).catch(() => undefined);
        if (current) setCatalog({ status: 'ready', gyms: result.value, fromCache: false });
        return;
      }
      const cached = await store.cachedGyms().catch(() => null);
      if (!current) return;
      setCatalog(cached ? { status: 'ready', gyms: cached, fromCache: true } : { status: 'error' });
    })();
    return () => {
      current = false;
    };
  }, [service, store, attempt]);

  const reload = useCallback(() => {
    setCatalog({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  return { catalog, reload };
}
