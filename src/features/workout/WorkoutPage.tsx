import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { BackLink, Button, buttonClasses } from '../../components';
import { ignoreClosed, type StoredSet, type StoredWorkout } from '../../data/local';
import { formatKg, pickDefaultGym } from '../../domain/gyms';
import { useOnline } from '../../lib/useOnline';
import { useExerciseService, useExercises } from '../exercises';
import { SyncBadge, useLogStore, useSyncControls } from '../sync';
import { OfflineBanner } from './OfflineBanner';
import { SetList } from './SetList';
import { useFreshGym } from './useFreshGym';
import { PrBadge, useRecordMarks } from '../progress';
import { setSummary } from '../../domain/workout';
import { exerciseQuery, useExerciseParam } from './useExerciseParam';
import { useGymCatalog } from './useGymCatalog';
import { useWorkout } from './useWorkout';
import { usePending } from '../../lib/usePending';

export function WorkoutPage() {
  const { state, reload } = useWorkout();
  if (state.status === 'loading')
    return (
      <p role="status" className="text-ink-muted">
        Loading…
      </p>
    );
  if (state.status === 'none') return <StartWorkout onStarted={reload} />;
  return <ActiveWorkout workout={state.workout} sets={state.sets} reload={reload} />;
}

function StartWorkout({ onStarted }: { onStarted: () => Promise<void> }) {
  const { catalog, reload } = useGymCatalog();
  const store = useLogStore();
  const { notify } = useSyncControls();
  const [chosen, setChosen] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const { pending: starting, begin: beginStart, end: endStart } = usePending();
  // One id for this screen, so a second tap starts the same workout instead of another one.
  const workoutId = useRef(crypto.randomUUID());

  async function start(gymId: string) {
    if (catalog.status !== 'ready') return;
    const gym = catalog.gyms.find((g) => g.id === gymId);
    if (!gym) return;
    setProblem(null);
    if (!beginStart()) return;
    try {
      await store.startWorkout({
        id: workoutId.current,
        gymId: gym.id,
        startedAt: new Date().toISOString(),
        gymSnapshot: { name: gym.name, barbellKg: gym.barbellKg, bars: gym.bars },
      });
      notify();
      await onStarted();
    } catch {
      setProblem('Could not start the workout. Please try again.');
      endStart();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-2">
        <BackLink to="/" />
        <h1 className="text-title font-semibold">Workout</h1>
      </header>
      <OfflineBanner />

      {catalog.status === 'loading' && (
        <p role="status" className="text-ink-muted">
          Loading your gyms…
        </p>
      )}
      {catalog.status === 'error' && (
        <div className="flex flex-col items-start gap-4">
          <p role="alert" className="rounded-md border border-danger bg-surface-200 p-4">
            Could not load your gyms. Connect once to load them, and they stay available offline.
          </p>
          <Button variant="secondary" onClick={reload}>
            Try again
          </Button>
        </div>
      )}
      {catalog.status === 'ready' && catalog.gyms.length === 0 && (
        <section className="flex flex-col items-start gap-4 rounded-md border border-line bg-surface-200 p-4">
          <h2 className="text-headline font-semibold">Add a gym first</h2>
          <p className="text-callout text-ink-muted">
            A workout needs a gym, so the bar weight is added to every weight you log.
          </p>
          <Link to="/gyms/new" className={buttonClasses('primary')}>
            Add a gym
          </Link>
        </section>
      )}
      {catalog.status === 'ready' && catalog.gyms.length > 0 && (
        <>
          {catalog.fromCache && (
            <p className="text-caption text-ink-muted">Using the gyms saved on this device.</p>
          )}
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-callout font-medium">Where are you training?</legend>
            {catalog.gyms.map((gym) => {
              const selected = (chosen ?? pickDefaultGym(catalog.gyms)?.id) === gym.id;
              return (
                <label
                  key={gym.id}
                  className={`flex min-h-touch items-center gap-3 rounded-md border p-4 ${selected ? 'border-accent' : 'border-line'}`}
                >
                  <input
                    type="radio"
                    name="gym"
                    checked={selected}
                    onChange={() => setChosen(gym.id)}
                    className="size-5 accent-[var(--color-accent)]"
                  />
                  <span>
                    <span className="block text-body font-semibold">{gym.name}</span>
                    <span className="block text-callout text-ink-muted">
                      Barbell {formatKg(gym.barbellKg)} kg
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>
          {problem && (
            <p role="alert" className="rounded-md border border-danger bg-surface-200 p-4">
              {problem}
            </p>
          )}
          <Button
            disabled={starting}
            onClick={() => void start(chosen ?? pickDefaultGym(catalog.gyms)!.id)}
          >
            Start workout
          </Button>
        </>
      )}
    </div>
  );
}

type ActiveProps = { workout: StoredWorkout; sets: StoredSet[]; reload: () => Promise<void> };

function ActiveWorkout({ workout, sets, reload }: ActiveProps) {
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
  const marks = useRecordMarks(sets.map((s) => s.exerciseId));

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
            <p className="inline-flex h-8 items-center rounded-full border border-line bg-surface-200 px-3 text-caption font-medium">
              {gym.name} · {formatKg(gym.barbellKg)} kg bar
            </p>
          )}
          <SyncBadge />
        </div>
      </header>

      {confirmingEnd && (
        <div
          role="group"
          aria-label="End workout"
          className="flex flex-col gap-4 rounded-md border border-danger bg-surface-200 p-4"
        >
          <p>End this workout? You can start a new one afterwards.</p>
          <div className="flex gap-2">
            <Button variant="danger" onClick={() => void end()}>
              Yes, end it
            </Button>
            <Button variant="secondary" onClick={() => setConfirmingEnd(false)}>
              Keep going
            </Button>
          </div>
        </div>
      )}

      <OfflineBanner />

      {last && marks.get(last.id) && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-md border border-success bg-surface-200 p-4"
        >
          <PrBadge kind={marks.get(last.id)!} />
          <span>
            New personal record: {nameOf(last.exerciseId)}, {setSummary(last).headline}
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

      {problem && (
        <p role="alert" className="rounded-md border border-danger bg-surface-200 p-4">
          {problem}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <Button disabled aria-describedby="voice-note" className="w-full">
          {online ? 'Voice logging coming soon' : 'Voice logging unavailable offline'}
        </Button>
        <p id="voice-note" className="text-caption text-ink-muted">
          {online
            ? 'Say a set, and it is logged for you.'
            : 'Voice needs internet. Tap logging works.'}
        </p>
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
