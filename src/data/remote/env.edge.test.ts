import { describe, expect, it } from 'vitest';
import { parseSupabaseEnv } from './env';

const publishable = `sb_publishable_${'a'.repeat(30)}`;
const secret = `sb_secret_${'b'.repeat(30)}`;
const valid = {
  VITE_SUPABASE_URL: 'https://abcdefghij.supabase.co',
  VITE_SUPABASE_ANON_KEY: publishable,
};
const b64url = (json: string) =>
  btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (payload: string, encode: (s: string) => string = b64url) =>
  `eyJhbGciOiJIUzI1NiJ9.${encode(payload)}.c2lnbmF0dXJl`;

describe('parseSupabaseEnv: keys that must never reach the browser', () => {
  it.each([
    { name: 'leading space', key: ` ${secret}` },
    { name: 'trailing newline', key: `${secret}\n` },
    { name: 'leading tab', key: `\t${secret}` },
    { name: 'wrapped in double quotes', key: `"${secret}"` },
  ])('never returns a secret key that is padded or quoted: $name', ({ key }) => {
    const r = parseSupabaseEnv({ ...valid, VITE_SUPABASE_ANON_KEY: key });
    if (r.ok) expect(r.env.anonKey).not.toContain('sb_secret_');
  });

  it.each([
    {
      name: 'base64url payload using - and _ characters',
      // 0xfb 0xff bytes in the base64 alphabet force "+" and "/" in standard base64
      token: jwt('{"role":"service_role","pad":"???>>>~~~"}'),
    },
    { name: 'padded base64 payload', token: jwt('{"role":"service_role"}', btoa) },
    {
      name: 'role after other claims',
      token: jwt('{"iss":"supabase","ref":"x","exp":1,"role":"service_role"}'),
    },
    { name: 'whitespace inside the JSON', token: jwt('{ "role" : "service_role" }') },
  ])('rejects a service_role JWT: $name', ({ token }) => {
    const r = parseSupabaseEnv({ ...valid, VITE_SUPABASE_ANON_KEY: token });
    expect(r.ok).toBe(false);
  });

  it.each([
    { name: 'payload is JSON null', payload: 'null' },
    { name: 'payload is a JSON string', payload: '"service_role"' },
    { name: 'payload is an array', payload: '["service_role"]' },
    { name: 'payload is a number', payload: '42' },
    { name: 'role is an object', payload: '{"role":{"x":"service_role"}}' },
    { name: 'role is missing', payload: '{"ref":"x"}' },
    { name: 'role is authenticated', payload: '{"role":"authenticated"}' },
  ])('rejects, without throwing, a JWT whose role is not provably anon: $name', ({ payload }) => {
    expect(() =>
      parseSupabaseEnv({ ...valid, VITE_SUPABASE_ANON_KEY: jwt(payload) }),
    ).not.toThrow();
    expect(parseSupabaseEnv({ ...valid, VITE_SUPABASE_ANON_KEY: jwt(payload) }).ok).toBe(false);
  });

  it('applies the 20 character minimum exactly', () => {
    const key = (tail: number) => `sb_publishable_${'k'.repeat(tail)}`;
    expect(parseSupabaseEnv({ ...valid, VITE_SUPABASE_ANON_KEY: key(4) }).ok).toBe(false); // 19 characters
    expect(parseSupabaseEnv({ ...valid, VITE_SUPABASE_ANON_KEY: key(5) }).ok).toBe(true); // 20 characters
  });
});

describe('parseSupabaseEnv: URL handling', () => {
  it.each([
    { name: 'http scheme in upper case', url: 'HTTP://abcdefghij.supabase.co' },
    { name: 'ftp scheme', url: 'ftp://abcdefghij.supabase.co' },
    { name: 'javascript scheme', url: 'javascript:alert(1)' },
    { name: 'data scheme', url: 'data:text/plain,hello' },
    { name: 'protocol-relative', url: '//abcdefghij.supabase.co' },
    { name: 'whitespace only', url: '   ' },
  ])('rejects $name', ({ url }) => {
    expect(parseSupabaseEnv({ ...valid, VITE_SUPABASE_URL: url }).ok).toBe(false);
  });

  it.each([
    { name: 'upper-case scheme', url: 'HTTPS://abcdefghij.supabase.co' },
    { name: 'leading space', url: ' https://abcdefghij.supabase.co' },
    { name: 'trailing space', url: 'https://abcdefghij.supabase.co ' },
    { name: 'trailing newline', url: 'https://abcdefghij.supabase.co\n' },
  ])(
    'either accepts a usable https URL or rejects it, never returns an unusable one: $name',
    ({ url }) => {
      const r = parseSupabaseEnv({ ...valid, VITE_SUPABASE_URL: url });
      if (r.ok) {
        expect(r.env.url).toMatch(/^https:\/\/abcdefghij\.supabase\.co\/?$/i);
        expect(r.env.url).not.toMatch(/\s/);
      }
    },
  );

  it.each([
    { name: 'number', value: 42 },
    { name: 'null', value: null },
    { name: 'boolean', value: true },
    { name: 'object', value: { toString: () => 'https://abcdefghij.supabase.co' } },
    { name: 'array', value: ['https://abcdefghij.supabase.co'] },
  ])('rejects a non-string URL ($name) without throwing', ({ value }) => {
    expect(parseSupabaseEnv({ ...valid, VITE_SUPABASE_URL: value }).ok).toBe(false);
  });

  it('keeps the URL path and port untouched for local development', () => {
    const r = parseSupabaseEnv({ ...valid, VITE_SUPABASE_URL: 'https://localhost:54321' });
    expect(r.ok).toBe(true);
  });

  it('does not repeat the URL in its message', () => {
    const r = parseSupabaseEnv({ ...valid, VITE_SUPABASE_URL: 'http://leaky-host.example' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).not.toContain('leaky-host');
  });
});
