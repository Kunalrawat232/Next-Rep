import { Link } from 'react-router';
import { Button, buttonClasses } from '../../components';
import type { StoredSet, StoredWorkout } from '../../data/local';
import { dayLabel, durationMinutes, formatDuration } from '../../domain/history';
import { useWorkout } from '../workout';
import { countLabel, syncNote } from './rows';
import { useHistory } from './useHistory';

/** Past workouts on this device, newest first. */
export function HistoryPage() {
  const { state, showMore, retry } = useHistory();
  const open = useWorkout().state;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-title font-semibold">History</h1>

      {open.status === 'open' && (
        <Link
          to="/workout"
          className="flex flex-col gap-1 rounded-md border border-accent bg-surface-200 p-4"
        >
          <span className="text-headline font-semibold">Workout in progress</span>
          <span className="text-callout text-ink-muted">
            {countLabel(open.sets.length, 'set')} so far. Tap to continue.
          </span>
        </Link>
      )}

      {state.status === 'loading' && (
        <p role="status" className="text-ink-muted">
          Loading…
        </p>
      )}

      {state.status === 'error' && (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-md border border-danger bg-surface-200 p-4"
        >
          <p>Could not read your workouts from this device.</p>
          <Button variant="secondary" onClick={retry}>
            Try again
          </Button>
        </div>
      )}

      {state.status === 'ready' && state.workouts.length === 0 && (
        <section className="flex flex-col items-start gap-4 rounded-md border border-line bg-surface-200 p-4">
          <h2 className="text-headline font-semibold">No finished workouts yet</h2>
          <p className="text-callout text-ink-muted">
            Finish a workout and it shows up here. Workouts from before you last signed out are not
            kept on this device.
          </p>
          <Link to="/workout" className={buttonClasses('primary')}>
            Start workout
          </Link>
        </section>
      )}

      {state.status === 'ready' && state.workouts.length > 0 && (
        <>
          <ul className="flex flex-col gap-2">
            {state.workouts.map((workout) => (
              <li key={workout.id}>
                <WorkoutRow
                  workout={workout}
                  sets={state.sets.filter((s) => s.workoutId === workout.id)}
                />
              </li>
            ))}
          </ul>
          {state.hasMore && (
            <Button variant="secondary" onClick={showMore}>
              Show more
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function WorkoutRow({ workout, sets }: { workout: StoredWorkout; sets: StoredSet[] }) {
  const minutes = durationMinutes(workout.startedAt, workout.endedAt);
  const exercises = new Set(sets.map((s) => s.exerciseId)).size;
  const note = syncNote(workout, sets);
  return (
    <Link
      to={`/history/${workout.id}`}
      className="flex flex-col gap-1 rounded-md border border-line bg-surface-200 p-4"
    >
      <span className="flex items-baseline justify-between gap-4">
        <span className="text-headline font-semibold">
          {dayLabel(workout.startedAt, new Date())}
        </span>
        {minutes !== null && (
          <span className="text-callout text-ink-muted">{formatDuration(minutes)}</span>
        )}
      </span>
      <span className="text-callout text-ink-muted">
        {workout.gymSnapshot?.name ?? 'No gym'} · {countLabel(sets.length, 'set')} ·{' '}
        {countLabel(exercises, 'exercise')}
      </span>
      {note && <span className="text-caption text-warning">{note}</span>}
    </Link>
  );
}
