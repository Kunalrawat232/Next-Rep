import type { StoredSet } from '../../data/local';
import type { RecordKind } from '../../domain/records';
import { setSummary } from '../../domain/workout';
import { PrBadge } from '../progress';
import { useUnit } from '../settings/UnitProvider';
import { cardClasses } from '../../components';

/** The sets of one exercise, numbered, with the bar breakdown when there is one. */
export function SetList({
  title,
  sets,
  empty,
  marks,
}: {
  title: string;
  sets: StoredSet[];
  empty?: string;
  /** Sets that were personal records when logged. */
  marks?: ReadonlyMap<string, RecordKind>;
}) {
  const { unit } = useUnit();
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="text-headline font-semibold">{title}</h2>
      {sets.length === 0 ? (
        <p className="text-callout text-ink-muted">{empty}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {sets.map((set, index) => {
            const { headline, detail } = setSummary(set, unit);
            return (
              <li key={set.id} className={cardClasses('flex items-center gap-4')}>
                <span className="w-6 text-callout text-ink-muted">{index + 1}</span>
                <span className="flex flex-1 flex-col">
                  <span className="text-headline font-semibold tabular-nums">{headline}</span>
                  {detail && <span className="text-callout text-ink-muted">{detail}</span>}
                </span>
                {marks?.get(set.id) && <PrBadge kind={marks.get(set.id)!} />}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
