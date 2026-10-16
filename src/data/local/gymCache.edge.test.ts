// Edge and negative cases for the gym saved on the device and the gym kept on a workout.
// A failing test here is a suspected bug: do not weaken it.
import { describe, expect, it } from 'vitest';
import type { Gym } from '../../domain/gyms';
import { aSet, aWorkout, freshLocal, reopenLocal } from '../../test/localDb';
import type { GymSnapshot } from './types';

const gym = (over: Partial<Gym> = {}): Gym => ({
  id: '11111111-1111-4111-8111-111111111111',
  barbellKg: 15,
  bars: [],
  ...over,
});
const snapshot: GymSnapshot = { barbellKg: 15, bars: [] };

describe('the saved gym', () => {
  it('is replaced as a whole by the next save, not merged', async () => {
    const { store } = freshLocal();
    await store.saveGym(
      gym({ id: 'a', bars: [{ id: 'x', name: 'EZ', weightKg: 7, kind: 'ez_bar' }] }),
    );
    await store.saveGym(gym({ id: 'c' }));
    expect(await store.cachedGym()).toEqual({ gym: gym({ id: 'c' }) });
  });

  it('can be saved as "no gym yet", which is different from nothing saved', async () => {
    const { store } = freshLocal();
    expect(await store.cachedGym()).toBeNull();
    await store.saveGym(gym());
    await store.saveGym(null);
    expect(await store.cachedGym()).toEqual({ gym: null });
  });

  it('survives closing and reopening the database, as after an app restart', async () => {
    const { store, db, userId } = freshLocal();
    await store.saveGym(gym());
    db.close();
    const again = reopenLocal(userId);
    expect(await again.store.cachedGym()).toEqual({ gym: gym() });
  });

  it('is a copy: changing the gym after saving does not change what was saved', async () => {
    const { store } = freshLocal();
    const saved = gym();
    await store.saveGym(saved);
    saved.barbellKg = 99;
    saved.bars.push({ id: 'x', name: 'EZ', weightKg: 7, kind: 'ez_bar' });
    expect(await store.cachedGym()).toEqual({ gym: gym() });
  });

  it('is cleared by purgeSynced but leaves an unsynced workout and its gym alone', async () => {
    const { store } = freshLocal();
    await store.saveGym(gym());
    const w = await store.startWorkout({ ...aWorkout(), gymSnapshot: snapshot });
    await store.logSet(aSet(w.id));
    await store.purgeSynced();
    expect(await store.cachedGym()).toBeNull();
    expect((await store.activeWorkout())?.gymSnapshot).toEqual(snapshot);
    expect(await store.listSets(w.id)).toHaveLength(1);
  });

  it('keeps a gym with many bars and unusual bar names intact', async () => {
    const { store } = freshLocal();
    const odd = gym({
      bars: Array.from({ length: 20 }, (_, i) => ({
        id: `bar-${i}`,
        name: i === 0 ? '<b>Ananya\'s "bar"</b> 🏋️' : `Bar ${i}`,
        weightKg: i + 0.25,
        kind: i % 2 ? ('ez_bar' as const) : ('smith' as const),
      })),
    });
    await store.saveGym(odd);
    expect(await store.cachedGym()).toEqual({ gym: odd });
  });

  it('reads an old copy with a name, a default flag and a date, and drops those fields', async () => {
    const { store, db } = freshLocal();
    const old = { ...gym(), name: 'Old gym', isDefault: true, createdAt: '2026-10-01T00:00:00Z' };
    await db.gymCache.put({ id: 'gym', gym: old as unknown as Gym, savedAt: 0 });
    expect(await store.cachedGym()).toEqual({ gym: gym() });
  });

  it('does not trust a saved copy of the old list shape', async () => {
    const { store, db } = freshLocal();
    await db.gymCache.put({ id: 'gym', gyms: [gym()], savedAt: 0 } as never);
    expect(await store.cachedGym()).toBeNull();
  });
});

describe('the gym kept on a workout', () => {
  it('is not replaced when the same workout is started again with another gym', async () => {
    const { store } = freshLocal();
    const input = aWorkout();
    await store.startWorkout({ ...input, gymSnapshot: snapshot });
    const second = await store.startWorkout({
      ...input,
      gymSnapshot: { barbellKg: 20, bars: [] },
    });
    expect(second.gymSnapshot).toEqual(snapshot);
  });

  it('is null, not undefined, for a workout saved before snapshots existed, even after ending it', async () => {
    const { store, db } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    await db.workouts.update(w.id, { gymSnapshot: undefined as never });
    const ended = await store.endWorkout(w.id, '2026-10-10T11:00:00.000Z');
    expect(ended.gymSnapshot).toBeNull();
  });

  it.each([
    ['a negative bar', { barbellKg: -5, bars: [] }],
    ['a bar over 100 kg', { barbellKg: 1000, bars: [] }],
    ['a bar that is not a number', { barbellKg: Number.NaN, bars: [] }],
    [
      'an extra bar of negative weight',
      { barbellKg: 20, bars: [{ id: 'b', name: 'EZ', weightKg: -7.5, kind: 'ez_bar' }] },
    ],
    [
      'an extra bar over 100 kg',
      { barbellKg: 20, bars: [{ id: 'b', name: 'EZ', weightKg: 700, kind: 'ez_bar' }] },
    ],
    ['bars that are not a list', { barbellKg: 20, bars: null }],
  ])('does not trust a stored snapshot with %s', async (_name, bad) => {
    const { store } = freshLocal();
    await store
      .startWorkout({ ...aWorkout(), gymSnapshot: bad as unknown as GymSnapshot })
      .catch(() => undefined);
    expect((await store.activeWorkout())?.gymSnapshot ?? null).toBeNull();
  });

  it.each([
    ['a negative bar', -5],
    ['a bar over 100 kg', 1000],
  ])('does not trust a saved gym with %s', async (_name, barbellKg) => {
    const { store } = freshLocal();
    await store.saveGym(gym({ barbellKg }));
    expect(await store.cachedGym()).toBeNull();
  });
});

describe('removeSyncedSet', () => {
  it.each(['pending', 'failed'] as const)('keeps a %s set and says no', async (status) => {
    const { store, db } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    const set = aSet(w.id);
    await store.logSet(set);
    await db.sets.update(set.id, { syncStatus: status });
    expect(await store.removeSyncedSet(set.id)).toBe(false);
    expect(await db.sets.get(set.id)).toBeDefined();
  });

  it('says no for a set that is not there, and removes a synced one exactly once', async () => {
    const { store, db } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    const set = aSet(w.id);
    await store.logSet(set);
    await db.sets.update(set.id, { syncStatus: 'synced' });
    expect(await store.removeSyncedSet('00000000-0000-4000-8000-00000000ffff')).toBe(false);
    expect(await store.removeSyncedSet(set.id)).toBe(true);
    expect(await store.removeSyncedSet(set.id)).toBe(false);
  });

  it('leaves other sets of the workout alone', async () => {
    const { store, db } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    const a = aSet(w.id, { loggedAt: '2026-10-10T10:00:00.000Z' });
    const b = aSet(w.id, { loggedAt: '2026-10-10T10:01:00.000Z' });
    await store.logSet(a);
    await store.logSet(b);
    await db.sets.update(a.id, { syncStatus: 'synced' });
    await store.removeSyncedSet(a.id);
    expect((await store.listSets(w.id)).map((s) => s.id)).toEqual([b.id]);
  });
});
