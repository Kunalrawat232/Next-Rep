import type { Result } from '../../lib/result';

const UNIQUE_VIOLATION = '23505';

// What browsers say when a request never got an answer: Chrome and Edge "Failed to fetch", Firefox
// "NetworkError…", Safari "Load failed".
const NETWORK_MESSAGE = /fetch|network|load failed|internet connection/i;

/**
 * Turns a Supabase error into a reason the screens and the sync worker can act on. Server text is
 * never passed on. A server error always has a code, a request that got no answer has none, so the
 * code decides: a browser that says it is offline cannot turn a real server refusal into "offline".
 */
export function failure(error: { message: string; code?: string }): Result<never> {
  if (!error.code) {
    const reason =
      NETWORK_MESSAGE.test(error.message) || browserSaysOffline() ? 'offline' : 'unknown';
    return { status: 'error', reason };
  }
  if (error.code === UNIQUE_VIOLATION) return { status: 'error', reason: 'conflict' };
  // Constraint (23xxx) and bad-data (22xxx) errors are about the row sent, not about the server.
  if (/^2[23]/.test(error.code)) return { status: 'error', reason: 'rejected' };
  return { status: 'error', reason: 'unknown' };
}

// Not typed through `navigator`: this file is also compiled for the Node-side integration tests.
function browserSaysOffline(): boolean {
  const nav = (globalThis as { navigator?: { onLine?: boolean } }).navigator;
  return nav?.onLine === false;
}
