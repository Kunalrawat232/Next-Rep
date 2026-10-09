import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button, buttonClasses, Chip, TextField } from '../../components';
import {
  pickDefaultGym,
  validateGymForm,
  type BarKind,
  type Gym,
  type GymFormErrors,
  type GymInput,
} from '../../domain/gyms';
import { useAuth } from '../auth';
import { BackLink } from './BackLink';
import { useGymService } from './GymServiceContext';
import { GymsLoadError } from './GymsLoadError';
import type { GymFailure, GymService } from './types';
import { useGyms } from './useGyms';

type FormBar = { id: string; name: string; weightKg: string; kind: BarKind };

const BARBELL_PRESETS = ['20', '15'];
const KIND_LABEL: Record<BarKind, string> = {
  ez_bar: 'EZ bar',
  smith: 'Smith bar',
  other: 'Other',
};
const PRESET_NAMES = [KIND_LABEL.ez_bar, KIND_LABEL.smith];

const failureMessage = (reason: GymFailure, action: string) =>
  reason === 'offline'
    ? `You're offline. Gym changes need a connection, so connect and try again.`
    : reason === 'conflict'
      ? 'This gym already has a bar with that name or of that kind. Change it and try again.'
      : `Could not ${action}. Please try again.`;

export function GymFormPage() {
  const { gymId } = useParams();
  const { state: auth } = useAuth();
  const service = useGymService();
  const { state, reload } = useGyms(service);

  if (auth.status !== 'signedIn') return null;
  if (state.status === 'loading')
    return (
      <p role="status" className="text-ink-muted">
        Loading…
      </p>
    );
  if (state.status === 'error') return <GymsLoadError reason={state.reason} onRetry={reload} />;

  const existing = gymId ? state.gyms.find((gym) => gym.id === gymId) : undefined;
  if (gymId && !existing)
    return (
      <div className="flex flex-col items-start gap-4">
        <h1 className="text-title font-semibold">Gym not found</h1>
        <Link to="/gyms" className={buttonClasses('secondary')}>
          Back to gyms
        </Link>
      </div>
    );

  return (
    <GymForm
      key={existing?.id ?? 'new'}
      service={service}
      userId={auth.user.id}
      existing={existing}
      defaultId={pickDefaultGym(state.gyms)?.id}
      // Only the very first gym claims the default; after that the user moves it on purpose.
      isFirstGym={state.gyms.length === 0}
    />
  );
}

type FormProps = {
  service: GymService;
  userId: string;
  existing: Gym | undefined;
  defaultId: string | undefined;
  isFirstGym: boolean;
};

function GymForm({ service, userId, existing, defaultId, isFirstGym }: FormProps) {
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

  const [name, setName] = useState(existing?.name ?? '');
  const [barbellKg, setBarbellKg] = useState(String(existing?.barbellKg ?? 20));
  const [bars, setBars] = useState<FormBar[]>(
    () => existing?.bars.map((bar) => ({ ...bar, weightKg: String(bar.weightKg) })) ?? [],
  );
  const [errors, setErrors] = useState<GymFormErrors>({ bars: {} });
  const [focusTick, setFocusTick] = useState(0);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const [draftKind, setDraftKind] = useState<BarKind>('other');
  const [draftName, setDraftName] = useState('');
  const [draftWeight, setDraftWeight] = useState('');
  const [draftErrors, setDraftErrors] = useState<{ name?: string; weightKg?: string }>({});

  const [isDefault, setIsDefault] = useState(existing !== undefined && existing.id === defaultId);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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
      kind: draftKind,
    };
    const result = validateGymForm({ name, barbellKg, bars: [...bars, draft] });
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
    const checked = validateGymForm({ name, barbellKg, bars });
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
    setPending(true);
    const input: GymInput = checked.value;
    try {
      const result = existing
        ? await service.update(userId, existing.id, input)
        : await service.create(userId, newGymId, input, isFirstGym);
      if (!mounted.current) return;
      if (result.status === 'ok') {
        navigate('/gyms');
        return;
      }
      setProblem(failureMessage(result.reason, 'save the gym'));
    } catch {
      if (mounted.current) setProblem(failureMessage('unknown', 'save the gym'));
    }
    if (mounted.current) setPending(false);
  }

  async function makeThisDefault() {
    if (!existing || pending) return;
    setProblem(null);
    setPending(true);
    try {
      const result = await service.setDefault(existing.id);
      if (!mounted.current) return;
      if (result.status === 'ok') setIsDefault(true);
      else setProblem(failureMessage(result.reason, 'change the default gym'));
    } catch {
      if (mounted.current) setProblem(failureMessage('unknown', 'change the default gym'));
    }
    if (mounted.current) setPending(false);
  }

  async function deleteGym() {
    if (!existing || pending) return;
    setProblem(null);
    setPending(true);
    try {
      const result = await service.remove(existing.id);
      if (!mounted.current) return;
      if (result.status === 'ok') {
        navigate('/gyms');
        return;
      }
      setProblem(failureMessage(result.reason, 'delete the gym'));
    } catch {
      if (mounted.current) setProblem(failureMessage('unknown', 'delete the gym'));
    }
    if (mounted.current) {
      setPending(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-2">
        <BackLink to="/gyms" />
        <h1 className="text-title font-semibold">{existing ? 'Edit gym' : 'New gym'}</h1>
      </header>

      <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-6">
        <TextField
          label="Gym name"
          placeholder="For example, Home gym"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setErrors((prev) => ({ ...prev, name: undefined }));
          }}
          disabled={pending}
          error={errors.name}
        />

        <div className="flex flex-col gap-2">
          <TextField
            label="Barbell weight (kg)"
            inputMode="decimal"
            value={barbellKg}
            onChange={(e) => {
              setBarbellKg(e.target.value);
              setErrors((prev) => ({ ...prev, barbellKg: undefined }));
            }}
            disabled={pending}
            error={errors.barbellKg}
            hint={existing ? undefined : 'Not sure? Most gyms use a 20 kg barbell.'}
          />
          <div role="group" aria-label="Barbell presets" className="flex gap-2">
            {BARBELL_PRESETS.map((kg) => (
              <Chip
                key={kg}
                selected={barbellKg.trim() === kg}
                disabled={pending}
                onClick={() => setBarbellKg(kg)}
              >
                {kg} kg
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
              <li
                key={bar.id}
                className="flex items-end gap-2 rounded-md border border-line bg-surface-200 p-4"
              >
                <div className="flex-1">
                  <TextField
                    label={`${bar.name} weight (kg)`}
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
              label="Bar weight (kg)"
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

        {problem && (
          <p role="alert" className="rounded-md border border-danger bg-surface-200 p-4">
            {problem}
          </p>
        )}

        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : existing ? 'Save changes' : 'Create gym'}
        </Button>
      </form>

      {existing && (
        <section aria-label="Gym actions" className="flex flex-col gap-4">
          {isDefault ? (
            <p className="text-callout text-ink-muted">This is your default gym.</p>
          ) : (
            <Button variant="secondary" disabled={pending} onClick={makeThisDefault}>
              Make this my default gym
            </Button>
          )}
          {confirmingDelete ? (
            <div className="flex flex-col gap-4 rounded-md border border-danger bg-surface-200 p-4">
              <p>Delete {existing.name}? Its bars go with it.</p>
              <div className="flex gap-2">
                <Button variant="danger" disabled={pending} onClick={deleteGym}>
                  Yes, delete
                </Button>
                <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
              Delete gym
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
