// Verifies supabase/migrations/0001_init.sql and supabase/seed.sql in PGlite (Postgres in WASM).
// PGlite has no Supabase, so the `auth` schema, `auth.uid()` and the `anon`/`authenticated` roles
// are minimal stand-ins. This does not replace running the isolation suite against the hosted
// project (see docs/qa/test-plan.md). Tests share state and are intentionally ordered.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const curated = JSON.parse(read('src/domain/exercises.seed.json')) as {
  id: string;
  name: string;
}[];
const seed = [
  ...curated,
  ...(JSON.parse(read('src/domain/exercises.extended.json')) as { id: string; name: string }[]),
];

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const G1 = 'cccccccc-0000-0000-0000-000000000001';
const W_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const W_B = 'aaaaaaaa-0000-0000-0000-000000000002';
const S1 = 'bbbbbbbb-0000-0000-0000-000000000001';
const CUSTOM = 'dddddddd-0000-0000-0000-000000000001';
const BENCH = curated.find((e) => e.name === 'Barbell Bench Press')!.id;
const SQUATTED = curated[0]!;

let db: PGlite;

const q = (sql: string, params?: unknown[]) => db.query(sql, params);

async function as<T>(role: 'anon' | 'authenticated', uid: string | null, fn: () => Promise<T>) {
  await db.exec(
    `set role ${role}; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false)`,
  );
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}

const insertSet = (userId: string, workoutId: string, exerciseId: string, extra = '') =>
  q(
    `insert into public.sets (id, user_id, workout_id, exercise_id, total_kg, input_mode, reps, source, logged_at)
     values (gen_random_uuid(), $1, $2, $3, 10, 'total', 5, 'tap', now()) ${extra}`,
    [userId, workoutId, exerciseId],
  );

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
  await db.exec(read('supabase/migrations/0001_init.sql'));
  await db.exec(read('supabase/migrations/0002_gym_bar_kind.sql'));
  await db.exec(read('supabase/migrations/0003_exercise_muscle.sql'));
  await db.exec(read('supabase/migrations/0005_rate_limit_scopes.sql'));

  // A user squats a public seed id before the seed runs; the seed must reclaim it.
  await as('authenticated', A, () =>
    q(
      `insert into public.exercises (id, user_id, name, equipment_type, body_part)
       values ($1, $2, 'Squatted', 'machine', 'upper')`,
      [SQUATTED.id, A],
    ),
  );
  await db.exec(read('supabase/seed.sql'));
  await db.exec(read('supabase/seed.sql')); // must be idempotent
});

afterAll(async () => {
  await db.close();
});

describe('seed', () => {
  it('loads every seed exercise as global and re-runs idempotently', async () => {
    const r = await q('select count(*)::int as c from public.exercises where user_id is null');
    expect((r.rows[0] as { c: number }).c).toBe(seed.length);
  });

  it('reclaims a squatted seed id (user_id reset, name restored)', async () => {
    const r = await q('select user_id, name from public.exercises where id = $1', [SQUATTED.id]);
    expect(r.rows[0]).toEqual({ user_id: null, name: SQUATTED.name });
  });

  it('keeps global exercise names unique, case-insensitively', async () => {
    await expect(
      q(
        `insert into public.exercises (user_id, name, equipment_type, body_part) values (null, 'barbell bench press', 'barbell', 'upper')`,
      ),
    ).rejects.toThrow(/duplicate key/i);
  });
});

describe('user A owns data', () => {
  it('creates a profile, gym, workout and a per-side set', async () => {
    await as('authenticated', A, async () => {
      await q(`insert into public.profiles (id, display_name) values ($1, 'A')`, [A]);
      await q(
        `insert into public.gyms (id, user_id, name, default_bar_kg, is_default) values ($1, $2, 'Home', 15, true)`,
        [G1, A],
      );
      await q(
        `insert into public.workouts (id, user_id, gym_id, started_at) values ($1, $2, $3, now())`,
        [W_A, A, G1],
      );
      await q(
        `insert into public.sets (id, user_id, workout_id, exercise_id, total_kg, bar_kg, per_side_kg, input_mode, reps, source, logged_at)
         values ($1, $2, $3, $4, 60, 15, 22.5, 'per_side', 8, 'voice', now())`,
        [S1, A, W_A, BENCH],
      );
    });
  });

  it('sees all global exercises', async () => {
    const r = await as('authenticated', A, () =>
      q('select count(*)::int as c from public.exercises'),
    );
    expect((r.rows[0] as { c: number }).c).toBe(seed.length);
  });

  it('upserts the same set id in place (idempotent sync), updating the breakdown with the total', async () => {
    await as('authenticated', A, () =>
      q(
        `insert into public.sets as s (id, user_id, workout_id, exercise_id, total_kg, input_mode, reps, source, logged_at)
         values ($1, $2, $3, $4, 62.5, 'total', 8, 'tap', now())
         on conflict (id) do update set total_kg = excluded.total_kg, bar_kg = excluded.bar_kg,
           per_side_kg = excluded.per_side_kg, input_mode = excluded.input_mode`,
        [S1, A, W_A, BENCH],
      ),
    );
    const r = await q('select total_kg::float as t from public.sets where id = $1', [S1]);
    expect((r.rows[0] as { t: number }).t).toBe(62.5);
  });

  it('rejects editing the total alone, because it must equal bar + 2 x per side', async () => {
    await expect(
      as('authenticated', A, () =>
        q(`update public.sets set total_kg = 70, bar_kg = 15, per_side_kg = 22.5 where id = $1`, [
          S1,
        ]),
      ),
    ).rejects.toThrow(/check constraint/i);
  });

  it('creates a custom exercise', async () => {
    await as('authenticated', A, () =>
      q(
        `insert into public.exercises (id, user_id, name, equipment_type, body_part) values ($1, $2, 'My Custom Lift', 'machine', 'upper')`,
        [CUSTOM, A],
      ),
    );
  });

  it('cannot create, update or delete global exercises', async () => {
    await expect(
      as('authenticated', A, () =>
        q(
          `insert into public.exercises (name, equipment_type, body_part, user_id) values ('Sneaky Global', 'barbell', 'upper', null)`,
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
    const upd = await as('authenticated', A, () =>
      q(`update public.exercises set name = 'Hacked' where user_id is null`),
    );
    const del = await as('authenticated', A, () =>
      q(`delete from public.exercises where user_id is null`),
    );
    expect(upd.affectedRows).toBe(0);
    expect(del.affectedRows).toBe(0);
  });
});

describe('user B cannot reach user A', () => {
  it.each(['profiles', 'gyms', 'workouts', 'sets'])('sees no rows of A in %s', async (table) => {
    const r = await as('authenticated', B, () =>
      q(`select count(*)::int as c from public.${table}`),
    );
    expect((r.rows[0] as { c: number }).c).toBe(0);
  });

  it("sees global exercises but not A's custom one", async () => {
    const r = await as('authenticated', B, () =>
      q('select count(*)::int as c from public.exercises'),
    );
    expect((r.rows[0] as { c: number }).c).toBe(seed.length);
  });

  it('cannot insert rows as A', async () => {
    await expect(
      as('authenticated', B, () =>
        q(`insert into public.gyms (user_id, name) values ($1, 'x')`, [A]),
      ),
    ).rejects.toThrow(/row-level security/i);
    await expect(as('authenticated', B, () => insertSet(A, W_A, BENCH))).rejects.toThrow(
      /row-level security/i,
    );
  });

  it("cannot update or delete A's rows (0 rows affected)", async () => {
    const up = await as('authenticated', B, () =>
      q(`update public.gyms set name = 'pwned' where id = $1`, [G1]),
    );
    const del = await as('authenticated', B, () =>
      q('delete from public.sets where id = $1', [S1]),
    );
    expect(up.affectedRows).toBe(0);
    expect(del.affectedRows).toBe(0);
  });

  it("cannot upsert over A's set id", async () => {
    await expect(
      as('authenticated', B, () =>
        q(
          `insert into public.sets (id, user_id, workout_id, exercise_id, total_kg, input_mode, reps, source, logged_at)
           values ($1, $2, $3, $4, 1, 'total', 1, 'tap', now()) on conflict (id) do update set total_kg = 1`,
          [S1, B, W_A, BENCH],
        ),
      ),
    ).rejects.toThrow();
  });

  it("cannot attach own rows to A's gym or workout (composite foreign keys)", async () => {
    await expect(
      as('authenticated', B, () =>
        q(
          `insert into public.workouts (id, user_id, gym_id, started_at) values (gen_random_uuid(), $1, $2, now())`,
          [B, G1],
        ),
      ),
    ).rejects.toThrow(/foreign key/i);
    await expect(as('authenticated', B, () => insertSet(B, W_A, BENCH))).rejects.toThrow(
      /foreign key/i,
    );
  });

  it("cannot log a set against A's custom exercise (visibility trigger)", async () => {
    await as('authenticated', B, () =>
      q(`insert into public.workouts (id, user_id, started_at) values ($1, $2, now())`, [W_B, B]),
    );
    await expect(as('authenticated', B, () => insertSet(B, W_B, CUSTOM))).rejects.toThrow(
      /not available/i,
    );
  });

  it('can log a set against a global exercise in own workout', async () => {
    await as('authenticated', B, () => insertSet(B, W_B, BENCH));
  });

  it('cannot reassign own set to A (WITH CHECK)', async () => {
    await expect(
      as('authenticated', B, () =>
        q('update public.sets set user_id = $1 where user_id = $2', [A, B]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('anonymous and signed-out access', () => {
  it.each(['sets', 'exercises', 'profiles'])('anon cannot read %s', async (table) => {
    await expect(as('anon', null, () => q(`select * from public.${table}`))).rejects.toThrow(
      /permission denied/i,
    );
  });
});

describe('rate limit function', () => {
  it('counts calls per user and window (1, 2, 3), independently per user', async () => {
    const counts: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await as('authenticated', A, () => q('select public.consume_rate_limit(60) as c'));
      counts.push((r.rows[0] as { c: number }).c);
    }
    expect(counts).toEqual([1, 2, 3]);
    const b = await as('authenticated', B, () => q('select public.consume_rate_limit(60) as c'));
    expect((b.rows[0] as { c: number }).c).toBe(1);
  });

  it('keeps the counter table closed to clients', async () => {
    await expect(
      as('authenticated', A, () => q('select * from public.api_rate_limits')),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      as('authenticated', A, () =>
        q('insert into public.api_rate_limits values ($1, now(), 0)', [A]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('rejects an invalid window, signed-out callers and anon', async () => {
    await expect(
      as('authenticated', A, () => q('select public.consume_rate_limit(0)')),
    ).rejects.toThrow(/invalid window/i);
    await expect(
      as('authenticated', null, () => q('select public.consume_rate_limit(60)')),
    ).rejects.toThrow(/not authenticated/i);
    await expect(as('anon', null, () => q('select public.consume_rate_limit(60)'))).rejects.toThrow(
      /permission denied/i,
    );
  });
});

describe('check constraints', () => {
  const ins = (cols: string, vals: string) =>
    as('authenticated', A, () =>
      q(
        `insert into public.sets (id, user_id, workout_id, exercise_id, logged_at, source, ${cols})
         values (gen_random_uuid(), $1, $2, $3, now(), 'tap', ${vals})`,
        [A, W_A, BENCH],
      ),
    );

  it.each([
    ['reps = 0', 'total_kg, input_mode, reps', `50, 'total', 0`],
    ['reps = 101', 'total_kg, input_mode, reps', `50, 'total', 101`],
    ['total_kg = 501', 'total_kg, input_mode, reps', `501, 'total', 5`],
    ['negative weight', 'total_kg, input_mode, reps', `-1, 'total', 5`],
    [
      'per_side mode without bar and per-side weight',
      'total_kg, input_mode, reps',
      `60, 'per_side', 5`,
    ],
    [
      'total inconsistent with bar + 2 x per side',
      'total_kg, bar_kg, per_side_kg, input_mode, reps',
      `61, 15, 22.5, 'per_side', 5`,
    ],
  ])('rejects a set with %s', async (_name, cols, vals) => {
    await expect(ins(cols, vals)).rejects.toThrow(/check constraint/i);
  });

  it('rejects an unknown source', async () => {
    await expect(
      as('authenticated', A, () =>
        q(
          `insert into public.sets (id, user_id, workout_id, exercise_id, logged_at, source, total_kg, input_mode, reps)
           values (gen_random_uuid(), $1, $2, $3, now(), 'telepathy', 50, 'total', 5)`,
          [A, W_A, BENCH],
        ),
      ),
    ).rejects.toThrow(/check constraint/i);
  });

  it('allows one default gym per user only', async () => {
    await expect(
      as('authenticated', A, () =>
        q(`insert into public.gyms (user_id, name, is_default) values ($1, 'Office', true)`, [A]),
      ),
    ).rejects.toThrow(/duplicate key/i);
  });

  it('keeps exercise names unique per user, case-insensitively', async () => {
    await expect(
      as('authenticated', A, () =>
        q(
          `insert into public.exercises (user_id, name, equipment_type, body_part) values ($1, 'my custom lift', 'cable', 'upper')`,
          [A],
        ),
      ),
    ).rejects.toThrow(/duplicate key/i);
  });

  it('rejects a workout that ends before it starts', async () => {
    await expect(
      as('authenticated', A, () =>
        q(
          `insert into public.workouts (id, user_id, started_at, ended_at) values (gen_random_uuid(), $1, now(), now() - interval '1 hour')`,
          [A],
        ),
      ),
    ).rejects.toThrow(/check constraint/i);
  });
});

describe('row level security coverage', () => {
  it('is enabled on every table in the public schema', async () => {
    const r = await q(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(r.rows).toEqual([]);
  });
});
