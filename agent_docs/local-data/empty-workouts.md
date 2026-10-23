# Empty workouts are never kept

**Rule:** a workout with no sets that has never reached the server is not stored anywhere that lasts: it is not sent to Supabase, it is not counted as waiting to sync, it is discarded when it is ended, and the history pull does not bring one back.

## Where it is enforced

| Place                                                                | Behaviour                                                                                                                                                                                                                           |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/data/local/logStore.ts` `outbox.dueWorkouts`                    | Skips a workout that is empty and unsent (`isEmptyAndUnsent`: `everSynced` is false and it has no sets). It goes out together with its first set: the workout first, then the set.                                                  |
| `logStore.ts` `counts()`                                             | Does not count such a workout as pending, so the sync badge does not say "1 waiting".                                                                                                                                               |
| `logStore.ts` `finishWorkout(id, endedAt)` (interface in `types.ts`) | Deletes an empty, never-synced workout and returns `'discarded'`; otherwise ends it like `endWorkout` and returns `'saved'`. This is what the End workout button calls. `endWorkout` itself is unchanged and still just ends a row. |
| `logStore.ts` `mergePulled`                                          | Skips an incoming server workout that has no sets in the pulled data and no local row.                                                                                                                                              |
| `src/features/workout/WorkoutPage.tsx`                               | The End workout question says "This workout has no sets, so it will not be saved. End it?" when there are no sets, and the usual question otherwise.                                                                                |

## What stays as it was

- A workout that is **already on the server** is still saved when ended, even if all its sets were undone (a deliberate choice; a delete of the server copy was not built).
- A workout that is started and never ended stays on the device only and can be resumed from Home.
- The database cannot enforce "a workout has sets", so the rule lives in the app.

## For tests

A test that needs a workout on the server must log a set in it. Tests: `src/data/sync/emptyWorkout.test.ts`, `src/data/sync/emptyWorkoutPull.test.ts`, `src/features/workout/emptyWorkout.test.tsx`; the randomised `src/data/sync/invariants.test.ts` only expects workouts that have sets to be on the server.
