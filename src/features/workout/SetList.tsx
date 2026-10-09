import type { StoredSet } from '../../data/local';
import { setSummary } from '../../domain/workout';

/** The sets of one exercise, numbered, with the bar breakdown when there is one. */
export function SetList({
  title,
  sets,
  empty,
}: {
  title: string;
  sets: StoredSet[];
  empty?: string;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="text-headline font-semibold">{title}</h2>
      {sets.length === 0 ? (
        <p className="text-callout text-ink-muted">{empty}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {sets.map((set, index) => {
            const { headline, detail } = setSummary(set);
            return (
              <li
                key={set.id}
                className="flex items-center gap-4 rounded-md border border-line bg-surface-200 p-4"
              >
                <span className="w-6 text-callout text-ink-muted">{index + 1}</span>
                <span className="flex flex-col">
                  <span className="text-headline font-semibold tabular-nums">{headline}</span>
                  {detail && <span className="text-callout text-ink-muted">{detail}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
