import type { ReactNode } from 'react';
import { Button } from './Button';
import { cardClasses } from './Card';

/** "Loading…" while a screen waits for its data. */
export function LoadingMessage({ children = 'Loading…' }: { children?: ReactNode }) {
  return (
    <p role="status" className="text-ink-muted">
      {children}
    </p>
  );
}

const error = cardClasses('', 'danger');

/**
 * Something went wrong, in a red-bordered box that is announced to screen readers. With `onRetry`
 * it also has a "Try again" button inside the box.
 */
export function ErrorMessage({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  if (!onRetry)
    return (
      <p role="alert" className={error}>
        {children}
      </p>
    );
  return (
    <div role="alert" className={`flex flex-col items-start gap-3 ${error}`}>
      <p>{children}</p>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/** A plain (not boxed) message with a "Try again" button, for a screen that could not read its data. */
export function RetryMessage({ children, onRetry }: { children: ReactNode; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3">
      <p>{children}</p>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
