// Profile access rules on the hosted project, as real signed-in users. Needs the two test users
// from docs/delivery/deployment.md. Run with `npm run test:integration`; skipped when not configured.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureProfile } from '../../src/data/remote/profiles';

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

const newClient = () =>
  createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });

async function signedIn(who: 'a' | 'b') {
  const client = newClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: users[who].email!,
    password: users[who].password!,
  });
  if (error || !data.user)
    throw new Error(
      `Test user ${who.toUpperCase()} could not sign in (${error?.code ?? 'no user'})`,
    );
  return { client, id: data.user.id };
}

describe.skipIf(!configured)('profiles on the hosted project', () => {
  let a: { client: SupabaseClient; id: string };
  let b: { client: SupabaseClient; id: string };

  beforeAll(async () => {
    a = await signedIn('a');
    b = await signedIn('b');
    await ensureProfile(a.client, a.id);
    await ensureProfile(b.client, b.id);
  });

  afterAll(async () => {
    await a?.client.from('profiles').delete().eq('id', a.id);
    await b?.client.from('profiles').delete().eq('id', b.id);
  });

  it('lets a user read their own profile', async () => {
    const { data, error } = await a.client
      .from('profiles')
      .select('id, default_unit')
      .eq('id', a.id);
    expect(error).toBeNull();
    expect(data).toEqual([{ id: a.id, default_unit: 'kg' }]);
  });

  it('does not overwrite an existing profile when ensureProfile runs again', async () => {
    await a.client.from('profiles').update({ display_name: 'Integration test' }).eq('id', a.id);
    await ensureProfile(a.client, a.id);
    const { data } = await a.client.from('profiles').select('display_name').eq('id', a.id);
    expect(data).toEqual([{ display_name: 'Integration test' }]);
  });

  it("hides another user's profile", async () => {
    const { data, error } = await a.client.from('profiles').select('id').eq('id', b.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('refuses to create a profile for someone else', async () => {
    const { error } = await a.client.from('profiles').insert({ id: b.id });
    expect(error?.code).toBe('42501');
  });

  it("changes nothing when updating someone else's profile", async () => {
    const { data, error } = await a.client
      .from('profiles')
      .update({ display_name: 'hacked' })
      .eq('id', b.id)
      .select();
    expect(error).toBeNull();
    expect(data).toEqual([]);
    const { data: own } = await b.client.from('profiles').select('display_name').eq('id', b.id);
    expect(own).toEqual([{ display_name: null }]);
  });

  it('keeps profiles closed to signed-out visitors', async () => {
    const { error } = await newClient().from('profiles').select('id');
    expect(error?.code).toBe('42501');
  });
});
