import { Link } from 'react-router';
import { Button, buttonClasses } from '../../components';
import { dayLabel, groupByExercise } from '../../domain/history';
import { currentRecords } from '../../domain/records';
import { formatKg } from '../../domain/gyms';
import { useExerciseService, useExercises } from '../exercises';
import { useSyncStatus } from '../sync';
import { useExerciseSets } from './useExerciseSets';

/** The exercises logged on this device, most recently done first, each with its heaviest set. */
export function ProgressPage() {
  const { state, retry } = useExerciseSets();
  const { pulling } = useSyncStatus();
  const { state: exercises } = useExercises(useExerciseService());

  if (state.status === 'error')
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p>Could not read your sets from this device.</p>
        <Button variant="secondary" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  if (state.status === 'loading' || exercises.status === 'loading')
    return (
      <p role="status" className="text-ink-muted">
        Loading…
      </p>
    );

  const nameOf = (id: string) =>
    exercises.status === 'ready'
      ? (exercises.exercises.find((e) => e.id === id)?.name ?? 'Custom exercise')
      : 'Exercise';
  const rows = groupByExercise(state.sets)
    .map(({ exerciseId, sets }) => ({
      id: exerciseId,
      heaviest: currentRecords(sets).heaviest,
      last: sets[sets.length - 1]!.loggedAt,
    }))
    .sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : 0));
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-title font-semibold">Progress</h1>
      {rows.length === 0 && pulling ? (
        <p role="status" className="text-ink-muted">
          Loading your history…
        </p>
      ) : rows.length === 0 ? (
        <section className="flex flex-col items-start gap-4 rounded-md border border-line bg-surface-200 p-4">
          <h2 className="text-headline font-semibold">Nothing to chart yet</h2>
          <p className="text-callout text-ink-muted">
            Log a few sets and your progress for each exercise shows up here. Sets from before you
            last signed out are not kept on this device.
          </p>
          <Link to="/workout" className={buttonClasses('primary')}>
            Start workout
          </Link>
        </section>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                to={`/progress/${row.id}`}
                className="flex flex-col gap-1 rounded-md border border-line bg-surface-200 p-4"
              >
                <span className="text-headline font-semibold">{nameOf(row.id)}</span>
                <span className="text-callout text-ink-muted">
                  {row.heaviest &&
                    `Heaviest ${formatKg(row.heaviest.totalKg)} kg × ${row.heaviest.reps} · `}
                  Last {dayLabel(row.last, now)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
