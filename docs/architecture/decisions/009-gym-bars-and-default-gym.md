# ADR-009: Gym bars have a kind, and the default gym is moved in two steps

- **Status:** accepted. Superseded in part by [ADR-015](015-one-gym-per-user.md): the default-gym rules, the two-step default change and "no limit on the number of gyms" no longer apply (a user has exactly one gym). The bar kinds, the bar lookup, the weight parsing and the server-error rules below still hold.

## Context

Weights are logged as the total including the bar (ADR-002), so tap and voice logging must find the bar for an exercise at the user's gym. Exercises carry an `equipment_type` (`barbell`, `ez_bar`, `smith`), but `gym_bars` held only a free-text name, so nothing linked the two. Gym changes also need several writes, and supabase-js has no client-side transactions.

## Decision

- **Migration 0002 adds `gym_bars.kind`** (`ez_bar`, `smith`, `other`, default `other`). At most one bar of each special kind per gym (partial unique index), and bar names are unique per gym ignoring case. The barbell stays on the gym as `default_bar_kg`.
- **Bar lookup is in the domain** (`barFor` in `src/domain/gyms`): barbell uses the gym's barbell weight, EZ bar and Smith use the bar of that kind, and everything else has no bar. If the gym has no bar for the equipment, the answer is "none" and the caller asks the user. An `other` bar is never picked automatically.
- **The default gym is the one marked, otherwise the oldest** (`pickDefaultGym`), so "no default" is a valid state and a failed write never leaves the user without one.
- **Setting the default is two statements:** clear the old default, then set the new one. This was measured: a single `update gyms set is_default = (id = X)` succeeded for the first two of three gyms and failed for the third with a unique violation, because the partial unique index is checked row by row, not at the end of the statement. If the second write fails, the fallback still gives a default.
- **The default in the UI** follows `pickDefaultGym` everywhere (badge, "make default" button), and only the very first gym claims the default when created.
- **Creating and updating** use client-generated ids and upserts. The form mints the gym id and each new bar's id once, so a retry after a half-done save sends the same ids and finishes the job instead of making a second gym. On update, removed bars are deleted before the others are upserted, so a bar that takes over a name or kind does not collide with its predecessor.
- **Gym changes are online-only.** Unlike sets, they need a connection and say so when offline. Reads are cached on the device for offline use (done, see [offline sync](../offline-sync.md)).
- **No limit on the number of gyms.** Most people have one.
- **Bar weights** are stored as typed, to 2 decimals (`numeric(5,2)`), 0 to 100 kg, with no plate-step rule. A comma is accepted as the decimal point.
- **Typed weights** accept `.5`, `7.` and a comma decimal with one or two digits (`7,5`). `1,000` is refused, because reading it as a decimal would store 1 kg. Names are trimmed, inner spaces collapsed and Unicode-normalised before duplicates are compared.
- **Server errors:** a unique violation is shown as "already has a bar with that name or kind"; a request that never reached the server is offline; everything else is a generic failure.
- **Bars are listed by name**, because `gym_bars` has no creation time.
- **A server `numeric` may arrive as text or a number**, so rows are parsed with coercion, and the integration test checks the result is a number.

## Alternatives considered

- **Reserved bar names ("EZ bar"):** no migration, but a typo or a different language silently breaks the lookup.
- **A database function that does each multi-step write in one transaction:** safer, but more SQL to maintain and test for little gain here.
- **Storing the barbell as a `gym_bars` row:** one list, but a second source of truth next to `default_bar_kg`, which already exists and is what the validator reads.

## Consequences

- The migration must be applied to the hosted project before the gym screens work there.
- A half-finished update can leave a gym with some of its bars changed (removed bars are deleted before the others are written), and a bar added on another device after the form loaded is removed on save. A single database function would remove both risks; it is deferred as more SQL to maintain for a rare case.
- `setDefault` and `update` cannot tell "0 rows changed" from success.
- Deleting a gym that has workouts is a plain delete for now. Once workouts exist it will be blocked with a message instead.
