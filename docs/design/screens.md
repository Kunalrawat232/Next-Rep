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

Shared components: see [design system](design-system.md). Every screen needs empty, loading and error states with friendly, actionable microcopy.

## Priority order for designs (11 to 15 Oct)

Active workout (idle, listening, parsing, offline) → set confirmation with weight breakdown → "total or per side?" prompt → home with suggestion → history and progress chart → sign in and gym setup.
