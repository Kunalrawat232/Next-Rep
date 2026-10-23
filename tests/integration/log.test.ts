// The whole path on the hosted project: record on a device (fake IndexedDB), push with the real
// sync worker and the real Supabase remote, and read it back as the real users. Needs the two test
// users from docs/delivery/deployment.md. Run with `npm run test:integration`; skipped when not configured.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLogStore, openLocalDb } from '../../src/data/local';
import { createSupabaseLogRemote } from '../../src/data/remote/log';
import { createSyncWorker, pullHistory } from '../../src/data/sync';

const env = process.env;
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
const users = {
  a: { email: env.E2E_USER_A_EMAIL, password: env.E2E_USER_A_PASSWORD },
  b: { email: env.E2E_USER_B_EMAIL, password: env.E2E_USER_B_PASSWORD },
};
const configured = Boolean(
  url && key && users.a.email && users.a.password && users.b.email && users.b.password,
);

async function signedIn(who: 'a' | 'b') {
  const client = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: users[who].email!,
    password: users[who].password!,
  });
  if (error || !data.user)
    throw new Error(
      `Test user ${who.toUpperCase()} could not sign in (${error?.name ?? 'no user'})`,
    );
  return { client, id: data.user.id };
}

const BENCH = '2c49d84c-42d6-5729-8791-bdf87686998a';

describe.skipIf(!configured)('recording and syncing on the hosted project', () => {
  let a: { client: SupabaseClient; id: string };
  let b: { client: SupabaseClient; id: string };
  const wipe = async (client: SupabaseClient, id: string) =>
    void (await client.from('workouts').delete().eq('user_id', id));

  beforeAll(async () => {
    a = await signedIn('a');
    b = await signedIn('b');
    await wipe(a.client, a.id);
    await wipe(b.client, b.id);
  });

  afterAll(async () => {
    if (a) await wipe(a.client, a.id);
    if (b) await wipe(b.client, b.id);
  });

  const device = (userId: string, client: SupabaseClient) => {
    const db = openLocalDb(`it-${userId}-${crypto.randomUUID()}`, { indexedDB, IDBKeyRange });
    const store = createLogStore(db);
    const worker = createSyncWorker({ store, remote: createSupabaseLogRemote(client), userId });
    return { db, store, worker };
  };

  it('delivers a workout and its sets, and a second run changes nothing', async () => {
    const { store, worker } = device(a.id, a.client);
    const workoutId = crypto.randomUUID();
    await store.startWorkout({ id: workoutId, gymId: null, startedAt: new Date().toISOString() });
    const setIds = [crypto.randomUUID(), crypto.randomUUID()];
    for (const [i, id] of setIds.entries())
      await store.logSet({
        id,
        workoutId,
        exerciseId: BENCH,
        totalKg: 60,
        barKg: 20,
        perSideKg: 20,
        inputMode: 'per_side',
        reps: 8 + i,
        source: 'tap',
        rawTranscript: null,
        loggedAt: new Date(Date.now() + i * 1000).toISOString(),
      });
    const first = await worker.run();
    expect(first).toMatchObject({ pushedWorkouts: 1, pushedSets: 2, refused: 0, offline: false });
    const rows = await a.client
      .from('sets')
      .select('id, total_kg, bar_kg, per_side_kg, reps')
      .eq('workout_id', workoutId);
    expect(rows.error).toBeNull();
    expect(rows.data).toHaveLength(2);
    // numeric comes back as a number or a string depending on the setup; both must read as 60.
    for (const row of rows.data ?? []) expect(Number(row.total_kg)).toBe(60);
    const again = await worker.run();
    expect(again).toMatchObject({ pushedWorkouts: 0, pushedSets: 0 });
    expect(await store.counts()).toEqual({ pending: 0, failed: 0 });
  });

  it('sends the end time when a synced workout is ended', async () => {
    const { store, worker } = device(a.id, a.client);
    const id = crypto.randomUUID();
    await store.startWorkout({
      id,
      gymId: null,
      startedAt: new Date(Date.now() - 60_000).toISOString(),
    });
    // An empty workout is never sent (it is dropped on End), so this one needs a set to be synced.
    await store.logSet({
      id: crypto.randomUUID(),
      workoutId: id,
      exerciseId: BENCH,
      totalKg: 60,
      barKg: 20,
      perSideKg: 20,
      inputMode: 'per_side',
      reps: 8,
      source: 'tap',
      rawTranscript: null,
      loggedAt: new Date().toISOString(),
    });
    await worker.run();
    const endedAt = new Date().toISOString();
    await store.endWorkout(id, endedAt);
    await worker.run();
    const row = await a.client.from('workouts').select('ended_at').eq('id', id).single();
    expect(new Date(row.data!.ended_at as string).getTime()).toBe(new Date(endedAt).getTime());
  });

  it("keeps A's workouts away from B, and B cannot send a set into A's workout", async () => {
    expect((await b.client.from('workouts').select('id')).data).toEqual([]);
    const a1 = device(a.id, a.client);
    const workoutId = crypto.randomUUID();
    await a1.store.startWorkout({
      id: workoutId,
      gymId: null,
      startedAt: new Date().toISOString(),
    });
    await a1.worker.run();
    const intruder = device(b.id, b.client);
    // B's device holds a set that points at A's workout id; the server must refuse it.
    await intruder.store.startWorkout({
      id: crypto.randomUUID(),
      gymId: null,
      startedAt: new Date().toISOString(),
    });
    const direct = await createSupabaseLogRemote(b.client).upsertSets(b.id, [
      {
        id: crypto.randomUUID(),
        workoutId,
        exerciseId: BENCH,
        totalKg: 10,
        barKg: null,
        perSideKg: null,
        inputMode: 'total',
        reps: 1,
        source: 'tap',
        rawTranscript: null,
        loggedAt: new Date().toISOString(),
        syncStatus: 'pending',
        rev: 1,
        attempts: 0,
        nextAttemptAt: 0,
        lastError: null,
        lastAttemptAt: null,
      },
    ]);
    expect(direct.status).toBe('error');
  });

  it('soft-deletes a set online', async () => {
    const { store, worker } = device(a.id, a.client);
    const workoutId = crypto.randomUUID();
    const setId = crypto.randomUUID();
    await store.startWorkout({ id: workoutId, gymId: null, startedAt: new Date().toISOString() });
    await store.logSet({
      id: setId,
      workoutId,
      exerciseId: BENCH,
      totalKg: 40,
      barKg: null,
      perSideKg: null,
      inputMode: 'total',
      reps: 5,
      source: 'tap',
      rawTranscript: null,
      loggedAt: new Date().toISOString(),
    });
    await worker.run();
    const result = await createSupabaseLogRemote(a.client).softDeleteSet(
      setId,
      new Date().toISOString(),
    );
    expect(result.status).toBe('ok');
    const row = await a.client.from('sets').select('deleted_at').eq('id', setId).single();
    expect(row.data!.deleted_at).not.toBeNull();
  });

  it('brings a finished workout and its sets to a second, empty device, typed as the app expects', async () => {
    const first = device(a.id, a.client);
    const workoutId = crypto.randomUUID();
    await first.store.startWorkout({
      id: workoutId,
      gymId: null,
      startedAt: new Date(Date.now() - 3_600_000).toISOString(),
    });
    const setId = crypto.randomUUID();
    await first.store.logSet({
      id: setId,
      workoutId,
      exerciseId: BENCH,
      totalKg: 62.5,
      barKg: 20,
      perSideKg: 21.25,
      inputMode: 'per_side',
      reps: 6,
      source: 'tap',
      rawTranscript: null,
      loggedAt: new Date().toISOString(),
    });
    await first.store.endWorkout(workoutId, new Date().toISOString());
    await first.worker.run({ ignoreWait: true });

    const second = device(a.id, a.client);
    const remote = createSupabaseLogRemote(a.client);
    const outcome = await pullHistory({ store: second.store, remote, userId: a.id });
    expect(outcome.status).toBe('done');
    // Nothing was refused: the server's types (numbers, times with an offset) pass the shared schemas.
    expect(outcome).toMatchObject({ refused: 0 });
    const [pulled] = await second.store.listSets(workoutId);
    expect(pulled).toMatchObject({
      id: setId,
      totalKg: 62.5,
      barKg: 20,
      perSideKg: 21.25,
      syncStatus: 'synced',
    });
    expect(pulled!.loggedAt.endsWith('Z')).toBe(true);
    expect((await second.store.getWorkout(workoutId))?.endedAt).not.toBeNull();
  });

  it("never brings in another user's rows", async () => {
    const other = device(b.id, b.client);
    const outcome = await pullHistory({
      store: other.store,
      remote: createSupabaseLogRemote(b.client),
      userId: b.id,
    });
    expect(outcome.status).toBe('done');
    expect(await other.db.workouts.count()).toBe(0);
    expect(await other.db.sets.count()).toBe(0);
  });
});
