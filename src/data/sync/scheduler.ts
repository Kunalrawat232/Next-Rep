import type { LogStore } from '../local';
import type { PullOutcome } from './pull';
import type { SyncWorker } from './worker';

/** The browser features the scheduler uses, so tests can drive them by hand. */
export type SchedulerEnv = {
  addEventListener(type: 'online' | 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'online' | 'visibilitychange', listener: () => void): void;
  setInterval(handler: () => void, ms: number): number;
  clearInterval(id: number): void;
  isVisible(): boolean;
};

export type SyncStatus = {
  syncing: boolean;
  pending: number;
  failed: number;
  /** The last run could not reach the server. */
  offline: boolean;
  /** History is being read from the server. */
  pulling: boolean;
  /** Goes up each time a pull changed what is on the device, so screens read it again. */
  pulledVersion: number;
};

export type SyncScheduler = {
  /** Syncs now, then keeps syncing: when the network returns, when the app is shown, and on a timer while rows wait. */
  start(): void;
  stop(): void;
  /** Call after writing to the local store, so the new row goes out soon. */
  notify(): void;
  /** Runs `work` when no push or pull is running, and keeps them from starting until it ends. */
  exclusive<T>(work: () => Promise<T>): Promise<T>;
  /** Clears what the server already has from the device (sign-out), and stops history from being read back in. */
  purgeSynced(): Promise<{ remaining: number }>;
  /** Re-reads the waiting and failed counts, after a local write that is not synced yet. */
  refresh(): Promise<void>;
  retryFailed(): Promise<void>;
  status(): SyncStatus;
  subscribe(listener: (status: SyncStatus) => void): () => void;
};

export const SYNC_INTERVAL_MS = 15_000;
/** After a pull fails for a reason other than being offline, the next try waits this long (unless the network event forces it). */
export const PULL_RETRY_MS = 60_000;

export function createSyncScheduler({
  worker,
  store,
  env,
  intervalMs = SYNC_INTERVAL_MS,
  pull,
  now = Date.now,
}: {
  worker: SyncWorker;
  store: LogStore;
  env: SchedulerEnv;
  intervalMs?: number;
  /** Reads history from the server. It runs after each push pass until one completes, and never alongside a push. */
  pull?: (isActive: () => boolean) => Promise<PullOutcome>;
  now?: () => number;
}): SyncScheduler {
  let current: SyncStatus = {
    syncing: false,
    pending: 0,
    failed: 0,
    offline: false,
    pulling: false,
    pulledVersion: 0,
  };
  let needsPull = pull !== undefined;
  let pullAfter = 0;
  /** The last pull found the network down: the timer leaves it alone until the network event. */
  let pullWaitsForNetwork = false;
  /** Set when the user clears the device (sign-out): nothing may be read back in after that. */
  let pullBlocked = false;
  const listeners = new Set<(status: SyncStatus) => void>();
  let timer: number | null = null;
  let started = false;

  const publish = (patch: Partial<SyncStatus>) => {
    current = { ...current, ...patch };
    for (const listener of [...listeners]) {
      try {
        listener(current);
      } catch {
        // one broken listener must neither stop syncing nor silence the others
      }
    }
  };

  // The database may close (sign-out) while a read is in flight; that is not an error worth surfacing.
  async function refresh() {
    try {
      publish(await store.counts());
    } catch {
      // closed or unavailable: keep the last known counts
    }
  }

  /** The end of a run. After stop() the state is updated quietly, so nobody is told about a run they stopped. */
  const finish = (patch: Partial<SyncStatus>) => {
    if (started) publish(patch);
    else current = { ...current, ...patch };
  };

  /** Always called inside the push pass's lock, so a pull never overlaps a push. */
  async function pullNow(read: NonNullable<typeof pull>) {
    publish({ pulling: true });
    const result = await read(() => started && !pullBlocked).catch((): PullOutcome => ({
      status: 'failed',
    }));
    pullWaitsForNetwork = result.status === 'offline';
    if (result.status === 'done') needsPull = false;
    if (result.status === 'failed') pullAfter = now() + PULL_RETRY_MS;
    const changed = result.status === 'done' && result.changed;
    finish({
      pulling: false,
      pulledVersion: current.pulledVersion + (changed ? 1 : 0),
      offline: result.status === 'offline' ? true : current.offline,
      ...(changed ? await store.counts().catch(() => ({})) : {}),
    });
  }

  let running = false;
  let queued: { ignoreWait: boolean } | null = null;
  let release: () => void = () => undefined;
  let idle: Promise<void> = Promise.resolve();
  const lock = () => {
    running = true;
    idle = new Promise<void>((resolve) => {
      release = resolve;
    });
  };
  const unlock = () => {
    running = false;
    release();
  };

  async function sync(ignoreWait: boolean): Promise<void> {
    if (!started) return;
    if (running) {
      // A burst of requests becomes one more pass after the current one, not a pile of overlapping ones.
      queued = { ignoreWait: ignoreWait || (queued?.ignoreWait ?? false) };
      return;
    }
    lock();
    try {
      const counts = await store.counts();
      if (!started) return; // stopped while the counts were being read
      publish({ ...counts, syncing: true });
      const outcome = await worker.run({ ignoreWait });
      const moved = outcome.pushedWorkouts + outcome.pushedSets + outcome.deletedSets > 0;
      // Offline stays on until a request gets through (or the network event says it is back).
      const offline = outcome.offline ? true : moved ? false : current.offline;
      finish({ ...(await store.counts()), syncing: false, offline });
      if (
        started &&
        pull &&
        needsPull &&
        !pullBlocked &&
        !outcome.offline &&
        (ignoreWait || now() >= pullAfter)
      ) {
        await pullNow(pull);
      }
    } catch {
      finish({ syncing: false });
    } finally {
      unlock();
    }
    if (queued && started) {
      const next = queued;
      queued = null;
      await sync(next.ignoreWait);
    }
  }

  const onOnline = () => {
    pullWaitsForNetwork = false;
    publish({ offline: false });
    void sync(true);
  };
  const onVisibility = () => {
    if (env.isVisible()) void sync(true);
  };
  const onTick = () => {
    void store
      .counts()
      .then(({ pending }) => {
        if (
          pending > 0 ||
          (needsPull && !pullWaitsForNetwork && !pullBlocked && now() >= pullAfter)
        )
          void sync(false);
      })
      .catch(() => undefined);
  };

  return {
    start() {
      if (started) return;
      started = true;
      env.addEventListener('online', onOnline);
      env.addEventListener('visibilitychange', onVisibility);
      timer = env.setInterval(onTick, intervalMs);
      void sync(true);
    },

    stop() {
      if (!started) return;
      started = false;
      env.removeEventListener('online', onOnline);
      env.removeEventListener('visibilitychange', onVisibility);
      if (timer !== null) env.clearInterval(timer);
      timer = null;
    },

    notify() {
      void sync(false);
    },

    async exclusive<T>(work: () => Promise<T>): Promise<T> {
      while (running) await idle;
      lock();
      try {
        return await work();
      } finally {
        unlock();
        if (queued && started) {
          const next = queued;
          queued = null;
          void sync(next.ignoreWait);
        }
      }
    },

    purgeSynced() {
      // No pull may start, or finish, after this: the history it would bring back is what is being cleared.
      pullBlocked = true;
      return this.exclusive(() => store.purgeSynced());
    },

    refresh,

    async retryFailed() {
      try {
        await store.retryFailed();
      } catch {
        return;
      }
      await refresh();
      void sync(true);
    },

    status: () => current,

    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
