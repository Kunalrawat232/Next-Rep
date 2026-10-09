import { describe, expect, it } from 'vitest';
import { ignoreClosed } from './closed';

describe('ignoreClosed', () => {
  it('drops the error from a database that was closed', () => {
    const closed = Object.assign(new Error('Database has been closed'), {
      name: 'DatabaseClosedError',
    });
    expect(() => ignoreClosed(closed)).not.toThrow();
  });

  it.each([
    new Error('boom'),
    'text',
    null,
    Object.assign(new Error('x'), { name: 'QuotaExceededError' }),
  ])('rethrows anything else: %s', (error) => {
    expect(() => ignoreClosed(error)).toThrow();
  });
});
