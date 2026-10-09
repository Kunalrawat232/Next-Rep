import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { z } from 'zod';
import { BackLink, Button, buttonClasses } from '../../components';
import { ignoreClosed, type StoredSet, type StoredWorkout } from '../../data/local';
import { dayLabel, durationMinutes, formatDuration, groupByExercise } from '../../domain/history';
import { useExerciseService, useExercises } from '../exercises';
import { useLogStore, useSyncStatus } from '../sync';
import { SetList } from '../workout';
import { countLabel, syncNote } from './rows';

const IdSchema = z.uuid();

// Tagged with the workout it is about, so a different address never shows the previous workout.
type Loaded =
  | { status: 'missing' | 'error'; workoutId: string }
  | { status: 'ready'; workoutId: string; workout: StoredWorkout; sets: StoredSet[] };

/** One past workout: when, where, how long, and every set by exercise. */
export function WorkoutDetailPage() {
  const id = IdSchema.safeParse(useParams().workoutId);
  const store = useLogStore();
  const { pending, failed, syncing } = useSyncStatus();
  const { state: exercises } = useExercises(useExerciseService());
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);

  const workoutId = id.success ? id.data : null;
  useEffect(() => {
    if (!workoutId) return;
    let current = true;
    (async () => {
      const workout = await store.getWorkout(workoutId);
      const sets = workout ? await store.listSets(workoutId) : [];
      if (current)
        setLoaded(
          workout
            ? { status: 'ready', workoutId, workout, sets }
            : { status: 'missing', workoutId },
        );
    })().catch((error: unknown) => {
      try {
        ignoreClosed(error);
      } catch {
        if (current) setLoaded({ status: 'error', workoutId });
      }
    });
    return () => {
      current = false;
    };
  }, [store, workoutId, attempt, pending, failed, syncing]);

  const here = loaded?.workoutId === workoutId ? loaded : null;
  if (here?.status === 'error')
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p>Could not read this workout from the device.</p>
        <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </Button>
      </div>
    );
  if (!workoutId || here?.status === 'missing')
    return (
      <div className="flex flex-col items-start gap-4">
        <h1 className="text-title font-semibold">Workout not found</h1>
        <p className="text-callout text-ink-muted">It may have been cleared from this device.</p>
        <Link to="/history" className={buttonClasses('secondary')}>
          Back to history
        </Link>
      </div>
    );
  if (!here || here.status !== 'ready' || exercises.status === 'loading')
    return (
      <p role="status" className="text-ink-muted">
        Loading…
      </p>
    );

  const { workout, sets } = here;
  const note = syncNote(workout, sets);
  const minutes = durationMinutes(workout.startedAt, workout.endedAt);
  // The built-in exercises are always known; only the user's own can be missing when offline.
  const nameOf = (exerciseId: string) =>
    exercises.status === 'ready'
      ? (exercises.exercises.find((e) => e.id === exerciseId)?.name ?? 'Custom exercise')
      : 'Exercise';

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-2">
        <BackLink to="/history" />
        <h1 className="text-title font-semibold">{dayLabel(workout.startedAt, new Date())}</h1>
      </header>
      <p className="text-callout text-ink-muted">
        {workout.gymSnapshot?.name ?? 'No gym'} · {countLabel(sets.length, 'set')}
        {minutes !== null && ` · ${formatDuration(minutes)}`}
      </p>
      {workout.endedAt === null && (
        <Link to="/workout" className={buttonClasses('primary')}>
          This workout is still open. Continue
        </Link>
      )}
      {note && (
        <p role="status" className="text-caption text-warning">
          {note}
        </p>
      )}
      {sets.length === 0 && <p className="text-callout text-ink-muted">No sets in this workout.</p>}
      {groupByExercise(sets).map((group) => (
        <SetList key={group.exerciseId} title={nameOf(group.exerciseId)} sets={group.sets} />
      ))}
    </div>
  );
}
