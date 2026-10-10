import { Link } from 'react-router';
import { buttonClasses, EmptyState, ErrorMessage, LoadingMessage, Section } from '../../components';
import { dayLabel, groupByExercise, topSet } from '../../domain/history';
import { pickDefaultGym } from '../../domain/gyms';
import { describeSuggestion, suggest } from '../../domain/progression';
import { withUnit } from '../../domain/units';
import { setSummary } from '../../domain/workout';
import { useAuth } from '../auth';
import { useExerciseService, useExercises } from '../exercises';
import { useUnit } from '../settings/UnitProvider';
import { SyncBadge } from '../sync';
import { useGymCatalog, useWorkout } from '../workout';
import { useHomeData } from './useHomeData';

/** Home: ready to lift. What to try today, what you did last time, and the way into a workout. */
export function HomePage() {
  const { state: auth } = useAuth();
  const { unit } = useUnit();
  const data = useHomeData();
  const { state: open } = useWorkout();
  const { catalog } = useGymCatalog();
  const { state: exercises } = useExercises(useExerciseService());
  if (auth.status !== 'signedIn') return null;

  const gyms = catalog.status === 'ready' ? catalog.gyms : null;
  const gym = gyms ? pickDefaultGym(gyms) : undefined;
  const noGym = gyms !== null && gyms.length === 0;

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
        <Section headingId="steps-heading" title="Two quick steps">
          <p className="text-callout text-ink-muted">
            You are ready to log your first set after these.
          </p>
          <ol className="flex flex-col gap-4">
            <li className="flex flex-col items-start gap-2">
              <span className="text-body font-semibold">1. Add your gym</span>
              <span className="text-callout text-ink-muted">
                Tell Next Rep which bar you use, so every weight adds up.
              </span>
              <Link to="/gyms/new" className={buttonClasses('primary')}>
                Add gym
              </Link>
            </li>
            <li className="flex flex-col items-start gap-2">
              <span className="text-body font-semibold">2. Start your first workout</span>
              <span className="text-callout text-ink-muted">
                Add a gym first, then say or tap your first set.
              </span>
              <button type="button" disabled className={buttonClasses('primary', 'opacity-60')}>
                Start workout
              </button>
            </li>
          </ol>
        </Section>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {gym && (
            <p className="inline-flex h-8 items-center rounded-full border border-line bg-surface-200 px-3 text-caption font-medium">
              {gym.name} · {withUnit(gym.barbellKg, unit)} bar
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
            {data.last.workout.gymSnapshot ? ` · ${data.last.workout.gymSnapshot.name}` : ''}
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
        <Link to="/gyms" className={buttonClasses('secondary', 'w-full')}>
          Manage gyms
        </Link>
        <Link to="/exercises" className={buttonClasses('secondary', 'w-full')}>
          Exercises
        </Link>
      </div>
    </div>
  );
}
