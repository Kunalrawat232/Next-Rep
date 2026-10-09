import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { BackLink, Button, Chip, TextField } from '../../components';
import {
  EQUIPMENT_LABEL,
  validateCustomExercise,
  type CustomExerciseErrors,
} from '../../domain/exercises';
import type { EquipmentType } from '../../domain/schemas';
import type { Failure } from '../../lib/result';
import { useAuth } from '../auth';
import { useExerciseService } from './ExerciseServiceContext';
import { useExercises } from './useExercises';

// The order in the design: the common five, then the two bars.
const EQUIPMENT_ORDER: EquipmentType[] = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
  'ez_bar',
  'smith',
];
const BODY_PARTS = [
  { value: 'upper', label: 'Upper' },
  { value: 'lower', label: 'Lower' },
  { value: 'core', label: 'Core' },
];

const WEIGHT_HINT: Record<EquipmentType, string> = {
  barbell: 'Log the total including the bar.',
  ez_bar: 'Log the total including the bar.',
  smith: 'Log the total including the bar.',
  dumbbell: 'Log one dumbbell.',
  machine: 'Log the stack weight.',
  cable: 'Log the stack weight.',
  bodyweight: 'Log only the weight you add.',
};

export function CustomExercisePage() {
  const { state: auth } = useAuth();
  const service = useExerciseService();
  const { state, reload } = useExercises(service);

  if (auth.status !== 'signedIn') return null;
  if (state.status === 'loading')
    return (
      <p role="status" className="text-ink-muted">
        Loading…
      </p>
    );
  if (state.status === 'error')
    return (
      <div className="flex flex-col items-start gap-4">
        <p role="alert" className="rounded-md border border-danger bg-surface-200 p-4">
          Could not load the exercises. Please try again.
        </p>
        <Button variant="secondary" onClick={reload}>
          Try again
        </Button>
      </div>
    );
  return (
    <CustomExerciseForm
      userId={auth.user.id}
      existing={state.exercises}
      customProblem={state.customProblem}
      onRetry={reload}
    />
  );
}

type FormProps = {
  userId: string;
  existing: Parameters<typeof validateCustomExercise>[1];
  /** Set when the user's own exercises could not be loaded, so the duplicate check is incomplete. */
  customProblem: Failure | null;
  onRetry: () => void;
};

function CustomExerciseForm({ userId, existing, customProblem, onRetry }: FormProps) {
  const service = useExerciseService();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const formRef = useRef<HTMLFormElement>(null);
  // Minted once, so a retry after a failed save cannot make a second exercise.
  const [exerciseId] = useState(() => crypto.randomUUID());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const [name, setName] = useState(params.get('name') ?? '');
  const [equipmentType, setEquipmentType] = useState<EquipmentType>('barbell');
  const [bodyPart, setBodyPart] = useState('');
  const [aliasesText, setAliasesText] = useState('');
  const [errors, setErrors] = useState<CustomExerciseErrors>({});
  const [focusTick, setFocusTick] = useState(0);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (focusTick === 0) return;
    const form = formRef.current;
    form?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"]')?.focus();
  }, [focusTick]);

  const clear = (patch: Partial<CustomExerciseErrors>) =>
    setErrors((prev) => ({ ...prev, ...patch }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || customProblem) return;
    setProblem(null);
    const checked = validateCustomExercise(
      { name, equipmentType, bodyPart, aliasesText },
      existing,
    );
    if (!checked.ok) {
      setErrors(checked.errors);
      setFocusTick((n) => n + 1);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const result = await service.create(userId, exerciseId, checked.value);
      if (!mounted.current) return;
      if (result.status === 'ok') {
        navigate('/exercises');
        return;
      }
      setProblem(
        result.reason === 'offline'
          ? "You're offline. Connect and try again."
          : result.reason === 'conflict'
            ? 'This account already has an exercise with that name. Change it and try again.'
            : 'Could not save the exercise. Please try again.',
      );
    } catch {
      if (mounted.current) setProblem('Could not save the exercise. Please try again.');
    }
    if (mounted.current) setPending(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-2">
        <BackLink to="/exercises" />
        <h1 className="text-title font-semibold">Custom exercise</h1>
      </header>

      <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-6">
        <TextField
          label="Name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            clear({ name: undefined });
          }}
          disabled={pending}
          error={errors.name}
        />

        <div className="flex flex-col gap-2">
          <p id="equipment-label" className="text-callout font-medium">
            Equipment
          </p>
          <div role="group" aria-labelledby="equipment-label" className="flex flex-wrap gap-2">
            {EQUIPMENT_ORDER.map((type) => (
              <Chip
                key={type}
                selected={equipmentType === type}
                disabled={pending}
                onClick={() => setEquipmentType(type)}
              >
                {EQUIPMENT_LABEL[type]}
              </Chip>
            ))}
          </div>
          <p className="text-caption text-ink-muted">{WEIGHT_HINT[equipmentType]}</p>
        </div>

        <div className="flex flex-col gap-2">
          <p id="body-part-label" className="text-callout font-medium">
            Body part
          </p>
          <div
            role="group"
            aria-labelledby="body-part-label"
            tabIndex={-1}
            data-invalid={errors.bodyPart ? 'true' : undefined}
            aria-describedby={errors.bodyPart ? 'body-part-error' : undefined}
            className="flex flex-wrap gap-2"
          >
            {BODY_PARTS.map((part) => (
              <Chip
                key={part.value}
                selected={bodyPart === part.value}
                disabled={pending}
                onClick={() => {
                  setBodyPart(part.value);
                  clear({ bodyPart: undefined });
                }}
              >
                {part.label}
              </Chip>
            ))}
          </div>
          {errors.bodyPart && (
            <p id="body-part-error" className="text-caption text-danger">
              {errors.bodyPart}
            </p>
          )}
        </div>

        <TextField
          label="What you will say (optional)"
          hint="Words you use, so voice logging can find it. Separate them with commas."
          value={aliasesText}
          onChange={(e) => {
            setAliasesText(e.target.value);
            clear({ aliases: undefined });
          }}
          disabled={pending}
          error={errors.aliases}
        />

        {customProblem && (
          <div
            role="status"
            aria-label="Your exercises"
            className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface-200 p-4"
          >
            <p className="flex-1 text-callout">
              Your own exercises have not loaded, so we cannot check for repeated names or words
              yet.
            </p>
            <Button variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          </div>
        )}

        {problem && (
          <p role="alert" className="rounded-md border border-danger bg-surface-200 p-4">
            {problem}
          </p>
        )}

        <Button type="submit" disabled={pending || customProblem !== null}>
          {pending ? 'Saving…' : 'Save exercise'}
        </Button>
      </form>
    </div>
  );
}
