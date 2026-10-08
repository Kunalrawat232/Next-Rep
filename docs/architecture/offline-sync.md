# Offline-tolerant design ("the middle option")

Decided approach ([ADR-001](decisions/001-online-first-offline-set-logging.md)): **online by default, but set logging works offline.**

## Rules

- Every set gets a **client-generated UUID** (`crypto.randomUUID()`) at creation.
- Sets are saved to IndexedDB first, with `sync_status: 'pending' | 'synced' | 'failed'`.
- The sync worker runs on app start, on the `online` event, after each new set, and on a short interval while pending items exist.
- Upload uses an **idempotent upsert** keyed on the set `id` (duplicates from retries are ignored).
- **Offline, only creating sets is allowed.** Editing or deleting existing sets requires a connection. This avoids conflict resolution entirely.
- Deletes are soft deletes (`deleted_at`) performed online.
- Workouts started offline also get client UUIDs and sync the same way (**workout row before its sets**).
- Global seeded exercises have stable UUIDs, so offline-created sets can reference them before sync.
- The UI shows a small sync badge: "3 sets waiting to sync" / "All synced" / "Sync failed, tap to retry".
- Voice and Gemini features show "Needs internet" when offline; tap logging remains fully usable.
- Request persistent storage (`navigator.storage.persist()`) where supported, and sync as soon as possible because browsers (especially iOS Safari) may evict local data.

## Components

`src/data/local/` (Dexie DB and repositories) · `src/data/remote/` (Supabase client and repositories) · `src/data/sync/` (queue + worker). Queue logic is unit-tested with `fake-indexeddb`; the offline-then-sync journey is covered by a Playwright test using offline mode.
