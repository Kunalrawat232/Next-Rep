import { Link } from 'react-router';
import {
  buttonClasses,
  cardClasses,
  EmptyState,
  LoadingMessage,
  RetryMessage,
} from '../../components';
import { dayLabel, groupByExercise } from '../../domain/history';
import { currentRecords } from '../../domain/records';
import { withUnit } from '../../domain/units';
import { useExerciseService, useExercises } from '../exercises';
import { useSyncStatus } from '../sync';
import { useExerciseSets } from './useExerciseSets';
import { useUnit } from '../settings/UnitProvider';

/** The exercises logged on this device, most recently done first, each with its heaviest set. */
export function ProgressPage() {
  const { unit } = useUnit();
  const { state, retry } = useExerciseSets();
  const { pulling } = useSyncStatus();
  const { state: exercises } = useExercises(useExerciseService());

  if (state.status === 'error')
    return <RetryMessage onRetry={retry}>Could not read your sets from this device.</RetryMessage>;
  if (state.status === 'loading' || exercises.status === 'loading') return <LoadingMessage />;

  const nameOf = (id: string) =>
    exercises.status === 'ready'
      ? (exercises.exercises.find((e) => e.id === id)?.name ?? 'Custom exercise')
      : 'Exercise';
  const rows = groupByExercise(state.sets)
    .map(({ exerciseId, sets }) => ({
      id: exerciseId,
      heaviest: currentRecords(sets, unit).heaviest,
      last: sets[sets.length - 1]!.loggedAt,
    }))
    .sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : 0));
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-title font-semibold">Progress</h1>
      {rows.length === 0 && pulling ? (
        <LoadingMessage>Loading your history…</LoadingMessage>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nothing to chart yet"
          message="Log a few sets and your progress for each exercise shows up here. Sets from before you last signed out are not kept on this device."
        >
          <Link to="/workout" className={buttonClasses('primary')}>
            Start workout
          </Link>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Link to={`/progress/${row.id}`} className={cardClasses('flex flex-col gap-1')}>
                <span className="text-headline font-semibold">{nameOf(row.id)}</span>
                <span className="text-callout text-ink-muted">
                  {row.heaviest &&
                    `Heaviest ${withUnit(row.heaviest.totalKg, unit)} × ${row.heaviest.reps} · `}
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
