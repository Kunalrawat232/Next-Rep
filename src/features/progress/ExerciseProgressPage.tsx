import { Link, useParams } from 'react-router';
import { z } from 'zod';
import {
  buttonClasses,
  EmptyState,
  LoadingMessage,
  NotFound,
  PageHeader,
  RetryMessage,
} from '../../components';
import { withUnit } from '../../domain/units';
import { dayLabel } from '../../domain/history';
import { currentRecords, recordMarks, sessionBests } from '../../domain/records';
import { useExerciseService, useExercises } from '../exercises';
import { PrBadge } from './PrBadge';
import { ProgressChart } from './ProgressChart';
import { useExerciseSets } from './useExerciseSets';
import { useUnit } from '../settings/UnitProvider';

const IdSchema = z.uuid();

/** One exercise over time: a chart of the top set per session, the records, and the sessions as a table. */
export function ExerciseProgressPage() {
  const { unit } = useUnit();
  const id = IdSchema.safeParse(useParams().exerciseId);
  const exerciseId = id.success ? id.data : undefined;
  const { state, retry } = useExerciseSets(exerciseId ?? null);
  const { state: exercises } = useExercises(useExerciseService());

  if (!exerciseId)
    return <NotFound title="Exercise not found" to="/progress" label="Back to progress" />;
  if (state.status === 'error')
    return <RetryMessage onRetry={retry}>Could not read your sets from this device.</RetryMessage>;
  if (state.status === 'loading' || exercises.status === 'loading') return <LoadingMessage />;

  const name =
    exercises.status === 'ready'
      ? (exercises.exercises.find((e) => e.id === exerciseId)?.name ?? 'Custom exercise')
      : 'Exercise';
  const { sets } = state;
  const points = sessionBests(sets);
  const records = currentRecords(sets);
  const marks = recordMarks(sets);
  const now = new Date();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader back="/progress" title={name} />

      {sets.length === 0 ? (
        <EmptyState
          title="No sets logged yet"
          message="Log this exercise and its progress shows up here."
        >
          <Link to="/workout" className={buttonClasses('primary')}>
            Start workout
          </Link>
        </EmptyState>
      ) : (
        <>
          <section aria-label="Records" className="flex flex-col gap-2">
            <h2 className="text-headline font-semibold">Records</h2>
            {records.heaviest && (
              <p className="flex items-center gap-2">
                {marks.get(records.heaviest.setId) && (
                  <PrBadge kind={marks.get(records.heaviest.setId)!} />
                )}
                <span>
                  Heaviest: {withUnit(records.heaviest.totalKg, unit)} × {records.heaviest.reps},{' '}
                  {dayLabel(records.heaviest.loggedAt, now)}
                </span>
              </p>
            )}
            <ul className="flex flex-col gap-1 text-callout text-ink-muted">
              {records.repsAtWeight.map((r) => (
                <li key={r.totalKg}>
                  {r.totalKg === 0
                    ? 'Most reps with body weight'
                    : `Most reps at ${withUnit(r.totalKg, unit)}`}
                  : {r.reps}
                </li>
              ))}
            </ul>
          </section>

          {points.length === 1 ? (
            <p className="text-callout text-ink-muted">Log another session to see a trend.</p>
          ) : (
            <ProgressChart points={points} unit={unit} />
          )}

          <section aria-label="Sessions" className="flex flex-col gap-2">
            <table className="w-full text-left">
              <caption className="pb-2 text-left text-headline font-semibold">
                Top set per session
              </caption>
              <thead className="text-callout text-ink-muted">
                <tr>
                  <th scope="col" className="py-1 font-medium">
                    Day
                  </th>
                  <th scope="col" className="py-1 font-medium">
                    Top set
                  </th>
                  <th scope="col" className="py-1 font-medium">
                    <span className="sr-only">Record</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...points].reverse().map((p) => {
                  const kind = marks.get(p.setId);
                  return (
                    <tr key={p.workoutId} className="border-t border-line">
                      <td className="py-2">{dayLabel(p.at, now)}</td>
                      <td className="py-2 tabular-nums">
                        {withUnit(p.totalKg, unit)} × {p.reps}
                      </td>
                      <td className="py-2">{kind && <PrBadge kind={kind} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
