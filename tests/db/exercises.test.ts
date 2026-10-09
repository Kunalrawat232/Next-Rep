// Verifies migration 0003 (exercises.muscle), the seed, and who can see or change which exercises.
// Same Supabase stand-ins as schema.test.ts. Tests share state and are intentionally ordered.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MUSCLES } from '../../src/domain/exercises/muscles';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
type Row = { id: string; name: string; equipmentType: string; bodyPart: string; muscle: string };
const curated = JSON.parse(read('src/domain/exercises.seed.json')) as Row[];
const extended = JSON.parse(read('src/domain/exercises.extended.json')) as Row[];

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const MINE = 'eeeeeeee-0000-0000-0000-000000000001';

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

const insertCustom = (id: string, user: string, name: string, muscle: string | null = null) =>
  q(
    `insert into public.exercises (id, user_id, name, equipment_type, body_part, muscle)
     values ($1, $2, $3, 'dumbbell', 'upper', $4)`,
    [id, user, name, muscle],
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
  for (const file of ['0001_init', '0002_gym_bar_kind', '0003_exercise_muscle'])
    await db.exec(read(`supabase/migrations/${file}.sql`));
  await db.exec(read('supabase/seed.sql'));
});

afterAll(async () => {
  await db.close();
});

describe('exercises.muscle', () => {
  it('accepts every muscle in the app list, and nothing else', async () => {
    for (const [i, muscle] of MUSCLES.entries())
      await insertCustom(
        `eeeeeeee-1111-0000-0000-${String(i).padStart(12, '0')}`,
        A,
        `Muscle test ${muscle}`,
        muscle,
      );
    await expect(insertCustom(MINE, A, 'Bad muscle', 'wings')).rejects.toThrow(/check/i);
  });

  it('keeps the SQL check and the app list in step', () => {
    const sql = read('supabase/migrations/0003_exercise_muscle.sql');
    const inSql = [...sql.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(inSql.sort()).toEqual([...MUSCLES].sort());
  });

  it('is optional, for a custom exercise', async () => {
    await insertCustom(MINE, A, 'No muscle given');
    const r = await q('select muscle from public.exercises where id = $1', [MINE]);
    expect((r.rows[0] as { muscle: string | null }).muscle).toBeNull();
  });
});

describe('seed', () => {
  it('loads the curated and the imported exercises, each with a muscle', async () => {
    const r = await q(
      'select count(*)::int as c, count(muscle)::int as m from public.exercises where user_id is null',
    );
    expect(r.rows[0]).toEqual({
      c: curated.length + extended.length,
      m: curated.length + extended.length,
    });
  });

  it('keeps ids stable, so a re-run changes nothing', async () => {
    await db.exec(read('supabase/seed.sql'));
    const r = await q('select count(*)::int as c from public.exercises where user_id is null');
    expect((r.rows[0] as { c: number }).c).toBe(curated.length + extended.length);
  });

  it('has no imported exercise whose name clashes with a curated one, ignoring case', () => {
    const names = new Set(curated.map((e) => e.name.toLowerCase()));
    expect(extended.filter((e) => names.has(e.name.toLowerCase()))).toEqual([]);
  });

  it('maps every imported exercise to an equipment type the weight rules know', () => {
    const known = new Set([
      'barbell',
      'ez_bar',
      'smith',
      'dumbbell',
      'machine',
      'cable',
      'bodyweight',
    ]);
    expect(extended.filter((e) => !known.has(e.equipmentType))).toEqual([]);
  });
});

describe('who can see and change exercises', () => {
  it('lets everyone read the global exercises', async () => {
    const r = await as(B, () =>
      q('select count(*)::int as c from public.exercises where user_id is null'),
    );
    expect((r.rows[0] as { c: number }).c).toBe(curated.length + extended.length);
  });

  it("hides A's custom exercises from B", async () => {
    const r = await as(B, () =>
      q('select count(*)::int as c from public.exercises where user_id is not null'),
    );
    expect((r.rows[0] as { c: number }).c).toBe(0);
  });

  it('stops a user adding a global exercise, or taking one over by id', async () => {
    await expect(
      as(A, () =>
        insertCustom('eeeeeeee-2222-0000-0000-000000000001', null as never, 'Fake global'),
      ),
    ).rejects.toThrow();
    const global = (await q('select id from public.exercises where user_id is null limit 1'))
      .rows[0] as { id: string };
    await expect(
      as(B, () =>
        q(
          `insert into public.exercises (id, user_id, name, equipment_type, body_part)
           values ($1, $2, 'Taken over', 'dumbbell', 'upper')
           on conflict (id) do update set name = excluded.name`,
          [global.id, B],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
    const r = await q('select name from public.exercises where id = $1', [global.id]);
    expect((r.rows[0] as { name: string }).name).not.toBe('Taken over');
  });

  it('refuses a second custom exercise with the same name for the same owner', async () => {
    await expect(
      insertCustom('eeeeeeee-3333-0000-0000-000000000001', A, 'No muscle given'),
    ).rejects.toThrow(/unique|duplicate/i);
  });
});
