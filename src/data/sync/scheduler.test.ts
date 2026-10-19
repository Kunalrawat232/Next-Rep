import { describe, expect, it, vi } from 'vitest';
import { createFakeRemoteLog } from '../../test/fakeRemoteLog';
import { aSet, aWorkout, freshLocal } from '../../test/localDb';
import { createSyncScheduler, type SchedulerEnv } from './scheduler';
import { createSyncWorker } from './worker';

/** A browser stand-in whose events and timers the test fires by hand. */
function fakeEnv() {
  const listeners = new Map<string, Set<() => void>>();
  const timers = new Map<number, () => void>();
  let nextId = 1;
  let visible = true;
  const env: SchedulerEnv = {
    addEventListener: (type, fn) =>
      void (listeners.get(type) ?? listeners.set(type, new Set()).get(type))!.add(fn),
    removeEventListener: (type, fn) => void listeners.get(type)?.delete(fn),
    setInterval: (fn) => {
      timers.set(nextId, fn);
      return nextId++;
    },
    clearInterval: (id) => void timers.delete(id),
    isVisible: () => visible,
  };
  return {
    env,
    fire: (type: string) => listeners.get(type)?.forEach((fn) => fn()),
    tick: () => timers.forEach((fn) => fn()),
    listenerCount: (type: string) => listeners.get(type)?.size ?? 0,
    timerCount: () => timers.size,
    setVisible: (value: boolean) => void (visible = value),
  };
}

async function setup() {
  const local = freshLocal();
  const server = createFakeRemoteLog();
  const clock = { now: 1_000_000 };
  const worker = createSyncWorker({
    store: local.store,
    remote: server.remote,
    userId: 'u1',
    now: () => clock.now,
  });
  const run = vi.spyOn(worker, 'run');
  const browser = fakeEnv();
  const scheduler = createSyncScheduler({ worker, store: local.store, env: browser.env });
  return { ...local, server, clock, worker, run, browser, scheduler };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 80));

describe('starting and stopping', () => {
  it('syncs at once when it starts, even rows that are still backing off', async () => {
    const { store, run, scheduler } = await setup();
    await store.startWorkout(aWorkout());
    scheduler.start();
    await settle();
    expect(run).toHaveBeenCalledWith({ ignoreWait: true });
    scheduler.stop();
  });

  it('listens for the network coming back and for the app becoming visible', async () => {
    const { browser, scheduler } = await setup();
    scheduler.start();
    expect(browser.listenerCount('online')).toBe(1);
    expect(browser.listenerCount('visibilitychange')).toBe(1);
    scheduler.stop();
    expect(browser.listenerCount('online')).toBe(0);
    expect(browser.listenerCount('visibilitychange')).toBe(0);
    expect(browser.timerCount()).toBe(0);
  });

  it('can be started twice without doubling its listeners', async () => {
    const { browser, scheduler } = await setup();
    scheduler.start();
    scheduler.start();
    expect(browser.listenerCount('online')).toBe(1);
    expect(browser.timerCount()).toBe(1);
    scheduler.stop();
  });

  it('does nothing after it is stopped', async () => {
    const { store, run, browser, scheduler } = await setup();
    scheduler.start();
    scheduler.stop();
    await settle();
    run.mockClear();
    await store.startWorkout(aWorkout());
    browser.fire('online');
    browser.tick();
    scheduler.notify();
    await settle();
    expect(run).not.toHaveBeenCalled();
  });
});

describe('when it runs', () => {
  it('runs, ignoring waits, when the network comes back', async () => {
    const { store, run, browser, scheduler } = await setup();
    scheduler.start();
    await settle();
    run.mockClear();
    await store.startWorkout(aWorkout());
    browser.fire('online');
    await settle();
    expect(run).toHaveBeenCalledWith({ ignoreWait: true });
    scheduler.stop();
  });

  it('runs when the app comes back to the foreground, but not when it goes to the background', async () => {
    const { run, browser, scheduler } = await setup();
    scheduler.start();
    await settle();
    run.mockClear();
    browser.setVisible(false);
    browser.fire('visibilitychange');
    await settle();
    expect(run).not.toHaveBeenCalled();
    browser.setVisible(true);
    browser.fire('visibilitychange');
    await settle();
    expect(run).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it('runs after a local write is announced', async () => {
    const { store, run, server, scheduler } = await setup();
    scheduler.start();
    await settle();
    run.mockClear();
    const w = await store.startWorkout(aWorkout());
    await store.logSet(aSet(w.id));
    scheduler.notify();
    await settle();
    expect(run).toHaveBeenCalled();
    expect(server.sets.size).toBe(1);
    scheduler.stop();
  });

  it('on each tick, runs only while something is waiting', async () => {
    const { store, run, browser, scheduler } = await setup();
    scheduler.start();
    await settle();
    run.mockClear();
    browser.tick();
    await settle();
    expect(run).not.toHaveBeenCalled(); // idle: no request, no battery
    const started = await store.startWorkout(aWorkout());
    await store.logSet(aSet(started.id));
    browser.tick();
    await settle();
    expect(run).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it('does not start a second pass while one is running', async () => {
    const { store, server, run, scheduler } = await setup();
    const started = await store.startWorkout(aWorkout());
    await store.logSet(aSet(started.id));
    const release = server.hold('upsertWorkouts');
    scheduler.start();
    scheduler.notify();
    scheduler.notify();
    await settle();
    release();
    await settle();
    expect(server.callsTo('upsertWorkouts')).toHaveLength(1);
    expect(run.mock.calls.length).toBeGreaterThan(1); // asked several times, answered by one pass
    scheduler.stop();
  });
});

describe('status', () => {
  it('reports waiting and failed counts, and that a run is going', async () => {
    const { store, server, scheduler } = await setup();
    scheduler.start();
    await settle();
    const seen: { syncing: boolean; pending: number }[] = [];
    scheduler.subscribe((s) => seen.push({ syncing: s.syncing, pending: s.pending }));
    const w = await store.startWorkout(aWorkout());
    await store.logSet(aSet(w.id));
    const release = server.hold('upsertWorkouts');
    scheduler.notify();
    await settle();
    expect(scheduler.status().syncing).toBe(true);
    expect(scheduler.status().pending).toBe(2);
    release();
    await settle();
    expect(scheduler.status()).toEqual({
      syncing: false,
      pending: 0,
      failed: 0,
      offline: false,
      pulling: false,
      pulledVersion: 0,
    });
    expect(seen.some((s) => s.syncing)).toBe(true);
    scheduler.stop();
  });

  it('says it is offline after a run that could not reach the server, and clears that once it can', async () => {
    const { store, server, scheduler, browser } = await setup();
    scheduler.start();
    await settle();
    const started = await store.startWorkout(aWorkout());
    await store.logSet(aSet(started.id));
    server.setOffline(true);
    scheduler.notify();
    await settle();
    expect(scheduler.status()).toMatchObject({ offline: true, pending: 2 });
    server.setOffline(false);
    browser.fire('online');
    await settle();
    expect(scheduler.status()).toMatchObject({ offline: false, pending: 0 });
    scheduler.stop();
  });

  it('counts failed rows, and a manual retry puts them back to work', async () => {
    const { store, db, scheduler, server } = await setup();
    scheduler.start();
    await settle();
    const w = await store.startWorkout(aWorkout());
    await store.logSet(aSet(w.id));
    await db.workouts.update(w.id, { syncStatus: 'failed', attempts: 8 });
    await scheduler.refresh();
    expect(scheduler.status()).toMatchObject({ failed: 1, pending: 1 }); // the set still waits
    await scheduler.retryFailed();
    await settle();
    expect(server.workouts.has(w.id)).toBe(true);
    expect(scheduler.status()).toMatchObject({ failed: 0, pending: 0 });
    scheduler.stop();
  });

  it('stops telling a listener once it unsubscribes', async () => {
    const { store, scheduler } = await setup();
    const listener = vi.fn();
    const off = scheduler.subscribe(listener);
    off();
    await store.startWorkout(aWorkout());
    scheduler.notify();
    await settle();
    expect(listener).not.toHaveBeenCalled();
  });
});
