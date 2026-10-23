// The gym service against the hosted project, as real signed-in users. Needs migration 0002 applied
// and the two test users from docs/delivery/deployment.md. Run with `npm run test:integration`.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSupabaseGymService } from '../../src/data/remote/gyms';

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

const gym = {
  barbellKg: 15,
  bars: [{ name: 'EZ bar', weightKg: 7.5, kind: 'ez_bar' as const }],
};

describe.skipIf(!configured)('gym service on the hosted project', () => {
  let a: { client: SupabaseClient; id: string };
  let b: { client: SupabaseClient; id: string };
  async function wipe(client: SupabaseClient, id: string) {
    await client.from('gyms').delete().eq('user_id', id);
  }

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

  it('creates the gym with a bar and reads it back with numbers, not strings', async () => {
    const service = createSupabaseGymService(a.client);
    expect(await service.get()).toEqual({ status: 'ok', value: null });
    const result = await service.save(a.id, crypto.randomUUID(), gym);
    expect(result.status).toBe('ok');
    const got = await service.get();
    expect(got.status).toBe('ok');
    if (got.status !== 'ok' || !got.value) throw new Error('get failed');
    expect(got.value).toMatchObject({ barbellKg: 15 });
    expect(typeof got.value.barbellKg).toBe('number');
    expect(got.value.bars).toMatchObject([{ name: 'EZ bar', weightKg: 7.5, kind: 'ez_bar' }]);
  });

  it('updates the gym, keeping a bar that stays and removing one that goes', async () => {
    const service = createSupabaseGymService(a.client);
    const got = await service.get();
    if (got.status !== 'ok' || !got.value) throw new Error('get failed');
    const home = got.value;
    const kept = home.bars[0]!;
    const update = await service.save(a.id, home.id, {
      barbellKg: 20,
      bars: [
        { id: kept.id, name: 'EZ bar', weightKg: 8, kind: 'ez_bar' },
        { name: 'Trap bar', weightKg: 25, kind: 'other' },
      ],
    });
    expect(update.status).toBe('ok');
    const after = await service.get();
    if (after.status !== 'ok' || !after.value) throw new Error('get failed');
    expect(after.value).toMatchObject({ id: home.id, barbellKg: 20 });
    expect(after.value.bars.map((bar) => bar.name).sort()).toEqual(['EZ bar', 'Trap bar']);
    expect(after.value.bars.find((bar) => bar.id === kept.id)?.weightKg).toBe(8);

    const trimmed = await service.save(a.id, home.id, { barbellKg: 20, bars: [] });
    expect(trimmed.status).toBe('ok');
    const bare = await service.get();
    if (bare.status !== 'ok' || !bare.value) throw new Error('get failed');
    expect(bare.value.bars).toEqual([]);
  });

  it('refuses a second gym for the same user with a unique violation', async () => {
    const service = createSupabaseGymService(a.client);
    const result = await service.save(a.id, crypto.randomUUID(), gym);
    expect(result).toEqual({ status: 'error', reason: 'conflict' });
    const got = await service.get();
    expect(got.status === 'ok' && got.value !== null).toBe(true);
  });

  it('refuses a second EZ bar in one gym', async () => {
    const service = createSupabaseGymService(a.client);
    const got = await service.get();
    if (got.status !== 'ok' || !got.value) throw new Error('get failed');
    const result = await service.save(a.id, got.value.id, {
      barbellKg: 20,
      bars: [
        { name: 'EZ one', weightKg: 7, kind: 'ez_bar' },
        { name: 'EZ two', weightKg: 8, kind: 'ez_bar' },
      ],
    });
    expect(result.status).toBe('error');
  });

  it("keeps A's gym away from B, and B cannot change it", async () => {
    const serviceA = createSupabaseGymService(a.client);
    const serviceB = createSupabaseGymService(b.client);
    expect(await serviceB.get()).toEqual({ status: 'ok', value: null });
    const got = await serviceA.get();
    if (got.status !== 'ok' || !got.value) throw new Error('get failed');
    const target = got.value;
    await serviceB.save(b.id, target.id, { barbellKg: 1, bars: [] });
    const after = await serviceA.get();
    if (after.status !== 'ok' || !after.value) throw new Error('get failed');
    expect(after.value).toEqual(target);
  });

  it("refuses B saving a gym over A's gym id", async () => {
    const got = await createSupabaseGymService(a.client).get();
    if (got.status !== 'ok' || !got.value) throw new Error('get failed');
    const result = await createSupabaseGymService(b.client).save(b.id, got.value.id, gym);
    expect(result.status).toBe('error');
  });

  it('deletes the gym row directly and its bars go with it', async () => {
    await wipe(a.client, a.id);
    const after = await createSupabaseGymService(a.client).get();
    expect(after).toEqual({ status: 'ok', value: null });
    const bars = await a.client.from('gym_bars').select('id');
    expect(bars.data).toEqual([]);
  });
});
