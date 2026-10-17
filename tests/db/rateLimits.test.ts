// Verifies supabase/migrations/0005_rate_limit_scopes.sql in PGlite: counters per endpoint and per window, the
// one-argument function kept for an older /api/parse, and the daily ceiling for model calls. Same stand-ins for
// Supabase as schema.test.ts.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

let db: PGlite;
const q = (sql: string, params?: unknown[]) => db.query(sql, params);

async function as<T>(uid: string | null, fn: () => Promise<T>, role = 'authenticated') {
  await db.exec(
    `set role ${role}; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false)`,
  );
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}
const count = async (uid: string, sql: string) =>
  ((await as(uid, () => q(sql))).rows[0] as { c: number | boolean }).c;

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
  // A counter from before the migration, in the old shape.
  await q('insert into public.api_rate_limits values ($1, now(), 7)', [A]);
  for (const file of ['0002_gym_bar_kind', '0003_exercise_muscle', '0005_rate_limit_scopes'])
    await db.exec(read(`supabase/migrations/${file}.sql`));
});
afterAll(async () => {
  await db.close();
});

describe('counters per endpoint and window', () => {
  it('drops the counters of the old shape, which were short-lived numbers', async () => {
    const r = await q('select count(*)::int as n from public.api_rate_limits');
    expect((r.rows[0] as { n: number }).n).toBe(0);
  });

  it('counts each endpoint on its own', async () => {
    const coach = "select public.consume_rate_limit('coach', 60) as c";
    const parse = "select public.consume_rate_limit('parse', 60) as c";
    expect([await count(A, coach), await count(A, coach), await count(A, parse)]).toEqual([
      1, 2, 1,
    ]);
  });

  it('keeps the minute and the hour apart, even when both start at the same moment', async () => {
    await q(
      "insert into public.api_rate_limits (user_id, scope, window_seconds, window_start, request_count) values ($1, 'x', 60, '2026-10-17T10:00:00Z', 1), ($1, 'x', 3600, '2026-10-17T10:00:00Z', 1)",
      [B],
    );
    const r = await q('select count(*)::int as n from public.api_rate_limits where user_id = $1', [
      B,
    ]);
    expect((r.rows[0] as { n: number }).n).toBe(2);
  });

  it('counts the one-argument call as /api/parse, so an older deployment keeps working', async () => {
    const old = 'select public.consume_rate_limit(60) as c';
    const parse = "select public.consume_rate_limit('parse', 60) as c";
    expect(await count(B, old)).toBe(1);
    expect(await count(B, parse)).toBe(2);
  });

  it('rejects a bad scope or window, signed-out callers and anon', async () => {
    await expect(
      as(A, () => q("select public.consume_rate_limit('Bad Scope', 60)")),
    ).rejects.toThrow(/invalid scope/i);
    await expect(as(A, () => q("select public.consume_rate_limit('coach', 0)"))).rejects.toThrow(
      /invalid window/i,
    );
    await expect(
      as(null, () => q("select public.consume_rate_limit('coach', 60)")),
    ).rejects.toThrow(/not authenticated/i);
    await expect(
      as(null, () => q("select public.consume_rate_limit('coach', 60)"), 'anon'),
    ).rejects.toThrow(/permission denied/i);
  });

  it('keeps the counter table closed to clients', async () => {
    await expect(as(A, () => q('select * from public.api_rate_limits'))).rejects.toThrow(
      /permission denied/i,
    );
  });
});

describe('the daily ceiling', () => {
  const ceiling = (max: number) => `select public.consume_daily_ceiling('gemini', ${max}) as c`;
  const total = async () =>
    (
      (
        await q(
          "select coalesce(sum(request_count), 0)::int as n from public.api_daily_totals where scope = 'gemini'",
        )
      ).rows[0] as { n: number }
    ).n;

  it('allows calls up to the ceiling and refuses the next one', async () => {
    expect(await count(A, ceiling(2))).toBe(true);
    expect(await count(B, ceiling(2))).toBe(true);
    expect(await count(A, ceiling(2))).toBe(false);
  });

  it('does not let one account use up the project: past its own hourly cap it stops being counted', async () => {
    const before = await total();
    let lastA: boolean | number = true;
    for (let i = 0; i < 101; i++) lastA = await count(A, ceiling(1_000_000));
    expect(lastA).toBe(false);
    // A was counted at most up to its own cap (some of the 100 were already used above), and B still gets in.
    const afterA = await total();
    expect(afterA - before).toBeLessThanOrEqual(100);
    expect(await count(B, ceiling(1_000_000))).toBe(true);
    expect(await total()).toBe(afterA + 1);
  });

  it('rejects a bad scope or maximum, signed-out callers and anon, and keeps its table closed', async () => {
    await expect(
      as(A, () => q("select public.consume_daily_ceiling('No Good', 5)")),
    ).rejects.toThrow(/invalid scope/i);
    await expect(
      as(A, () => q("select public.consume_daily_ceiling('gemini', 0)")),
    ).rejects.toThrow(/invalid maximum/i);
    await expect(as(null, () => q(ceiling(5)))).rejects.toThrow(/not authenticated/i);
    await expect(as(null, () => q(ceiling(5)), 'anon')).rejects.toThrow(/permission denied/i);
    await expect(as(A, () => q('select * from public.api_daily_totals'))).rejects.toThrow(
      /permission denied/i,
    );
  });
});
