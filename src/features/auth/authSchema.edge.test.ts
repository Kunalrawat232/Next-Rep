import { describe, expect, it } from 'vitest';
import { validateCredentials } from './authSchema';

const emailOf = (raw: string) => {
  const r = validateCredentials('signIn', raw, 'pw');
  return r.ok ? r.email : null;
};

/** Builds an address of exactly `length` characters with valid label sizes. */
function addressOfLength(length: number): string {
  const local = 'a'.repeat(64);
  const labels: string[] = [];
  let remaining = length - local.length - 1; // minus "@"
  while (remaining > 0) {
    const size = Math.min(remaining - (remaining > 63 ? 1 : 0), 63);
    labels.push('b'.repeat(size));
    remaining -= size + 1;
  }
  const address = `${local}@${labels.join('.')}`;
  return address.slice(0, length - 3) + '.co'.slice(0, 3);
}

describe('email normalisation', () => {
  it.each([
    { raw: 'Ada@EXAMPLE.COM', expected: 'ada@example.com' },
    { raw: 'ada+gym@example.com', expected: 'ada+gym@example.com' },
    { raw: 'Ada+Gym@Example.com', expected: 'ada+gym@example.com' },
    { raw: '\t a@b.co \n', expected: 'a@b.co' },
    { raw: ' a@b.co ', expected: 'a@b.co' },
    { raw: 'first.last@sub.example.co.uk', expected: 'first.last@sub.example.co.uk' },
    { raw: "o'brien@example.com", expected: "o'brien@example.com" },
  ])('accepts and normalises $raw', ({ raw, expected }) => {
    expect(emailOf(raw)).toBe(expected);
  });

  it.each([
    { name: 'trailing dot on the domain', raw: 'a@b.co.' },
    { name: 'leading dot in the local part', raw: '.a@b.co' },
    { name: 'consecutive dots in the local part', raw: 'a..b@b.co' },
    { name: 'two at signs', raw: 'a@@b.co' },
    { name: 'inner whitespace', raw: 'a @b.co' },
    { name: 'inner newline', raw: 'a\n@b.co' },
    { name: 'zero-width space after the domain', raw: 'a@b.co​' },
    { name: 'emoji domain', raw: 'a@😀.co' },
    { name: 'emoji local part', raw: '😀@b.co' },
    { name: 'domain starting with a hyphen', raw: 'a@-b.co' },
    { name: 'single-label domain', raw: 'a@localhost' },
    { name: 'IP literal', raw: 'a@[127.0.0.1]' },
    { name: 'display-name form', raw: 'Ada <a@b.co>' },
    { name: 'comma-separated list', raw: 'a@b.co,c@d.co' },
    { name: 'mailto prefix', raw: 'mailto:a@b.co' },
    { name: 'SQL-ish text', raw: "a@b.co'; drop table profiles;--" },
    { name: 'markup', raw: '<script>@b.co' },
    { name: 'NUL byte', raw: 'a\u0000@b.co' },
  ])('rejects $name', ({ raw }) => {
    expect(emailOf(raw)).toBeNull();
  });

  it('is idempotent: normalising a normalised email changes nothing', () => {
    const once = emailOf('  Ada+Gym@Example.COM ');
    expect(once).not.toBeNull();
    expect(emailOf(once as string)).toBe(once);
  });
});

describe('email length boundary (254)', () => {
  it('builds addresses of the intended length', () => {
    expect(addressOfLength(254)).toHaveLength(254);
    expect(addressOfLength(255)).toHaveLength(255);
  });

  it('accepts 254 characters and rejects 255', () => {
    expect(emailOf(addressOfLength(254))).not.toBeNull();
    expect(emailOf(addressOfLength(255))).toBeNull();
  });

  it('measures the length after trimming, so padding does not count', () => {
    expect(emailOf(`   ${addressOfLength(254)}   `)).not.toBeNull();
  });
});

describe('password edge cases', () => {
  it('treats a whitespace-only password as present when signing in, and long enough to sign up', () => {
    expect(validateCredentials('signIn', 'a@b.co', '   ').ok).toBe(true);
    expect(validateCredentials('signUp', 'a@b.co', ' '.repeat(8)).ok).toBe(true);
  });

  it.each([
    { name: 'tab and newline', password: 'pass\tword\n1' },
    { name: 'NUL byte', password: 'pass\u0000word' },
    { name: 'quotes and backslash', password: `pa"ss'wo\\rd1` },
  ])('passes $name through unchanged', ({ password }) => {
    const r = validateCredentials('signUp', 'a@b.co', password);
    expect(r).toMatchObject({ ok: true, password });
  });

  it('is exact at the 72 boundary with ASCII, in both directions', () => {
    expect(validateCredentials('signUp', 'a@b.co', 'x'.repeat(71)).ok).toBe(true);
    expect(validateCredentials('signUp', 'a@b.co', 'x'.repeat(72)).ok).toBe(true);
    expect(validateCredentials('signUp', 'a@b.co', 'x'.repeat(73)).ok).toBe(false);
  });

  it.each([
    { name: '40 Cyrillic letters (80 bytes)', password: 'я'.repeat(40) },
    { name: '37 Devanagari letters (111 bytes)', password: 'क'.repeat(37) },
    { name: '25 CJK characters (75 bytes)', password: '漢'.repeat(25) },
    { name: '19 emoji (76 bytes)', password: '😀'.repeat(19) },
  ])('rejects a sign-up password over 72 BYTES, not just characters: $name', ({ password }) => {
    // The source comment says "bcrypt ignores everything past 72 bytes".
    expect(new TextEncoder().encode(password).length).toBeGreaterThan(72);
    expect(validateCredentials('signUp', 'a@b.co', password).ok).toBe(false);
  });

  it('accepts a multi-byte password that fits in 72 bytes', () => {
    const password = 'я'.repeat(36); // exactly 72 bytes
    expect(new TextEncoder().encode(password)).toHaveLength(72);
    expect(validateCredentials('signUp', 'a@b.co', password).ok).toBe(true);
  });

  it('sign-in does not apply the maximum, so an old long password can still try', () => {
    expect(validateCredentials('signIn', 'a@b.co', 'x'.repeat(200)).ok).toBe(true);
  });

  it('reports only the password error when only the password is bad', () => {
    const r = validateCredentials('signUp', 'a@b.co', 'x'.repeat(73));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors)).toEqual(['password']);
  });
});
