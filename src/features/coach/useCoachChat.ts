import { useCallback, useEffect, useRef, useState } from 'react';
import { ignoreClosed } from '../../data/local';
import {
  buildCoachContext,
  cleanText,
  lastTurns,
  type ChatMessage,
  type CoachContext,
  COACH_NAME,
  COACH_REFUSAL,
} from '../../domain/coach';
import { suggest } from '../../domain/progression';
import { usePending } from '../../lib/usePending';
import { useExerciseService, useExercises } from '../exercises';
import { useHomeData } from '../home/useHomeData';
import { useUnit } from '../settings/UnitProvider';
import { useLogStore } from '../sync';
import { useCoachService, type CoachAnswer } from './coachService';

export type ChatState = { status: 'loading' } | { status: 'ready'; messages: ChatMessage[] };

/** What the person is told when the coach could not answer. */
export const COACH_PROBLEM: Record<Exclude<CoachAnswer['status'], 'ok' | 'off_topic'>, string> = {
  offline: `You're offline. ${COACH_NAME} needs an internet connection.`,
  limited: `You've asked ${COACH_NAME} a lot in a short time. Give it a few minutes and try again.`,
  signed_out: `Your session has ended. Sign in again to talk to ${COACH_NAME}.`,
  unavailable: `${COACH_NAME} can't answer right now. Please try again in a moment.`,
};

/**
 * The chat with the coach. Messages are kept on this device only. A question goes out with the last few
 * turns and, if the person allows it, a small summary of their recent training. A reply the coach could not
 * give is not kept as a message: it is a notice, and the question goes back to the person to send again.
 */
export function useCoachChat() {
  const store = useLogStore();
  const service = useCoachService();
  const { unit } = useUnit();
  const { state: exercises } = useExercises(useExerciseService());
  const home = useHomeData();
  const [state, setState] = useState<ChatState>({ status: 'loading' });
  const [problem, setProblem] = useState<string | null>(null);
  const { pending: sending, begin, end, active: sendActive } = usePending();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let current = true;
    store
      .coachMessages()
      .then((messages) => current && setState({ status: 'ready', messages }))
      .catch((error: unknown) => {
        try {
          ignoreClosed(error);
        } catch {
          if (current) setState({ status: 'ready', messages: [] });
        }
      });
    return () => {
      current = false;
    };
  }, [store]);

  const latest = useRef({ exercises, home, unit });
  useEffect(() => {
    latest.current = { exercises, home, unit };
  });

  /** The summary of recent training, read fresh when a question is sent. Null if it cannot be made. */
  const summary = useCallback(async (): Promise<CoachContext | null> => {
    try {
      const { exercises: list, home: data, unit: shown } = latest.current;
      const known = list.status === 'ready' ? list.exercises : [];
      const recent = await store.endedWorkouts(3);
      const sets = await store.listSetsFor(recent.map((w) => w.id));
      const workouts = recent.map((w) => ({
        startedAt: w.startedAt,
        sets: sets.filter((s) => s.workoutId === w.id),
      }));
      let suggestion: { exerciseId: string; totalKg: number; reps: number } | null = null;
      if (data.status === 'ready' && data.exerciseId) {
        const exercise = known.find((e) => e.id === data.exerciseId);
        const next = exercise
          ? suggest({
              sessions: data.sessions,
              bodyPart: exercise.bodyPart,
              equipment: exercise.equipmentType,
              unit: shown,
            })
          : null;
        if (next)
          suggestion = { exerciseId: data.exerciseId, totalKg: next.totalKg, reps: next.reps };
      }
      return buildCoachContext({
        unit: shown,
        now: new Date(),
        workouts,
        // The person's own exercise names are free text and can say private things, so they are not sent.
        nameOf: (id) => {
          const found = known.find((e) => e.id === id);
          return found && found.tier !== 'custom' ? found.name : undefined;
        },
        suggestion,
      });
    } catch {
      return null;
    }
  }, [store]);

  /** Takes a question back out of the chat, so the person can edit it and send it again, and shows the chat as it is on the device. */
  const takeBack = useCallback(
    async (id: string) => {
      await store.removeCoachMessage(id);
      if (mounted.current) setState({ status: 'ready', messages: await store.coachMessages() });
    },
    [store],
  );

  /** Sends a question. Returns 'failed' when the coach did not answer, so the screen can give the text back. */
  const send = useCallback(
    async (text: string, shareTraining: boolean): Promise<'sent' | 'failed' | 'ignored'> => {
      const question = cleanText(text);
      if (question === '' || state.status !== 'ready' || !begin()) return 'ignored';
      setProblem(null);
      let asked: ChatMessage | null = null;
      try {
        const before = state.messages;
        asked = await store.addCoachMessage({ role: 'user', text: question });
        if (mounted.current) setState({ status: 'ready', messages: [...before, asked] });
        const context = shareTraining ? await summary() : null;
        const answer = await service.ask({
          history: lastTurns(before).map(({ role, text: said }) => ({ role, text: said })),
          question,
          ...(context ? { context } : {}),
        });
        if (answer.status !== 'ok' && answer.status !== 'off_topic') {
          await takeBack(asked.id);
          if (mounted.current) setProblem(COACH_PROBLEM[answer.status]);
          return 'failed';
        }
        // An off-topic question is answered with our own words, and both stay in the chat.
        const said = answer.status === 'ok' ? answer.text : COACH_REFUSAL;
        const reply = await store.addCoachMessage({ role: 'coach', text: said });
        if (mounted.current) setState({ status: 'ready', messages: [...before, asked, reply] });
        return 'sent';
      } catch {
        // Whatever failed, the question must not stay in the chat. If the device store is not usable the notice below still tells the person.
        if (asked) await takeBack(asked.id).catch(() => undefined);
        if (mounted.current) setProblem(COACH_PROBLEM.unavailable);
        return 'failed';
      } finally {
        end();
      }
    },
    [state, store, service, summary, takeBack, begin, end],
  );

  /** Forgets the chat. Not while a question is out: its answer would bring the old chat back. Returns whether it was cleared. */
  const clear = useCallback(async (): Promise<boolean> => {
    if (sendActive()) return false;
    await store.clearCoachMessages();
    if (mounted.current) {
      setState({ status: 'ready', messages: [] });
      setProblem(null);
    }
    return true;
  }, [store, sendActive]);

  return { state, sending, problem, send, clear };
}
