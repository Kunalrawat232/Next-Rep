import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { BackLink, Button, buttonClasses, Chip } from '../../components';
import { ignoreClosed, type StoredSet, type StoredWorkout } from '../../data/local';
import { EQUIPMENT_LABEL, type Exercise } from '../../domain/exercises';
import { barFor, formatKg } from '../../domain/gyms';
import { usesBar } from '../../domain/schemas';
import { validateSet, type Option, type ResolvedWeight } from '../../domain/validation';
import {
  breakdownFor,
  initialEntry,
  nextValue,
  parseWeight,
  stepFor,
  usesModeToggle,
  weightHint,
  type EntryMode,
} from '../../domain/workout';
import { roundKg } from '../../domain/weight';
import { useExerciseService, useExercises } from '../exercises';
import { useLogStore, useSyncControls } from '../sync';
import { AmbiguityPrompt } from './AmbiguityPrompt';
import { BreakdownCard } from './BreakdownCard';
import { Stepper } from './Stepper';
import { useFreshGym } from './useFreshGym';
import { exerciseQuery, useExerciseParam } from './useExerciseParam';
import { useWorkout } from './useWorkout';

export function LogSetPage() {
  const exerciseId = useExerciseParam();
  const { state: workoutState, reload } = useWorkout();
  const { state: exercises } = useExercises(useExerciseService());
  const store = useLogStore();
  // Tagged with its exercise, so a different exercise in the address is never shown the previous one's last set.
  const [lastSet, setLastSet] = useState<{ exerciseId: string; set: StoredSet | undefined } | null>(
    null,
  );
  const last = lastSet?.exerciseId === exerciseId ? lastSet.set : 'loading';

  useEffect(() => {
    let current = true;
    if (!exerciseId) return;
    store
      .lastSetFor(exerciseId)
      .then((set) => {
        if (current) setLastSet({ exerciseId, set });
      })
      .catch(ignoreClosed);
    return () => {
      current = false;
    };
  }, [store, exerciseId]);

  const back = `/workout${exerciseQuery(exerciseId)}`;
  if (
    workoutState.status === 'loading' ||
    exercises.status === 'loading' ||
    (exerciseId && last === 'loading')
  )
    return (
      <p role="status" className="text-ink-muted">
        Loading…
      </p>
    );
  const exercise =
    exercises.status === 'ready' ? exercises.exercises.find((e) => e.id === exerciseId) : undefined;
  if (workoutState.status !== 'open' || !exercise)
    return (
      <div className="flex flex-col items-start gap-4">
        <h1 className="text-title font-semibold">
          {workoutState.status !== 'open' ? 'No workout is open' : 'Exercise not found'}
        </h1>
        <Link to="/workout" className={buttonClasses('secondary')}>
          Back to the workout
        </Link>
      </div>
    );

  return (
    <>
      <FreshGym workout={workoutState.workout} reload={reload} />
      <LogSetForm
        key={exercise.id}
        workout={workoutState.workout}
        exercise={exercise}
        last={last === 'loading' ? undefined : last}
        back={back}
      />
    </>
  );
}

function FreshGym({ workout, reload }: { workout: StoredWorkout; reload: () => Promise<void> }) {
  useFreshGym(workout, reload);
  return null;
}

type FormProps = {
  workout: StoredWorkout;
  exercise: Exercise;
  last: StoredSet | undefined;
  back: string;
};

function LogSetForm({ workout, exercise, last, back }: FormProps) {
  const navigate = useNavigate();
  const store = useLogStore();
  const { notify, ensurePersistence } = useSyncControls();
  const equipment = exercise.equipmentType;
  const gym = workout.gymSnapshot;
  const bar = gym ? barFor(gym, equipment) : undefined;
  const hasBar = usesBar(equipment);
  const initial = initialEntry(equipment, last);

  const [mode, setMode] = useState<EntryMode>(initial.mode);
  const [weightText, setWeightText] = useState(last ? String(initial.weight) : '');
  const [repsText, setRepsText] = useState(String(initial.reps));
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // The total that a weight per side was worked out from, so switching back gives exactly that total.
  const converted = useRef<{ total: string; perSide: string } | null>(null);

  const weight = parseWeight(weightText);
  const reps = /^\d+$/.test(repsText.trim()) ? Number(repsText.trim()) : null;
  const gymName = gym?.name ?? 'this gym';

  if (hasBar && bar === undefined)
    return (
      <div className="flex flex-col gap-6">
        <header className="flex items-center gap-2">
          <BackLink to={back} />
          <h1 className="text-title font-semibold">{exercise.name}</h1>
        </header>
        <section className="flex flex-col items-start gap-4 rounded-md border border-line bg-surface-200 p-4">
          <h2 className="text-headline font-semibold">
            No {EQUIPMENT_LABEL[equipment]} set for {gymName}
          </h2>
          <p className="text-callout text-ink-muted">
            The bar weight is added to every weight you log, so it has to be set first.
          </p>
          {workout.gymId && (
            <Link to={`/gyms/${workout.gymId}`} className={buttonClasses('primary')}>
              Set the bar for this gym
            </Link>
          )}
        </section>
      </div>
    );

  const result =
    weight === null || reps === null
      ? null
      : validateSet(
          {
            equipment,
            weight: { value: weight, unit: 'kg', mode: hasBar ? mode : 'total' },
            reps,
            barKg: bar ?? null,
            source: 'tap',
          },
          { lastTotalKg: last?.totalKg },
        );

  const weightLabel = !hasBar
    ? 'Weight'
    : mode === 'per_side'
      ? 'Weight per side'
      : 'Weight, total including bar';

  function switchMode(next: EntryMode) {
    if (next === mode) return;
    // Keep the real weight the same: a total and a weight per side describe one bar.
    if (next === 'total') {
      const back = converted.current;
      if (back && back.perSide === weightText) setWeightText(back.total);
      else
        setWeightText(
          weight !== null && bar !== undefined ? String(roundKg(weight * 2 + bar)) : '',
        );
    } else if (weight !== null && bar !== undefined && weight >= bar) {
      const perSide = String(roundKg((weight - bar) / 2));
      converted.current = { total: weightText, perSide };
      setWeightText(perSide);
    } else setWeightText(''); // less than the bar has no weight per side
    setMode(next);
  }

  function step(direction: 1 | -1) {
    setWeightText(
      String(nextValue(weight ?? 0, stepFor(equipment, mode), direction, hasBar ? mode : 'total')),
    );
  }

  async function save(resolved: ResolvedWeight) {
    if (reps === null || saving) return;
    setSaving(true);
    setProblem(null);
    try {
      await store.logSet({
        id: crypto.randomUUID(),
        workoutId: workout.id,
        exerciseId: exercise.id,
        totalKg: resolved.totalKg,
        barKg: resolved.barKg,
        perSideKg: resolved.perSideKg,
        inputMode: resolved.inputMode,
        reps,
        source: 'tap',
        rawTranscript: null,
        loggedAt: new Date().toISOString(),
      });
      ensurePersistence();
      notify();
      navigate(back);
    } catch {
      setProblem('Could not save the set. Please try again.');
      setSaving(false);
    }
  }

  function logSet() {
    if (!result) return;
    if (result.status === 'ask') setAsking(true);
    else if (result.status !== 'reject') void save(result.resolved);
  }

  const resolved =
    result && (result.status === 'ok' || result.status === 'warn') ? result.resolved : null;
  const issues = result ? result.issues : [];
  const disabled = !result || result.status === 'reject' || saving;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-2">
        <BackLink to={back} />
        <h1 className="text-title font-semibold">{exercise.name}</h1>
      </header>

      {hasBar && usesModeToggle(equipment) && (
        <div role="group" aria-label="Weight entry" className="flex gap-2">
          <Chip selected={mode === 'total'} onClick={() => switchMode('total')}>
            Total weight
          </Chip>
          <Chip selected={mode === 'per_side'} onClick={() => switchMode('per_side')}>
            Per side
          </Chip>
        </div>
      )}

      <Stepper
        label={weightLabel}
        value={weightText}
        unit="kg"
        onChange={setWeightText}
        onStep={step}
        error={
          weight === null && weightText.trim() !== ''
            ? 'Enter a number, for example 62.5.'
            : undefined
        }
      />
      {!hasBar && (
        <p className="text-center text-caption text-ink-muted">{weightHint(equipment)}</p>
      )}

      <Stepper
        label="Reps"
        value={repsText}
        inputMode="numeric"
        onChange={setRepsText}
        onStep={(direction) =>
          setRepsText(String(Math.min(100, Math.max(1, (reps ?? 0) + direction))))
        }
        error={reps === null ? 'Reps must be a whole number.' : undefined}
      />

      {hasBar && (
        <BreakdownCard
          gymName={gymName}
          breakdown={resolved ? breakdownFor(resolved) : undefined}
          message={
            !result
              ? 'Enter a weight and reps to see the breakdown.'
              : result.status === 'ask'
                ? 'Choose how to read this weight when you log the set.'
                : (issues[0]?.message ?? '')
          }
        />
      )}

      {result && result.status !== 'ask' && issues.length > 0 && (
        <ul
          role={result.status === 'reject' ? 'alert' : 'status'}
          className={`flex flex-col gap-1 rounded-md border p-4 text-callout ${result.status === 'reject' ? 'border-danger' : 'border-warning'}`}
        >
          {issues.map((issue) => (
            <li key={issue.code}>{issue.message}</li>
          ))}
        </ul>
      )}

      {problem && (
        <p role="alert" className="rounded-md border border-danger bg-surface-200 p-4">
          {problem}
        </p>
      )}

      <Button disabled={disabled} onClick={logSet}>
        {saving ? 'Saving…' : 'Log set'}
      </Button>

      {asking && result?.status === 'ask' && (
        <AmbiguityPrompt
          title={promptTitle(result.issues[0]?.code)}
          message={result.issues[0]?.message ?? 'Choose how to read this weight.'}
          options={result.options.map((option: Option) => ({
            label: option.label,
            hint: `${formatKg(option.resolved.totalKg)} kg in total`,
          }))}
          onChoose={(index) => {
            setAsking(false);
            void save(result.options[index]!.resolved);
          }}
          onCancel={() => setAsking(false)}
          extra={
            workout.gymId && hasBar ? (
              <Link
                to={`/gyms/${workout.gymId}`}
                className="flex min-h-touch items-center font-semibold text-accent"
              >
                Change bar
              </Link>
            ) : undefined
          }
        />
      )}
    </div>
  );
}

function promptTitle(code: string | undefined): string {
  if (code === 'TOTAL_BELOW_BAR') return 'Total or without the bar?';
  if (code === 'LARGE_JUMP') return 'Is this right?';
  return 'Check this weight';
}
