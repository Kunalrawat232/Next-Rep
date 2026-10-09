import { describe, expect, it } from 'vitest';
import { aSet, aWorkout, freshLocal, uuid } from '../../test/localDb';

type Store = ReturnType<typeof freshLocal>['store'];

async function ended(store: Store, startedAt: string, endedAt = '2030-01-01T00:00:00.000Z') {
  const w = await store.startWorkout(aWorkout({ startedAt }));
  await store.endWorkout(w.id, endedAt);
  return w;
}

describe('endedWorkouts paging', () => {
  it('gives each longer page the shorter one as its start, even when every workout started at the same instant', async () => {
    const { store } = freshLocal();
    for (let i = 0; i < 30; i += 1) await ended(store, '2026-10-01T10:00:00.000Z');
    const p1 = (await store.endedWorkouts(11)).map((w) => w.id);
    const p2 = (await store.endedWorkouts(21)).map((w) => w.id);
    const p3 = (await store.endedWorkouts(31)).map((w) => w.id);
    expect(p2.slice(0, 11)).toEqual(p1);
    expect(p3.slice(0, 21)).toEqual(p2);
    expect(new Set(p3).size).toBe(30);
  });

  it('includes a workout that ended before it started, ordered by its start', async () => {
    const { store, db } = freshLocal();
    const odd = await ended(store, '2026-10-02T10:00:00.000Z', '2026-10-02T11:00:00.000Z');
    await db.workouts.update(odd.id, { endedAt: '2026-10-02T09:00:00.000Z' });
    const normal = await ended(store, '2026-10-01T10:00:00.000Z');
    expect((await store.endedWorkouts(5)).map((w) => w.id)).toEqual([odd.id, normal.id]);
  });

  it('orders across a year boundary, a leap day and a far-future start', async () => {
    const { store } = freshLocal();
    const a = await ended(store, '2026-12-31T23:59:59.999Z');
    const b = await ended(store, '2027-01-01T00:00:00.000Z');
    const c = await ended(store, '2028-02-29T12:00:00.000Z', '2028-02-29T13:00:00.000Z');
    const d = await ended(store, '2999-01-01T00:00:00.000Z', '2999-01-01T01:00:00.000Z');
    expect((await store.endedWorkouts(10)).map((w) => w.id)).toEqual([d.id, c.id, b.id, a.id]);
  });

  it('does not count open workouts towards the limit', async () => {
    const { store } = freshLocal();
    const old = await ended(store, '2026-09-01T10:00:00.000Z');
    for (const day of ['02', '03', '04'])
      await store.startWorkout(aWorkout({ startedAt: `2026-10-${day}T10:00:00.000Z` }));
    expect((await store.endedWorkouts(1)).map((w) => w.id)).toEqual([old.id]);
  });
});

describe('getWorkout', () => {
  it('reads a damaged gym snapshot as missing', async () => {
    const { store, db } = freshLocal();
    const w = await ended(store, '2026-10-01T10:00:00.000Z');
    await db.workouts.update(w.id, { gymSnapshot: 'broken' as never });
    expect((await store.getWorkout(w.id))?.gymSnapshot).toBeNull();
  });
});

describe('listSetsFor with odd input', () => {
  it('returns a set once when its workout id is listed twice', async () => {
    const { store } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    await store.logSet(aSet(w.id));
    expect(await store.listSetsFor([w.id, w.id])).toHaveLength(1);
  });

  it('still returns sets whose workout row is missing, only when asked for by id', async () => {
    const { store, db } = freshLocal();
    const w = await ended(store, '2026-10-01T10:00:00.000Z');
    const orphanWorkoutId = uuid();
    await store.logSet(aSet(w.id));
    await db.sets.put({
      ...(await db.sets.toCollection().first())!,
      id: uuid(),
      workoutId: orphanWorkoutId,
    });
    expect(await store.listSetsFor([w.id])).toHaveLength(1);
    expect(await store.listSetsFor([orphanWorkoutId])).toHaveLength(1);
    expect(await store.getWorkout(orphanWorkoutId)).toBeUndefined();
    expect((await store.endedWorkouts(10)).map((x) => x.id)).toEqual([w.id]);
  });

  it('orders sets across several workouts purely by time', async () => {
    const { store } = freshLocal();
    const a = await store.startWorkout(aWorkout());
    const b = await store.startWorkout(aWorkout());
    const s3 = await store.logSet(aSet(a.id, { loggedAt: '2027-01-01T00:00:00.000Z' }));
    const s1 = await store.logSet(aSet(b.id, { loggedAt: '2026-12-31T23:59:59.999Z' }));
    const s2 = await store.logSet(aSet(a.id, { loggedAt: '2026-12-31T23:59:59.999Z' }));
    const ids = (await store.listSetsFor([a.id, b.id])).map((s) => s.id);
    expect(ids[2]).toBe(s3.id);
    expect(new Set(ids.slice(0, 2))).toEqual(new Set([s1.id, s2.id]));
  });

  it('handles a few thousand sets in one workout', async () => {
    const { store, db } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    const base = await store.logSet(aSet(w.id));
    const rows = Array.from({ length: 3000 }, (_, i) => ({
      ...base,
      id: uuid(10_000 + i),
      loggedAt: new Date(Date.UTC(2026, 9, 10) + i * 1000).toISOString(),
    }));
    await db.sets.bulkPut(rows);
    const sets = await store.listSetsFor([w.id]);
    expect(sets).toHaveLength(3001);
    const times = sets.map((s) => s.loggedAt);
    expect(times).toEqual([...times].sort());
  }, 30_000);
});
