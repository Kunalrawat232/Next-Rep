import { useEffect } from 'react';
import type { StoredWorkout } from '../../data/local';
import { ignoreClosed } from '../../data/local';
import { useGymService } from '../gyms';
import { useLogStore } from '../sync';

/**
 * A workout keeps the gym as it was when it started, so it works offline. When there is a
 * connection and the gym was edited since (a bar added, say), the workout takes the new bars.
 */
export function useFreshGym(workout: StoredWorkout, reload: () => Promise<void>): void {
  const service = useGymService();
  const store = useLogStore();
  const { id, gymId, gymSnapshot } = workout;

  useEffect(() => {
    if (!gymId) return;
    let current = true;
    (async () => {
      const result = await service.get().catch(() => null);
      if (!current || result?.status !== 'ok') return;
      const gym = result.value;
      if (!gym || gym.id !== gymId) return;
      const fresh = { barbellKg: gym.barbellKg, bars: gym.bars };
      if (JSON.stringify(fresh) === JSON.stringify(gymSnapshot)) return;
      await store.refreshGymSnapshot(id, fresh);
      if (current) await reload();
    })().catch(ignoreClosed);
    return () => {
      current = false;
    };
  }, [service, store, id, gymId, gymSnapshot, reload]);
}
