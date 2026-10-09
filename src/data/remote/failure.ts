import type { Result } from '../../lib/result';

const UNIQUE_VIOLATION = '23505';

// Not typed through `navigator`: this file is also compiled for the Node-side integration tests.
function browserSaysOffline(): boolean {
  const nav = (globalThis as { navigator?: { onLine?: boolean } }).navigator;
  return nav?.onLine === false;
}

/** Turns a Supabase error into a reason the screens can explain. Server text is never passed on. */
export function failure(error: { message: string; code?: string }): Result<never> {
  // A server error has a code; a failed request has only a message.
  const offline = browserSaysOffline() || (!error.code && /fetch|network/i.test(error.message));
  if (offline) return { status: 'error', reason: 'offline' };
  return { status: 'error', reason: error.code === UNIQUE_VIOLATION ? 'conflict' : 'unknown' };
}
