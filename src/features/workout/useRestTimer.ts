import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import {
  extendRest,
  isRestOver,
  isRestStale,
  remainingSeconds,
  startRest,
} from '../../domain/rest';
import { useAuth } from '../auth';

const StoredRest = z.object({ workoutId: z.string(), endsAt: z.number().finite() });

const storageKey = (userId: string) => `next-rep-rest-${userId}`;

function readEndsAt(userId: string | null, workoutId: string, now: number): number | null {
  if (!userId) return null;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = StoredRest.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.workoutId !== workoutId) return null;
    return isRestStale(parsed.data.endsAt, now) ? null : parsed.data.endsAt;
  } catch {
    return null;
  }
}

function writeEndsAt(userId: string | null, workoutId: string, endsAt: number | null): void {
  if (!userId) return;
  try {
    if (endsAt === null) window.localStorage.removeItem(storageKey(userId));
    else window.localStorage.setItem(storageKey(userId), JSON.stringify({ workoutId, endsAt }));
  } catch {
    // Blocked storage only means the timer is not kept across a reload.
  }
}

export type RestTimer = {
  /** Seconds left, or null when no rest is running or waiting to be dismissed. */
  remaining: number | null;
  over: boolean;
  start: (seconds: number) => void;
  extend: () => void;
  stop: () => void;
};

/**
 * The rest timer of one workout. It keeps the time the rest ends, not a count, so the display
 * is right after the screen locks or the page is reloaded. The end time is a convenience kept on
 * this device only, tied to the workout so one from an earlier workout is never shown. It reads
 * the wall clock, so a changed device clock moves the rest, and it reads storage once: two open
 * tabs do not follow each other. It vibrates only when it sees the time run out on a visible page.
 */
export function useRestTimer(workoutId: string): RestTimer {
  const { state } = useAuth();
  const userId = state.status === 'signedIn' ? state.user.id : null;
  const [first] = useState(() => {
    const at = Date.now();
    return { endsAt: readEndsAt(userId, workoutId, at), now: at };
  });
  const [endsAt, setEndsAt] = useState<number | null>(first.endsAt);
  const [now, setNow] = useState(first.now);
  // The end time already announced, so a rest that is over when the page opens does not buzz.
  const announced = useRef<number | null>(
    first.endsAt !== null && isRestOver(first.endsAt, first.now) ? first.endsAt : null,
  );

  const running = endsAt !== null && !isRestOver(endsAt, now);

  useEffect(() => {
    if (!running) return;
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, 500);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [running]);

  const over = endsAt !== null && isRestOver(endsAt, now);
  useEffect(() => {
    if (!over || endsAt === null || announced.current === endsAt) return;
    announced.current = endsAt;
    if (document.visibilityState === 'visible' && typeof navigator.vibrate === 'function')
      navigator.vibrate([200, 100, 200]);
  }, [over, endsAt]);

  const set = useCallback(
    (next: number | null) => {
      setNow(Date.now());
      setEndsAt(next);
      writeEndsAt(userId, workoutId, next);
    },
    [userId, workoutId],
  );

  const start = useCallback((seconds: number) => set(startRest(Date.now(), seconds)), [set]);
  const extend = useCallback(() => {
    if (endsAt !== null) set(extendRest(endsAt, Date.now()));
  }, [endsAt, set]);
  const stop = useCallback(() => set(null), [set]);

  return {
    remaining: endsAt === null ? null : remainingSeconds(endsAt, now),
    over,
    start,
    extend,
    stop,
  };
}
