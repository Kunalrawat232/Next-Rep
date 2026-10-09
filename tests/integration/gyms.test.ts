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

const gym = (name: string) => ({
  name,
  barbellKg: 15,
  bars: [{ name: 'EZ bar', weightKg: 7.5, kind: 'ez_bar' as const }],
});

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

  it('creates a gym with a bar and reads it back with numbers, not strings', async () => {
    const service = createSupabaseGymService(a.client);
    const result = await service.create(a.id, crypto.randomUUID(), gym('Integration home'), true);
    expect(result.status).toBe('ok');
    const listed = await service.list();
    expect(listed.status).toBe('ok');
    if (listed.status !== 'ok') return;
    expect(listed.value).toHaveLength(1);
    const row = listed.value[0]!;
    expect(row).toMatchObject({ name: 'Integration home', barbellKg: 15, isDefault: true });
    expect(typeof row.barbellKg).toBe('number');
    expect(row.bars).toMatchObject([{ name: 'EZ bar', weightKg: 7.5, kind: 'ez_bar' }]);
  });

  it('updates the gym, keeping a bar that stays and removing one that goes', async () => {
    const service = createSupabaseGymService(a.client);
    const listed = await service.list();
    if (listed.status !== 'ok') throw new Error('list failed');
    const home = listed.value[0]!;
    const kept = home.bars[0]!;
    const update = await service.update(a.id, home.id, {
      name: 'Integration home 2',
      barbellKg: 20,
      bars: [
        { id: kept.id, name: 'EZ bar', weightKg: 8, kind: 'ez_bar' },
        { name: 'Trap bar', weightKg: 25, kind: 'other' },
      ],
    });
    expect(update.status).toBe('ok');
    const after = await service.list();
    if (after.status !== 'ok') throw new Error('list failed');
    expect(after.value[0]).toMatchObject({ name: 'Integration home 2', barbellKg: 20 });
    expect(after.value[0]?.bars.map((bar) => bar.name).sort()).toEqual(['EZ bar', 'Trap bar']);
    expect(after.value[0]?.bars.find((bar) => bar.id === kept.id)?.weightKg).toBe(8);
  });

  it('moves the default between gyms without ever leaving two', async () => {
    const service = createSupabaseGymService(a.client);
    const secondId = crypto.randomUUID();
    const second = await service.create(a.id, secondId, gym('Integration office'), false);
    expect(second.status).toBe('ok');
    expect((await service.setDefault(secondId)).status).toBe('ok');
    const listed = await service.list();
    if (listed.status !== 'ok') throw new Error('list failed');
    expect(listed.value.filter((g) => g.isDefault).map((g) => g.id)).toEqual([secondId]);
  });

  it('refuses a second EZ bar in one gym', async () => {
    const service = createSupabaseGymService(a.client);
    const result = await service.create(
      a.id,
      crypto.randomUUID(),
      {
        name: 'Two EZ',
        barbellKg: 20,
        bars: [
          { name: 'EZ one', weightKg: 7, kind: 'ez_bar' },
          { name: 'EZ two', weightKg: 8, kind: 'ez_bar' },
        ],
      },
      false,
    );
    expect(result.status).toBe('error');
  });

  it("keeps A's gyms away from B, and B cannot change or delete them", async () => {
    const serviceA = createSupabaseGymService(a.client);
    const serviceB = createSupabaseGymService(b.client);
    expect(await serviceB.list()).toEqual({ status: 'ok', value: [] });
    const listed = await serviceA.list();
    if (listed.status !== 'ok') throw new Error('list failed');
    const target = listed.value[0]!;
    await serviceB.remove(target.id);
    await serviceB.update(b.id, target.id, { name: 'pwned', barbellKg: 1, bars: [] });
    const after = await serviceA.list();
    if (after.status !== 'ok') throw new Error('list failed');
    expect(after.value.find((g) => g.id === target.id)?.name).toBe(target.name);
  });

  it("refuses B creating a gym over A's gym id", async () => {
    const listed = await createSupabaseGymService(a.client).list();
    if (listed.status !== 'ok') throw new Error('list failed');
    const result = await createSupabaseGymService(b.client).create(
      b.id,
      listed.value[0]!.id,
      gym('Takeover'),
      false,
    );
    expect(result.status).toBe('error');
  });

  it('deletes a gym and its bars', async () => {
    const service = createSupabaseGymService(a.client);
    const listed = await service.list();
    if (listed.status !== 'ok') throw new Error('list failed');
    for (const g of listed.value) expect((await service.remove(g.id)).status).toBe('ok');
    const after = await service.list();
    expect(after).toEqual({ status: 'ok', value: [] });
    const bars = await a.client.from('gym_bars').select('id');
    expect(bars.data).toEqual([]);
  });
});
