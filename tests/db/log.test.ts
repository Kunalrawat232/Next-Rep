// What the sync worker relies on in the database: idempotent upserts by id, a workout before its
// sets, soft delete that a re-send cannot undo, and no reaching into another user's rows.
// Same Supabase stand-ins as schema.test.ts. Tests share state and are intentionally ordered.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const W1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const W2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const S1 = 'bbbbbbbb-0000-4000-8000-000000000001';
const S2 = 'bbbbbbbb-0000-4000-8000-000000000002';
const BENCH = '2c49d84c-42d6-5729-8791-bdf87686998a';

let db: PGlite;
const q = (sql: string, params?: unknown[]) => db.query(sql, params);

async function as<T>(uid: string, fn: () => Promise<T>) {
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false)`,
  );
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}

// The same statements PostgREST runs for the worker's upserts.
const upsertWorkout = (user: string, id: string, endedAt: string | null = null) =>
  q(
    `insert into public.workouts (id, user_id, gym_id, started_at, ended_at, notes)
     values ($1, $2, null, '2026-10-10T10:00:00Z', $3, null)
     on conflict (id) do update set user_id = excluded.user_id, gym_id = excluded.gym_id,
       started_at = excluded.started_at, ended_at = excluded.ended_at, notes = excluded.notes`,
    [id, user, endedAt],
  );

const upsertSet = (
  user: string,
  id: string,
  workout: string,
  over: {
    total?: number;
    bar?: number | null;
    side?: number | null;
    mode?: string;
    reps?: number;
  } = {},
) =>
  q(
    `insert into public.sets (id, user_id, workout_id, exercise_id, total_kg, bar_kg, per_side_kg, input_mode, reps, source, raw_transcript, logged_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'tap', null, '2026-10-10T10:05:00Z')
     on conflict (id) do update set user_id = excluded.user_id, workout_id = excluded.workout_id,
       exercise_id = excluded.exercise_id, total_kg = excluded.total_kg, bar_kg = excluded.bar_kg,
       per_side_kg = excluded.per_side_kg, input_mode = excluded.input_mode, reps = excluded.reps,
       source = excluded.source, raw_transcript = excluded.raw_transcript, logged_at = excluded.logged_at`,
    [
      id,
      user,
      workout,
      BENCH,
      over.total ?? 60,
      over.bar === undefined ? 20 : over.bar,
      over.side === undefined ? 20 : over.side,
      over.mode ?? 'per_side',
      over.reps ?? 8,
    ],
  );

const count = async (sql: string, params?: unknown[]) =>
  ((await q(sql, params)).rows[0] as { c: number }).c;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    grant usage on schema public to anon, authenticated;
    create schema auth;
    grant usage on schema auth to anon, authenticated;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant execute on function auth.uid() to anon, authenticated;
    insert into auth.users values ('${A}'), ('${B}');
  `);
  for (const file of ['0001_init', '0002_gym_bar_kind', '0003_exercise_muscle'])
    await db.exec(read(`supabase/migrations/${file}.sql`));
  await db.exec(read('supabase/seed.sql'));
});

afterAll(async () => {
  await db.close();
});

describe('idempotent upserts', () => {
  it('stores a workout and its set, and a second identical send changes nothing', async () => {
    await as(A, () => upsertWorkout(A, W1));
    await as(A, () => upsertSet(A, S1, W1));
    await as(A, () => upsertWorkout(A, W1));
    await as(A, () => upsertSet(A, S1, W1));
    expect(await count('select count(*)::int as c from public.workouts where id = $1', [W1])).toBe(
      1,
    );
    expect(await count('select count(*)::int as c from public.sets where id = $1', [S1])).toBe(1);
  });

  it('applies the end time when the workout is sent again after being ended', async () => {
    await as(A, () => upsertWorkout(A, W1, '2026-10-10T11:00:00Z'));
    const r = await q('select ended_at from public.workouts where id = $1', [W1]);
    expect(new Date((r.rows[0] as { ended_at: string }).ended_at).toISOString()).toBe(
      '2026-10-10T11:00:00.000Z',
    );
  });

  it('sends several rows in one statement', async () => {
    await as(A, () => upsertWorkout(A, W2));
    await as(A, () =>
      q(
        `insert into public.sets (id, user_id, workout_id, exercise_id, total_kg, input_mode, reps, source, logged_at)
         values ($1, $3, $4, $5, 40, 'total', 5, 'tap', now()), ($2, $3, $4, $5, 50, 'total', 5, 'tap', now())
         on conflict (id) do nothing`,
        [S2, 'bbbbbbbb-0000-4000-8000-000000000003', A, W2, BENCH],
      ),
    );
    expect(
      await count('select count(*)::int as c from public.sets where workout_id = $1', [W2]),
    ).toBe(2);
  });
});

describe('order: the workout goes first', () => {
  it('refuses a set whose workout is not there yet, which is why the worker sends workouts first', async () => {
    await expect(
      as(A, () =>
        upsertSet(
          A,
          'bbbbbbbb-0000-4000-8000-0000000000ff',
          'aaaaaaaa-0000-4000-8000-0000000000ff',
        ),
      ),
    ).rejects.toThrow(/foreign key/i);
  });

  it('refuses one bad row in a batch as a whole, which is why the worker then sends rows one by one', async () => {
    await expect(
      as(A, () =>
        q(
          `insert into public.sets (id, user_id, workout_id, exercise_id, total_kg, input_mode, reps, source, logged_at)
           values ('bbbbbbbb-0000-4000-8000-0000000000a1', $1, $2, $3, 40, 'total', 5, 'tap', now()),
                  ('bbbbbbbb-0000-4000-8000-0000000000a2', $1, $2, $3, 40, 'total', 0, 'tap', now())`,
          [A, W1, BENCH],
        ),
      ),
    ).rejects.toThrow(/check/i);
    expect(
      await count(
        `select count(*)::int as c from public.sets where id = 'bbbbbbbb-0000-4000-8000-0000000000a1'`,
      ),
    ).toBe(0);
  });
});

describe('what the database refuses, as a second line behind the app', () => {
  it.each([
    ['0 reps', { reps: 0 }],
    ['101 reps', { reps: 101 }],
    ['a total that is not bar plus two sides', { total: 61 }],
    ['per-side input without a bar', { bar: null }],
    ['501 kg', { total: 501, bar: null, side: null, mode: 'total' }],
  ])('refuses a set with %s', async (_label, over) => {
    await expect(
      as(A, () => upsertSet(A, 'bbbbbbbb-0000-4000-8000-0000000000b1', W1, over)),
    ).rejects.toThrow(/check/i);
  });
});

describe('soft delete', () => {
  it('marks a set deleted, and a re-send of the set does not undelete it', async () => {
    await as(A, () =>
      q(`update public.sets set deleted_at = '2026-10-10T12:00:00Z' where id = $1`, [S1]),
    );
    await as(A, () => upsertSet(A, S1, W1));
    const r = await q('select deleted_at from public.sets where id = $1', [S1]);
    expect((r.rows[0] as { deleted_at: string | null }).deleted_at).not.toBeNull();
  });
});

describe('another user', () => {
  it("cannot read A's workouts or sets", async () => {
    expect(await as(B, () => count('select count(*)::int as c from public.workouts'))).toBe(0);
    expect(await as(B, () => count('select count(*)::int as c from public.sets'))).toBe(0);
  });

  it("cannot take over A's workout or set by upserting its id", async () => {
    await expect(as(B, () => upsertWorkout(B, W1))).rejects.toThrow(/row-level security/i);
    await expect(as(B, () => upsertSet(B, S2, W2))).rejects.toThrow(
      /row-level security|foreign key/i,
    );
  });

  it("cannot put a set into A's workout, even as B", async () => {
    await expect(
      as(B, () => upsertSet(B, 'bbbbbbbb-0000-4000-8000-0000000000c1', W1)),
    ).rejects.toThrow(/foreign key/i);
  });

  it("cannot soft-delete A's set", async () => {
    await as(B, () => q(`update public.sets set deleted_at = now() where id = $1`, [S2]));
    const r = await q('select deleted_at from public.sets where id = $1', [S2]);
    expect((r.rows[0] as { deleted_at: string | null }).deleted_at).toBeNull();
  });

  it('cannot send rows as user A', async () => {
    await expect(
      as(B, () => upsertWorkout(A, 'aaaaaaaa-0000-4000-8000-0000000000d1')),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe("more ways to reach another user's data", () => {
  const WB = 'aaaaaaaa-0000-4000-8000-0000000000b1';

  it("cannot hand one of A's own rows to B by changing user_id in an upsert", async () => {
    await expect(
      as(A, () =>
        q(
          `insert into public.workouts (id, user_id, started_at) values ($1, $2, now())
           on conflict (id) do update set user_id = excluded.user_id`,
          [W1, B],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
    const r = await q('select user_id from public.workouts where id = $1', [W1]);
    expect((r.rows[0] as { user_id: string }).user_id).toBe(A);
  });

  it("cannot point A's own set at B's workout", async () => {
    await as(B, () => upsertWorkout(B, WB));
    await expect(
      as(A, () => upsertSet(A, 'bbbbbbbb-0000-4000-8000-0000000000e1', WB)),
    ).rejects.toThrow(/foreign key/i);
  });

  it("cannot move A's existing set into B's workout through an upsert", async () => {
    await expect(as(A, () => upsertSet(A, S2, WB))).rejects.toThrow(/foreign key/i);
    const r = await q('select workout_id from public.sets where id = $1', [S2]);
    expect((r.rows[0] as { workout_id: string }).workout_id).toBe(W2);
  });

  it('gives the anon role no access to workouts or sets', async () => {
    await db.exec('set role anon');
    try {
      await expect(q('select * from public.workouts')).rejects.toThrow(/permission denied/i);
      await expect(q('select * from public.sets')).rejects.toThrow(/permission denied/i);
      await expect(
        q(
          `insert into public.workouts (id, user_id, started_at) values (gen_random_uuid(), '${A}', now())`,
        ),
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await db.exec('reset role');
    }
  });

  it('keeps a good row of a batch out when another row of the same statement is bad (all or nothing)', async () => {
    await expect(
      as(A, () =>
        q(
          `insert into public.sets (id, user_id, workout_id, exercise_id, total_kg, input_mode, reps, source, logged_at)
           values ('bbbbbbbb-0000-4000-8000-0000000000f1', $1, $2, $3, 40, 'total', 5, 'tap', now()),
                  ('bbbbbbbb-0000-4000-8000-0000000000f2', $1, $4, $3, 40, 'total', 5, 'tap', now())`,
          [A, W1, BENCH, WB],
        ),
      ),
    ).rejects.toThrow(/foreign key/i);
    expect(
      await count(
        `select count(*)::int as c from public.sets where id = 'bbbbbbbb-0000-4000-8000-0000000000f1'`,
      ),
    ).toBe(0);
  });
});

describe('what the history pull reads', () => {
  const PW = (n: number) => `cccccccc-0000-4000-8000-00000000000${n}`;
  const PS = (n: number) => `dddddddd-0000-4000-8000-00000000000${n}`;
  // The statements PostgREST runs for fetchWorkouts and fetchSets, with the same filters and order.
  const pullWorkouts = (user: string, from: number, size: number) =>
    q(
      `select id, started_at, ended_at from public.workouts
       where user_id = $1 and deleted_at is null and ended_at is not null and id::text like 'cccccccc%'
       order by started_at, id offset $2 limit $3`,
      [user, from, size],
    );
  const pullSets = (user: string, from: number, size: number) =>
    q(
      `select id from public.sets
       where user_id = $1 and deleted_at is null and id::text like 'dddddddd%'
       order by created_at, id offset $2 limit $3`,
      [user, from, size],
    );

  it("lists a user's finished, not deleted workouts oldest first, and pages without gaps", async () => {
    await upsertWorkout(A, PW(1), '2026-10-10T11:00:00Z');
    await upsertWorkout(A, PW(2), '2026-10-10T11:00:00Z');
    await upsertWorkout(A, PW(3)); // still open
    await upsertWorkout(A, PW(4), '2026-10-10T11:00:00Z');
    await q(`update public.workouts set deleted_at = now() where id = $1`, [PW(4)]);
    const all = (await as(A, () => pullWorkouts(A, 0, 10))).rows as { id: string }[];
    expect(all.map((r) => r.id)).toEqual([PW(1), PW(2)]);
    const first = (await as(A, () => pullWorkouts(A, 0, 1))).rows as { id: string }[];
    const second = (await as(A, () => pullWorkouts(A, 1, 1))).rows as { id: string }[];
    expect([...first, ...second].map((r) => r.id)).toEqual([PW(1), PW(2)]);
  });

  it('lists sets that are not deleted, in the order the server received them', async () => {
    await upsertSet(A, PS(1), PW(1));
    await upsertSet(A, PS(2), PW(1));
    await upsertSet(A, PS(3), PW(2));
    await q(`update public.sets set deleted_at = now() where id = $1`, [PS(2)]);
    const rows = (await as(A, () => pullSets(A, 0, 10))).rows as { id: string }[];
    expect(rows.map((r) => r.id)).toEqual([PS(1), PS(3)]);
  });

  it("does not show another user's rows, even when asked for them by id", async () => {
    expect((await as(B, () => pullWorkouts(A, 0, 10))).rows).toHaveLength(0);
    expect((await as(B, () => pullSets(A, 0, 10))).rows).toHaveLength(0);
  });

  it('shows nothing to the anon role', async () => {
    await db.exec(`set role anon`);
    try {
      await expect(pullWorkouts(A, 0, 10)).rejects.toThrow(/permission denied/i);
    } finally {
      await db.exec('reset role');
    }
  });
});
