import { describe, expect, it, vi } from 'vitest';
import { createFakeRemoteLog } from '../../test/fakeRemoteLog';
import { aSet, aWorkout, freshLocal } from '../../test/localDb';
import type { PullOutcome } from './pull';
import { createSyncScheduler, type SchedulerEnv } from './scheduler';
import { createSyncWorker } from './worker';

const env: SchedulerEnv = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  setInterval: () => 1,
  clearInterval: () => undefined,
  isVisible: () => true,
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 60));
const done = (over: Partial<Extract<PullOutcome, { status: 'done' }>> = {}): PullOutcome => ({
  status: 'done',
  refused: 0,
  changed: false,
  addedWorkouts: 0,
  updatedWorkouts: 0,
  addedSets: 0,
  removedWorkouts: 0,
  removedSets: 0,
  skippedSets: 0,
  removalsSkipped: false,
  ...over,
});

function setup(pull: (isActive: () => boolean) => Promise<PullOutcome>) {
  const local = freshLocal();
  const server = createFakeRemoteLog();
  const clock = { now: 1_000_000 };
  const worker = createSyncWorker({
    store: local.store,
    remote: server.remote,
    userId: 'u',
    now: () => clock.now,
  });
  const scheduler = createSyncScheduler({
    worker,
    store: local.store,
    env,
    pull,
    now: () => clock.now,
  });
  return { ...local, server, clock, scheduler };
}

describe('scheduler, adversarial', () => {
  it('a pull that was stopped (not failed) is tried again at the next pass, without the one-minute wait', async () => {
    const pull = vi.fn<(a: () => boolean) => Promise<PullOutcome>>();
    pull.mockResolvedValueOnce({ status: 'stopped' }).mockResolvedValue(done());
    const s = setup(pull);
    s.scheduler.start();
    await settle();
    s.scheduler.notify();
    await settle();
    expect(pull).toHaveBeenCalledTimes(2);
    s.scheduler.stop();
  });

  it('a pull that completes with removals skipped is still a completed pull (not repeated forever)', async () => {
    const pull = vi.fn(async () => done({ removalsSkipped: true }));
    const s = setup(pull);
    s.scheduler.start();
    await settle();
    s.scheduler.notify();
    s.scheduler.notify();
    await settle();
    expect(pull).toHaveBeenCalledTimes(1);
    s.scheduler.stop();
  });

  it('exclusive work that throws releases the lock, so pushes and later exclusive work still run', async () => {
    const s = setup(async () => done());
    s.scheduler.start();
    await settle();
    await expect(
      s.scheduler.exclusive(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const w = await s.store.startWorkout(aWorkout());
    await s.store.logSet(aSet(w.id));
    s.scheduler.notify();
    await settle();
    expect(s.server.workouts.has(w.id)).toBe(true);
    await expect(s.scheduler.exclusive(async () => 7)).resolves.toBe(7);
    s.scheduler.stop();
  });

  it('two exclusive jobs started together run one after the other, never overlapping', async () => {
    const s = setup(async () => done());
    s.scheduler.start();
    await settle();
    const log: string[] = [];
    const job = (name: string) => async () => {
      log.push(`${name}:start`);
      await new Promise((r) => setTimeout(r, 15));
      log.push(`${name}:end`);
    };
    await Promise.all([
      s.scheduler.exclusive(job('a')),
      s.scheduler.exclusive(job('b')),
      s.scheduler.exclusive(job('c')),
    ]);
    expect(log).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end']);
    s.scheduler.stop();
  });

  it('purgeSynced twice in a row is safe and still blocks pulls', async () => {
    const pull = vi.fn(async () => done());
    const s = setup(pull);
    await s.scheduler.purgeSynced();
    await s.scheduler.purgeSynced();
    s.scheduler.start();
    await settle();
    expect(pull).not.toHaveBeenCalled();
    s.scheduler.stop();
  });

  it('the pull is never started while the push said the network is down', async () => {
    const pull = vi.fn(async () => done());
    const s = setup(pull);
    const w = await s.store.startWorkout(aWorkout());
    s.server.setOffline(true);
    s.scheduler.start();
    await settle();
    expect(pull).not.toHaveBeenCalled();
    expect(s.scheduler.status().offline).toBe(true);
    s.server.setOffline(false);
    s.scheduler.notify();
    s.clock.now += 10_000;
    s.scheduler.notify();
    await settle();
    expect(s.server.workouts.has(w.id)).toBe(true);
    s.scheduler.stop();
  });
});
