import { describe, expect, it } from 'vitest';
import { validateCredentials } from './authSchema';

describe('validateCredentials', () => {
  it('trims and lower-cases the email', () => {
    expect(validateCredentials('signIn', '  Kunal@Example.COM ', 'secret-pass')).toEqual({
      ok: true,
      email: 'kunal@example.com',
      password: 'secret-pass',
    });
  });

  it('keeps the password exactly as typed, including spaces', () => {
    const r = validateCredentials('signUp', 'a@b.co', '  spaced pass  ');
    expect(r).toMatchObject({ ok: true, password: '  spaced pass  ' });
  });

  it.each([
    '',
    '   ',
    'nope',
    'a@b',
    '@example.com',
    'a b@example.com',
    `${'x'.repeat(250)}@example.com`,
  ])('rejects the email %j in both modes', (email) => {
    for (const mode of ['signIn', 'signUp'] as const) {
      const r = validateCredentials(mode, email, 'long-enough-pass');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.email).toBeTruthy();
    }
  });

  it('only requires a non-empty password to sign in, so older short passwords still work', () => {
    expect(validateCredentials('signIn', 'a@b.co', 'x').ok).toBe(true);
    const r = validateCredentials('signIn', 'a@b.co', '');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.password).toBeTruthy();
  });

  it.each([
    { password: '', ok: false },
    { password: '1234567', ok: false },
    { password: '12345678', ok: true },
    { password: 'p'.repeat(72), ok: true },
    { password: 'p'.repeat(73), ok: false },
    { password: 'пароль-пароль', ok: true },
  ])('sign-up password of $password.length characters is ok: $ok', ({ password, ok }) => {
    const r = validateCredentials('signUp', 'a@b.co', password);
    expect(r.ok).toBe(ok);
    if (!r.ok) expect(r.errors.password).toBeTruthy();
  });

  it('reports email and password problems together', () => {
    const r = validateCredentials('signUp', 'nope', 'short');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['email', 'password']);
  });

  it('does not echo the password in any message', () => {
    const r = validateCredentials('signUp', 'a@b.co', 'hunter2');
    expect(JSON.stringify(r)).not.toContain('hunter2');
  });
});
