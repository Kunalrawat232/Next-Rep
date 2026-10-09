import type { LogStore } from '../local';
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
};

export type SyncScheduler = {
  /** Syncs now, then keeps syncing: when the network returns, when the app is shown, and on a timer while rows wait. */
  start(): void;
  stop(): void;
  /** Call after writing to the local store, so the new row goes out soon. */
  notify(): void;
  /** Re-reads the waiting and failed counts, after a local write that is not synced yet. */
  refresh(): Promise<void>;
  retryFailed(): Promise<void>;
  status(): SyncStatus;
  subscribe(listener: (status: SyncStatus) => void): () => void;
};

export const SYNC_INTERVAL_MS = 15_000;

export function createSyncScheduler({
  worker,
  store,
  env,
  intervalMs = SYNC_INTERVAL_MS,
}: {
  worker: SyncWorker;
  store: LogStore;
  env: SchedulerEnv;
  intervalMs?: number;
}): SyncScheduler {
  let current: SyncStatus = { syncing: false, pending: 0, failed: 0, offline: false };
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

  let running = false;
  let queued: { ignoreWait: boolean } | null = null;

  async function sync(ignoreWait: boolean): Promise<void> {
    if (!started) return;
    if (running) {
      // A burst of requests becomes one more pass after the current one, not a pile of overlapping ones.
      queued = { ignoreWait: ignoreWait || (queued?.ignoreWait ?? false) };
      return;
    }
    running = true;
    try {
      const counts = await store.counts();
      if (!started) return; // stopped while the counts were being read
      publish({ ...counts, syncing: true });
      const outcome = await worker.run({ ignoreWait });
      const moved = outcome.pushedWorkouts + outcome.pushedSets + outcome.deletedSets > 0;
      // Offline stays on until a request gets through (or the network event says it is back).
      const offline = outcome.offline ? true : moved ? false : current.offline;
      finish({ ...(await store.counts()), syncing: false, offline });
    } catch {
      finish({ syncing: false });
    } finally {
      running = false;
    }
    if (queued && started) {
      const next = queued;
      queued = null;
      await sync(next.ignoreWait);
    }
  }

  const onOnline = () => {
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
        if (pending > 0) void sync(false);
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
