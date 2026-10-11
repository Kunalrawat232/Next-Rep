import { useEffect, useRef, useState } from 'react';
import { Button, ErrorMessage } from '../../components';
import { ignoreClosed, type StoredWorkout } from '../../data/local';
import type { Exercise } from '../../domain/exercises';
import { parseTranscript } from '../../domain/parser';
import { REST_MAX, REST_MIN_CUSTOM, formatRest } from '../../domain/rest';
import type { ResolvedWeight } from '../../domain/validation';
import { usePending } from '../../lib/usePending';
import { useOnline } from '../../lib/useOnline';
import { useUnit } from '../settings/UnitProvider';
import { useLogStore, useSyncControls } from '../sync';
import {
  draftFromParse,
  UNCLEAR_MESSAGE,
  useSpeech,
  type SpeechError,
  type VoiceDraft,
} from '../voice';
import type { RestTimer } from './useRestTimer';
import { VoiceConfirmCard } from './VoiceConfirmCard';

type Props = {
  workout: StoredWorkout;
  exerciseId: string | null;
  exercises: readonly Exercise[];
  rest: RestTimer;
  /** Called after a set is stored, so the list shows it. */
  onLogged(): Promise<void>;
};

type Pending = {
  transcript: string;
  draft: Extract<VoiceDraft, { kind: 'set' }>;
  lastTotalKg: number | undefined;
};

const SPEECH_MESSAGE: Record<SpeechError, string> = {
  denied: 'The microphone is blocked. Allow it in the browser settings, or tap to log.',
  'no-speech': UNCLEAR_MESSAGE.nothing_heard,
  unavailable: 'Voice is not available right now. Tap logging works.',
  failed: 'Voice stopped working. Try again, or tap to log.',
};

/** The mic: tap, speak a set, check it, tap Log set. What was said is only ever a proposal. */
export function VoiceLogger({ workout, exerciseId, exercises, rest, onLogged }: Props) {
  const { unit } = useUnit();
  const online = useOnline();
  const store = useLogStore();
  const { notify, ensurePersistence } = useSyncControls();
  const speech = useSpeech();
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const { pending: saving, begin, end } = usePending();
  const latest = useRef({ exercises, exerciseId, unit, workout, rest });
  useEffect(() => {
    latest.current = { exercises, exerciseId, unit, workout, rest };
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
    const {
      exercises: list,
      exerciseId: currentExerciseId,
      unit: said,
      workout: open,
      rest: timer,
    } = latest.current;
    const parsed = parseTranscript(transcript, {
      exercises: list,
      unit: said,
      currentExerciseId: currentExerciseId ?? undefined,
    });
    const draft = draftFromParse(parsed, {
      exercises: list,
      gym: open.gymSnapshot ?? undefined,
      unit: said,
    });
    if (draft.kind === 'unclear') setNotice(UNCLEAR_MESSAGE[draft.reason]);
    else if (draft.kind === 'rest') {
      if (draft.seconds < REST_MIN_CUSTOM || draft.seconds > REST_MAX)
        setNotice(`Rest can be ${formatRest(REST_MIN_CUSTOM)} to ${formatRest(REST_MAX)}.`);
      else {
        timer.start(draft.seconds);
        setNotice(`Rest started: ${formatRest(draft.seconds)}.`);
      }
    } else if (draft.kind === 'set') {
      // The last total of this exercise lets the validator spot a number that is far off.
      store
        .lastSetFor(draft.exercise.id)
        .then((last) => last?.totalKg)
        .catch((error: unknown) => {
          ignoreClosed(error);
          return undefined;
        })
        .then((lastTotalKg) => {
          if (mounted.current) setPending({ transcript, draft, lastTotalKg });
        });
    } else setNotice('That command is not available yet.');
  }, [transcript, clear, store]);

  function listen() {
    setPending(null);
    setNotice(null);
    setProblem(null);
    speech.start();
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
        source: 'voice',
        rawTranscript: pending.transcript,
        loggedAt: new Date().toISOString(),
      });
      ensurePersistence();
      notify();
      setPending(null);
      setNotice(null);
      await onLogged();
    } catch {
      setProblem('Could not save the set. Please try again.');
    } finally {
      end();
    }
  }

  if (!speech.supported)
    return (
      <p className="text-caption text-ink-muted">
        Voice is not supported in this browser. Tap logging works.
      </p>
    );

  const statusText = speech.listening ? 'Listening…' : (notice ?? null);

  return (
    <div className="flex flex-col gap-3">
      <Button
        className="w-full"
        disabled={!online}
        aria-pressed={speech.listening}
        aria-describedby="voice-note"
        onClick={speech.listening ? speech.stop : listen}
      >
        {speech.listening ? 'Listening… tap to stop' : 'Tap to speak a set'}
      </Button>
      <p id="voice-note" role="status" className="text-caption text-ink-muted">
        {!online
          ? 'Voice needs internet. Tap logging works.'
          : (statusText ?? 'Say a set, like “bench 60 kilo 8 reps”.')}
      </p>
      {speech.error && <ErrorMessage>{SPEECH_MESSAGE[speech.error]}</ErrorMessage>}
      {pending && (
        <VoiceConfirmCard
          transcript={pending.transcript}
          exercise={pending.draft.exercise}
          reps={pending.draft.reps}
          candidate={pending.draft.candidate}
          lastTotalKg={pending.lastTotalKg}
          unit={unit}
          gymName={workout.gymSnapshot?.name ?? 'this gym'}
          saving={saving}
          problem={problem}
          onLog={(resolved) => void save(resolved)}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
