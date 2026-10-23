import type { ReactNode } from 'react';
import { Card } from './Card';

/** What to show when there is nothing yet: a title, a line of explanation, and what to do about it. */
export function EmptyState({
  title,
  message,
  children,
}: {
  title: ReactNode;
  message: ReactNode;
  /** The ways forward: links and buttons. */
  children?: ReactNode;
}) {
  return (
    <Card as="section" className="flex flex-col items-start gap-4">
      <h2 className="text-headline font-semibold">{title}</h2>
      <p className="text-callout text-ink-muted">{message}</p>
      {children}
    </Card>
  );
}
