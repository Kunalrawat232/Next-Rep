// Verifies supabase/migrations/0006_revoke_rls_auto_enable.sql in PGlite: the helper function that Supabase adds to a
// project can no longer be called by the anon and authenticated roles, and the migration is harmless on a database
// that does not have the function.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../supabase/migrations/0006_revoke_rls_auto_enable.sql', import.meta.url),
  'utf8',
);

const roles = `
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
`;

async function callAs(db: PGlite, role: string) {
  await db.exec(`set role ${role}`);
  try {
    return await db.query('select public.rls_auto_enable()');
  } finally {
    await db.exec('reset role');
  }
}

describe('when the project has the helper function', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`${roles}
      create function public.rls_auto_enable() returns void language plpgsql security definer
        set search_path = '' as $$ begin null; end; $$;
    `);
  });
  afterAll(async () => {
    await db.close();
  });

  it('is callable by anyone before the migration, as Postgres grants EXECUTE to everybody by default', async () => {
    await expect(callAs(db, 'anon')).resolves.toBeDefined();
    await expect(callAs(db, 'authenticated')).resolves.toBeDefined();
  });

  it('is closed to anon and authenticated after the migration, and still open to its owner', async () => {
    await db.exec(migration);
    await expect(callAs(db, 'anon')).rejects.toThrow(/permission denied/i);
    await expect(callAs(db, 'authenticated')).rejects.toThrow(/permission denied/i);
    await expect(db.query('select public.rls_auto_enable()')).resolves.toBeDefined();
  });

  it('can be run twice with the same result', async () => {
    await db.exec(migration);
    await expect(callAs(db, 'anon')).rejects.toThrow(/permission denied/i);
  });
});

describe('when the database does not have the helper function', () => {
  it('runs without error and changes nothing', async () => {
    const db = new PGlite();
    await db.exec(roles);
    await expect(db.exec(migration)).resolves.toBeDefined();
    const r = await db.query(
      "select count(*)::int as n from pg_proc where proname = 'rls_auto_enable'",
    );
    expect((r.rows[0] as { n: number }).n).toBe(0);
    await db.close();
  });
});
