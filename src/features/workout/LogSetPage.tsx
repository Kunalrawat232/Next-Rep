import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Button,
  buttonClasses,
  Chip,
  EmptyState,
  ErrorMessage,
  LoadingMessage,
  NotFound,
  PageHeader,
} from '../../components';
import { ignoreClosed, type StoredSet, type StoredWorkout } from '../../data/local';
import { EQUIPMENT_LABEL, type Exercise } from '../../domain/exercises';
import { barFor } from '../../domain/gyms';
import { usesBar, type Unit } from '../../domain/schemas';
import { fieldFromText, kgFromField, withUnit, type WeightField } from '../../domain/units';
import { validateSet, type Option, type ResolvedWeight } from '../../domain/validation';
import {
  breakdownFor,
  convertEntry,
  initialEntry,
  nextValue,
  parseWeight,
  stepFor,
  usesModeToggle,
  weightForValidation,
  weightHint,
  type EntryMode,
} from '../../domain/workout';
import { useExerciseService, useExercises } from '../exercises';
import { useUnit } from '../settings/UnitProvider';
import { useLogStore, useSyncControls } from '../sync';
import { AmbiguityPrompt } from './AmbiguityPrompt';
import { BreakdownCard } from './BreakdownCard';
import { Stepper } from './Stepper';
import { useFreshGym } from './useFreshGym';
import { exerciseQuery, useExerciseParam } from './useExerciseParam';
import { useWorkout } from './useWorkout';
import { usePending } from '../../lib/usePending';

export function LogSetPage() {
  const { unit } = useUnit();
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
      .catch((error: unknown) => {
        try {
          ignoreClosed(error);
        } catch {
          // Without the last set the form simply starts from its defaults.
          if (current) setLastSet({ exerciseId, set: undefined });
        }
      });
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
    return <LoadingMessage />;
  const exercise =
    exercises.status === 'ready' ? exercises.exercises.find((e) => e.id === exerciseId) : undefined;
  if (workoutState.status === 'error')
    return (
      <ErrorMessage onRetry={() => void reload()}>
        Could not read your workout from this device.
      </ErrorMessage>
    );
  if (workoutState.status !== 'open' || !exercise)
    return (
      <NotFound
        title={workoutState.status !== 'open' ? 'No workout is open' : 'Exercise not found'}
        to="/workout"
        label="Back to the workout"
      />
    );

  return (
    <>
      <FreshGym workout={workoutState.workout} reload={reload} />
      <LogSetForm
        // A new unit starts a new form, so text typed in one unit is never read in the other.
        key={`${exercise.id}-${unit}`}
        unit={unit}
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
  unit: Unit;
  workout: StoredWorkout;
  exercise: Exercise;
  last: StoredSet | undefined;
  back: string;
};

function LogSetForm({ unit, workout, exercise, last, back }: FormProps) {
  const navigate = useNavigate();
  const store = useLogStore();
  const { notify, ensurePersistence } = useSyncControls();
  const equipment = exercise.equipmentType;
  const gym = workout.gymSnapshot;
  const bar = gym ? barFor(gym, equipment) : undefined;
  const hasBar = usesBar(equipment);
  const initial = initialEntry(equipment, last, unit);

  const [mode, setMode] = useState<EntryMode>(initial.mode);
  const [field, setField] = useState<WeightField>(initial.weight);
  const [repsText, setRepsText] = useState(String(initial.reps));
  const [asking, setAsking] = useState(false);
  const { pending: saving, begin, end } = usePending();
  const [problem, setProblem] = useState<string | null>(null);
  // The field a weight per side was worked out from, so switching back gives exactly that weight.
  const converted = useRef<{ total: WeightField; perSide: string } | null>(null);

  const weightText = field.text;
  /** What is typed, in the unit shown. */
  const weight = parseWeight(weightText);
  /** What it means in kg: the stored value the field started from while the text is unchanged, else the typed text converted. */
  const valueKg = kgFromField(field, unit);
  const reps = /^\d+$/.test(repsText.trim()) ? Number(repsText.trim()) : null;

  if (hasBar && bar === undefined)
    return (
      <div className="flex flex-col gap-6">
        <PageHeader back={back} title={exercise.name} />
        <EmptyState
          title={<>No {EQUIPMENT_LABEL[equipment]} set up</>}
          message="The bar weight is added to every weight you log, so it has to be set first."
        >
          <Link to="/gym" className={buttonClasses('primary')}>
            Set up your bars
          </Link>
        </EmptyState>
      </div>
    );

  // As it was at the start (same text, same way of entering it), the weight is the stored total.
  const untouched =
    last !== undefined && field.text === initial.weight.text && mode === initial.mode;
  const given =
    valueKg === null || weight === null
      ? null
      : weightForValidation(
          {
            mode: hasBar ? mode : 'total',
            valueKg,
            valueShown: weight,
            barKg: bar ?? null,
            untouchedTotalKg: untouched && hasBar ? last.totalKg : undefined,
          },
          unit,
        );
  const result =
    given === null || reps === null
      ? null
      : validateSet(
          {
            equipment,
            weight: { value: given.kg, unit: 'kg', mode: given.mode },
            reps,
            barKg: bar ?? null,
            source: 'tap',
          },
          { lastTotalKg: last?.totalKg, displayUnit: unit },
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
      if (back && back.perSide === weightText) setField(back.total);
      else {
        const total =
          weight !== null && bar !== undefined ? convertEntry(weight, 'per_side', bar, unit) : null;
        setField(fieldFromText(total === null ? '' : String(total)));
      }
    } else {
      const side =
        weight !== null && bar !== undefined ? convertEntry(weight, 'total', bar, unit) : null;
      // Less than the bar has no weight per side.
      if (side !== null) converted.current = { total: field, perSide: String(side) };
      setField(fieldFromText(side === null ? '' : String(side)));
    }
    setMode(next);
  }

  function step(direction: 1 | -1) {
    const next = nextValue(
      weight ?? 0,
      stepFor(equipment, mode, unit),
      direction,
      hasBar ? mode : 'total',
      unit,
    );
    setField(fieldFromText(String(next)));
  }

  async function save(resolved: ResolvedWeight) {
    if (reps === null || !begin()) return;
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
      end();
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
      <PageHeader back={back} title={exercise.name} />

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
        unit={unit}
        onChange={(text) => setField({ text, origin: field.origin })}
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
          breakdown={resolved ? breakdownFor(resolved, unit) : undefined}
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

      {problem && <ErrorMessage>{problem}</ErrorMessage>}

      <Button disabled={disabled} onClick={logSet}>
        {saving ? 'Saving…' : 'Log set'}
      </Button>

      {asking && result?.status === 'ask' && (
        <AmbiguityPrompt
          title={promptTitle(result.issues[0]?.code)}
          message={result.issues[0]?.message ?? 'Choose how to read this weight.'}
          options={result.options.map((option: Option) => ({
            label: option.label,
            hint: `${withUnit(option.resolved.totalKg, unit)} in total`,
          }))}
          onChoose={(index) => {
            setAsking(false);
            void save(result.options[index]!.resolved);
          }}
          onCancel={() => setAsking(false)}
          extra={
            hasBar ? (
              <Link to="/gym" className="flex min-h-touch items-center font-semibold text-accent">
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
