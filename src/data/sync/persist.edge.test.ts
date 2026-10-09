import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestPersistentStorage } from './persist';

type Manager = { persisted?: () => Promise<boolean>; persist?: () => Promise<boolean> };
type Case = [string, Manager, string];

afterEach(() => vi.unstubAllGlobals());

describe('requestPersistentStorage edge cases', () => {
  it.each<Case>([
    [
      'persisted says no, persist says yes',
      { persisted: async () => false, persist: async () => true },
      'granted',
    ],
    [
      'persisted says no, persist says no',
      { persisted: async () => false, persist: async () => false },
      'denied',
    ],
    [
      'persist answers undefined',
      { persist: async () => undefined as unknown as boolean },
      'denied',
    ],
    [
      'persist rejects after persisted said no',
      {
        persisted: async () => false,
        persist: async () => {
          throw new Error('blocked');
        },
      },
      'denied',
    ],
    [
      'persist throws before returning a promise',
      {
        persist: () => {
          throw new Error('sync throw');
        },
      },
      'denied',
    ],
    [
      'persisted is not a function',
      { persisted: 5 as unknown as () => Promise<boolean>, persist: async () => true },
      'denied',
    ],
  ] as const)('%s', async (_l, storage, expected) => {
    expect(await requestPersistentStorage(storage)).toBe(expected);
  });

  it('still asks for persistence when the persisted() check itself throws', async () => {
    const persist = vi.fn(async () => true);
    const result = await requestPersistentStorage({
      persisted: async () => {
        throw new Error('flaky');
      },
      persist,
    });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(result).toBe('granted');
  });

  it('calls the browser methods on the storage object, which real browsers require', async () => {
    const storage = {
      ok: true,
      async persisted(this: { ok?: boolean }) {
        if (!this?.ok) throw new TypeError('Illegal invocation');
        return false;
      },
      async persist(this: { ok?: boolean }) {
        if (!this?.ok) throw new TypeError('Illegal invocation');
        return true;
      },
    };
    expect(await requestPersistentStorage(storage)).toBe('granted');
  });

  it('asks only once per call', async () => {
    const persist = vi.fn(async () => false);
    const persisted = vi.fn(async () => false);
    await requestPersistentStorage({ persist, persisted });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persisted).toHaveBeenCalledTimes(1);
  });

  it('uses navigator.storage when called without arguments', async () => {
    const persist = vi.fn(async () => true);
    vi.stubGlobal('navigator', { storage: { persist } });
    expect(await requestPersistentStorage()).toBe('granted');
    expect(persist).toHaveBeenCalled();
  });

  it.each([
    ['no navigator at all', undefined],
    ['a navigator without storage', {}],
    ['a navigator whose storage is null', { storage: null }],
  ])('is unsupported with %s', async (_l, nav) => {
    vi.stubGlobal('navigator', nav);
    expect(await requestPersistentStorage()).toBe('unsupported');
  });
});
