import type { Breakdown } from '../../domain/workout';
import { cardClasses } from '../../components';

type Props = {
  gymName: string;
  /** The weight made up of bar and plates, when it can be shown. */
  breakdown?: Breakdown;
  /** Shown instead when there is nothing to break down yet (a question is open, or the input is not valid). */
  message?: string;
};

/** How the weight is made up, as the validator resolved it. */
export function BreakdownCard({ gymName, breakdown, message }: Props) {
  return (
    <section aria-label="Weight breakdown" className={cardClasses('flex flex-col gap-3')}>
      <h2 className="text-caption font-medium text-ink-muted">Weight breakdown · {gymName}</h2>
      {breakdown ? (
        <dl className="flex flex-col gap-2">
          {breakdown.lines.map((line) => (
            <div key={line.label} className="flex justify-between gap-4 text-body">
              <dt className="text-ink-muted">{line.label}</dt>
              <dd className="font-semibold tabular-nums">{line.value}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 border-t border-line pt-2 text-headline font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{breakdown.total}</dd>
          </div>
        </dl>
      ) : (
        <p className="text-body text-ink-muted">{message}</p>
      )}
    </section>
  );
}
