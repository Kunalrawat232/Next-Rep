# Screens

| Screen            | Purpose                                                          | States to handle                                                     |
| ----------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| Sign in           | Email + password sign-in                                         | loading, error                                                       |
| Gym setup         | Create gym, set bar weights                                      | empty, editing                                                       |
| Home              | Start workout, last workout summary, suggestion                  | empty (first use), offline                                           |
| Active workout    | Current exercise, mic button, tap entry, logged sets, rest timer | listening, parsing, confirm, ambiguity prompt, offline, sync pending |
| Exercise picker   | Search + recent exercises, add custom                            | empty search, no results                                             |
| History           | Past workouts                                                    | empty, loading, offline (cached)                                     |
| Exercise progress | Chart of `total_kg` over time, PRs                               | single data point, no data                                           |
| Settings          | Units, default gym, sign out                                     |                                                                      |

## Designs and routes (handoff 2026-10-08)

| Handoff artboards (mobile, web)                   | Route / status                                                                                                                   |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Main, WebSignIn                                   | `/sign-in`, built. The designs show magic link only; the app uses email + password with a create-account toggle (ADR-007).       |
| Home, WebHome                                     | `/`, built as a shell: greeting, disabled Start workout, account card. Suggestion, last workout and sync pill wait for data.     |
| ActiveWorkout, WebWorkout, SetConfirm, WebConfirm | Phase 2/3, not built.                                                                                                            |
| Ambiguity, WebAmbiguity                           | Phase 3. Design shows 45 kg after 60 kg, which the validator does not flag (within the 40% band); decide when to ask in Phase 3. |
| Offline, WebOffline                               | Phase 3, not built.                                                                                                              |
| Progress, WebProgress                             | Phase 4, not built.                                                                                                              |

Navigation: bottom tab bar on phones (Home, History, Progress, Settings), sidebar from 1024px (adds Workout). Pages that do not exist yet show as disabled items, not as dead links.

Shared components: see [design system](design-system.md). Every screen needs empty, loading and error states with friendly, actionable microcopy.

## Priority order for designs (11 to 15 Oct)

Active workout (idle, listening, parsing, offline) → set confirmation with weight breakdown → "total or per side?" prompt → home with suggestion → history and progress chart → sign in and gym setup.
