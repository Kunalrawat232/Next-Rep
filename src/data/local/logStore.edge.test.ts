import { describe, expect, it } from 'vitest';
import { aSet, aWorkout, freshLocal, uuid } from '../../test/localDb';
import { backoffMs, MAX_ATTEMPTS } from './logStore';
import type { StoredSet, StoredWorkout } from './types';

const meta = { syncStatus: 'pending', rev: 1, attempts: 0, nextAttemptAt: 0, lastError: null };
const rawSet = (over: Record<string, unknown>) =>
  ({ ...aSet(uuid()), ...meta, ...over }) as unknown as StoredSet;
const rawWorkout = (over: Record<string, unknown>) =>
  ({ ...aWorkout(), endedAt: null, notes: null, ...meta, ...over }) as unknown as StoredWorkout;

describe('corrupt rows already in IndexedDB', () => {
  it.each([
    ['a set without loggedAt', { loggedAt: undefined }],
    ['a set without workoutId', { workoutId: undefined }],
  ])(
    'one corrupt row (%s) does not stop the outbox from listing the healthy ones',
    async (_l, over) => {
      const { store, db } = freshLocal();
      const w = await store.startWorkout(aWorkout());
      await db.workouts.update(w.id, { syncStatus: 'synced', everSynced: true });
      const good = await store.logSet(aSet(w.id));
      await db.sets.put(rawSet({ workoutId: w.id, ...over }));
      const due = await store.outbox.dueSets(Number.MAX_SAFE_INTEGER).catch(() => null);
      expect(due?.map((s) => s.id)).toContain(good.id);
    },
  );

  it('a workout without startedAt does not stop the outbox from listing the healthy workouts', async () => {
    const { store, db } = freshLocal();
    const good = await store.startWorkout(aWorkout());
    await store.logSet(aSet(good.id));
    await db.workouts.put(rawWorkout({ startedAt: undefined }));
    const due = await store.outbox.dueWorkouts(Number.MAX_SAFE_INTEGER).catch(() => null);
    expect(due?.map((w) => w.id)).toContain(good.id);
  });

  it('a set without loggedAt does not make listSets throw for the whole workout', async () => {
    const { store, db } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    await store.logSet(aSet(w.id));
    await db.sets.put(rawSet({ workoutId: w.id, loggedAt: undefined }));
    await expect(store.listSets(w.id)).resolves.toHaveLength(2);
  });

  it('a row with an unknown syncStatus is neither pending nor failed, so nothing is sent for it', async () => {
    const { store, db } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    await db.workouts.update(w.id, { syncStatus: 'synced', everSynced: true });
    await db.sets.put(rawSet({ workoutId: w.id, syncStatus: 'banana' }));
    expect(await store.outbox.dueSets(Number.MAX_SAFE_INTEGER)).toEqual([]);
    expect(await store.counts()).toEqual({ pending: 0, failed: 0 });
  });

  it('endWorkout refuses a stored workout whose startedAt was damaged, and leaves it as it was', async () => {
    const { store, db } = freshLocal();
    const bad = rawWorkout({ startedAt: 'last tuesday' });
    await db.workouts.put(bad);
    await expect(store.endWorkout(bad.id, '2026-10-10T11:00:00.000Z')).rejects.toThrow();
    expect(await db.workouts.get(bad.id)).toMatchObject({ rev: 1, startedAt: 'last tuesday' });
  });
});

describe('outbox timing', () => {
  it.each([
    ['exactly now is due', 1_000, 1_000, true],
    ['one ms early is not due', 1_001, 1_000, false],
    ['far future (only a wrong clock can cause it) is due', 9e15, 1_000, true],
    ['a clock that went back by more than the longest backoff is due', 5_000_000, 1_000, true],
    ['zero is always due', 0, 0, true],
  ])('%s', async (_l, nextAttemptAt, now, due) => {
    const { store, db } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    await store.logSet(aSet(w.id));
    await db.workouts.update(w.id, { nextAttemptAt });
    expect((await store.outbox.dueWorkouts(now)).length).toBe(due ? 1 : 0);
  });

  it('a row deferred by a clock that was wrong is due again once the clock is right', async () => {
    const { store } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    await store.logSet(aSet(w.id));
    const farFuture = Date.UTC(2030, 0, 1);
    await store.outbox.recordFailure('workout', { id: w.id, rev: w.rev }, 'rejected', farFuture);
    // the device clock is now corrected back to 2026
    const clockNow = Date.UTC(2026, 9, 10);
    expect((await store.outbox.dueWorkouts(clockNow)).map((r) => r.id)).toEqual([w.id]);
  });
});

describe('attempt limits', () => {
  it.each([
    [0, 'pending'],
    [MAX_ATTEMPTS - 3, 'pending'],
    [MAX_ATTEMPTS - 2, 'pending'], // becomes MAX-1
    [MAX_ATTEMPTS - 1, 'failed'], // becomes MAX
    [MAX_ATTEMPTS, 'failed'], // becomes MAX+1, stays failed
    [MAX_ATTEMPTS * 100, 'failed'],
  ])('a row at %i attempts that is refused once more ends up %s', async (attempts, status) => {
    const { store, db } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    await db.workouts.update(w.id, { attempts });
    await store.outbox.recordFailure('workout', { id: w.id, rev: w.rev }, 'rejected', 10);
    expect(await db.workouts.get(w.id)).toMatchObject({
      syncStatus: status,
      attempts: attempts + 1,
      nextAttemptAt: 10 + backoffMs(attempts + 1),
    });
  });

  it.each([
    [-5, 2_000],
    [Number.MAX_SAFE_INTEGER, 5 * 60_000],
  ])('backoffMs(%s) stays within 2 s and 5 min', (attempts, expected) => {
    expect(backoffMs(attempts)).toBe(expected);
  });

  it('recording a failure for a row that is gone creates nothing and does not throw', async () => {
    const { store, db } = freshLocal();
    await store.outbox.recordFailure('set', { id: uuid(), rev: 1 }, 'rejected', 1);
    expect(await db.sets.count()).toBe(0);
  });

  it('deferring a row never counts as an attempt', async () => {
    const { store, db } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    for (let i = 0; i < 20; i++)
      await store.outbox.defer('workout', [{ id: w.id, rev: w.rev }], 100 + i);
    expect(await db.workouts.get(w.id)).toMatchObject({
      attempts: 0,
      syncStatus: 'pending',
      nextAttemptAt: 119,
    });
  });
});

describe('markSynced', () => {
  it('reports ids that do not exist and leaves a newer revision pending', async () => {
    const { store, db } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    const ghost = uuid();
    const gone = await store.outbox.markSynced('workout', [
      { id: ghost, rev: 1 },
      { id: w.id, rev: 0 },
    ]);
    expect(gone).toEqual([ghost]);
    expect((await db.workouts.get(w.id))?.syncStatus).toBe('pending');
  });

  it('an empty list does nothing', async () => {
    const { store } = freshLocal();
    expect(await store.outbox.markSynced('set', [])).toEqual([]);
  });

  it('removeUnsyncedSet racing with markSynced ends in one consistent state, whichever wins', async () => {
    for (let round = 0; round < 25; round++) {
      const { store, db } = freshLocal();
      const w = await store.startWorkout(aWorkout());
      const s = await store.logSet(aSet(w.id));
      const [removed, gone] = await Promise.all([
        store.removeUnsyncedSet(s.id),
        store.outbox.markSynced('set', [{ id: s.id, rev: s.rev }]),
      ]);
      const row = await db.sets.get(s.id);
      if (removed === 'removed') {
        expect(gone).toEqual([s.id]); // the worker must queue a server-side delete
        expect(row).toBeUndefined();
      } else {
        expect(removed).toBe('synced');
        expect(gone).toEqual([]);
        expect(row?.syncStatus).toBe('synced');
      }
    }
  });
});

describe('deletion queue', () => {
  it('queueing the same id twice keeps one entry', async () => {
    const { store } = freshLocal();
    const id = uuid();
    await store.outbox.queueDeletion(id, '2026-10-10T10:00:00.000Z');
    await store.outbox.queueDeletion(id, '2026-10-10T11:00:00.000Z');
    expect(await store.outbox.dueDeletions(Number.MAX_SAFE_INTEGER)).toHaveLength(1);
  });

  it('queueing again while a retry is backing off keeps the backoff', async () => {
    const { store } = freshLocal();
    const id = uuid();
    await store.outbox.queueDeletion(id, 'a');
    await store.outbox.deferDeletion(id, 50_000);
    await store.outbox.queueDeletion(id, 'a');
    expect(await store.outbox.dueDeletions(1_000)).toEqual([]);
  });

  it('retrying or clearing a deletion that is not queued is harmless', async () => {
    const { store, db } = freshLocal();
    await store.outbox.deferDeletion(uuid(), 5);
    await store.outbox.recordDeletionFailure(uuid(), 5);
    await store.outbox.clearDeletion(uuid());
    expect(await db.deletions.count()).toBe(0);
  });

  it('counts owed deletions as pending', async () => {
    const { store } = freshLocal();
    await store.outbox.queueDeletion(uuid(), 'x');
    await store.outbox.queueDeletion(uuid(), 'x');
    expect(await store.counts()).toEqual({ pending: 2, failed: 0 });
  });
});

describe('workouts', () => {
  it('ending twice with the same time bumps the revision each time and never loses notes', async () => {
    const { store, db } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    await db.workouts.update(w.id, { notes: 'felt strong' });
    const a = await store.endWorkout(w.id, '2026-10-10T11:00:00.000Z');
    const b = await store.endWorkout(w.id, '2026-10-10T11:00:00.000Z');
    expect([a.rev, b.rev]).toEqual([2, 3]);
    expect(b.notes).toBe('felt strong');
  });

  it('ending twice with different times keeps the latest, and the workout stops being active', async () => {
    const { store } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    await store.endWorkout(w.id, '2026-10-10T11:00:00.000Z');
    const b = await store.endWorkout(w.id, '2026-10-10T12:00:00.000Z');
    expect(b.endedAt).toBe('2026-10-10T12:00:00.000Z');
    expect(await store.activeWorkout()).toBeUndefined();
  });

  it('ending at exactly the start time is allowed; ending a millisecond earlier is not', async () => {
    const { store } = freshLocal();
    const w = await store.startWorkout(aWorkout({ startedAt: '2026-10-10T10:00:00.000Z' }));
    await expect(store.endWorkout(w.id, '2026-10-10T09:59:59.999Z')).rejects.toThrow();
    await expect(store.endWorkout(w.id, '2026-10-10T10:00:00.000Z')).resolves.toBeDefined();
  });

  it('a refused end leaves the stored workout untouched', async () => {
    const { store, db } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    await expect(store.endWorkout(w.id, 'soon')).rejects.toThrow();
    expect(await db.workouts.get(w.id)).toMatchObject({ endedAt: null, rev: 1 });
  });

  it('ending a workout does not touch its unsynced sets', async () => {
    const { store, db } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    const s = await store.logSet(aSet(w.id));
    await store.endWorkout(w.id, '2026-10-10T11:00:00.000Z');
    expect(await db.sets.get(s.id)).toMatchObject({ syncStatus: 'pending', rev: 1 });
    expect(await store.counts()).toEqual({ pending: 2, failed: 0 });
  });

  it('ending a failed workout puts it back in the queue with a clean slate', async () => {
    const { store, db } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    await db.workouts.update(w.id, {
      syncStatus: 'failed',
      attempts: MAX_ATTEMPTS,
      lastError: 'x',
    });
    await store.endWorkout(w.id, '2026-10-10T11:00:00.000Z');
    expect(await db.workouts.get(w.id)).toMatchObject({
      syncStatus: 'pending',
      attempts: 0,
      lastError: null,
    });
  });

  it('ending two workouts at once keeps both ends', async () => {
    const { store } = freshLocal();
    const a = await store.startWorkout(aWorkout());
    const b = await store.startWorkout(aWorkout());
    await Promise.all([
      store.endWorkout(a.id, '2026-10-10T11:00:00.000Z'),
      store.endWorkout(b.id, '2026-10-10T12:00:00.000Z'),
    ]);
    expect(await store.activeWorkout()).toBeUndefined();
  });

  it('starting a workout again with an id that already exists does not reopen an ended workout', async () => {
    const { store, db } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    await store.endWorkout(w.id, '2026-10-10T11:00:00.000Z');
    await store.startWorkout({ id: w.id, gymId: null, startedAt: w.startedAt }).catch(() => null);
    expect((await db.workouts.get(w.id))?.endedAt).toBe('2026-10-10T11:00:00.000Z');
  });

  it('many workouts with the same startedAt are all kept, listed and picked deterministically', async () => {
    const { store } = freshLocal();
    const same = '2026-10-10T10:00:00.000Z';
    const made = [];
    for (let i = 0; i < 20; i++) {
      const w = await store.startWorkout(aWorkout({ startedAt: same }));
      await store.logSet(aSet(w.id));
      made.push(w);
    }
    const first = (await store.activeWorkout())?.id;
    expect(made.map((w) => w.id)).toContain(first);
    expect((await store.activeWorkout())?.id).toBe(first);
    expect(await store.outbox.dueWorkouts(0)).toHaveLength(20);
  });

  it.each([
    ['unicode in the id', { id: 'बेंच-💪-0000' }],
    ['an empty id', { id: '' }],
    ['an id that is not hex', { id: 'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz' }],
    ['a date without a time zone', { startedAt: '2026-10-10T10:00:00' }],
    ['a date-only start', { startedAt: '2026-10-10' }],
    ['a gym id that is a number', { gymId: 5 as unknown as string }],
  ])('refuses a workout with %s', async (_l, over) => {
    const { store, db } = freshLocal();
    await expect(store.startWorkout(aWorkout(over))).rejects.toThrow();
    expect(await db.workouts.count()).toBe(0);
  });
});

describe('sets', () => {
  it('a set can be logged twice with the same id and stays one row (double tap)', async () => {
    const { store, db } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    const input = aSet(w.id);
    await store.logSet(input);
    await store.logSet(input);
    expect(await db.sets.count()).toBe(1);
  });

  it('logging a set again with the id of a synced set does not lose the fact that it was sent', async () => {
    const { store, db } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    const input = aSet(w.id);
    const first = await store.logSet(input);
    await store.outbox.markSynced('set', [{ id: first.id, rev: first.rev }]);
    await store.logSet(input);
    // The server has this set, so it must not be removable offline: that would leave a ghost there.
    expect(await store.removeUnsyncedSet(input.id)).toBe('synced');
    expect(await db.sets.get(input.id)).toBeDefined();
  });

  it.each([
    [
      'NaN weight',
      { totalKg: Number.NaN, barKg: null, perSideKg: null, inputMode: 'total' as const },
    ],
    [
      'infinite weight',
      { totalKg: Infinity, barKg: null, perSideKg: null, inputMode: 'total' as const },
    ],
    ['a weight as a string', { totalKg: '60' as unknown as number }],
    ['reps as a string', { reps: '8' as unknown as number }],
    ['negative reps', { reps: -8 }],
    ['negative bar', { barKg: -20, totalKg: 20, perSideKg: 20 }],
    ['negative per-side', { perSideKg: -5, totalKg: 10 }],
    ['101 kg bar', { barKg: 101, totalKg: 301, perSideKg: 100 }],
    ['251 kg per side', { perSideKg: 251, totalKg: 522 }],
    ['an uppercase exercise id of the wrong shape', { exerciseId: '2C49D84C' }],
    ['a loggedAt without a zone', { loggedAt: '2026-10-10T10:05:00' }],
    ['transcript as a number', { rawTranscript: 5 as unknown as string }],
  ])('refuses a set with %s and stores nothing', async (_l, over) => {
    const { store, db } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    await expect(store.logSet(aSet(w.id, over))).rejects.toThrow();
    expect(await db.sets.count()).toBe(0);
  });

  it.each([
    ['Hinglish in Devanagari', 'बेंच प्रेस साठ किलो आठ रेप्स'],
    ['Hinglish in Latin', 'bench saath kilo aath reps'],
    ['exactly 500 ASCII characters', 'a'.repeat(500)],
    ['exactly 500 Devanagari characters', 'क'.repeat(500)],
    ['quotes, newlines and SQL', 'he said "60"\n\t\'; DROP TABLE sets;--'],
    ['an empty transcript', ''],
  ])('keeps a transcript with %s exactly as it was', async (_l, text) => {
    const { store } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    const s = await store.logSet(aSet(w.id, { rawTranscript: text, source: 'voice' }));
    expect((await store.listSets(w.id))[0]?.rawTranscript).toBe(text);
    expect(s.rawTranscript).toBe(text);
  });

  it('accepts 500 emoji, which the database counts as 500 characters', async () => {
    const { store } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    // Postgres char_length counts code points; a 500-character limit must not refuse these.
    await expect(
      store.logSet(aSet(w.id, { rawTranscript: '💪'.repeat(500), source: 'voice' })),
    ).resolves.toBeDefined();
  });

  it('refuses 501 Devanagari characters', async () => {
    const { store } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    await expect(store.logSet(aSet(w.id, { rawTranscript: 'क'.repeat(501) }))).rejects.toThrow();
  });

  it('refuses unicode in a set id', async () => {
    const { store } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    await expect(store.logSet(aSet(w.id, { id: '💪💪💪' }))).rejects.toThrow();
  });

  it('sets with the same loggedAt are all kept', async () => {
    const { store } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    for (let i = 0; i < 10; i++) await store.logSet(aSet(w.id));
    expect(await store.listSets(w.id)).toHaveLength(10);
  });

  it('orders sets by the moment they happened when timestamps carry different offsets', async () => {
    const { store } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    // 10:00+05:30 is 04:30Z, which is earlier than 05:00Z
    await store.logSet(aSet(w.id, { loggedAt: '2026-10-10T05:00:00.000Z', reps: 2 }));
    await store.logSet(aSet(w.id, { loggedAt: '2026-10-10T10:00:00.000+05:30', reps: 1 }));
    expect((await store.listSets(w.id)).map((s) => s.reps)).toEqual([1, 2]);
  });

  it('lastSetFor finds the latest set when one has an offset timestamp', async () => {
    const { store } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    await store.logSet(aSet(w.id, { loggedAt: '2026-10-10T05:00:00.000Z', reps: 2 }));
    await store.logSet(aSet(w.id, { loggedAt: '2026-10-10T10:00:00.000+05:30', reps: 1 }));
    expect((await store.lastSetFor(aSet(w.id).exerciseId))?.reps).toBe(2);
  });

  it('logging into an ended workout is still stored (the workout exists)', async () => {
    const { store } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    await store.endWorkout(w.id, '2026-10-10T11:00:00.000Z');
    await expect(store.logSet(aSet(w.id))).resolves.toBeDefined();
  });

  it('removing a failed set that never reached the server removes it', async () => {
    const { store, db } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    const s = await store.logSet(aSet(w.id));
    await db.sets.update(s.id, { syncStatus: 'failed' });
    expect(await store.removeUnsyncedSet(s.id)).toBe('removed');
  });

  it('a thousand sets can be logged and counted', async () => {
    const { store } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    await Promise.all(Array.from({ length: 1000 }, () => store.logSet(aSet(w.id))));
    expect(await store.counts()).toEqual({ pending: 1001, failed: 0 });
    expect(await store.listSets(w.id)).toHaveLength(1000);
  }, 30_000);

  it('retryFailed leaves pending and synced rows alone and counts sets and workouts', async () => {
    const { store, db } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    const a = await store.logSet(aSet(w.id));
    const b = await store.logSet(aSet(w.id));
    await db.sets.update(a.id, { syncStatus: 'failed', attempts: 9 });
    await db.sets.update(b.id, { syncStatus: 'synced' });
    await db.workouts.update(w.id, { syncStatus: 'failed' });
    expect(await store.retryFailed()).toBe(2);
    expect((await db.sets.get(b.id))?.syncStatus).toBe('synced');
  });
});
