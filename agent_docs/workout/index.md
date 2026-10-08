# workout

The workout screens: starting a workout, choosing an exercise, logging sets by tap or voice, the rest timer, undo and ending. Code is in `src/features/workout/`; the pure helpers are in `src/domain/workout`, `src/domain/rest`, `src/domain/validation` and `src/domain/gyms`.

| Doc                                | Read when                                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [workout-flow.md](workout-flow.md) | Changing any workout screen, the tap or voice logging, undo, ending a workout, or the round Workout button. |
| [rest-timer.md](rest-timer.md)     | Changing the rest pill, its panel, the saved rest settings, or when a rest starts.                          |

Related: [empty workouts](../local-data/empty-workouts.md) (what End workout does with no sets), [sync](../local-data/sync-worker-and-pull.md) (how a logged set reaches the server), [weight rules](../../docs/domain/weight-rules.md), [voice grammar](../../docs/domain/voice-grammar.md), [screens](../../docs/design/screens.md).
