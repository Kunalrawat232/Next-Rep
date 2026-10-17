import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Button,
  buttonClasses,
  Card,
  cardClasses,
  ErrorMessage,
  LoadingMessage,
  PageHeader,
} from '../../components';
import { ignoreClosed, type StoredSet, type StoredWorkout } from '../../data/local';
import { defaultBarbellKg, summarizeBars } from '../../domain/gyms';
import { useOnline } from '../../lib/useOnline';
import { useAuth } from '../auth';
import { useExerciseService, useExercises } from '../exercises';
import { useGymService } from '../gyms';
import { SyncBadge, useLogStore, useSyncControls } from '../sync';
import { OfflineBanner } from './OfflineBanner';
import { SetList } from './SetList';
import { useFreshGym } from './useFreshGym';
import { PrBadge, useRecordMarksState } from '../progress';
import { setSummary } from '../../domain/workout';
import { exerciseQuery, useExerciseParam } from './useExerciseParam';
import { RestTimer } from './RestTimer';
import { VoiceLogger } from './VoiceLogger';
import { useMyGym } from './useMyGym';
import { useRestTimer } from './useRestTimer';
import { useWorkout } from './useWorkout';
import { usePending } from '../../lib/usePending';
import { useSettled } from '../../lib/useSettled';
import { useUnit } from '../settings/UnitProvider';
import { withUnit } from '../../domain/units';

export function WorkoutPage() {
  const { state, reload } = useWorkout();
  if (state.status === 'loading') return <LoadingMessage />;
  if (state.status === 'error')
    return (
      <ErrorMessage onRetry={() => void reload()}>
        Could not read your workout from this device.
      </ErrorMessage>
    );
  if (state.status === 'none') return <StartWorkout onStarted={reload} />;
  return <ActiveWorkout workout={state.workout} sets={state.sets} reload={reload} />;
}

function StartWorkout({ onStarted }: { onStarted: () => Promise<void> }) {
  const { unit } = useUnit();
  const { state: auth } = useAuth();
  const service = useGymService();
  const { catalog, reload, saved } = useMyGym();
  const store = useLogStore();
  const { notify } = useSyncControls();
  const [problem, setProblem] = useState<string | null>(null);
  const { pending: starting, begin: beginStart, end: endStart } = usePending();
  // One id for this screen, so a second tap starts the same workout instead of another one.
  const workoutId = useRef(crypto.randomUUID());
  // Likewise for the gym made on the first workout, so a retry finishes the job instead of making a second.
  const newGymId = useRef(crypto.randomUUID());

  async function start() {
    if (catalog.status !== 'ready' || auth.status !== 'signedIn') return;
    setProblem(null);
    if (!beginStart()) return;
    try {
      let gym = catalog.gym;
      if (!gym) {
        // The first workout sets the gym up with a standard barbell; Settings changes it.
        const input = { barbellKg: defaultBarbellKg(unit), bars: [] };
        const result = await service.save(auth.user.id, newGymId.current, input);
        if (result.status !== 'ok') {
          if (result.reason === 'conflict') reload();
          setProblem(
            result.reason === 'offline'
              ? "You're offline. Setting up your gym needs a connection once, so connect and try again."
              : result.reason === 'conflict'
                ? 'Your gym was just set up on another device. Try again.'
                : 'Could not set up your gym. Please try again.',
          );
          endStart();
          return;
        }
        gym = { id: newGymId.current, ...input };
        saved(gym);
      }
      await store.startWorkout({
        id: workoutId.current,
        gymId: gym.id,
        startedAt: new Date().toISOString(),
        gymSnapshot: { barbellKg: gym.barbellKg, bars: gym.bars },
      });
      notify();
      await onStarted();
    } catch {
      setProblem('Could not start the workout. Please try again.');
      endStart();
    }
  }

  // One loader until the gym has arrived, then the whole screen at once.
  if (catalog.status === 'loading') return <LoadingMessage>Loading your gym…</LoadingMessage>;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back="/" title="Workout" />
      <OfflineBanner />

      {catalog.status === 'error' && (
        <div className="flex flex-col items-start gap-4">
          <ErrorMessage>
            Could not load your gym. Connect once to load it, and it stays available offline.
          </ErrorMessage>
          <Button variant="secondary" onClick={reload}>
            Try again
          </Button>
        </div>
      )}
      {catalog.status === 'ready' && (
        <>
          {catalog.fromCache && (
            <p className="text-caption text-ink-muted">Using the gym saved on this device.</p>
          )}
          <Card as="section" aria-label="Your bars" className="flex flex-col gap-2">
            {catalog.gym ? (
              <>
                <p className="text-callout text-ink-muted">Bars added to your weights</p>
                <p className="text-body font-semibold">{summarizeBars(catalog.gym, unit)}</p>
                <Link to="/gym" className="min-h-touch content-center font-semibold text-accent">
                  Change bars
                </Link>
              </>
            ) : (
              <p className="text-callout text-ink-muted">
                Next Rep adds the bar to every weight you log. It starts with a standard{' '}
                {withUnit(defaultBarbellKg(unit), unit)} barbell, and you can change it any time in
                Settings.
              </p>
            )}
          </Card>
          {problem && <ErrorMessage>{problem}</ErrorMessage>}
          <Button disabled={starting} onClick={() => void start()}>
            Start workout
          </Button>
        </>
      )}
    </div>
  );
}

type ActiveProps = { workout: StoredWorkout; sets: StoredSet[]; reload: () => Promise<void> };

function ActiveWorkout({ workout, sets, reload }: ActiveProps) {
  const { unit } = useUnit();
  const navigate = useNavigate();
  const exerciseId = useExerciseParam();
  const exercises = useExercises(useExerciseService());
  const store = useLogStore();
  const { notify, deleteSyncedSet } = useSyncControls();
  const online = useOnline();
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { pending: undoing, begin: beginUndo, end: endUndo } = usePending();
  useFreshGym(workout, reload);
  const rest = useRestTimer(workout.id);
  const { marks, loaded: marksLoaded } = useRecordMarksState(sets.map((s) => s.exerciseId));
  // One loader until the exercise names and the record badges are here, so nothing fills in later.
  const settled = useSettled(exercises.state.status !== 'loading' && marksLoaded);
  if (!settled) return <LoadingMessage />;

  const nameOf = (id: string) =>
    exercises.state.status === 'ready'
      ? (exercises.state.exercises.find((e) => e.id === id)?.name ?? 'Exercise')
      : 'Exercise';
  const selected = exerciseId ? sets.filter((s) => s.exerciseId === exerciseId) : [];
  const others = [...new Set(sets.map((s) => s.exerciseId))].filter((id) => id !== exerciseId);
  const last = sets.at(-1);
  const gym = workout.gymSnapshot;
  const lastIsSynced = last?.syncStatus === 'synced';

  async function undo() {
    if (!last || !beginUndo()) return;
    setProblem(null);
    try {
      // The list on screen can be a moment behind the sync, so the set is read again first.
      const latest = (await store.listSets(workout.id)).at(-1);
      let synced = latest?.syncStatus === 'synced';
      if (latest && !synced) {
        synced = (await store.removeUnsyncedSet(latest.id)) === 'synced';
        notify();
      }
      if (latest && synced) {
        const result = await deleteSyncedSet(latest.id);
        if (result === 'offline')
          setProblem('Deleting a set that is already saved needs internet.');
        else if (result === 'failed') setProblem('Could not delete that set. Please try again.');
      }
      await reload();
    } catch (error) {
      ignoreClosed(error);
      setProblem('Could not undo that set. Please try again.');
    } finally {
      endUndo();
    }
  }

  async function end() {
    try {
      await store.endWorkout(workout.id, new Date().toISOString());
      rest.stop();
      notify();
      navigate('/');
    } catch {
      setProblem('Could not end the workout. Please try again.');
    }
  }

  const query = exerciseQuery(exerciseId);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Link
            to={`/workout/exercise${query}`}
            className="flex min-h-touch items-center gap-2 text-title font-semibold"
          >
            {exerciseId ? nameOf(exerciseId) : 'Choose exercise'}
          </Link>
          {confirmingEnd ? null : (
            <Button variant="secondary" onClick={() => setConfirmingEnd(true)}>
              End workout
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {gym && (
            <p className="inline-flex h-8 items-center rounded-full border border-glass-line glass-flat px-3 text-caption font-medium">
              {withUnit(gym.barbellKg, unit)} bar
            </p>
          )}
          <SyncBadge />
        </div>
      </header>
      {/* Outside the header, so it can stay in view at the top while the sets list scrolls. */}
      <RestTimer timer={rest} />

      {confirmingEnd && (
        <Card tone="danger" role="group" aria-label="End workout" className="flex flex-col gap-4">
          <p>End this workout? You can start a new one afterwards.</p>
          <div className="flex gap-2">
            <Button variant="danger" onClick={() => void end()}>
              Yes, end it
            </Button>
            <Button variant="secondary" onClick={() => setConfirmingEnd(false)}>
              Keep going
            </Button>
          </div>
        </Card>
      )}

      <OfflineBanner />

      {last && marks.get(last.id) && (
        <p role="status" className={cardClasses('flex items-center gap-2', 'success')}>
          <PrBadge kind={marks.get(last.id)!} />
          <span>
            New personal record: {nameOf(last.exerciseId)}, {setSummary(last, unit).headline}
          </span>
        </p>
      )}

      {!exerciseId && (
        <p className="text-callout text-ink-muted">Choose an exercise to log your first set.</p>
      )}
      {exerciseId && (
        <SetList
          title={nameOf(exerciseId)}
          sets={selected}
          empty="No sets yet. Tap instead to log one."
          marks={marks}
        />
      )}
      {others.map((id) => (
        <SetList
          key={id}
          title={nameOf(id)}
          sets={sets.filter((s) => s.exerciseId === id)}
          marks={marks}
        />
      ))}

      {problem && <ErrorMessage>{problem}</ErrorMessage>}

      <div className="flex flex-col gap-3">
        {exercises.state.status === 'ready' && (
          <VoiceLogger
            workout={workout}
            exerciseId={exerciseId ?? null}
            exercises={exercises.state.exercises}
            rest={rest}
            sets={sets}
            onUndo={undo}
            onLogged={reload}
          />
        )}
        {exerciseId ? (
          <Link to={`/workout/log${query}`} className={buttonClasses('primary', 'w-full')}>
            Tap instead
          </Link>
        ) : (
          <span aria-disabled="true" className={buttonClasses('primary', 'w-full opacity-60')}>
            Tap instead
          </span>
        )}
        <Button
          variant="secondary"
          disabled={!last || undoing || (lastIsSynced && !online)}
          onClick={() => void undo()}
        >
          Undo last
        </Button>
        {lastIsSynced && !online && (
          <p className="text-caption text-ink-muted">
            The last set is already saved, so removing it needs internet.
          </p>
        )}
      </div>
    </div>
  );
}
