# ADR-015: One gym per user

- **Status:** accepted. Replaces "no limit on the number of gyms" and the default-gym rules in [ADR-009](009-gym-bars-and-default-gym.md).

## Context

The app let a user keep several gyms, mark one as the default, name them, and choose where they were training at the start of every workout. The developer's point: people have one gym. The only thing a gym is for is its bars (the barbell, an EZ bar, a Smith bar and so on), which the app adds to every weight (ADR-002). So what the user needs is "my bars", not a list of places.

## Decision

- **One gym per user, enforced by the database.** Migration `0004_one_gym_per_user.sql` adds a unique index on `gyms(user_id)` and drops `is_default` and its index. For a user who somehow has several, it keeps the default one, otherwise the oldest, and deletes the rest with their bars; a workout that used a removed gym keeps its own copy of the bars and only loses the link (`on delete set null`). On the hosted project it deleted nothing (one user, one gym).
- **The table stays.** `gyms` and `gym_bars` hold the bars, `workouts.gym_id` still points at the gym, and a workout still keeps a snapshot of the bars it started with (offline logging and history). The `name` column stays and takes the default `'My gym'`; the app never shows it.
- **One service, two calls.** `GymService` is `get()` (the gym, or null) and `save()` (create or update with the same retry-safe ids). `list`, `create`, `update`, `remove` and `setDefault` are gone, and so are `pickDefaultGym`, `isDefault` and the gym name in the domain, the forms, the local cache and the workout snapshot.
- **One screen.** `/gym` ("Your gym"), reached from Settings ("Your bars"), from Home ("Your bars") and from the places that need a bar. The old `/gyms`, `/gyms/new` and `/gyms/:id` addresses redirect to it. There is no list, no delete and no default.
- **No set-up step.** The first workout creates the gym with a standard barbell (20 kg, or 45 lb for a user who works in pounds) and says so on the Start workout screen; Settings changes it. Creating the gym still needs a connection, once, like every gym change. The ids are minted once per screen, so a retry never makes a second gym.
- **Start workout has no chooser.** It starts at the user's gym straight away and shows its bars with a "Change bars" link.
- **The on-device copy** is one row (`gymCache` id `'gym'`) that may say "no gym yet". Copies saved before this change are read as missing or with their extra fields dropped.

## Alternatives considered

- **Hide the list but keep the data model:** quick, but the database and the code would still allow many gyms.
- **Remove the gym table and put the bars on the profile:** the purest result, but it rewrites workout history links and the sync path for no gain over one row per user.
- **Keep asking for a first-time set-up screen:** one more step before the first set, for a value most people leave at 20 kg.

## Consequences

- A user with a barbell other than 20 kg must change it once in Settings; until then totals use 20 kg (the card says which bar is counted).
- Someone who really uses two gyms with different bars has one set of bars and can edit them. Accepted by the developer.
- The migration is applied to the hosted project; an older deployed build that still asks for `is_default` stops working against it, so redeploy.
