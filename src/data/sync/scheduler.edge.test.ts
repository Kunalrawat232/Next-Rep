import { describe, expect, it, vi } from 'vitest';
import { createFakeRemoteLog } from '../../test/fakeRemoteLog';
import { aSet, aWorkout, freshLocal } from '../../test/localDb';
import { createSyncScheduler, type SchedulerEnv, type SyncStatus } from './scheduler';
import { createSyncWorker } from './worker';

function fakeEnv(firstTimerId = 1) {
  const listeners = new Map<string, Set<() => void>>();
  const timers = new Map<number, () => void>();
  let nextId = firstTimerId;
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

function setup(firstTimerId = 1) {
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
  const browser = fakeEnv(firstTimerId);
  const scheduler = createSyncScheduler({ worker, store: local.store, env: browser.env });
  return { ...local, server, clock, worker, run, browser, scheduler };
}

async function waitFor(condition: () => boolean, timeoutMs = 5000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 80));

describe('rapid events', () => {
  it('toggling online and offline fifty times ends in one consistent, finished state', async () => {
    const { store, server, browser, scheduler } = setup();
    scheduler.start();
    await settle();
    const w = await store.startWorkout(aWorkout());
    await store.logSet(aSet(w.id));
    for (let i = 0; i < 50; i++) {
      server.setOffline(i % 2 === 0);
      browser.fire('online');
    }
    server.setOffline(false);
    browser.fire('online');
    await settle();
    await settle();
    expect(scheduler.status()).toMatchObject({ syncing: false, pending: 0, failed: 0 });
    expect(server.sets.size).toBe(1);
    scheduler.stop();
  });

  it('a storm of two hundred notifies sends each row once and leaves syncing false', async () => {
    const { store, server, scheduler } = setup();
    scheduler.start();
    await settle();
    const w = await store.startWorkout(aWorkout());
    for (let i = 0; i < 5; i++) await store.logSet(aSet(w.id));
    for (let i = 0; i < 200; i++) scheduler.notify();
    await waitFor(() => server.sets.size === 5 && !scheduler.status().syncing);
    expect(server.sets.size).toBe(5);
    expect(scheduler.status().syncing).toBe(false);
    expect(server.callsTo('upsertWorkouts').length).toBeLessThanOrEqual(2);
    scheduler.stop();
  });

  it('visibility flapping hidden, visible, hidden, visible only runs for the visible ones', async () => {
    const { run, browser, scheduler } = setup();
    scheduler.start();
    await waitFor(() => run.mock.calls.length >= 1 && !scheduler.status().syncing);
    run.mockClear();
    for (const visible of [false, true, false, true]) {
      browser.setVisible(visible);
      browser.fire('visibilitychange');
    }
    await settle();
    expect(run.mock.calls.length).toBe(2);
    scheduler.stop();
  });

  it('start, stop, start in a row leaves exactly one set of listeners and one timer', async () => {
    const { browser, scheduler } = setup();
    scheduler.start();
    scheduler.stop();
    scheduler.start();
    expect(browser.listenerCount('online')).toBe(1);
    expect(browser.listenerCount('visibilitychange')).toBe(1);
    expect(browser.timerCount()).toBe(1);
    scheduler.stop();
    expect(browser.timerCount()).toBe(0);
  });

  it('stop without start is harmless, and stop twice clears the timer once', async () => {
    const { browser, scheduler } = setup();
    scheduler.stop();
    scheduler.start();
    scheduler.stop();
    scheduler.stop();
    expect(browser.timerCount()).toBe(0);
  });

  it('a timer id of 0 is still cleared on stop', async () => {
    const { browser, scheduler } = setup(0);
    scheduler.start();
    expect(browser.timerCount()).toBe(1);
    scheduler.stop();
    expect(browser.timerCount()).toBe(0);
  });
});

describe('stopping while a run is in flight', () => {
  it('does not publish to listeners after stop', async () => {
    const { store, server, scheduler } = setup();
    await store.startWorkout(aWorkout());
    const release = server.hold('upsertWorkouts');
    scheduler.start();
    await settle();
    const seen: SyncStatus[] = [];
    scheduler.subscribe((s) => seen.push(s));
    scheduler.stop();
    release();
    await settle();
    expect(seen).toEqual([]);
  });

  it('does not leave the status saying it is still syncing', async () => {
    const { store, server, scheduler } = setup();
    await store.startWorkout(aWorkout());
    const release = server.hold('upsertWorkouts');
    scheduler.start();
    await settle();
    expect(scheduler.status().syncing).toBe(true);
    scheduler.stop();
    release();
    await settle();
    expect(scheduler.status().syncing).toBe(false);
  });

  it('starting again after a stop syncs again and reports a finished run', async () => {
    const { store, server, scheduler } = setup();
    scheduler.start();
    await settle();
    scheduler.stop();
    const w = await store.startWorkout(aWorkout());
    await store.logSet(aSet(w.id));
    scheduler.start();
    await settle();
    expect(server.sets.size).toBe(1);
    expect(scheduler.status()).toMatchObject({ syncing: false, pending: 0 });
    scheduler.stop();
  });

  it('a stop and quick restart while a run is held does not run two passes at once', async () => {
    const { store, server, scheduler } = setup();
    await store.startWorkout(aWorkout());
    const release = server.hold('upsertWorkouts');
    scheduler.start();
    await settle();
    scheduler.stop();
    scheduler.start();
    await settle();
    release();
    await settle();
    expect(server.callsTo('upsertWorkouts')).toHaveLength(1);
    scheduler.stop();
  });
});

describe('things that fail', () => {
  it('a worker that rejects ends the run with syncing false, and later runs still work', async () => {
    const { store, run, server, scheduler } = setup();
    scheduler.start();
    await settle();
    run.mockRejectedValueOnce(new Error('worker exploded'));
    const w = await store.startWorkout(aWorkout());
    scheduler.notify();
    await settle();
    expect(scheduler.status().syncing).toBe(false);
    scheduler.notify();
    await settle();
    expect(server.workouts.has(w.id)).toBe(true);
    scheduler.stop();
  });

  it('a worker that rejects keeps the earlier offline flag rather than claiming we are online', async () => {
    const { store, run, server, scheduler } = setup();
    scheduler.start();
    await settle();
    await store.startWorkout(aWorkout());
    server.setOffline(true);
    scheduler.notify();
    await settle();
    expect(scheduler.status().offline).toBe(true);
    run.mockRejectedValueOnce(new Error('boom'));
    scheduler.notify();
    await settle();
    expect(scheduler.status().offline).toBe(true);
    scheduler.stop();
  });

  it('a store whose counts() rejects does not throw out of start, notify or a tick', async () => {
    const { store, browser, scheduler } = setup();
    vi.spyOn(store, 'counts').mockRejectedValue(new Error('database closed'));
    expect(() => {
      scheduler.start();
      scheduler.notify();
      browser.tick();
      browser.fire('online');
    }).not.toThrow();
    await settle();
    expect(scheduler.status()).toEqual({ syncing: false, pending: 0, failed: 0, offline: false });
    scheduler.stop();
  });

  it('after counts() recovers, the next notify syncs normally', async () => {
    const { store, server, scheduler } = setup();
    const counts = vi.spyOn(store, 'counts').mockRejectedValue(new Error('database closed'));
    scheduler.start();
    await settle();
    counts.mockRestore();
    const w = await store.startWorkout(aWorkout());
    scheduler.notify();
    await settle();
    expect(server.workouts.has(w.id)).toBe(true);
    scheduler.stop();
  });

  it('refresh keeps the last known counts when the database is closed', async () => {
    const { store, scheduler } = setup();
    await store.startWorkout(aWorkout());
    await scheduler.refresh();
    expect(scheduler.status().pending).toBe(1);
    vi.spyOn(store, 'counts').mockRejectedValue(new Error('closed'));
    await expect(scheduler.refresh()).resolves.toBeUndefined();
    expect(scheduler.status().pending).toBe(1);
  });

  it('a manual retry whose store call rejects resolves quietly and starts no sync', async () => {
    const { store, run, scheduler } = setup();
    scheduler.start();
    await settle();
    run.mockClear();
    vi.spyOn(store, 'retryFailed').mockRejectedValue(new Error('closed'));
    await expect(scheduler.retryFailed()).resolves.toBeUndefined();
    await settle();
    expect(run).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it('a subscriber that throws does not stop rows from being synced', async () => {
    const { store, server, scheduler } = setup();
    scheduler.start();
    await settle();
    scheduler.subscribe((s) => {
      if (s.syncing) throw new Error('UI bug');
    });
    const w = await store.startWorkout(aWorkout());
    scheduler.notify();
    await settle();
    expect(server.workouts.has(w.id)).toBe(true);
    scheduler.stop();
  });

  it('a subscriber that throws does not stop other subscribers hearing about the run', async () => {
    const { store, scheduler } = setup();
    scheduler.start();
    await settle();
    const seen: SyncStatus[] = [];
    scheduler.subscribe((s) => {
      if (s.syncing) throw new Error('UI bug');
    });
    scheduler.subscribe((s) => seen.push(s));
    await store.startWorkout(aWorkout());
    scheduler.notify();
    await settle();
    expect(seen.some((s) => s.syncing)).toBe(true);
    scheduler.stop();
  });

  it('subscribing twice with the same function and unsubscribing once stops it', async () => {
    const { scheduler, store } = setup();
    const listener = vi.fn();
    const off = scheduler.subscribe(listener);
    scheduler.subscribe(listener);
    off();
    await store.startWorkout(aWorkout());
    await scheduler.refresh();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('retry and refresh during a run', () => {
  it('a retried failed row goes out, at the latest on the next timer tick', async () => {
    const { store, db, server, scheduler, browser } = setup();
    scheduler.start();
    await settle();
    const other = await store.startWorkout(aWorkout());
    const failed = await store.startWorkout(aWorkout());
    await db.workouts.update(failed.id, { syncStatus: 'failed', attempts: 8 });
    const release = server.hold('upsertWorkouts');
    scheduler.notify();
    await settle();
    await scheduler.retryFailed(); // arrives while the other pass is in flight
    release();
    await settle();
    browser.tick();
    await settle();
    expect(server.workouts.has(other.id)).toBe(true);
    expect(server.workouts.has(failed.id)).toBe(true);
    expect(scheduler.status()).toMatchObject({ pending: 0, failed: 0, syncing: false });
    scheduler.stop();
  });

  it('a retried row is sent without waiting for the next timer tick', async () => {
    const { store, db, server, scheduler } = setup();
    scheduler.start();
    await settle();
    const other = await store.startWorkout(aWorkout());
    const failed = await store.startWorkout(aWorkout());
    await db.workouts.update(failed.id, { syncStatus: 'failed', attempts: 8 });
    const release = server.hold('upsertWorkouts');
    scheduler.notify();
    await settle();
    await scheduler.retryFailed();
    release();
    await settle();
    await settle();
    expect(server.workouts.has(other.id)).toBe(true);
    expect(server.workouts.has(failed.id)).toBe(true);
    scheduler.stop();
  });

  it('refresh does not change the syncing flag', async () => {
    const { store, server, scheduler } = setup();
    scheduler.start();
    await settle();
    await store.startWorkout(aWorkout());
    const release = server.hold('upsertWorkouts');
    scheduler.notify();
    await settle();
    await scheduler.refresh();
    expect(scheduler.status().syncing).toBe(true);
    release();
    await settle();
    scheduler.stop();
  });

  it('retryFailed on a stopped scheduler does not start a pass', async () => {
    const { run, scheduler } = setup();
    await scheduler.retryFailed();
    await settle();
    expect(run).not.toHaveBeenCalled();
  });

  it('notify before start does nothing', async () => {
    const { store, run, scheduler } = setup();
    await store.startWorkout(aWorkout());
    scheduler.notify();
    await settle();
    expect(run).not.toHaveBeenCalled();
  });
});
