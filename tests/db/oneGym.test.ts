// Verifies supabase/migrations/0004_one_gym_per_user.sql in PGlite: users who have several gyms are cut down to
// one, and from then on the database allows only one. Same stand-ins for Supabase as schema.test.ts.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const A = '11111111-1111-1111-1111-111111111111'; // two gyms, one marked default
const B = '22222222-2222-2222-2222-222222222222'; // two gyms, none marked: the oldest stays
const C = '33333333-3333-3333-3333-333333333333'; // one gym already
const D = '44444444-4444-4444-4444-444444444444'; // no gym

const A_OLD = 'aaaaaaaa-0000-0000-0000-000000000001';
const A_DEFAULT = 'aaaaaaaa-0000-0000-0000-000000000002';
const B_OLD = 'bbbbbbbb-0000-0000-0000-000000000001';
const B_NEW = 'bbbbbbbb-0000-0000-0000-000000000002';
const C_ONLY = 'cccccccc-0000-0000-0000-000000000001';

let db: PGlite;
const q = (sql: string, params?: unknown[]) => db.query(sql, params);
const rows = async (sql: string, params?: unknown[]) =>
  (await q(sql, params)).rows as Record<string, unknown>[];

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
    insert into auth.users values ('${A}'), ('${B}'), ('${C}'), ('${D}');
  `);
  for (const file of ['0001_init', '0002_gym_bar_kind', '0003_exercise_muscle'])
    await db.exec(read(`supabase/migrations/${file}.sql`));

  // The world as it was before: several gyms for some users.
  const gym = (id: string, user: string, name: string, isDefault: boolean, created: string) =>
    q(
      `insert into public.gyms (id, user_id, name, default_bar_kg, is_default, created_at)
       values ($1, $2, $3, 20, $4, $5)`,
      [id, user, name, isDefault, created],
    );
  await gym(A_OLD, A, 'A old', false, '2026-10-01T10:00:00Z');
  await gym(A_DEFAULT, A, 'A default', true, '2026-10-05T10:00:00Z');
  await gym(B_OLD, B, 'B old', false, '2026-10-01T10:00:00Z');
  await gym(B_NEW, B, 'B new', false, '2026-10-05T10:00:00Z');
  await gym(C_ONLY, C, 'C', true, '2026-10-01T10:00:00Z');
  for (const [gymId, user, name] of [
    [A_OLD, A, 'EZ bar'],
    [A_DEFAULT, A, 'Trap bar'],
    [B_NEW, B, 'Smith bar'],
    [C_ONLY, C, 'EZ bar'],
  ])
    await q(
      `insert into public.gym_bars (user_id, gym_id, name, weight_kg) values ($1, $2, $3, 10)`,
      [user, gymId, name],
    );
  // A workout at each gym that is about to go, and one at the gym that stays.
  for (const [id, gymId, user] of [
    ['dddddddd-0000-0000-0000-000000000001', A_OLD, A],
    ['dddddddd-0000-0000-0000-000000000002', A_DEFAULT, A],
    ['dddddddd-0000-0000-0000-000000000003', B_NEW, B],
  ])
    await q(
      `insert into public.workouts (id, user_id, gym_id, started_at) values ($1, $2, $3, now())`,
      [id, user, gymId],
    );

  await db.exec(read('supabase/migrations/0004_one_gym_per_user.sql'));
});

afterAll(async () => {
  await db.close();
});

describe('0004 on existing data', () => {
  it('keeps the default gym, or the oldest when none is marked, and leaves a single gym alone', async () => {
    const kept = await rows(`select user_id, id from public.gyms order by user_id`);
    expect(kept).toEqual([
      { user_id: A, id: A_DEFAULT },
      { user_id: B, id: B_OLD },
      { user_id: C, id: C_ONLY },
    ]);
  });

  it('removes the bars of the gyms that went, and keeps those of the gyms that stayed', async () => {
    const bars = await rows(`select name, gym_id from public.gym_bars order by name`);
    expect(bars).toEqual([
      { name: 'EZ bar', gym_id: C_ONLY },
      { name: 'Trap bar', gym_id: A_DEFAULT },
    ]);
  });

  it('keeps every workout, and only clears the link to a gym that went', async () => {
    const workouts = await rows(`select id, gym_id from public.workouts order by id`);
    expect(workouts).toEqual([
      { id: 'dddddddd-0000-0000-0000-000000000001', gym_id: null },
      { id: 'dddddddd-0000-0000-0000-000000000002', gym_id: A_DEFAULT },
      { id: 'dddddddd-0000-0000-0000-000000000003', gym_id: null },
    ]);
  });

  it('drops the default flag and its index', async () => {
    const columns = await rows(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'gyms'`,
    );
    expect(columns.map((c) => c.column_name)).not.toContain('is_default');
    const indexes = await rows(`select indexname from pg_indexes where tablename = 'gyms'`);
    expect(indexes.map((i) => i.indexname)).not.toContain('gyms_one_default_per_user');
  });
});

describe('one gym per user from now on', () => {
  it('refuses a second gym for a user, whatever its id', async () => {
    await expect(
      q(`insert into public.gyms (user_id, default_bar_kg) values ($1, 20)`, [A]),
    ).rejects.toThrow(/gyms_one_per_user|duplicate key/);
  });

  it('refuses a second gym through the same upsert the app uses, with a new id', async () => {
    await expect(
      as(C, () =>
        q(
          `insert into public.gyms (id, user_id, default_bar_kg)
           values (gen_random_uuid(), $1, 25)
           on conflict (id) do update set default_bar_kg = excluded.default_bar_kg`,
          [C],
        ),
      ),
    ).rejects.toThrow(/gyms_one_per_user|duplicate key/);
  });

  it('lets a user who has none create one without a name, which takes the default', async () => {
    await as(D, () => q(`insert into public.gyms (user_id, default_bar_kg) values ($1, 15)`, [D]));
    const r = await rows(`select name, default_bar_kg from public.gyms where user_id = $1`, [D]);
    expect(r).toEqual([{ name: 'My gym', default_bar_kg: '15.00' }]);
  });

  it('still lets the app update the one gym by its id', async () => {
    await as(D, () => q(`update public.gyms set default_bar_kg = 20 where user_id = $1`, [D]));
    const r = await rows(`select default_bar_kg from public.gyms where user_id = $1`, [D]);
    expect(r).toEqual([{ default_bar_kg: '20.00' }]);
  });

  it('still keeps the gyms of different users apart', async () => {
    const seenByD = await as(D, () => rows(`select user_id from public.gyms`));
    expect(seenByD).toEqual([{ user_id: D }]);
  });

  it('still refuses a blank name', async () => {
    await expect(q(`update public.gyms set name = '   ' where user_id = $1`, [C])).rejects.toThrow(
      /gyms_name_not_blank|check/,
    );
  });
});
