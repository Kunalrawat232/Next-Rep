import { describe, expect, it } from 'vitest';
import { aSet, aWorkout, freshLocal, uuid } from '../../test/localDb';

async function ended(store: ReturnType<typeof freshLocal>['store'], startedAt: string) {
  const w = await store.startWorkout(aWorkout({ startedAt }));
  await store.endWorkout(w.id, '2026-12-31T23:00:00.000Z');
  return w;
}

describe('endedWorkouts', () => {
  it('lists ended workouts newest start first, and leaves out the open one', async () => {
    const { store } = freshLocal();
    const a = await ended(store, '2026-10-01T10:00:00.000Z');
    const c = await ended(store, '2026-10-03T10:00:00.000Z');
    const b = await ended(store, '2026-10-02T10:00:00.000Z');
    await store.startWorkout(aWorkout({ startedAt: '2026-10-04T10:00:00.000Z' }));
    expect((await store.endedWorkouts(10)).map((w) => w.id)).toEqual([c.id, b.id, a.id]);
  });

  it.each([
    [0, 0],
    [-3, 0],
    [Number.NaN, 0],
    [2, 2],
    [0.5, 0],
    [2.9, 2],
    [100, 3],
  ])('with a limit of %s returns %s', async (limit, count) => {
    const { store } = freshLocal();
    for (const day of ['01', '02', '03']) await ended(store, `2026-10-${day}T10:00:00.000Z`);
    expect(await store.endedWorkouts(limit)).toHaveLength(count);
  });

  it('keeps workouts that started at the same moment', async () => {
    const { store } = freshLocal();
    await ended(store, '2026-10-01T10:00:00.000Z');
    await ended(store, '2026-10-01T10:00:00.000Z');
    expect(await store.endedWorkouts(10)).toHaveLength(2);
  });

  it('is empty on a new device', async () => {
    expect(await freshLocal().store.endedWorkouts(10)).toEqual([]);
  });

  it('reads a damaged gym snapshot as missing', async () => {
    const { store, db } = freshLocal();
    const w = await ended(store, '2026-10-01T10:00:00.000Z');
    await db.workouts.update(w.id, { gymSnapshot: { name: 1 } as never });
    expect((await store.endedWorkouts(1))[0]?.gymSnapshot).toBeNull();
  });
});

describe('listSetsFor and getWorkout', () => {
  it('returns the sets of the given workouts only, oldest first', async () => {
    const { store } = freshLocal();
    const w1 = await store.startWorkout(aWorkout());
    const w2 = await store.startWorkout(aWorkout());
    const w3 = await store.startWorkout(aWorkout());
    const late = await store.logSet(aSet(w1.id, { loggedAt: '2026-10-02T10:00:00.000Z' }));
    const early = await store.logSet(aSet(w2.id, { loggedAt: '2026-10-01T10:00:00.000Z' }));
    await store.logSet(aSet(w3.id));
    expect((await store.listSetsFor([w1.id, w2.id])).map((s) => s.id)).toEqual([early.id, late.id]);
  });

  it('returns nothing for no ids or unknown ids', async () => {
    const { store } = freshLocal();
    expect(await store.listSetsFor([])).toEqual([]);
    expect(await store.listSetsFor([uuid()])).toEqual([]);
  });

  it('finds a workout by id, open or ended, and says nothing for an unknown id', async () => {
    const { store } = freshLocal();
    const open = await store.startWorkout(aWorkout());
    const done = await ended(store, '2026-10-01T10:00:00.000Z');
    expect((await store.getWorkout(open.id))?.endedAt).toBeNull();
    expect((await store.getWorkout(done.id))?.endedAt).not.toBeNull();
    expect(await store.getWorkout(uuid())).toBeUndefined();
  });
});
