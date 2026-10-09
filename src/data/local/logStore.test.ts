import { describe, expect, it } from 'vitest';
import { aSet, aWorkout, freshLocal, reopenLocal, uuid } from '../../test/localDb';

describe('workouts', () => {
  it('starts a workout as a pending, unfinished row', async () => {
    const { store } = freshLocal();
    const input = aWorkout({ gymId: uuid(), startedAt: '2026-10-10T09:00:00.000Z' });
    const w = await store.startWorkout(input);
    expect(w).toMatchObject({
      ...input,
      endedAt: null,
      notes: null,
      syncStatus: 'pending',
      rev: 1,
      attempts: 0,
    });
  });

  it('refuses a workout with a bad id or time', async () => {
    const { store } = freshLocal();
    await expect(
      store.startWorkout({ id: 'nope', gymId: null, startedAt: '2026-10-10T09:00:00Z' }),
    ).rejects.toThrow();
    await expect(
      store.startWorkout({ id: uuid(), gymId: null, startedAt: 'yesterday' }),
    ).rejects.toThrow();
  });

  it('knows which workout is still open, and picks the newest', async () => {
    const { store } = freshLocal();
    expect(await store.activeWorkout()).toBeUndefined();
    const old = await store.startWorkout(aWorkout({ startedAt: '2026-10-09T09:00:00.000Z' }));
    const recent = await store.startWorkout(aWorkout({ startedAt: '2026-10-10T09:00:00.000Z' }));
    expect((await store.activeWorkout())?.id).toBe(recent.id);
    await store.endWorkout(recent.id, '2026-10-10T10:00:00.000Z');
    expect((await store.activeWorkout())?.id).toBe(old.id);
  });

  it('ends a workout, puts it back in the queue and bumps its revision', async () => {
    const { store } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    await store.outbox.markSynced('workout', [{ id: w.id, rev: w.rev }]);
    const ended = await store.endWorkout(w.id, '2026-10-10T11:00:00.000Z');
    expect(ended).toMatchObject({
      endedAt: '2026-10-10T11:00:00.000Z',
      syncStatus: 'pending',
      rev: 2,
      attempts: 0,
    });
  });

  it('refuses to end a missing workout, or to end it before it started', async () => {
    const { store } = freshLocal();
    await expect(store.endWorkout(uuid(), '2026-10-10T11:00:00.000Z')).rejects.toThrow(
      /not found/i,
    );
    const w = await store.startWorkout(aWorkout({ startedAt: '2026-10-10T10:00:00.000Z' }));
    await expect(store.endWorkout(w.id, '2026-10-10T09:00:00.000Z')).rejects.toThrow();
  });
});

describe('sets', () => {
  it('stores a set against its workout, pending', async () => {
    const { store } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    const s = await store.logSet(aSet(w.id));
    expect(s).toMatchObject({ workoutId: w.id, totalKg: 60, syncStatus: 'pending', rev: 1 });
    expect(await store.listSets(w.id)).toHaveLength(1);
  });

  it('refuses a set for a workout that is not on this device', async () => {
    const { store } = freshLocal();
    await expect(store.logSet(aSet(uuid()))).rejects.toThrow(/workout not found/i);
  });

  it.each([
    ['zero reps', { reps: 0 }],
    ['101 reps', { reps: 101 }],
    ['a fractional rep count', { reps: 7.5 }],
    ['501 kg', { totalKg: 501, barKg: null, perSideKg: null, inputMode: 'total' as const }],
    [
      'a negative weight',
      { totalKg: -1, barKg: null, perSideKg: null, inputMode: 'total' as const },
    ],
    ['a total that is not bar plus two sides', { totalKg: 61 }],
    ['per-side input without a bar', { barKg: null }],
    ['an unknown source', { source: 'psychic' as never }],
    ['a bad exercise id', { exerciseId: 'bench' }],
    ['a transcript over 500 characters', { rawTranscript: 'x'.repeat(501) }],
  ])('refuses a set with %s, and stores nothing', async (_label, over) => {
    const { store } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    await expect(store.logSet(aSet(w.id, over))).rejects.toThrow();
    expect(await store.listSets(w.id)).toEqual([]);
  });

  it('keeps boundary sets: 1 and 100 reps, 0 and 500 kg', async () => {
    const { store } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    const total = { barKg: null, perSideKg: null, inputMode: 'total' as const };
    await store.logSet(aSet(w.id, { reps: 1, totalKg: 0, ...total }));
    await store.logSet(aSet(w.id, { reps: 100, totalKg: 500, ...total }));
    expect(await store.listSets(w.id)).toHaveLength(2);
  });

  it("lists a workout's sets in the order they were logged, not the order they were saved", async () => {
    const { store } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    await store.logSet(aSet(w.id, { loggedAt: '2026-10-10T10:30:00.000Z', reps: 3 }));
    await store.logSet(aSet(w.id, { loggedAt: '2026-10-10T10:10:00.000Z', reps: 1 }));
    await store.logSet(aSet(w.id, { loggedAt: '2026-10-10T10:20:00.000Z', reps: 2 }));
    expect((await store.listSets(w.id)).map((s) => s.reps)).toEqual([1, 2, 3]);
  });

  it('keeps sets of different workouts apart', async () => {
    const { store } = freshLocal();
    const a = await store.startWorkout(aWorkout());
    const b = await store.startWorkout(aWorkout());
    await store.logSet(aSet(a.id));
    await store.logSet(aSet(b.id));
    await store.logSet(aSet(b.id));
    expect(await store.listSets(a.id)).toHaveLength(1);
    expect(await store.listSets(b.id)).toHaveLength(2);
  });

  it('finds the newest set of an exercise across workouts, and nothing for an exercise never done', async () => {
    const { store } = freshLocal();
    const a = await store.startWorkout(aWorkout());
    const b = await store.startWorkout(aWorkout());
    const bench = '2c49d84c-42d6-5729-8791-bdf87686998a';
    const squat = '38080a0f-a088-5f32-952f-d8dc3b6d5664';
    await store.logSet(
      aSet(a.id, { loggedAt: '2026-10-08T10:00:00.000Z', totalKg: 50, perSideKg: 15 }),
    );
    await store.logSet(aSet(b.id, { loggedAt: '2026-10-10T10:00:00.000Z', totalKg: 60 }));
    await store.logSet(
      aSet(a.id, {
        exerciseId: squat,
        loggedAt: '2026-10-11T10:00:00.000Z',
        totalKg: 100,
        perSideKg: 40,
      }),
    );
    expect((await store.lastSetFor(bench))?.totalKg).toBe(60);
    expect((await store.lastSetFor(squat))?.totalKg).toBe(100);
    expect(await store.lastSetFor('94831dec-ce3c-5f65-9f25-0af535daf062')).toBeUndefined();
  });
});

describe('removing a set', () => {
  it('removes a set that has not reached the server', async () => {
    const { store } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    const s = await store.logSet(aSet(w.id));
    expect(await store.removeUnsyncedSet(s.id)).toBe('removed');
    expect(await store.listSets(w.id)).toEqual([]);
  });

  it('refuses to remove a synced set, because that has to be deleted online', async () => {
    const { store } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    const s = await store.logSet(aSet(w.id));
    await store.outbox.markSynced('set', [{ id: s.id, rev: s.rev }]);
    expect(await store.removeUnsyncedSet(s.id)).toBe('synced');
    expect(await store.listSets(w.id)).toHaveLength(1);
  });

  it('says so when the set is not there', async () => {
    const { store } = freshLocal();
    expect(await store.removeUnsyncedSet(uuid())).toBe('missing');
  });
});

describe('counts and retry', () => {
  it('counts pending and failed rows across workouts and sets', async () => {
    const { store } = freshLocal();
    expect(await store.counts()).toEqual({ pending: 0, failed: 0 });
    const w = await store.startWorkout(aWorkout());
    const s1 = await store.logSet(aSet(w.id));
    await store.logSet(aSet(w.id));
    expect(await store.counts()).toEqual({ pending: 3, failed: 0 });
    await store.outbox.markSynced('set', [{ id: s1.id, rev: s1.rev }]);
    expect(await store.counts()).toEqual({ pending: 2, failed: 0 });
  });

  it('puts failed rows back in the queue with a clean slate', async () => {
    const { store, db } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    await db.workouts.update(w.id, {
      syncStatus: 'failed',
      attempts: 8,
      lastError: 'x',
      nextAttemptAt: 9e12,
    });
    expect(await store.counts()).toEqual({ pending: 0, failed: 1 });
    expect(await store.retryFailed()).toBe(1);
    expect(await db.workouts.get(w.id)).toMatchObject({
      syncStatus: 'pending',
      attempts: 0,
      nextAttemptAt: 0,
      lastError: null,
    });
    expect(await store.retryFailed()).toBe(0);
  });
});

describe('persistence and isolation', () => {
  it('keeps everything after the database is reopened, as after a page reload', async () => {
    const { store, userId, db } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    await store.logSet(aSet(w.id));
    db.close();
    const again = reopenLocal(userId);
    expect(await again.store.listSets(w.id)).toHaveLength(1);
    expect((await again.store.activeWorkout())?.id).toBe(w.id);
    expect(await again.store.counts()).toEqual({ pending: 2, failed: 0 });
  });

  it("never shows one user's workouts to another on the same device", async () => {
    const a = freshLocal('user-a-iso');
    const b = freshLocal('user-b-iso');
    await a.store.startWorkout(aWorkout());
    expect(await b.store.activeWorkout()).toBeUndefined();
    expect(await b.store.counts()).toEqual({ pending: 0, failed: 0 });
  });
});

describe('idempotent writes', () => {
  it('starting a workout again leaves an ended workout ended', async () => {
    const { store } = freshLocal();
    const input = aWorkout();
    await store.startWorkout(input);
    await store.endWorkout(input.id, '2026-10-10T11:00:00.000Z');
    const again = await store.startWorkout(input);
    expect(again.endedAt).toBe('2026-10-10T11:00:00.000Z');
    expect(again.rev).toBe(2);
  });

  it('logging a set again leaves a synced set synced', async () => {
    const { store } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    const s = await store.logSet(aSet(w.id));
    await store.outbox.markSynced('set', [{ id: s.id, rev: s.rev }]);
    await store.logSet(aSet(w.id, { id: s.id }));
    expect(await store.removeUnsyncedSet(s.id)).toBe('synced');
  });
});

describe('times are stored in one form', () => {
  it('turns an offset time into UTC, so sets sort by when they happened', async () => {
    const { store } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    await store.logSet(aSet(w.id, { loggedAt: '2026-10-10T10:00:00+05:30', reps: 1 })); // 04:30Z
    await store.logSet(aSet(w.id, { loggedAt: '2026-10-10T05:00:00Z', reps: 2 }));
    await store.logSet(aSet(w.id, { loggedAt: '2026-10-10T05:00:00.5Z', reps: 3 }));
    const sets = await store.listSets(w.id);
    expect(sets.map((s) => s.reps)).toEqual([1, 2, 3]);
    expect(sets[0]?.loggedAt).toBe('2026-10-10T04:30:00.000Z');
    expect((await store.lastSetFor(sets[0]!.exerciseId))?.reps).toBe(3);
  });
});

describe('purgeSynced', () => {
  it('removes what the server has and keeps what it does not', async () => {
    const { store } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    const sent = await store.logSet(aSet(w.id));
    const waiting = await store.logSet(aSet(w.id));
    await store.outbox.markSynced('workout', [{ id: w.id, rev: 1 }]);
    await store.outbox.markSynced('set', [{ id: sent.id, rev: 1 }]);
    const { remaining } = await store.purgeSynced();
    expect(remaining).toBe(2); // the workout (it still has an unsynced set) and that set
    expect(await store.listSets(w.id)).toEqual([expect.objectContaining({ id: waiting.id })]);
  });

  it('leaves nothing behind when everything is synced', async () => {
    const { store, db } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    const s = await store.logSet(aSet(w.id));
    await store.outbox.markSynced('workout', [{ id: w.id, rev: 1 }]);
    await store.outbox.markSynced('set', [{ id: s.id, rev: 1 }]);
    expect(await store.purgeSynced()).toEqual({ remaining: 0 });
    expect(await db.workouts.count()).toBe(0);
    expect(await db.sets.count()).toBe(0);
  });

  it('keeps owed deletions', async () => {
    const { store } = freshLocal();
    await store.outbox.queueDeletion(uuid(), 'x');
    expect(await store.purgeSynced()).toEqual({ remaining: 1 });
  });
});
