# ADR-012: Pulling history from the server

- **Status:** accepted (2026-10-09)

## Context

[ADR-011](011-local-log-and-sync-worker.md) made the device log push-only. Sign-out clears what the server already has from the device, and a new device starts empty, so History, Progress and personal records showed only what had been logged on that device. The server is the permanent copy, so the device needs a way to read it back.

## Decision

- **A full, read-only pull of finished workouts and their sets**, run by the sync scheduler after a push pass until one completes: at app start, again when the network returns if it did not finish, and a minute after a server failure. It never runs alongside a push, so a set pushed during a pull cannot look missing.
- **All or nothing.** Every page is read first, then merged in one transaction. Pages are read **by id** (`id > last id read`, 500 rows, filtered by `user_id` and `deleted_at is null`), not by offset, so a row deleted on another device meanwhile cannot make the pull skip another and wrongly drop it. The end is an **empty** page, not a short one, so a server that caps its answers below 500 is still read to the end. A pull that fails half way stores nothing, and it stops between pages when the scheduler stops.
- **Server rows are untrusted input.** Each row is checked against `WorkoutSchema` and `SetSchema` (numbers are coerced from strings first, because the type PostgREST sends is not relied on); a row that fails is skipped and counted. Times are stored in the same canonical form as local ones (`+00:00` becomes `Z`), so plain string comparison and the `[exerciseId+loggedAt]` index stay correct.
- **Merge rules:** a row the device does not have is added as `synced` (with the gym name from the saved gym list when it is there); a row waiting to sync or failed is never touched; a set removed on this device whose server delete is still queued is not brought back; a synced workout changed on the server is updated. A synced row that a complete pull no longer lists was deleted elsewhere and is removed (a workout only when no local set still uses it). A row that failed the checks still counts as being on the server, so its local copy is kept.
- **A bad answer must not empty the device.** If the server's answer lacks every synced set on the device, or at least 10 and more than half of them, nothing is removed (`removalsSkipped`); additions and updates still apply. A row whose time passes the schemas but cannot be read as a date is refused like any other bad row. `raw_transcript` is not read back: nothing on the device needs it.
- **Clearing the device and online deletes go through the scheduler's lock.** Sign-out's purge waits for any push or pull under way, and no pull starts or merges after it, so history cannot be written back to a signed-out device. Deleting a saved set online runs inside the same lock, so a pull that read the set earlier cannot bring it back.
- **Only finished workouts are pulled.** An open workout from another device must not take over this device's Workout screen (`activeWorkout()` picks the newest open one).
- **Screens read again after a pull that changed something** through a counter in the sync status (`pulledVersion`), and History and Progress say "Loading your history…" instead of "nothing yet" while it runs.
- **No server change.** No migration and nothing written to the server; row-level security already limits every read to the user's own rows.

## Consequences

- A set that belongs to a workout still open on another device is skipped, and shows once that workout is finished and the next pull runs (app start).
- Records and charts are complete on a freshly signed-in device once the first pull ends.
- The pull reads everything each app start. That is cheap at this scale; an incremental pull needs an `updated_at` column on workouts (a migration) and is left for later.
- Pulled workouts have no gym name unless the gym list was saved on the device.
- Two devices that edit the same finished workout at once are not reconciled: the server wins for synced rows, and the device's own pending change wins until it is pushed.
