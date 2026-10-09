import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { openLocalDb } from '../data/local';
import { createLogStore } from '../data/local';
import type { LoggedSet } from '../domain/schemas';

let counter = 0;

/** A fresh, empty local database on a fake IndexedDB, plus its log store. */
export function freshLocal(
  userId = `user-${(counter += 1)}-${Math.random().toString(36).slice(2)}`,
) {
  const db = openLocalDb(userId, { indexedDB, IDBKeyRange });
  return { db, store: createLogStore(db), userId };
}

/** Reopens the same database, as the app does after a reload. */
export function reopenLocal(userId: string) {
  const db = openLocalDb(userId, { indexedDB, IDBKeyRange });
  return { db, store: createLogStore(db), userId };
}

let idCounter = 0;
/** A valid UUID that is the same shape every time, so tests read easily. */
export const uuid = (n = (idCounter += 1)): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const aWorkout = (
  over: Partial<{ id: string; gymId: string | null; startedAt: string }> = {},
) => ({
  id: uuid(),
  gymId: null,
  startedAt: '2026-10-10T10:00:00.000Z',
  ...over,
});

export const aSet = (workoutId: string, over: Partial<LoggedSet> = {}): LoggedSet => ({
  id: uuid(),
  workoutId,
  exerciseId: '2c49d84c-42d6-5729-8791-bdf87686998a',
  totalKg: 60,
  barKg: 20,
  perSideKg: 20,
  inputMode: 'per_side',
  reps: 8,
  source: 'tap',
  rawTranscript: null,
  loggedAt: '2026-10-10T10:05:00.000Z',
  ...over,
});
