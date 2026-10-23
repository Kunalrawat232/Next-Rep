// ignoreClosed against the real Dexie error, not a hand-built one. A failing test here is a suspected bug.
import { describe, expect, it } from 'vitest';
import { freshLocal, uuid } from '../../test/localDb';
import { ignoreClosed } from './closed';

describe('ignoreClosed with a real closed database', () => {
  it('swallows the error from a read on a closed database', async () => {
    const { db } = freshLocal();
    await db.open();
    db.close();
    await expect(db.sets.toArray().catch(ignoreClosed)).resolves.toBeUndefined();
  });

  it('swallows the error from a transaction on a closed database', async () => {
    const { db } = freshLocal();
    await db.open();
    db.close();
    await expect(
      db.transaction('rw', db.sets, async () => db.sets.clear()).catch(ignoreClosed),
    ).resolves.toBeUndefined();
  });

  it('swallows the error from a store call made after sign-out closed the database', async () => {
    const { db, store } = freshLocal();
    await db.open();
    db.close();
    await expect(store.activeWorkout().catch(ignoreClosed)).resolves.toBeUndefined();
    await expect(store.listSets(uuid()).catch(ignoreClosed)).resolves.toBeUndefined();
    await expect(store.cachedGym().catch(ignoreClosed)).resolves.toBeUndefined();
  });

  it('still throws a different Dexie error (a constraint failure on a duplicate key)', async () => {
    const { db } = freshLocal();
    await db.open();
    const row = { id: 'one' } as never;
    await db.gymCache.add(row);
    await expect(db.gymCache.add(row).catch(ignoreClosed)).rejects.toThrow();
  });
});

describe('ignoreClosed with look-alikes', () => {
  it.each([
    ['a plain object with the right name', { name: 'DatabaseClosedError' }],
    ['an error that only mentions closing', new Error('DatabaseClosedError')],
    [
      'a different name with a closed message',
      Object.assign(new Error('Database has been closed'), { name: 'InvalidStateError' }),
    ],
    ['undefined', undefined],
    ['a number', 0],
  ])('rethrows %s', (_name, error) => {
    expect(() => ignoreClosed(error)).toThrow();
  });
});
