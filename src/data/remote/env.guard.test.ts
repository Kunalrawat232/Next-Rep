import { describe, expect, it } from 'vitest';
import { unsafePublicEnvProblems } from './env';

const publishable = `sb_publishable_${'a'.repeat(30)}`;
const ok = {
  VITE_SUPABASE_URL: 'https://abcdefghij.supabase.co',
  VITE_SUPABASE_ANON_KEY: publishable,
  MODE: 'production',
};

describe('unsafePublicEnvProblems (runs at build time, because Vite inlines every VITE_ value)', () => {
  it('has no complaints about the two expected variables', () => {
    expect(unsafePublicEnvProblems(ok)).toEqual([]);
  });

  it('has no complaints when the Supabase variables are absent (CI builds without them)', () => {
    expect(unsafePublicEnvProblems({ MODE: 'production' })).toEqual([]);
  });

  it.each([
    'VITE_SERVICE_ROLE_KEY',
    'VITE_SUPABASE_SECRET_KEY',
    'VITE_GEMINI_API_KEY',
    'VITE_DB_PASSWORD',
    'VITE_PRIVATE_TOKEN',
    'VITE_stripe_secret',
  ])('flags a variable named %s, which would be published to every visitor', (name) => {
    const problems = unsafePublicEnvProblems({ ...ok, [name]: 'value-that-must-not-leak' });
    expect(problems.some((p) => p.includes(name))).toBe(true);
    expect(problems.join(' ')).not.toContain('value-that-must-not-leak');
  });

  it('flags a secret key placed in the anon variable, with padding or quotes too', () => {
    for (const key of [
      `sb_secret_${'b'.repeat(30)}`,
      ` sb_secret_${'b'.repeat(30)}`,
      `"sb_secret_${'b'.repeat(30)}"`,
    ]) {
      const problems = unsafePublicEnvProblems({ ...ok, VITE_SUPABASE_ANON_KEY: key });
      expect(problems.length).toBeGreaterThan(0);
      expect(problems.join(' ')).not.toContain('b'.repeat(30));
    }
  });

  it('ignores variables that are not exposed to the browser', () => {
    expect(
      unsafePublicEnvProblems({ ...ok, GEMINI_API_KEY: 'server-only', E2E_USER_A_PASSWORD: 'x' }),
    ).toEqual([]);
  });
});
