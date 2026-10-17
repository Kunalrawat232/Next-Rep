import { describe, expect, it } from 'vitest';
import { aSet, aWorkout, freshLocal, reopenLocal } from '../../test/localDb';

describe('the chat with the coach, kept on the device', () => {
  it('starts empty', async () => {
    const { store } = freshLocal();
    expect(await store.coachMessages()).toEqual([]);
  });

  it('keeps messages in the order they were added, even within the same millisecond', async () => {
    const { store } = freshLocal();
    await Promise.all([]);
    const first = await store.addCoachMessage({ role: 'user', text: 'one' });
    const second = await store.addCoachMessage({ role: 'coach', text: 'two' });
    const third = await store.addCoachMessage({ role: 'user', text: 'three' });
    expect(first.at).toBeLessThan(second.at);
    expect(second.at).toBeLessThan(third.at);
    expect((await store.coachMessages()).map((m) => m.text)).toEqual(['one', 'two', 'three']);
  });

  it('survives a reload of the app', async () => {
    const { store, userId } = freshLocal();
    await store.addCoachMessage({ role: 'user', text: 'hello' });
    const again = reopenLocal(userId);
    expect((await again.store.coachMessages()).map((m) => m.text)).toEqual(['hello']);
  });

  it('keeps only the newest 50', async () => {
    const { store } = freshLocal();
    for (let i = 1; i <= 55; i += 1) await store.addCoachMessage({ role: 'user', text: `m${i}` });
    const kept = await store.coachMessages();
    expect(kept).toHaveLength(50);
    expect(kept[0]!.text).toBe('m6');
    expect(kept.at(-1)!.text).toBe('m55');
  });

  it('can be cleared, and only for that user', async () => {
    const mine = freshLocal();
    const theirs = freshLocal();
    await mine.store.addCoachMessage({ role: 'user', text: 'mine' });
    await theirs.store.addCoachMessage({ role: 'user', text: 'theirs' });
    await mine.store.clearCoachMessages();
    expect(await mine.store.coachMessages()).toEqual([]);
    expect((await theirs.store.coachMessages()).map((m) => m.text)).toEqual(['theirs']);
  });

  it('leaves out a damaged row instead of showing it', async () => {
    const { store, db } = freshLocal();
    await store.addCoachMessage({ role: 'user', text: 'good' });
    await db.coachMessages.put({ id: 'bad1', role: 'robot', text: 'x', at: 5 } as never);
    await db.coachMessages.put({ id: 'bad2', role: 'user', text: '', at: 6 } as never);
    await db.coachMessages.put({
      id: 'bad3',
      role: 'user',
      text: 'no time',
      at: Number.NaN,
    } as never);
    expect((await store.coachMessages()).map((m) => m.text)).toEqual(['good']);
  });

  it('is wiped at sign-out together with what the server already has, but never touches waiting sets', async () => {
    const { store } = freshLocal();
    const workout = await store.startWorkout(aWorkout());
    await store.logSet(aSet(workout.id));
    await store.addCoachMessage({ role: 'user', text: 'private question' });
    await store.purgeSynced();
    expect(await store.coachMessages()).toEqual([]);
    expect(await store.listSets(workout.id)).toHaveLength(1);
  });
});
