import { Link, useParams } from 'react-router';
import { z } from 'zod';
import { BackLink, Button, buttonClasses } from '../../components';
import { formatKg } from '../../domain/gyms';
import { dayLabel } from '../../domain/history';
import { currentRecords, recordMarks, sessionBests } from '../../domain/records';
import { useExerciseService, useExercises } from '../exercises';
import { PrBadge } from './PrBadge';
import { ProgressChart } from './ProgressChart';
import { useExerciseSets } from './useExerciseSets';

const IdSchema = z.uuid();

/** One exercise over time: a chart of the top set per session, the records, and the sessions as a table. */
export function ExerciseProgressPage() {
  const id = IdSchema.safeParse(useParams().exerciseId);
  const exerciseId = id.success ? id.data : undefined;
  const { state, retry } = useExerciseSets(exerciseId ?? null);
  const { state: exercises } = useExercises(useExerciseService());

  if (!exerciseId)
    return (
      <div className="flex flex-col items-start gap-4">
        <h1 className="text-title font-semibold">Exercise not found</h1>
        <Link to="/progress" className={buttonClasses('secondary')}>
          Back to progress
        </Link>
      </div>
    );
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
      <header className="flex items-center gap-2">
        <BackLink to="/progress" />
        <h1 className="text-title font-semibold">{name}</h1>
      </header>

      {sets.length === 0 ? (
        <section className="flex flex-col items-start gap-4 rounded-md border border-line bg-surface-200 p-4">
          <h2 className="text-headline font-semibold">No sets logged yet</h2>
          <p className="text-callout text-ink-muted">
            Log this exercise and its progress shows up here.
          </p>
          <Link to="/workout" className={buttonClasses('primary')}>
            Start workout
          </Link>
        </section>
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
                  Heaviest: {formatKg(records.heaviest.totalKg)} kg × {records.heaviest.reps},{' '}
                  {dayLabel(records.heaviest.loggedAt, now)}
                </span>
              </p>
            )}
            <ul className="flex flex-col gap-1 text-callout text-ink-muted">
              {records.repsAtWeight.map((r) => (
                <li key={r.totalKg}>
                  {r.totalKg === 0
                    ? 'Most reps with body weight'
                    : `Most reps at ${formatKg(r.totalKg)} kg`}
                  : {r.reps}
                </li>
              ))}
            </ul>
          </section>

          {points.length === 1 ? (
            <p className="text-callout text-ink-muted">Log another session to see a trend.</p>
          ) : (
            <ProgressChart points={points} />
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
                        {formatKg(p.totalKg)} kg × {p.reps}
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
