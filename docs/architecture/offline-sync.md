# Offline-tolerant design ("the middle option")

Overview only. The details are in [ADR-011](decisions/011-local-log-and-sync-worker.md) (push, failure classes, attempts and waits) and [ADR-012](decisions/012-pull-history-from-server.md) (pull).

Decided approach ([ADR-001](decisions/001-online-first-offline-set-logging.md)): **online by default, but set logging works offline.**

## Rules

- Every set gets a **client-generated UUID** (`crypto.randomUUID()`) at creation.
- Sets are saved to IndexedDB first, with `sync_status: 'pending' | 'synced' | 'failed'`.
- The sync worker runs on app start, on the `online` event, after each new set, and on a short interval while pending items exist.
- Upload uses an **idempotent upsert** keyed on the set `id` (duplicates from retries are ignored).
- **Offline, only creating sets is allowed.** Editing or deleting **synced** sets requires a connection (a set that has not synced yet can be undone offline, see below). This avoids conflict resolution entirely.
- Deletes are soft deletes (`deleted_at`) performed online.
- Workouts started offline also get client UUIDs and sync the same way (**workout row before its sets**).
- **An empty workout is never kept (2026-10-19).** A workout with no sets that has never reached the server is not sent (it goes out with its first set, and is not counted as "waiting"); ending it with no sets (`finishWorkout`) deletes it from the device; and the history pull does not bring an empty workout from the server onto the device. A workout that is already on the server stays as it is when it is ended, even if all its sets were undone (the rare case was left alone on purpose). A workout that is started and never ended stays on the device only, and can be resumed.
- Global seeded exercises have stable UUIDs, so offline-created sets can reference them before sync.
- The UI shows a small sync badge: "3 sets waiting to sync" / "All synced" / "Sync failed, tap to retry".
- Voice is online only: offline the mic button is disabled and the note under it says "Voice needs internet. Tap logging works." (`src/features/workout/VoiceLogger.tsx`). The coach also needs a connection. Tap logging remains fully usable.
- Request persistent storage (`navigator.storage.persist()`) where supported, and sync as soon as possible because browsers (especially iOS Safari) may evict local data.

## Components

`src/data/local/` (Dexie DB and repositories) · `src/data/remote/` (Supabase client and repositories) · `src/data/sync/` (queue + worker). Queue logic is unit-tested with `fake-indexeddb`; the offline-then-sync journey is covered by a Playwright test using offline mode (developer-run, not in CI).

## As built (2026-10-09)

Details and reasons: [ADR-011](decisions/011-local-log-and-sync-worker.md).

- `src/data/local/`: the Dexie database (one per user), the log store and the outbox.
- `src/data/sync/`: the push worker, the scheduler (start, `online`, visibility, after a write, and a 15 s timer while rows wait) and the persistent-storage request.
- `src/data/remote/log.ts`: the Supabase upserts and the soft delete.
- `src/features/sync/`: `SyncProvider` and the `useLogStore`, `useSyncControls` and `useSyncStatus` hooks the screens use.
- **Pull ([ADR-012](decisions/012-pull-history-from-server.md)):** after a push pass the scheduler reads the user's finished workouts and sets from the server into the device log (`src/data/sync/pull.ts`), all or nothing, checked against the shared schemas, never overwriting rows that are waiting to sync.
- The gym is managed online, so the workout screens save the user's gym (or the fact that there is none yet) on the device (`gymCache`, one row, Dexie version 2) each time it loads and fall back to it with no connection. A workout keeps a local-only snapshot of its gym (the bar weights) so logging, bars and the breakdown work offline for the whole workout, with a connection the workout takes the gym's current bars (so adding a bar mid-workout works), and without one it keeps what it has. Both copies are checked when read back, and a damaged one is treated as missing.
- The Dexie database is at version 3 (`src/data/local/db.ts`): version 2 added `gymCache`, version 3 added `coachMessages`, the coach chat kept on the device only and cleared at sign-out ([ADR-017](decisions/017-ai-coach.md)).
- Undo: a set that has not reached the server is removed from the device only; a set that has is soft-deleted on the server first (needs internet) and then removed locally.
- Failures are told apart by cause: being offline or trouble on the server never counts against a row, only a refusal of the row itself does ([ADR-011](decisions/011-local-log-and-sync-worker.md)).
- Tests: the store and worker against a fake IndexedDB and a fake server; a randomised test that mixes logging, removing, ending, going offline and failing, and checks that no set is ever lost, duplicated or orphaned; PGlite tests of the upsert statements; and an integration test for the hosted project.
