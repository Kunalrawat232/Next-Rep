/**
 * For work that was still running when the device database closed (signing out, leaving the app):
 * there is nothing left to show, so that one error is dropped. Any other error is still thrown.
 */
export function ignoreClosed(error: unknown): void {
  if (error instanceof Error && error.name === 'DatabaseClosedError') return;
  throw error;
}
