import { describe, expect, it, vi } from 'vitest';
import { createFakeRemoteLog } from '../../test/fakeRemoteLog';
import { aSet, aWorkout, freshLocal } from '../../test/localDb';
import type { PullOutcome } from './pull';
import { pullHistory } from './pull';
import { PULL_RETRY_MS, createSyncScheduler, type SchedulerEnv } from './scheduler';
import { createSyncWorker } from './worker';

function fakeEnv() {
  const listeners = new Map<string, Set<() => void>>();
  const timers = new Map<number, () => void>();
  let nextId = 1;
  const env: SchedulerEnv = {
    addEventListener: (type, fn) =>
      void (listeners.get(type) ?? listeners.set(type, new Set()).get(type))!.add(fn),
    removeEventListener: (type, fn) => void listeners.get(type)?.delete(fn),
    setInterval: (fn) => {
      timers.set(nextId, fn);
      return nextId++;
    },
    clearInterval: (id) => void timers.delete(id),
    isVisible: () => true,
  };
  return {
    env,
    fire: (type: string) => listeners.get(type)?.forEach((fn) => fn()),
    tick: () => timers.forEach((fn) => fn()),
  };
}

const done = (changed: boolean): PullOutcome => ({
  status: 'done',
  refused: 0,
  changed,
  addedWorkouts: 0,
  updatedWorkouts: 0,
  addedSets: changed ? 1 : 0,
  removedWorkouts: 0,
  removedSets: 0,
  skippedSets: 0,
  removalsSkipped: false,
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 80));

function setup(pull: (isActive: () => boolean) => Promise<PullOutcome>) {
  const local = freshLocal();
  const server = createFakeRemoteLog();
  const clock = { now: 1_000_000 };
  const worker = createSyncWorker({
    store: local.store,
    remote: server.remote,
    userId: 'u1',
    now: () => clock.now,
  });
  const browser = fakeEnv();
  const scheduler = createSyncScheduler({
    worker,
    store: local.store,
    env: browser.env,
    pull,
    now: () => clock.now,
  });
  return { ...local, server, clock, worker, browser, scheduler };
}

describe('pulling history after a push pass', () => {
  it('pulls once when it starts, and says so while it reads', async () => {
    let release: () => void = () => undefined;
    const pull = vi.fn(
      () =>
        new Promise<PullOutcome>((resolve) => {
          release = () => resolve(done(true));
        }),
    );
    const { scheduler } = setup(pull);
    const seen: boolean[] = [];
    scheduler.subscribe((s) => seen.push(s.pulling));
    scheduler.start();
    await settle();
    expect(pull).toHaveBeenCalledTimes(1);
    expect(scheduler.status().pulling).toBe(true);
    release();
    await settle();
    expect(scheduler.status()).toMatchObject({ pulling: false, pulledVersion: 1 });
    expect(seen).toContain(true);
    scheduler.stop();
  });

  it('does not pull again once one has completed', async () => {
    const pull = vi.fn(async () => done(false));
    const { scheduler, browser } = setup(pull);
    scheduler.start();
    await settle();
    browser.fire('online');
    browser.tick();
    scheduler.notify();
    await settle();
    expect(pull).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it('only counts a pull that changed something as news for the screens', async () => {
    const pull = vi.fn(async () => done(false));
    const { scheduler } = setup(pull);
    scheduler.start();
    await settle();
    expect(scheduler.status().pulledVersion).toBe(0);
    scheduler.stop();
  });

  it('pushes what is waiting before it pulls, and never at the same time', async () => {
    const order: string[] = [];
    const pull = vi.fn(async () => {
      order.push('pull');
      return done(false);
    });
    const { scheduler, store, server } = setup(pull);
    server.remote.upsertWorkouts.mockImplementation(async () => {
      order.push('push');
      return { status: 'ok', value: undefined };
    });
    const started = await store.startWorkout(aWorkout());
    await store.logSet(aSet(started.id));
    scheduler.start();
    await settle();
    expect(order).toEqual(['push', 'pull']);
    scheduler.stop();
  });

  it('tries again when the network comes back after an offline pull', async () => {
    const pull = vi
      .fn<() => Promise<PullOutcome>>()
      .mockResolvedValueOnce({ status: 'offline' })
      .mockResolvedValue(done(true));
    const { scheduler, browser } = setup(pull);
    scheduler.start();
    await settle();
    expect(scheduler.status().offline).toBe(true);
    browser.fire('online');
    await settle();
    expect(pull).toHaveBeenCalledTimes(2);
    expect(scheduler.status()).toMatchObject({ offline: false, pulledVersion: 1 });
    scheduler.stop();
  });

  it('waits a minute after the server fails, unless the network event forces it', async () => {
    const pull = vi
      .fn<() => Promise<PullOutcome>>()
      .mockResolvedValueOnce({ status: 'failed' })
      .mockResolvedValue(done(false));
    const { scheduler, browser, clock } = setup(pull);
    scheduler.start();
    await settle();
    expect(pull).toHaveBeenCalledTimes(1);
    browser.tick();
    await settle();
    expect(pull).toHaveBeenCalledTimes(1);
    clock.now += PULL_RETRY_MS + 1;
    browser.tick();
    await settle();
    expect(pull).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('treats a pull that throws as a failure, not a crash', async () => {
    const pull = vi.fn(async (): Promise<PullOutcome> => {
      throw new Error('boom');
    });
    const { scheduler } = setup(pull);
    scheduler.start();
    await settle();
    expect(scheduler.status().pulling).toBe(false);
    scheduler.stop();
  });

  it('tells the pull to stop once the scheduler is stopped', async () => {
    let active: () => boolean = () => true;
    const pull = vi.fn(async (isActive: () => boolean) => {
      active = isActive;
      return done(false);
    });
    const { scheduler } = setup(pull);
    scheduler.start();
    await settle();
    expect(active()).toBe(true);
    scheduler.stop();
    expect(active()).toBe(false);
  });

  it('does nothing about history when it has no pull to run', async () => {
    const local = freshLocal();
    const server = createFakeRemoteLog();
    const worker = createSyncWorker({ store: local.store, remote: server.remote, userId: 'u1' });
    const scheduler = createSyncScheduler({ worker, store: local.store, env: fakeEnv().env });
    await local.store.logSet(aSet((await local.store.startWorkout(aWorkout())).id));
    scheduler.start();
    await settle();
    expect(scheduler.status().pulling).toBe(false);
    expect(server.callsTo('fetchWorkouts')).toHaveLength(0);
    scheduler.stop();
  });
});

describe('clearing the device while history is being read', () => {
  function withRealPull() {
    const local = freshLocal();
    const server = createFakeRemoteLog();
    const worker = createSyncWorker({ store: local.store, remote: server.remote, userId: 'u1' });
    const browser = fakeEnv();
    const scheduler = createSyncScheduler({
      worker,
      store: local.store,
      env: browser.env,
      pull: (isActive) =>
        pullHistory({ store: local.store, remote: server.remote, userId: 'u1', isActive }),
    });
    const w = aWorkout();
    server.seedWorkout({ ...w, endedAt: '2026-10-10T11:00:00.000Z' });
    server.seedSet(aSet(w.id));
    return { ...local, server, browser, scheduler, w };
  }

  it('does not let a pull in flight put the history back after it was cleared', async () => {
    const { scheduler, server, db } = withRealPull();
    const release = server.hold('fetchSets');
    scheduler.start();
    await settle();
    expect(scheduler.status().pulling).toBe(true);
    const purged = scheduler.purgeSynced();
    release();
    await purged;
    await settle();
    expect(await db.sets.count()).toBe(0);
    expect(await db.workouts.count()).toBe(0);
    scheduler.stop();
  });

  it('does not start another pull after the clear, whatever fires', async () => {
    const { scheduler, server, browser, db } = withRealPull();
    server.setOffline(true);
    scheduler.start();
    await settle();
    await scheduler.purgeSynced();
    server.setOffline(false);
    browser.fire('online');
    browser.fire('visibilitychange');
    browser.tick();
    await settle();
    expect(await db.sets.count()).toBe(0);
    expect(server.callsTo('fetchSets').length).toBe(0);
    scheduler.stop();
  });

  it('keeps a set deleted while a pull was reading from coming back', async () => {
    const { scheduler, server, store, db, w } = withRealPull();
    const set = [...server.sets.values()][0]!;
    // The set is already on the device and synced; the pull is held while it reads.
    await store.startWorkout(w);
    await db.workouts.update(w.id, { syncStatus: 'synced' });
    await store.logSet(set);
    await db.sets.update(set.id, { syncStatus: 'synced' });
    const release = server.hold('fetchSets');
    scheduler.start();
    await settle();
    const deleted = scheduler.exclusive(async () => {
      await server.remote.softDeleteSet(set.id, new Date().toISOString());
      await store.removeSyncedSet(set.id);
    });
    release();
    await deleted;
    await settle();
    expect(await db.sets.count()).toBe(0);
    scheduler.stop();
  });

  it('runs exclusive work one at a time, after a pass that is under way', async () => {
    const { scheduler } = withRealPull();
    const order: string[] = [];
    scheduler.start();
    await Promise.all([
      scheduler.exclusive(async () => void order.push('a')),
      scheduler.exclusive(async () => void order.push('b')),
    ]);
    expect(order).toEqual(['a', 'b']);
    scheduler.stop();
  });
});
