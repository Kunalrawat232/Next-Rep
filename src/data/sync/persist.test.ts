import { describe, expect, it, vi } from 'vitest';
import { requestPersistentStorage } from './persist';

describe('requestPersistentStorage', () => {
  it('is unsupported where the browser has no storage manager', async () => {
    expect(await requestPersistentStorage(undefined)).toBe('unsupported');
    expect(await requestPersistentStorage({})).toBe('unsupported');
  });

  it('asks the browser, and reports yes or no', async () => {
    expect(await requestPersistentStorage({ persist: async () => true })).toBe('granted');
    expect(await requestPersistentStorage({ persist: async () => false })).toBe('denied');
  });

  it('does not ask again when the site is already persistent', async () => {
    const persist = vi.fn(async () => true);
    expect(await requestPersistentStorage({ persisted: async () => true, persist })).toBe(
      'granted',
    );
    expect(persist).not.toHaveBeenCalled();
  });

  it('treats a throwing browser as a no', async () => {
    expect(
      await requestPersistentStorage({
        persist: async () => {
          throw new Error('blocked');
        },
      }),
    ).toBe('denied');
  });
});
