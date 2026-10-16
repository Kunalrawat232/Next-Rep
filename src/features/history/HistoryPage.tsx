import { Link } from 'react-router';
import {
  Button,
  buttonClasses,
  cardClasses,
  EmptyState,
  ErrorMessage,
  LoadingMessage,
} from '../../components';
import type { StoredSet, StoredWorkout } from '../../data/local';
import { dayLabel, durationMinutes, formatDuration } from '../../domain/history';
import { useSyncStatus } from '../sync';
import { useWorkout } from '../workout';
import { countLabel, syncNote } from './rows';
import { useHistory } from './useHistory';

/** Past workouts on this device, newest first. */
export function HistoryPage() {
  const { state, showMore, retry } = useHistory();
  const open = useWorkout().state;
  const { pulling } = useSyncStatus();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-title font-semibold">History</h1>

      {open.status === 'open' && (
        <Link to="/workout" className={cardClasses('flex flex-col gap-1', 'accent')}>
          <span className="text-headline font-semibold">Workout in progress</span>
          <span className="text-callout text-ink-muted">
            {countLabel(open.sets.length, 'set')} so far. Tap to continue.
          </span>
        </Link>
      )}

      {state.status === 'loading' && <LoadingMessage />}

      {state.status === 'error' && (
        <ErrorMessage onRetry={retry}>Could not read your workouts from this device.</ErrorMessage>
      )}

      {state.status === 'ready' && state.workouts.length === 0 && pulling && (
        <LoadingMessage>Loading your history…</LoadingMessage>
      )}

      {state.status === 'ready' && state.workouts.length === 0 && !pulling && (
        <EmptyState
          title="No finished workouts yet"
          message="Finish a workout and it shows up here. Workouts from before you last signed out are not kept on this device."
        >
          <Link to="/workout" className={buttonClasses('primary')}>
            Start workout
          </Link>
        </EmptyState>
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
    <Link to={`/history/${workout.id}`} className={cardClasses('flex flex-col gap-1')}>
      <span className="flex items-baseline justify-between gap-4">
        <span className="text-headline font-semibold">
          {dayLabel(workout.startedAt, new Date())}
        </span>
        {minutes !== null && (
          <span className="text-callout text-ink-muted">{formatDuration(minutes)}</span>
        )}
      </span>
      <span className="text-callout text-ink-muted">
        {countLabel(sets.length, 'set')} · {countLabel(exercises, 'exercise')}
      </span>
      {note && <span className="text-caption text-warning">{note}</span>}
    </Link>
  );
}
