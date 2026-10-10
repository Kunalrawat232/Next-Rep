import type { ReactNode } from 'react';
import { Card } from './Card';

/** A titled card, labelled by its heading, for a group of related things on a page. */
export function Section({
  headingId,
  title,
  children,
}: {
  /** Names the heading, so the section is a labelled region. */
  headingId: string;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card as="section" aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-headline font-semibold">
        {title}
      </h2>
      {children}
    </Card>
  );
}
