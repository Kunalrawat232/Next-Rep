import { useEffect, useRef, useState } from 'react';
import { Button, Card, ErrorMessage } from '../../components';
import { ignoreClosed, type StoredSet, type StoredWorkout } from '../../data/local';
import type { Exercise } from '../../domain/exercises';
import {
  fromGemini,
  needsFallback,
  parseTranscript,
  ParseRequestSchema,
  type ParseRequest,
} from '../../domain/parser';
import type { LogStore } from '../../data/local';
import { setSummary } from '../../domain/workout';
import { REST_MAX, REST_MIN_CUSTOM, formatRest } from '../../domain/rest';
import type { Unit } from '../../domain/schemas';
import type { ResolvedWeight } from '../../domain/validation';
import { usePending } from '../../lib/usePending';
import { useOnline } from '../../lib/useOnline';
import { useUnit } from '../settings/UnitProvider';
import { useLogStore, useSyncControls } from '../sync';
import {
  draftFromParse,
  repeatDraft,
  UNCLEAR_MESSAGE,
  useParseService,
  useVoiceInput,
  withReps,
  withWeight,
  type PartialDraft,
  type SpeechError,
  type VoiceDraft,
} from '../voice';
import type { RestTimer } from './useRestTimer';
import { MissingNumberCard } from './MissingNumberCard';
import { VoiceConfirmCard } from './VoiceConfirmCard';

type Props = {
  workout: StoredWorkout;
  exerciseId: string | null;
  exercises: readonly Exercise[];
  rest: RestTimer;
  /** The sets of this workout, oldest first: "same again" copies the last one. */
  sets: readonly StoredSet[];
  /** Removes the last set, the same way the Undo last button does. */
  onUndo(): Promise<void>;
  /** Called after a set is stored, so the list shows it. */
  onLogged(): Promise<void>;
};

type SetSource = 'voice' | 'gemini';

type Pending = {
  source: SetSource;
  transcript: string;
  draft: Extract<VoiceDraft, { kind: 'set' }>;
  lastTotalKg: number | undefined;
};

const SPEECH_MESSAGE: Record<SpeechError, string> = {
  denied: 'The microphone is blocked. Allow it in the browser settings, or tap to log.',
  'service-off':
    'Voice typing is off on this phone. On iPhone, turn on Dictation in Settings, General, Keyboard. Or tap to log.',
  'no-speech': UNCLEAR_MESSAGE.nothing_heard,
  silent: UNCLEAR_MESSAGE.nothing_heard,
  'mic-busy': 'The microphone is busy. Close anything else using it, then tap the mic again.',
  limited: 'Voice is busy. Wait a minute and try again, or tap to log.',
  'cloud-on':
    'Voice now uses the internet to hear you, because this phone cannot do it on its own. Tap the mic and say it again.',
  unavailable: 'Voice is not available right now. Tap logging works.',
  failed: 'Voice stopped working. Try again, or tap to log.',
};

type Current = {
  exercises: readonly Exercise[];
  exerciseId: string | null;
  unit: Unit;
};

/** What Gemini is told: the phrase, the unit and the current exercise's name and last set. No ids, no user detail. */
async function fallbackRequest(
  transcript: string,
  { exercises, exerciseId, unit }: Current,
  store: Pick<LogStore, 'lastSetFor'>,
): Promise<ParseRequest | null> {
  const name = (id: string) => exercises.find((e) => e.id === id)?.name;
  const currentExercise = exerciseId ? name(exerciseId) : undefined;
  let lastSet: ParseRequest['context']['lastSet'];
  if (exerciseId && currentExercise) {
    const last = await store.lastSetFor(exerciseId).catch(() => undefined);
    if (last)
      lastSet = { exercise: currentExercise, weight: last.totalKg, unit: 'kg', reps: last.reps };
  }
  const request = ParseRequestSchema.safeParse({
    transcript,
    context: {
      unit,
      ...(currentExercise ? { currentExercise } : {}),
      ...(lastSet ? { lastSet } : {}),
    },
  });
  return request.success ? request.data : null;
}

type Asking = {
  transcript: string;
  draft: PartialDraft;
  source: SetSource;
  lastTotalKg: number | undefined;
};

/** The total of the last set of an exercise, which lets the validator spot a number that is far off. */
function lastTotalOf(store: LogStore, exerciseId: string): Promise<number | undefined> {
  return store
    .lastSetFor(exerciseId)
    .then((last) => last?.totalKg)
    .catch((error: unknown) => {
      ignoreClosed(error);
      return undefined;
    });
}

/** The mic: tap, speak a set, check it, tap Log set. What was said is only ever a proposal. */
export function VoiceLogger({
  workout,
  exerciseId,
  exercises,
  rest,
  sets,
  onUndo,
  onLogged,
}: Props) {
  const { unit } = useUnit();
  const online = useOnline();
  const parseService = useParseService();
  const [checking, setChecking] = useState(false);
  const store = useLogStore();
  const { notify, ensurePersistence } = useSyncControls();
  const speech = useVoiceInput();
  const [pending, setPending] = useState<Pending | null>(null);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [removing, setRemoving] = useState<StoredSet | null>(null);
  const { pending: saving, begin, end } = usePending();
  const latest = useRef({ exercises, exerciseId, unit, workout, rest, sets, online });
  useEffect(() => {
    latest.current = { exercises, exerciseId, unit, workout, rest, sets, online };
  });

  // Clearing the transcript re-runs the effect above, so only leaving the screen may drop a late answer.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const { transcript, clear } = speech;
  useEffect(() => {
    if (transcript === null) return;
    clear();
    const heard = transcript;
    const current = latest.current;
    const { exercises: list, exerciseId: currentExerciseId, unit: said } = current;
    const context = {
      exercises: list,
      gym: current.workout.gymSnapshot ?? undefined,
      unit: said,
    };

    const propose = (proposal: Extract<VoiceDraft, { kind: 'set' }>, source: SetSource) => {
      void lastTotalOf(store, proposal.exercise.id).then((lastTotalKg) => {
        if (mounted.current)
          setPending({ transcript: heard, draft: proposal, lastTotalKg, source });
      });
    };

    const act = (draft: VoiceDraft, source: SetSource) => {
      switch (draft.kind) {
        case 'unclear':
          setNotice(UNCLEAR_MESSAGE[draft.reason]);
          break;
        case 'rest':
          if (draft.seconds < REST_MIN_CUSTOM || draft.seconds > REST_MAX)
            setNotice(`Rest can be ${formatRest(REST_MIN_CUSTOM)} to ${formatRest(REST_MAX)}.`);
          else {
            current.rest.start(draft.seconds);
            setNotice(`Rest started: ${formatRest(draft.seconds)}.`);
          }
          break;
        case 'set':
          propose(draft, source);
          break;
        case 'partial':
          // Only a number is missing: ask for it, so the person does not have to say the whole set again.
          void lastTotalOf(store, draft.exercise.id).then((lastTotalKg) => {
            if (mounted.current) setAsking({ transcript: heard, draft, source, lastTotalKg });
          });
          break;
        case 'repeat': {
          const done = latest.current.sets;
          const last =
            done.filter((set) => set.exerciseId === currentExerciseId).at(-1) ?? done.at(-1);
          const proposal = last && repeatDraft(draft, last, context);
          if (proposal) propose(proposal, source);
          else setNotice('There is no set to repeat yet.');
          break;
        }
        case 'undo': {
          const target = latest.current.sets.at(-1);
          if (target) setRemoving(target);
          else setNotice('There is no set to undo.');
          break;
        }
        case 'edit':
          setNotice('Editing a set is not available yet. Say undo, then say it again.');
          break;
      }
    };

    const local = parseTranscript(heard, {
      exercises: list,
      unit: said,
      currentExerciseId: currentExerciseId ?? undefined,
    });
    const localDraft = draftFromParse(local, context);
    if (localDraft.kind === 'partial' || !needsFallback(local) || !current.online) {
      act(localDraft, 'voice');
      return;
    }

    // The parser is not sure: ask Gemini once. Whatever it says is checked and shown like any other phrase.
    setChecking(true);
    void (async () => {
      let draft: VoiceDraft = localDraft;
      let source: SetSource = 'voice';
      try {
        const request = await fallbackRequest(heard, current, store);
        const output = request && (await parseService.parse(request));
        if (output) {
          const read = fromGemini(
            output,
            { exercises: list, unit: said, currentExerciseId: currentExerciseId ?? undefined },
            heard,
          );
          draft = draftFromParse(read, context);
          source = 'gemini';
        }
      } finally {
        if (mounted.current) {
          setChecking(false);
          act(draft, source);
        }
      }
    })();
  }, [transcript, clear, store, parseService]);

  function listen() {
    if (checking) return;
    setPending(null);
    setAsking(null);
    setRemoving(null);
    setNotice(null);
    setProblem(null);
    speech.start();
  }

  /** The missing number was given: the set it makes goes to the same confirm card as a spoken one. */
  function proposeAnswer(asked: Asking, proposal: Extract<VoiceDraft, { kind: 'set' }>) {
    setAsking(null);
    void lastTotalOf(store, proposal.exercise.id).then((lastTotalKg) => {
      if (mounted.current)
        setPending({
          transcript: asked.transcript,
          draft: proposal,
          lastTotalKg,
          source: asked.source,
        });
    });
  }

  async function save(resolved: ResolvedWeight) {
    if (!pending || !begin()) return;
    setProblem(null);
    try {
      await store.logSet({
        id: crypto.randomUUID(),
        workoutId: workout.id,
        exerciseId: pending.draft.exercise.id,
        totalKg: resolved.totalKg,
        barKg: resolved.barKg,
        perSideKg: resolved.perSideKg,
        inputMode: resolved.inputMode,
        reps: pending.draft.reps,
        source: pending.source,
        rawTranscript: pending.transcript,
        loggedAt: new Date().toISOString(),
      });
      ensurePersistence();
      notify();
      rest.startAfterSet();
      setPending(null);
      setNotice(null);
      await onLogged();
    } catch {
      setProblem('Could not save the set. Please try again.');
    } finally {
      end();
    }
  }

  const exerciseName = (id: string) => exercises.find((e) => e.id === id)?.name ?? 'Exercise';

  if (!speech.supported)
    return (
      <p className="text-caption text-ink-muted">
        Voice is not supported in this browser. Tap logging works.
      </p>
    );

  const busy = checking || speech.transcribing;
  const statusText = speech.listening
    ? 'Listening…'
    : speech.transcribing
      ? 'Turning your voice into text…'
      : checking
        ? 'Checking what you said…'
        : (notice ?? null);

  return (
    <div className="flex flex-col gap-3">
      <Button
        className="w-full"
        disabled={!online || busy}
        aria-pressed={speech.listening}
        aria-describedby="voice-note"
        onClick={speech.listening ? speech.stop : listen}
      >
        {busy ? 'Checking…' : speech.listening ? 'Listening… tap to stop' : 'Tap to speak a set'}
      </Button>
      <p id="voice-note" role="status" className="text-caption text-ink-muted">
        {!online
          ? 'Voice needs internet. Tap logging works.'
          : (statusText ?? 'Say a set, like “bench press 60 kilo 8 reps”.')}
      </p>
      {speech.cloud && (
        <p className="text-caption text-ink-muted">
          Your voice is sent to a speech service to turn it into text. Next Rep does not keep it.
        </p>
      )}
      {speech.error && <ErrorMessage>{SPEECH_MESSAGE[speech.error]}</ErrorMessage>}
      {removing && (
        <Card role="group" aria-label="Confirm undo" className="flex flex-col gap-4">
          <p>
            Remove the last set? {exerciseName(removing.exerciseId)},{' '}
            {setSummary(removing, unit).headline}
          </p>
          <div className="flex gap-2">
            <Button
              variant="danger"
              onClick={() => {
                setRemoving(null);
                void onUndo();
              }}
            >
              Remove it
            </Button>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Keep it
            </Button>
          </div>
        </Card>
      )}
      {asking && (
        <MissingNumberCard
          transcript={asking.transcript}
          draft={asking.draft}
          unit={unit}
          lastTotalKg={asking.lastTotalKg}
          onReps={(reps) => {
            if (asking.draft.missing === 'reps')
              proposeAnswer(
                asking,
                withReps(asking.draft, reps, { gym: workout.gymSnapshot ?? undefined }),
              );
          }}
          onWeight={(weight) => {
            if (asking.draft.missing === 'weight')
              proposeAnswer(
                asking,
                withWeight(asking.draft, weight, { gym: workout.gymSnapshot ?? undefined }),
              );
          }}
          onCancel={() => setAsking(null)}
        />
      )}
      {pending && (
        <VoiceConfirmCard
          transcript={pending.transcript}
          readByAi={pending.source === 'gemini'}
          exercise={pending.draft.exercise}
          reps={pending.draft.reps}
          candidate={pending.draft.candidate}
          lastTotalKg={pending.lastTotalKg}
          unit={unit}
          saving={saving}
          problem={problem}
          onLog={(resolved) => void save(resolved)}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
