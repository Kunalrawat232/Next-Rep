// Edge and negative cases for the gym list saved on the device and the gym kept on a workout.
// A failing test here is a suspected bug: do not weaken it.
import { describe, expect, it } from 'vitest';
import type { Gym } from '../../domain/gyms';
import { aSet, aWorkout, freshLocal, reopenLocal } from '../../test/localDb';
import type { GymSnapshot } from './types';

const gym = (over: Partial<Gym> = {}): Gym => ({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Home gym',
  barbellKg: 15,
  isDefault: true,
  createdAt: '2026-10-01T10:00:00Z',
  bars: [],
  ...over,
});
const snapshot: GymSnapshot = { name: 'Home gym', barbellKg: 15, bars: [] };

describe('the saved gym list', () => {
  it('is replaced as a whole by the next save, not merged', async () => {
    const { store } = freshLocal();
    await store.saveGyms([gym({ id: 'a', name: 'A' }), gym({ id: 'b', name: 'B' })]);
    await store.saveGyms([gym({ id: 'c', name: 'C' })]);
    expect((await store.cachedGyms())?.map((g) => g.id)).toEqual(['c']);
  });

  it('survives closing and reopening the database, as after an app restart', async () => {
    const { store, db, userId } = freshLocal();
    await store.saveGyms([gym()]);
    db.close();
    const again = reopenLocal(userId);
    expect(await again.store.cachedGyms()).toEqual([gym()]);
  });

  it('is a copy: changing the list after saving does not change what was saved', async () => {
    const { store } = freshLocal();
    const list = [gym()];
    await store.saveGyms(list);
    list[0]!.name = 'Changed';
    list.push(gym({ id: 'x' }));
    expect(await store.cachedGyms()).toEqual([gym()]);
  });

  it('is cleared by purgeSynced but leaves an unsynced workout and its gym alone', async () => {
    const { store } = freshLocal();
    await store.saveGyms([gym()]);
    const w = await store.startWorkout({ ...aWorkout(), gymSnapshot: snapshot });
    await store.logSet(aSet(w.id));
    await store.purgeSynced();
    expect(await store.cachedGyms()).toBeNull();
    expect((await store.activeWorkout())?.gymSnapshot).toEqual(snapshot);
    expect(await store.listSets(w.id)).toHaveLength(1);
  });

  it('keeps gyms with unusual names and many bars intact', async () => {
    const { store } = freshLocal();
    const odd = gym({
      name: '<b>Ananya\'s "gym"</b> 🏋️',
      bars: Array.from({ length: 20 }, (_, i) => ({
        id: `bar-${i}`,
        name: `Bar ${i}`,
        weightKg: i + 0.25,
        kind: i % 2 ? ('ez_bar' as const) : ('smith' as const),
      })),
    });
    await store.saveGyms([odd]);
    expect(await store.cachedGyms()).toEqual([odd]);
  });
});

describe('the gym kept on a workout', () => {
  it('is not replaced when the same workout is started again with another gym', async () => {
    const { store } = freshLocal();
    const input = aWorkout();
    await store.startWorkout({ ...input, gymSnapshot: snapshot });
    const second = await store.startWorkout({
      ...input,
      gymSnapshot: { name: 'Office', barbellKg: 20, bars: [] },
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
    ['a negative bar', { name: 'G', barbellKg: -5, bars: [] }],
    ['a bar over 100 kg', { name: 'G', barbellKg: 1000, bars: [] }],
    ['a bar that is not a number', { name: 'G', barbellKg: Number.NaN, bars: [] }],
    [
      'an extra bar of negative weight',
      { name: 'G', barbellKg: 20, bars: [{ id: 'b', name: 'EZ', weightKg: -7.5, kind: 'ez_bar' }] },
    ],
    [
      'an extra bar over 100 kg',
      { name: 'G', barbellKg: 20, bars: [{ id: 'b', name: 'EZ', weightKg: 700, kind: 'ez_bar' }] },
    ],
    ['bars that are not a list', { name: 'G', barbellKg: 20, bars: null }],
    ['no name', { barbellKg: 20, bars: [] }],
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
  ])('does not trust a saved gym list with %s', async (_name, barbellKg) => {
    const { store } = freshLocal();
    await store.saveGyms([gym({ barbellKg })]);
    expect(await store.cachedGyms()).toBeNull();
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
