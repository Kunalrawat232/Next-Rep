import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  Button,
  cardClasses,
  Chip,
  ErrorMessage,
  LoadingMessage,
  PageHeader,
  TextField,
} from '../../components';
import {
  defaultBarbellKg,
  validateGymForm,
  type BarKind,
  type Gym,
  type GymFormErrors,
  type GymInput,
} from '../../domain/gyms';
import { formatWeight, unitLabel } from '../../domain/units';
import type { Unit } from '../../domain/schemas';
import { useAuth } from '../auth';
import { useUnit } from '../settings/UnitProvider';
import { useGymService } from './GymServiceContext';
import { GymsLoadError } from './GymsLoadError';
import type { GymFailure, GymService } from './types';
import { useGym } from './useGym';
import { usePending } from '../../lib/usePending';

/** `origin` is the stored kg the field started from, so saving it untouched changes nothing. */
type FormBar = { id: string; name: string; weightKg: string; origin: number | null; kind: BarKind };

/** Common barbells to tap: 20 and 15 kg, or 45 and 35 lb. */
const BARBELL_PRESETS: Record<Unit, string[]> = { kg: ['20', '15'], lb: ['45', '35'] };
const KIND_LABEL: Record<BarKind, string> = {
  ez_bar: 'EZ bar',
  smith: 'Smith bar',
  other: 'Other',
};
const PRESET_NAMES = [KIND_LABEL.ez_bar, KIND_LABEL.smith];

const failureMessage = (reason: GymFailure, action: string) =>
  reason === 'offline'
    ? `You're offline. Changes to your gym need a connection, so connect and try again.`
    : reason === 'conflict'
      ? 'You already have a bar with that name or of that kind, or your gym was just set up on another device. Check the bars, reload and try again.'
      : `Could not ${action}. Please try again.`;

export function GymPage() {
  const { unit } = useUnit();
  const { state: auth } = useAuth();
  const service = useGymService();
  const { state, reload } = useGym(service);

  if (auth.status !== 'signedIn') return null;
  if (state.status === 'loading') return <LoadingMessage />;
  if (state.status === 'error') return <GymsLoadError reason={state.reason} onRetry={reload} />;

  return (
    <GymForm
      // A new unit starts a new form, so text typed in one unit is never read in the other.
      key={`${state.gym?.id ?? 'new'}-${unit}`}
      unit={unit}
      service={service}
      userId={auth.user.id}
      existing={state.gym ?? undefined}
    />
  );
}

type FormProps = {
  unit: Unit;
  service: GymService;
  userId: string;
  existing: Gym | undefined;
};

function GymForm({ unit, service, userId, existing }: FormProps) {
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  // Minted once per form, so a retry after a half-done save finishes the job instead of duplicating it.
  const [newGymId] = useState(() => crypto.randomUUID());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const [barbellKg, setBarbellKg] = useState(
    existing ? formatWeight(existing.barbellKg, unit) : formatWeight(defaultBarbellKg(unit), unit),
  );
  const barbellOrigin = existing?.barbellKg ?? null;
  const [bars, setBars] = useState<FormBar[]>(
    () =>
      existing?.bars.map((bar) => ({
        ...bar,
        weightKg: formatWeight(bar.weightKg, unit),
        origin: bar.weightKg,
      })) ?? [],
  );
  const [errors, setErrors] = useState<GymFormErrors>({ bars: {} });
  const [focusTick, setFocusTick] = useState(0);
  const { pending, begin, end } = usePending();
  const [problem, setProblem] = useState<string | null>(null);

  const [draftKind, setDraftKind] = useState<BarKind>('other');
  const [draftName, setDraftName] = useState('');
  const [draftWeight, setDraftWeight] = useState('');
  const [draftErrors, setDraftErrors] = useState<{ name?: string; weightKg?: string }>({});

  useEffect(() => {
    if (focusTick > 0)
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusTick]);

  function chooseKind(kind: BarKind) {
    setDraftKind(kind);
    // A preset name follows the kind; a name the user typed is kept.
    if (draftName === '' || PRESET_NAMES.includes(draftName))
      setDraftName(kind === 'other' ? '' : KIND_LABEL[kind]);
  }

  function addBarOnEnter(event: KeyboardEvent) {
    // Enter in the add-bar fields adds the bar; it must not save the whole gym.
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      addBar();
    }
  }

  function addBar() {
    const draft = {
      id: crypto.randomUUID(),
      name: draftName,
      weightKg: draftWeight,
      origin: null,
      kind: draftKind,
    };
    const result = validateGymForm({ barbellKg, barbellOrigin, bars: [...bars, draft] }, unit);
    const own = result.ok ? undefined : result.errors.bars[bars.length];
    if (own) {
      setDraftErrors(own);
      return;
    }
    setBars([...bars, draft]);
    setDraftKind('other');
    setDraftName('');
    setDraftWeight('');
    setDraftErrors({});
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setProblem(null);
    const checked = validateGymForm({ barbellKg, barbellOrigin, bars }, unit);
    // A bar that was typed but never added would be lost, so ask instead of dropping it.
    const draftTyped =
      draftWeight.trim() !== '' || (draftName.trim() !== '' && !PRESET_NAMES.includes(draftName));
    if (draftTyped) {
      setDraftErrors({
        [draftWeight.trim() !== '' ? 'weightKg' : 'name']:
          'Tap Add bar to include this bar, or clear it.',
      });
    }
    if (!checked.ok || draftTyped) {
      setErrors(checked.ok ? { bars: {} } : checked.errors);
      setFocusTick((n) => n + 1);
      return;
    }
    setErrors({ bars: {} });
    if (!begin()) return;
    const input: GymInput = checked.value;
    try {
      const result = await service.save(userId, existing?.id ?? newGymId, input);
      if (!mounted.current) return;
      if (result.status === 'ok') {
        navigate('/settings');
        return;
      }
      setProblem(failureMessage(result.reason, 'save your gym'));
    } catch {
      if (mounted.current) setProblem(failureMessage('unknown', 'save your gym'));
    }
    if (mounted.current) end();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back="/settings" title="Your gym" />
      <p className="text-callout text-ink-muted">
        Bar weights are added to every weight you log, so a bar set here is counted for you.
      </p>

      <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <TextField
            label={`Barbell weight (${unitLabel(unit)})`}
            inputMode="decimal"
            value={barbellKg}
            onChange={(e) => {
              setBarbellKg(e.target.value);
              setErrors((prev) => ({ ...prev, barbellKg: undefined }));
            }}
            disabled={pending}
            error={errors.barbellKg}
            hint={
              existing
                ? undefined
                : `Not sure? Most gyms use a ${BARBELL_PRESETS[unit][0]} ${unitLabel(unit)} barbell.`
            }
          />
          <div role="group" aria-label="Barbell presets" className="flex gap-2">
            {BARBELL_PRESETS[unit].map((preset) => (
              <Chip
                key={preset}
                selected={barbellKg.trim() === preset}
                disabled={pending}
                onClick={() => setBarbellKg(preset)}
              >
                {preset} {unitLabel(unit)}
              </Chip>
            ))}
          </div>
        </div>

        <section aria-labelledby="bars-heading" className="flex flex-col gap-4">
          <h2 id="bars-heading" className="text-headline font-semibold">
            Other bars
          </h2>
          {bars.length === 0 && (
            <p className="text-callout text-ink-muted">Optional. You can add more later.</p>
          )}
          <ul className="flex flex-col gap-2">
            {bars.map((bar, index) => (
              <li key={bar.id} className={cardClasses('flex items-end gap-2')}>
                <div className="flex-1">
                  <TextField
                    label={`${bar.name} weight (${unitLabel(unit)})`}
                    inputMode="decimal"
                    value={bar.weightKg}
                    onChange={(e) => {
                      setBars(
                        bars.map((b) => (b.id === bar.id ? { ...b, weightKg: e.target.value } : b)),
                      );
                      setErrors((prev) => ({
                        ...prev,
                        bars: Object.fromEntries(
                          Object.entries(prev.bars).filter(([key]) => Number(key) !== index),
                        ),
                      }));
                    }}
                    disabled={pending}
                    error={errors.bars[index]?.weightKg ?? errors.bars[index]?.name}
                  />
                </div>
                <Button
                  variant="secondary"
                  aria-label={`Remove ${bar.name}`}
                  disabled={pending}
                  onClick={() => {
                    setBars(bars.filter((b) => b.id !== bar.id));
                    setErrors((prev) => ({ ...prev, bars: {} }));
                  }}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>

          <fieldset
            onKeyDown={addBarOnEnter}
            className="flex flex-col gap-4 rounded-md border border-line p-4"
          >
            <legend className="px-2 text-callout font-medium">Add a bar</legend>
            <div role="group" aria-label="Bar kind" className="flex flex-wrap gap-2">
              {(['ez_bar', 'smith', 'other'] as const).map((kind) => (
                <Chip
                  key={kind}
                  selected={draftKind === kind}
                  disabled={pending || (kind !== 'other' && bars.some((b) => b.kind === kind))}
                  onClick={() => chooseKind(kind)}
                >
                  {KIND_LABEL[kind]}
                </Chip>
              ))}
            </div>
            <TextField
              label="Bar name"
              value={draftName}
              onChange={(e) => {
                setDraftName(e.target.value);
                setDraftErrors((prev) => ({ ...prev, name: undefined }));
              }}
              disabled={pending}
              error={draftErrors.name}
            />
            <TextField
              label={`Bar weight (${unitLabel(unit)})`}
              inputMode="decimal"
              value={draftWeight}
              onChange={(e) => {
                setDraftWeight(e.target.value);
                setDraftErrors((prev) => ({ ...prev, weightKg: undefined }));
              }}
              disabled={pending}
              error={draftErrors.weightKg}
            />
            <Button variant="secondary" disabled={pending} onClick={addBar} className="self-start">
              Add bar
            </Button>
          </fieldset>
        </section>

        {problem && <ErrorMessage>{problem}</ErrorMessage>}

        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : existing ? 'Save changes' : 'Save'}
        </Button>
      </form>
    </div>
  );
}
