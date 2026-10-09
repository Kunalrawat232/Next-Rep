// The exercise service against the hosted project, as real signed-in users. Needs migration 0003
// applied (the muscle column) and the two test users from docs/delivery/deployment.md.
// Run with `npm run test:integration`; skipped when not configured.
import { readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSupabaseExerciseService } from '../../src/data/remote/exercises';

// The seed is the curated list plus the imported list (see scripts/generate-seed-sql.mjs).
const seedCount = ['exercises.seed.json', 'exercises.extended.json']
  .map(
    (file) =>
      (
        JSON.parse(
          readFileSync(new URL(`../../src/domain/${file}`, import.meta.url), 'utf8'),
        ) as unknown[]
      ).length,
  )
  .reduce((a, b) => a + b, 0);

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

const input = (name: string) => ({
  name,
  equipmentType: 'barbell' as const,
  bodyPart: 'lower' as const,
  aliases: ['zercher'],
});

describe.skipIf(!configured)('exercise service on the hosted project', () => {
  let a: { client: SupabaseClient; id: string };
  let b: { client: SupabaseClient; id: string };

  const wipe = async (client: SupabaseClient, id: string) =>
    void (await client.from('exercises').delete().eq('user_id', id));

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

  it('has the full seed, each exercise with a muscle', async () => {
    const all = await a.client
      .from('exercises')
      .select('id', { count: 'exact', head: true })
      .is('user_id', null);
    const withMuscle = await a.client
      .from('exercises')
      .select('id', { count: 'exact', head: true })
      .is('user_id', null)
      .not('muscle', 'is', null);
    expect(all.count).toBe(seedCount);
    expect(withMuscle.count).toBe(seedCount);
  });

  it('creates a custom exercise and lists it, and only it, as custom', async () => {
    const service = createSupabaseExerciseService(a.client);
    const id = crypto.randomUUID();
    expect((await service.create(a.id, id, input('Integration zercher'))).status).toBe('ok');
    const listed = await service.listCustom();
    expect(listed.status).toBe('ok');
    if (listed.status !== 'ok') return;
    expect(listed.value).toHaveLength(1);
    expect(listed.value[0]).toMatchObject({
      id,
      name: 'Integration zercher',
      equipmentType: 'barbell',
      bodyPart: 'lower',
      muscle: null,
      aliases: ['zercher'],
      tier: 'custom',
    });
  });

  it('is safe to retry with the same id', async () => {
    const service = createSupabaseExerciseService(a.client);
    const id = crypto.randomUUID();
    expect((await service.create(a.id, id, input('Integration retry'))).status).toBe('ok');
    expect((await service.create(a.id, id, input('Integration retry'))).status).toBe('ok');
    const listed = await service.listCustom();
    if (listed.status !== 'ok') throw new Error('list failed');
    expect(listed.value.filter((e) => e.name === 'Integration retry')).toHaveLength(1);
  });

  it('refuses a second exercise with the same name, as a conflict', async () => {
    const service = createSupabaseExerciseService(a.client);
    const result = await service.create(a.id, crypto.randomUUID(), input('integration ZERCHER'));
    expect(result).toEqual({ status: 'error', reason: 'conflict' });
  });

  it("keeps A's custom exercises away from B", async () => {
    expect(await createSupabaseExerciseService(b.client).listCustom()).toEqual({
      status: 'ok',
      value: [],
    });
  });

  it("stops B taking over one of A's exercises by id", async () => {
    const listed = await createSupabaseExerciseService(a.client).listCustom();
    if (listed.status !== 'ok') throw new Error('list failed');
    const result = await createSupabaseExerciseService(b.client).create(
      b.id,
      listed.value[0]!.id,
      input('Takeover'),
    );
    expect(result.status).toBe('error');
  });

  it('stops B taking over a global exercise by id', async () => {
    const global = await b.client.from('exercises').select('id').is('user_id', null).limit(1);
    const id = (global.data?.[0] as { id: string }).id;
    const result = await createSupabaseExerciseService(b.client).create(
      b.id,
      id,
      input('Global takeover'),
    );
    expect(result.status).toBe('error');
    const after = await b.client.from('exercises').select('name').eq('id', id);
    expect((after.data?.[0] as { name: string }).name).not.toBe('Global takeover');
  });
});
