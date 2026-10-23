import { Link } from 'react-router';
import { buttonClasses, EmptyState, ErrorMessage, LoadingMessage, Section } from '../../components';
import { defaultBarbellKg } from '../../domain/gyms';
import { dayLabel, groupByExercise, topSet } from '../../domain/history';
import { describeSuggestion, suggest } from '../../domain/progression';
import { withUnit } from '../../domain/units';
import { setSummary } from '../../domain/workout';
import { useAuth } from '../auth';
import { useExerciseService, useExercises } from '../exercises';
import { useUnit } from '../settings/UnitProvider';
import { SyncBadge } from '../sync';
import { useMyGym, useWorkout } from '../workout';
import { useHomeData } from './useHomeData';

/** Home: ready to lift. What to try today, what you did last time, and the way into a workout. */
export function HomePage() {
  const { state: auth } = useAuth();
  const { unit } = useUnit();
  const data = useHomeData();
  const { state: open } = useWorkout();
  const { catalog } = useMyGym();
  const { state: exercises } = useExercises(useExerciseService());
  if (auth.status !== 'signedIn') return null;

  const gym = catalog.status === 'ready' ? catalog.gym : null;
  const noGym = catalog.status === 'ready' && catalog.gym === null;

  if (
    data.status === 'loading' ||
    exercises.status === 'loading' ||
    catalog.status === 'loading' ||
    open.status === 'loading'
  )
    return <LoadingMessage />;
  if (data.status === 'error')
    return <ErrorMessage>Could not read your workouts from this device.</ErrorMessage>;

  const known = exercises.status === 'ready' ? exercises.exercises : [];

  const nameOf = (id: string) => known.find((e) => e.id === id)?.name ?? 'Custom exercise';
  const exercise = data.exerciseId ? known.find((e) => e.id === data.exerciseId) : undefined;
  const suggestion =
    exercise && data.exerciseId
      ? suggest({
          sessions: data.sessions,
          bodyPart: exercise.bodyPart,
          equipment: exercise.equipmentType,
          unit,
        })
      : null;
  const firstTime = data.last === null && noGym;
  const inProgress = open.status === 'open';
  const startTo = inProgress
    ? '/workout'
    : data.exerciseId
      ? `/workout?exercise=${encodeURIComponent(data.exerciseId)}`
      : '/workout';

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-display font-semibold">
        {firstTime ? 'Welcome to Next Rep' : 'Ready to lift?'}
      </h1>

      {firstTime ? (
        <Section headingId="steps-heading" title="Your first workout">
          <p className="text-callout text-ink-muted">
            Start a workout, then say or tap your first set. Next Rep adds the bar for you, starting
            with a standard {withUnit(defaultBarbellKg(unit), unit)} barbell. You can change it any
            time in Settings.
          </p>
          <Link to="/workout" className={buttonClasses('primary', 'self-start')}>
            Start workout
          </Link>
        </Section>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {gym && (
            <p className="inline-flex h-8 items-center rounded-full border border-glass-line glass-flat px-3 text-caption font-medium">
              {withUnit(gym.barbellKg, unit)} bar
            </p>
          )}
          <SyncBadge />
        </div>
      )}

      <Section headingId="suggestion-heading" title="Today's suggestion">
        {suggestion && exercise ? (
          <>
            <p className="text-body font-semibold">{exercise.name}</p>
            <p className="text-headline font-semibold tabular-nums">
              {withUnit(suggestion.totalKg, unit)} × {suggestion.reps}
            </p>
            <p className="text-callout text-ink-muted">
              {describeSuggestion(suggestion, unit)} It is a suggestion, you decide.
            </p>
          </>
        ) : (
          <p className="text-callout text-ink-muted">
            {!data.last
              ? 'After your first workout, Next Rep suggests what to lift next.'
              : !exercise
                ? 'The exercise from your last workout is not in your list, so there is nothing to suggest.'
                : 'Nothing to suggest for this exercise: it has no weight to build on.'}
          </p>
        )}
      </Section>

      {!firstTime && (
        <Link to={startTo} className={buttonClasses('primary', 'w-full')}>
          {inProgress ? 'Continue workout' : 'Start workout'}
        </Link>
      )}

      {data.last ? (
        <Section headingId="last-heading" title="Last workout">
          <p className="text-callout text-ink-muted">
            {dayLabel(data.last.workout.startedAt, new Date())}
          </p>
          <ul className="flex flex-col gap-2">
            {groupByExercise(data.last.sets)
              .slice(0, 3)
              .map((group) => {
                const best = topSet(group.sets);
                if (!best) return null;
                const { top, count } = best;
                return (
                  <li key={group.exerciseId} className="flex flex-col">
                    <span className="text-body font-semibold">{nameOf(group.exerciseId)}</span>
                    <span className="text-callout text-ink-muted tabular-nums">
                      {setSummary(top, unit).headline} · {count} {count === 1 ? 'set' : 'sets'}
                    </span>
                  </li>
                );
              })}
          </ul>
          <Link
            to={`/history/${data.last.workout.id}`}
            className={buttonClasses('secondary', 'self-start')}
          >
            Open workout
          </Link>
        </Section>
      ) : (
        <EmptyState title="Last workout" message="Your workouts will show up here." />
      )}

      <div className="flex flex-col gap-2">
        <Link to="/gym" className={buttonClasses('secondary', 'w-full')}>
          Your bars
        </Link>
        <Link to="/exercises" className={buttonClasses('secondary', 'w-full')}>
          Exercises
        </Link>
      </div>
    </div>
  );
}
