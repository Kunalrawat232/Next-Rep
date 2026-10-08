import { describe, expect, it } from 'vitest';
import { parseSupabaseEnv } from './env';

const publishable = `sb_publishable_${'a'.repeat(30)}`;
const secret = `sb_secret_${'b'.repeat(30)}`;
const jwtWithRole = (role: string) =>
  `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ role, ref: 'x' })).replace(/=+$/, '')}.c2lnbmF0dXJl`;
const valid = {
  VITE_SUPABASE_URL: 'https://abcdefghij.supabase.co',
  VITE_SUPABASE_ANON_KEY: publishable,
};

describe('parseSupabaseEnv', () => {
  it('accepts a project URL with a publishable key', () => {
    expect(parseSupabaseEnv(valid)).toEqual({
      ok: true,
      env: { url: 'https://abcdefghij.supabase.co', anonKey: publishable },
    });
  });

  it('accepts a legacy anon JWT', () => {
    const r = parseSupabaseEnv({ ...valid, VITE_SUPABASE_ANON_KEY: jwtWithRole('anon') });
    expect(r.ok).toBe(true);
  });

  it.each([
    { name: 'missing URL', patch: { VITE_SUPABASE_URL: undefined }, mentions: 'VITE_SUPABASE_URL' },
    { name: 'empty URL', patch: { VITE_SUPABASE_URL: '' }, mentions: 'VITE_SUPABASE_URL' },
    {
      name: 'URL that is not a URL',
      patch: { VITE_SUPABASE_URL: 'abcdefghij' },
      mentions: 'VITE_SUPABASE_URL',
    },
    {
      name: 'plain http URL',
      patch: { VITE_SUPABASE_URL: 'http://abcdefghij.supabase.co' },
      mentions: 'https',
    },
    {
      name: 'missing key',
      patch: { VITE_SUPABASE_ANON_KEY: undefined },
      mentions: 'VITE_SUPABASE_ANON_KEY',
    },
    {
      name: 'empty key',
      patch: { VITE_SUPABASE_ANON_KEY: '' },
      mentions: 'VITE_SUPABASE_ANON_KEY',
    },
    {
      name: 'key that is too short',
      patch: { VITE_SUPABASE_ANON_KEY: 'short' },
      mentions: 'VITE_SUPABASE_ANON_KEY',
    },
    { name: 'secret key', patch: { VITE_SUPABASE_ANON_KEY: secret }, mentions: 'secret' },
    {
      name: 'service_role JWT',
      patch: { VITE_SUPABASE_ANON_KEY: jwtWithRole('service_role') },
      mentions: 'service_role',
    },
  ])('rejects $name', ({ patch, mentions }) => {
    const r = parseSupabaseEnv({ ...valid, ...patch });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain(mentions);
  });

  it('never repeats a key in its message', () => {
    for (const key of [secret, jwtWithRole('service_role'), 'zq7x-key-4']) {
      const r = parseSupabaseEnv({ ...valid, VITE_SUPABASE_ANON_KEY: key });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).not.toContain(key);
    }
  });

  it('reports every problem at once', () => {
    const r = parseSupabaseEnv({});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toContain('VITE_SUPABASE_URL');
      expect(r.message).toContain('VITE_SUPABASE_ANON_KEY');
    }
  });

  it('rejects, without throwing, a JWT whose payload cannot be decoded (its role cannot be proven to be anon)', () => {
    const r = parseSupabaseEnv({
      ...valid,
      VITE_SUPABASE_ANON_KEY: 'eyJ.not-base64!.sig-padding-padding',
    });
    expect(r.ok).toBe(false);
  });

  it('trims accidental spaces around valid values', () => {
    const r = parseSupabaseEnv({
      VITE_SUPABASE_URL: '  https://abcdefghij.supabase.co ',
      VITE_SUPABASE_ANON_KEY: `	${publishable}
`,
    });
    expect(r).toEqual({
      ok: true,
      env: { url: 'https://abcdefghij.supabase.co', anonKey: publishable },
    });
  });

  it.each([
    `sb_secret_${'b'.repeat(30)}`.padStart(40, ' '),
    `"sb_secret_${'b'.repeat(30)}"`,
    `'${publishable}'`,
  ])('rejects the padded or quoted key %#', (key) => {
    expect(parseSupabaseEnv({ ...valid, VITE_SUPABASE_ANON_KEY: key }).ok).toBe(false);
  });
});
