# The device database (Dexie)

Authoritative code: `src/data/local/db.ts` (tables and versions), `src/data/local/types.ts` (row types and the `LogStore` interface), `src/data/local/logStore.ts` (`createLogStore`). Shared validation: `src/domain/schemas.ts`.

- **One database per user**, named `next-rep-<userId>` (`openLocalDb`). A shared phone never shows or uploads someone else's rows. `SyncProvider` is keyed by user id.
- **Versions:** 1 has `workouts`, `sets`, `deletions`; 2 adds `gymCache`; 3 adds `coachMessages`. **Never edit an old version; add a new one.**
- **Indexes:** `workouts: id, syncStatus, startedAt`; `sets: id, workoutId, syncStatus, [exerciseId+loggedAt]`; `deletions: id`; `gymCache: id`; `coachMessages: id, at`.

| Table           | Row type                                                               | Notes                                                                                                                                                                                                       |
| --------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workouts`      | `StoredWorkout` = Workout + sync fields + `gymSnapshot` + `everSynced` | `gymSnapshot` (barbell weight and bars) is local only and never sent; read back through `readGymSnapshot`, and a damaged value is treated as missing. `everSynced` is true once the server has the workout. |
| `sets`          | `StoredSet` = LoggedSet + sync fields                                  | Sync fields: `syncStatus` (`pending`, `synced`, `failed`), `rev`, `attempts`, `nextAttemptAt`, `lastError`, `lastAttemptAt`.                                                                                |
| `deletions`     | `{id, at, attempts, nextAttemptAt, failed}`                            | Server deletes still owed for sets removed on this device.                                                                                                                                                  |
| `gymCache`      | `{id: 'gym', gym or null, savedAt}`                                    | The user's gym (or "none yet") so a workout can start offline; read back through `readCachedGym`.                                                                                                           |
| `coachMessages` | `ChatMessage` `{id, role, text, at}`                                   | The coach chat. Device only, never synced, newest 50 kept, cleared at sign-out with the synced rows. Read back through a Zod schema.                                                                        |

## Rules for code that touches it

- **Rows read from IndexedDB are untrusted** (an extension or the user can edit them): check them with the shared Zod schemas before use or before sending.
- **Timestamps** are stored as UTC ISO strings ending in `Z`. Postgres returns `+00:00`, and strings are compared directly in indexes and sorting, so every stored time goes through `canonical()` in `logStore.ts` first.
- **Ignore `DatabaseClosedError`** in async effects with `ignoreClosed` (`src/data/local/closed.ts`) and handle everything else with a visible state; an unhandled rejection fails `npm test`.
- Hooks that read the store re-read when `pending`, `failed`, `syncing` or `pulledVersion` from `useSyncStatus()` change.
- Weights are stored in kg only (total including the bar); see the domain rules in `CLAUDE.md`.
