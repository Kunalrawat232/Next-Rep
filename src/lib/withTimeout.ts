/** How long a screen waits for the server before it goes on without that answer. */
export const SERVER_WAIT_MS = 8000;

/**
 * The promise's value, or `null` if it has not settled within `ms` (what it says later is ignored). A
 * rejection passes through. Used so a screen that waits for the server never waits for ever on a weak signal.
 */
export function within<T>(promise: Promise<T>, ms: number = SERVER_WAIT_MS): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
