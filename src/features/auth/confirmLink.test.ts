import { describe, expect, it } from 'vitest';
import { readConfirmLink } from './confirmLink';

const HASH = 'b1946ac92492d2347c6235b4d2611184c0ab5d1f8f2e6a9c1d3e5f7a';

describe('readConfirmLink', () => {
  it('reads the one-time code and removes it from the address', () => {
    expect(readConfirmLink(`?token_hash=${HASH}&type=email`, '')).toEqual({
      tokenHash: HASH,
      failed: false,
      clean: { search: '', hash: '' },
    });
  });

  it('accepts a prefixed code and keeps other query keys', () => {
    expect(readConfirmLink(`?next=1&token_hash=pkce_${HASH}&type=email`, '')).toEqual({
      tokenHash: `pkce_${HASH}`,
      failed: false,
      clean: { search: '?next=1', hash: '' },
    });
  });

  it('refuses a malformed code but still cleans it away', () => {
    for (const bad of ['short', 'has spaces in it', `${HASH}<script>`, 'a'.repeat(300)]) {
      const read = readConfirmLink(`?token_hash=${encodeURIComponent(bad)}&type=email`, '');
      expect(read.tokenHash).toBeNull();
      expect(read.clean).toEqual({ search: '', hash: '' });
    }
  });

  it('reads an error from Supabase, in the hash or the query, as a failed link', () => {
    const error = 'error=access_denied&error_code=otp_expired&error_description=Email+link+expired';
    expect(readConfirmLink('', `#${error}`)).toEqual({
      tokenHash: null,
      failed: true,
      clean: { search: '', hash: '' },
    });
    expect(readConfirmLink(`?${error}`, '').failed).toBe(true);
  });

  it('does not verify a code that came with an error', () => {
    const read = readConfirmLink(`?token_hash=${HASH}&error=access_denied`, '');
    expect(read).toMatchObject({ tokenHash: null, failed: true });
  });

  it('removes login tokens of the older link style without using them', () => {
    expect(readConfirmLink('', '#access_token=a&refresh_token=r&type=signup')).toEqual({
      tokenHash: null,
      failed: false,
      clean: { search: '', hash: '' },
    });
  });

  it('does nothing for a plain sign-in page', () => {
    expect(readConfirmLink('', '')).toEqual({ tokenHash: null, failed: false, clean: null });
    expect(readConfirmLink('?next=1', '#section')).toEqual({
      tokenHash: null,
      failed: false,
      clean: null,
    });
  });

  it('keeps an unrelated hash when only the query is cleaned', () => {
    expect(readConfirmLink(`?token_hash=${HASH}`, '#section').clean).toEqual({
      search: '',
      hash: '#section',
    });
  });

  it('copes with junk', () => {
    expect(readConfirmLink('?%%%', '#%E0%A4%A&&==')).toEqual({
      tokenHash: null,
      failed: false,
      clean: null,
    });
  });
});
