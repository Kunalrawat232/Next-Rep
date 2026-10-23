# Sync worker, scheduler and history pull

```
Screen --> LogStore (Dexie) --> SyncScheduler --> SyncWorker --> RemoteLog.upsertWorkouts / upsertSets / softDeleteSet --> Supabase
                                       \--> after a push pass: pullHistory --> RemoteLog.fetchWorkouts / fetchSets --> LogStore.mergePulled
```

Code: `src/data/sync/worker.ts` (`createSyncWorker`), `scheduler.ts` (`createSyncScheduler`, status and controls), `pull.ts` (`pullHistory`), `persist.ts` (asks the browser to keep the data), `types.ts` (the `RemoteLog` interface); the Supabase implementation is `src/data/remote/log.ts`; the outbox lives in `src/data/local/logStore.ts`; the React side is `src/features/sync/SyncProvider.tsx` (`useLogStore`, `useSyncControls`, `useSyncStatus`, `SyncBadge`). Design and reasons: [offline sync](../../docs/architecture/offline-sync.md), ADR [011](../../docs/architecture/decisions/011-local-log-and-sync-worker.md) and [012](../../docs/architecture/decisions/012-pull-history-from-server.md).

## Push

- **Order:** one pass sends due workouts first, then due sets (only sets whose workout `everSynced`), then the deletions owed. Batches of 50. Rows are re-validated with the shared schemas before sending; an invalid row is marked failed and not sent.
- **A workout with no sets that never reached the server is not sent** (see [empty-workouts.md](empty-workouts.md)).
- **Retries:** after `MAX_ATTEMPTS = 8` refusals of the row itself a row is `failed` and needs a manual retry (the sync badge offers it). Backoff starts at 2 s and doubles to 5 min (`backoffMs`, `BACKOFF_MAX_MS`). Being offline (wait 5 s) or server trouble (wait 30 s) never counts as an attempt, so an outage cannot fail rows.
- **Errors** are classified `offline | conflict | rejected | unknown` in `src/data/remote/failure.ts` (see [supabase-client-and-errors.md](../api/supabase-client-and-errors.md)). Only `rejected` and `conflict` count against a row (`offline` and `unknown` just wait). A refused batch is retried one row at a time, so one bad row cannot hold back the others. A workout the server rejects while it has a gym is sent again without the gym (most likely the gym was deleted on another device), so its sets are not stranded.
- **Removing a set:** an unsynced set is just deleted locally. A set that may already be on the server is soft-deleted there through the `deletions` queue (also when it was removed while its push was in flight). Undoing a saved set needs internet (the server is told first).
- Ending a workout is another upsert of the same row (a higher `rev`), so it also works offline.

## Scheduler

Runs a pass on start, on the `online` event, when the page becomes visible, after a local write (`notify`), and every `SYNC_INTERVAL_MS = 15 s` while rows are waiting. `useSyncStatus()` gives `{syncing, pending, failed, offline, pulling, pulledVersion}`; `SyncBadge` shows "All synced", "N waiting to sync", "Syncing…" or "Sync failed, tap to retry". `counts()` (what the badge shows) does not count an empty, never-sent workout as waiting.

## Pull (history from the server)

- Runs inside the push pass's lock after it, until one pull completes. After a server failure it retries after `PULL_RETRY_MS = 60 s`; after an offline result it waits for the `online` event.
- It is a **full read** (no `updated_at` on workouts): finished workouts and their sets, `PULL_PAGE_SIZE = 500` per page, keyset paging by id, only rows with `deleted_at is null`. Rows are checked with `WorkoutSchema` and `SetSchema` before merging.
- `LogStore.mergePulled` adds what is missing, keeps pending local rows, and removes synced local rows that the server no longer lists, **except** that an answer which would remove all or most synced sets is not applied for removals (`removalsSkipped`), because a bad answer is likelier than a real change. It skips a server workout that has no sets, and fills `gymSnapshot` from the cached gym (without it a pulled workout has no bars and bar exercises ask for the bar).
- Open workouts on other devices are not pulled (only finished ones). Records and charts see only what is on the device until the pull has run.
- Verified against the hosted project: workouts and sets inserted directly on the server appeared in the app after a reload.

## Sign-out

Sign-out's purge goes through `scheduler.purgeSynced()` (via `scheduler.exclusive`), which waits for a running push or pull and blocks later pulls, so a pull cannot write history back. After it, only unsynced rows stay on the device (the user is warned first). Do not call `store.purgeSynced()` directly. Retained-data caveats: [threat model](../../docs/security/threat-model.md).

## Gotchas

- A local row marked `synced` that the server does not list is deleted by the next pull, because it is taken as deleted elsewhere. **Tests that fake "synced" rows must use an unreachable server** (`offlineServer()`), see [testing](../testing/harness-and-conventions.md).
- `SyncProvider` closes its database in a deferred step, and only if nothing switched the session back on; under React StrictMode an immediate close would leave the dev session with a closed database.
- Stored times must be in the canonical `Z` form (see [device-database.md](device-database.md)).
