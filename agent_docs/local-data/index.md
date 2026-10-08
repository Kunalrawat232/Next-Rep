# local-data

The on-device log (IndexedDB through Dexie) and how it syncs with Supabase. Sets and workouts are written to the device first and pushed later (local-first), so most bugs in this area are about ordering, retries and what is allowed to leave the device.

| Doc                                                | Read when                                                                                                               |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [device-database.md](device-database.md)           | Changing a Dexie table, index or version, or reading rows from the device (including the coach chat and the gym cache). |
| [sync-worker-and-pull.md](sync-worker-and-pull.md) | Touching the outbox, worker, scheduler, retries, the history pull or the sign-out purge, or writing a test that syncs.  |
| [empty-workouts.md](empty-workouts.md)             | Starting or ending a workout, or asking why a workout is not on the server.                                             |

Also: [offline sync design](../../docs/architecture/offline-sync.md); ADR [001](../../docs/architecture/decisions/001-online-first-offline-set-logging.md), [011](../../docs/architecture/decisions/011-local-log-and-sync-worker.md), [012](../../docs/architecture/decisions/012-pull-history-from-server.md).
