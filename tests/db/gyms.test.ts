// Verifies supabase/migrations/0002_gym_bar_kind.sql, and the gym rules the app relies on, in PGlite.
// Same stand-ins for Supabase as schema.test.ts. Tests share state and are intentionally ordered.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const G1 = 'cccccccc-0000-0000-0000-000000000001';
const G2 = 'cccccccc-0000-0000-0000-000000000002';

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

const addBar = (gym: string, name: string, kg: number, kind?: string, user = A) =>
  q(
    `insert into public.gym_bars (user_id, gym_id, name, weight_kg${kind ? ', kind' : ''})
     values ($1, $2, $3, $4${kind ? ', $5' : ''})`,
    kind ? [user, gym, name, kg, kind] : [user, gym, name, kg],
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
  await q(
    `insert into public.gyms (id, user_id, name, default_bar_kg, is_default) values ($1, $2, 'Home', 15, true)`,
    [G1, A],
  );
  await q(
    `insert into public.gyms (id, user_id, name, default_bar_kg) values ($1, $2, 'Office', 20)`,
    [G2, A],
  );
});

afterAll(async () => {
  await db.close();
});

describe('gym_bars.kind', () => {
  it("defaults to 'other'", async () => {
    await addBar(G1, 'Trap bar', 25);
    const r = await q(`select kind from public.gym_bars where name = 'Trap bar'`);
    expect((r.rows[0] as { kind: string }).kind).toBe('other');
  });

  it('rejects an unknown kind', async () => {
    await expect(addBar(G1, 'Weird', 10, 'barbell')).rejects.toThrow(/check/i);
  });

  it('allows one EZ bar and one Smith bar per gym', async () => {
    await addBar(G1, 'EZ bar', 7.5, 'ez_bar');
    await addBar(G1, 'Smith bar', 12, 'smith');
    await expect(addBar(G1, 'EZ bar 2', 8, 'ez_bar')).rejects.toThrow(/unique|duplicate/i);
    await expect(addBar(G1, 'Smith 2', 8, 'smith')).rejects.toThrow(/unique|duplicate/i);
  });

  it('allows the same kind in another gym and many other bars in one gym', async () => {
    await addBar(G2, 'EZ bar', 8, 'ez_bar');
    await addBar(G1, 'Axle bar', 20);
    await addBar(G1, 'Safety squat bar', 30);
  });

  it('rejects a duplicate bar name in a gym, ignoring case', async () => {
    await expect(addBar(G1, 'axle BAR', 21)).rejects.toThrow(/unique|duplicate/i);
  });

  it('still enforces the weight range', async () => {
    await expect(addBar(G2, 'Too heavy', 100.01)).rejects.toThrow(/check/i);
    await expect(addBar(G2, 'Negative', -1)).rejects.toThrow(/check/i);
    await addBar(G2, 'Empty', 0);
    await addBar(G2, 'Max', 100);
  });
});

describe('default gym', () => {
  it('lets only one gym per user be the default', async () => {
    await expect(q(`update public.gyms set is_default = true where id = $1`, [G2])).rejects.toThrow(
      /unique|duplicate/i,
    );
  });

  it('can be moved by clearing the old default first, then setting the new one', async () => {
    await q(`update public.gyms set is_default = false where id = $1`, [G1]);
    await q(`update public.gyms set is_default = true where id = $1`, [G2]);
    const r = await q(`select id from public.gyms where is_default and user_id = $1`, [A]);
    expect(r.rows).toEqual([{ id: G2 }]);
  });

  it('allows no default at all, which the app treats as the oldest gym', async () => {
    await q(`update public.gyms set is_default = false where user_id = $1`, [A]);
    const r = await q(`select count(*)::int as c from public.gyms where is_default`);
    expect((r.rows[0] as { c: number }).c).toBe(0);
  });

  it('lets two different users each have a default', async () => {
    await q(`update public.gyms set is_default = true where id = $1`, [G1]);
    await q(`insert into public.gyms (user_id, name, is_default) values ($1, 'B gym', true)`, [B]);
  });
});

describe('isolation of bars', () => {
  it("hides A's bars from B", async () => {
    const r = await as(B, () => q('select count(*)::int as c from public.gym_bars'));
    expect((r.rows[0] as { c: number }).c).toBe(0);
  });

  it("stops B adding a bar to A's gym, even under B's own user id", async () => {
    await expect(as(B, () => addBar(G1, 'Sneaky', 10, undefined, B))).rejects.toThrow();
  });

  it("stops B changing or deleting A's bars", async () => {
    await as(B, () => q(`update public.gym_bars set weight_kg = 1 where gym_id = $1`, [G1]));
    await as(B, () => q(`delete from public.gym_bars where gym_id = $1`, [G1]));
    const r = await q(`select count(*)::int as c from public.gym_bars where gym_id = $1`, [G1]);
    expect((r.rows[0] as { c: number }).c).toBeGreaterThan(0);
    const w = await q(`select count(*)::int as c from public.gym_bars where weight_kg = 1`);
    expect((w.rows[0] as { c: number }).c).toBe(0);
  });
});

describe('stronger isolation', () => {
  const C = '33333333-3333-3333-3333-333333333333';
  let barOfA = '';
  let gymOfB = '';

  beforeAll(async () => {
    const bar = await q(`select id from public.gym_bars where gym_id = $1 limit 1`, [G1]);
    barOfA = (bar.rows[0] as { id: string }).id;
    const gym = await q(`select id from public.gyms where user_id = $1 limit 1`, [B]);
    gymOfB = (gym.rows[0] as { id: string }).id;
  });

  it("stops B taking over A's bar by upserting its id", async () => {
    await expect(
      as(B, () =>
        q(
          `insert into public.gym_bars (id, user_id, gym_id, name, weight_kg)
           values ($1, $2, $3, 'mine now', 1)
           on conflict (id) do update set name = excluded.name, weight_kg = excluded.weight_kg`,
          [barOfA, B, gymOfB],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
    const r = await q(`select name from public.gym_bars where id = $1`, [barOfA]);
    expect((r.rows[0] as { name: string }).name).not.toBe('mine now');
  });

  it("stops B taking over A's gym by upserting its id", async () => {
    await expect(
      as(B, () =>
        q(
          `insert into public.gyms (id, user_id, name) values ($1, $2, 'taken')
           on conflict (id) do update set name = excluded.name`,
          [G1, B],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('stops B inserting a bar as user A, with the check on user_id', async () => {
    await expect(as(B, () => addBar(G1, 'Forged', 10, undefined, A))).rejects.toThrow(
      /row-level security/i,
    );
  });

  it("stops A putting a bar into B's gym, even as A, through the composite foreign key", async () => {
    await expect(as(A, () => addBar(gymOfB, 'Planted', 10, undefined, A))).rejects.toThrow(
      /foreign key/i,
    );
  });

  it("stops B moving one of B's bars into A's gym", async () => {
    await q(
      `insert into public.gym_bars (user_id, gym_id, name, weight_kg) values ($1, $2, 'B bar', 5)`,
      [B, gymOfB],
    );
    await expect(
      as(B, () => q(`update public.gym_bars set gym_id = $1 where name = 'B bar'`, [G1])),
    ).rejects.toThrow(/foreign key/i);
  });

  it("leaves A's gym in place when B tries to delete it, and B's statement changes 0 rows", async () => {
    const r = await as(B, () => q(`delete from public.gyms where id = $1 returning id`, [G1]));
    expect(r.rows).toHaveLength(0);
    const still = await q(`select count(*)::int as c from public.gyms where id = $1`, [G1]);
    expect((still.rows[0] as { c: number }).c).toBe(1);
  });

  it('gives the anon role no access to gyms or bars', async () => {
    await db.exec('set role anon');
    try {
      await expect(q('select * from public.gyms')).rejects.toThrow(/permission denied/i);
      await expect(q('select * from public.gym_bars')).rejects.toThrow(/permission denied/i);
    } finally {
      await db.exec('reset role');
    }
  });

  it('refuses a name made only of spaces, for gyms and bars', async () => {
    await expect(
      q(`insert into public.gyms (user_id, name) values ($1, '   ')`, [A]),
    ).rejects.toThrow(/check/i);
    await expect(addBar(G1, '  ', 10)).rejects.toThrow(/check/i);
  });

  it('shows why the default moves in two steps: a single-statement swap fails for some orders', async () => {
    await db.exec(`insert into auth.users values ('${C}')`);
    for (const [i, name] of ['c1', 'c2', 'c3'].entries())
      await q(`insert into public.gyms (user_id, name, is_default) values ($1, $2, $3)`, [
        C,
        name,
        i === 0,
      ]);
    const ids = (await q(`select id from public.gyms where user_id = $1`, [C])).rows as {
      id: string;
    }[];
    let failures = 0;
    for (const { id } of ids) {
      try {
        await q(`update public.gyms set is_default = (id = $1) where user_id = $2`, [id, C]);
      } catch {
        failures += 1;
      }
    }
    expect(failures).toBeGreaterThan(0);
  });
});

describe('deleting a gym', () => {
  it('removes its bars and leaves other gyms alone', async () => {
    await as(A, () => q(`delete from public.gyms where id = $1`, [G2]));
    const r = await q(`select count(*)::int as c from public.gym_bars where gym_id = $1`, [G2]);
    expect((r.rows[0] as { c: number }).c).toBe(0);
    const other = await q(`select count(*)::int as c from public.gym_bars where gym_id = $1`, [G1]);
    expect((other.rows[0] as { c: number }).c).toBeGreaterThan(0);
  });
});
