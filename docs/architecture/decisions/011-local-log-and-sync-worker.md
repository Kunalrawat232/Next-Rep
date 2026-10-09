# ADR-011: A per-user local log and a push-only sync worker

- **Status:** accepted (2026-10-10)

## Context

[ADR-001](001-online-first-offline-set-logging.md) decided that set logging works offline: sets are written to IndexedDB first and pushed later, create-only, with client ids and idempotent upserts. This record fixes the details that code had to settle.

## Decision

- **One Dexie database per signed-in user** (`next-rep-<user id>`). A shared phone never shows or uploads another person's sets. Signing out keeps the data, so unsynced sets still sync after the next sign-in. Rows carry no user id; the worker sends the signed-in user's id.
- **Rows carry their own sync state:** `syncStatus` (`pending`, `synced`, `failed`), a revision number, an attempt count, a "not before" time and the last error. Every local write bumps the revision. A push marks a row synced only if the revision is unchanged, so a workout ended while its first copy was on its way is sent again and not lost.
- **Ending a workout is part of creating it.** Setting `ended_at` works offline and goes out as another upsert of the same workout. Editing or deleting a set still needs a connection.
- **The worker is push-only and runs one pass at a time.** Workouts go before their sets, because a set references its workout, and a set waits for its workout to have reached the server at least once (`everSynced`), not for its current state. Sets go in batches of 50. A forced request that arrives during an ordinary pass is followed by a forced pass.
- **Failures are told apart by cause** (`failure()` in `src/data/remote/failure.ts`):
  - _Offline_ (no answer from the server, including Safari's "Load failed"): the rows wait a few seconds and nothing is counted.
  - _Trouble on the server's side_ (5xx, an expired session, a rate limit, a thrown error): the pass stops, the rows wait 30 seconds, and nothing is counted. A server outage of any length never marks a row failed.
  - _The row itself was refused_ (a constraint or foreign-key error): only this counts. A batch is then sent row by row to find the bad one, the row backs off (2 s, doubling, capped at 5 minutes), and after 8 refusals it is marked `failed` and waits for a manual retry.
  - A real answer from the server decides the reason, even when `navigator.onLine` says offline.
- **A workout whose gym is gone** (deleted on another device, so the foreign key refuses it) is sent again without the gym, so its sets are not stranded.
- **Rows read back from IndexedDB are validated against the shared schemas before they are sent.** Invalid rows are marked failed and never sent; one corrupt row cannot stop the others.
- **Bookkeeping answers are revision-checked.** A late "refused" or "wait" about an older copy of a row cannot change a newer copy, and cannot turn a synced row back to pending.
- **Writes are idempotent.** Starting a workout or logging a set with an id that exists changes nothing, so a retry cannot reopen an ended workout or demote a sent set. Times are stored in one form (UTC with milliseconds) after being validated as given.
- **Removing a set:** if no push of it ever started, it is deleted locally. If a push started, even without an answer, a delete on the server is queued as well, because a soft delete of a row that is not there is harmless. A set removed while its push is in flight is queued in the same transaction that marks it synced. The deletion queue is durable, retried like rows, gives up after 8 refusals (counted as failed) and waits for a manual retry.
- **Being offline is not the row's fault** (see above), and a re-sent set never undeletes, because the upsert leaves `deleted_at` out.
- **When it runs** (`createSyncScheduler`): at app start, when the network returns, when the app is shown again, after each local write, and every 15 seconds only while rows are waiting. A burst of requests becomes at most one follow-up pass. An idle app makes no requests. The scheduler reports `offline` until a request gets through.
- **Sign-out and StrictMode:** the worker is paused at sign-out and checks before every step. The local database is closed in a deferred step, so React StrictMode's simulated unmount in development does not leave it closed for the session.
- **Persistent storage** is requested once, after the first set is logged, not on every start. Syncing soon is the real protection.
- **After sign-out,** `purgeSynced()` deletes what the server already has and keeps unsynced rows. The screens call it when the user signs out and tell them if sets are still waiting.
- **No pull.** Nothing is downloaded into the local log yet. History will read the server when online; the local log only holds what this device recorded. Multi-device and multi-tab handling are out of scope for now (two tabs on one database lose nothing, because upserts are idempotent).

## Alternatives considered

- **Online-only saves first, offline later:** simpler today, but every screen and test would be rewritten when sync arrived.
- **One shared database with a user column:** fewer databases, but a bug in one query could show another user's rows.
- **Marking removed sets with a flag in the sets table:** works, but the deletion queue keeps the sets table meaning "what exists".

## Consequences

- Unsynced sets exist only on the device until they reach the server. A cleared browser or an evicted store loses them, and the sync badge says how many are waiting.
- Recording is instant and never waits for the network; the screens show the waiting count.
- Rows the server keeps refusing end up `failed` and need the user to retry; the cause is kept in `lastError`. The screens show the waiting and failed counts and a retry action (built with the workout screens, the next task).
- Residual risks: unsynced data is on the device in plain text until it syncs ([threat model](../../security/threat-model.md), T10); a soft delete that matches no row looks like success; per-user row quotas are not enforced.
