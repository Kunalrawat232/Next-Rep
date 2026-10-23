import { useState } from 'react';
import { Link } from 'react-router';
import { Button, cardClasses, Chip, EmptyState } from '../../components';
import {
  EQUIPMENT_FILTERS,
  EQUIPMENT_LABEL,
  highlightRange,
  searchExercises,
  subtitleFor,
  type EquipmentFilter,
  type Exercise,
} from '../../domain/exercises';
import { dayLabel } from '../../domain/history';
import type { Failure } from '../../lib/result';
import type { HistoryEntry } from './useExerciseHistory';

const PAGE = 40;
/** How many exercises of the history show before "Show all". */
const HISTORY_SHOWN = 6;

type Props = {
  exercises: Exercise[];
  /** Why the user's own exercises are missing, if they are. */
  customProblem: Failure | null;
  onRetryCustom: () => void;
  /** Without it the rows are plain; the workout screen passes it to pick an exercise. */
  onSelect?: (exercise: Exercise) => void;
  /** Where a plain row leads (the exercise's page). Ignored when `onSelect` is given. */
  detailHref?: (exercise: Exercise) => string;
  /** The exercises done before, most recent first. Shown above the others while not searching. */
  history?: HistoryEntry[];
};

function Row({
  exercise,
  query,
  note,
  onSelect,
  detailHref,
}: {
  exercise: Exercise;
  query: string;
  /** A line under the equipment, such as when it was last done. */
  note?: string;
  onSelect?: Props['onSelect'];
  detailHref?: Props['detailHref'];
}) {
  const range = highlightRange(exercise.name, query);
  const body = (
    <>
      <span className="text-body font-semibold">
        {range ? (
          <>
            {exercise.name.slice(0, range[0])}
            <strong className="text-accent">{exercise.name.slice(range[0], range[1])}</strong>
            {exercise.name.slice(range[1])}
          </>
        ) : (
          exercise.name
        )}
      </span>
      <span className="block text-callout text-ink-muted">{subtitleFor(exercise)}</span>
      {note && <span className="block text-callout text-ink-muted">{note}</span>}
    </>
  );
  const box = cardClasses('flex min-h-touch w-full flex-col justify-center text-left');
  return (
    <li>
      {onSelect ? (
        <button type="button" className={box} onClick={() => onSelect(exercise)}>
          {body}
        </button>
      ) : detailHref ? (
        <Link to={detailHref(exercise)} className={box}>
          {body}
        </Link>
      ) : (
        <div className={box}>{body}</div>
      )}
    </li>
  );
}

function List({
  items,
  query,
  notes,
  onSelect,
  detailHref,
}: {
  items: Exercise[];
  query: string;
  notes?: Record<string, string>;
  onSelect?: Props['onSelect'];
  detailHref?: Props['detailHref'];
}) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((exercise) => (
        <Row
          key={exercise.id}
          exercise={exercise}
          query={query}
          note={notes?.[exercise.id]}
          onSelect={onSelect}
          detailHref={detailHref}
        />
      ))}
    </ul>
  );
}

export function ExercisePicker({
  exercises,
  customProblem,
  onRetryCustom,
  onSelect,
  detailHref,
  history = [],
}: Props) {
  const [query, setQuery] = useState('');
  const [allHistory, setAllHistory] = useState(false);
  const [equipment, setEquipment] = useState<EquipmentFilter>('all');
  const [shown, setShown] = useState(PAGE);

  const browsing = query.trim() === '' && equipment === 'all';
  const { results, total } = browsing
    ? { results: [], total: 0 }
    : searchExercises(exercises, query, { equipment });
  const custom = exercises.filter((e) => e.tier === 'custom');
  const popular = exercises.filter((e) => e.tier === 'curated');
  const moreToFind = exercises.filter((e) => e.tier === 'imported').length;
  const now = new Date();
  const doneNotes = Object.fromEntries(
    history.map(({ exercise, last }) => [exercise.id, `Last done ${dayLabel(last, now)}`]),
  );
  const doneShown = allHistory ? history : history.slice(0, HISTORY_SHOWN);

  function change(next: { query?: string; equipment?: EquipmentFilter }) {
    if (next.query !== undefined) setQuery(next.query);
    if (next.equipment !== undefined) setEquipment(next.equipment);
    setShown(PAGE);
  }

  const addHref = `/exercises/new${query.trim() ? `?${new URLSearchParams({ name: query.trim() })}` : ''}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <label htmlFor="exercise-search" className="mb-2 block text-callout font-medium">
          Search exercises
        </label>
        <input
          id="exercise-search"
          type="search"
          value={query}
          placeholder="Search by name or muscle"
          autoComplete="off"
          onChange={(e) => change({ query: e.target.value })}
          className="min-h-touch w-full rounded-sm border border-line bg-surface-300 px-4 pr-14 text-body text-ink"
        />
        {query !== '' && (
          <button
            type="button"
            aria-label="Clear search"
            className="absolute right-1 bottom-0 flex size-touch items-center justify-center text-ink-muted"
            onClick={() => {
              change({ query: '' });
              document.getElementById('exercise-search')?.focus();
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </div>

      <div role="group" aria-label="Equipment" className="flex flex-wrap gap-2">
        {EQUIPMENT_FILTERS.map((filter) => (
          <Chip
            key={filter}
            selected={equipment === filter}
            onClick={() => change({ equipment: filter })}
          >
            {filter === 'all' ? 'All' : EQUIPMENT_LABEL[filter]}
          </Chip>
        ))}
      </div>

      {customProblem && (
        <div
          role="status"
          aria-label="Your exercises"
          className={cardClasses('flex flex-wrap items-center gap-3')}
        >
          <p className="flex-1 text-callout">
            {customProblem === 'offline'
              ? "You're offline, so your own exercises are not shown."
              : 'Could not load your own exercises.'}
          </p>
          <Button variant="secondary" onClick={onRetryCustom}>
            Try again
          </Button>
        </div>
      )}

      {/* Always mounted, so screen readers announce a change in the count. */}
      <p role="status" aria-live="polite" className="text-callout text-ink-muted empty:hidden">
        {browsing
          ? ''
          : total === 0
            ? 'No matches'
            : `${total} ${total === 1 ? 'match' : 'matches'}`}
      </p>

      {browsing ? (
        <>
          {history.length > 0 && (
            <section aria-labelledby="history-heading" className="flex flex-col gap-2">
              <h2 id="history-heading" className="text-headline font-semibold">
                History
              </h2>
              <List
                items={doneShown.map((entry) => entry.exercise)}
                query=""
                notes={doneNotes}
                onSelect={onSelect}
                detailHref={detailHref}
              />
              {history.length > HISTORY_SHOWN && (
                <Button variant="secondary" onClick={() => setAllHistory(!allHistory)}>
                  {allHistory ? 'Show fewer' : `Show all ${history.length}`}
                </Button>
              )}
            </section>
          )}
          {custom.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-headline font-semibold">Your exercises</h2>
              <List items={custom} query="" onSelect={onSelect} detailHref={detailHref} />
            </section>
          )}
          <section className="flex flex-col gap-2">
            <h2 className="text-headline font-semibold">Popular exercises</h2>
            <List items={popular} query="" onSelect={onSelect} detailHref={detailHref} />
            <p className="text-callout text-ink-muted">Search to find {moreToFind} more.</p>
          </section>
        </>
      ) : total === 0 ? (
        <EmptyState
          title={
            <>
              {query.trim()
                ? `No exercises match “${query.trim()}”`
                : 'No exercises with that equipment'}
            </>
          }
          message="Check the spelling, or add it as your own exercise."
        >
          <Link to={addHref} className="min-h-touch content-center font-semibold text-accent">
            {query.trim() ? `Add “${query.trim()}”` : 'Add a custom exercise'}
          </Link>
          <Button
            variant="secondary"
            onClick={() => {
              change({ query: '', equipment: 'all' });
              document.getElementById('exercise-search')?.focus();
            }}
          >
            Show all exercises
          </Button>
        </EmptyState>
      ) : (
        <section className="flex flex-col gap-2">
          <List
            items={results.slice(0, shown)}
            query={query}
            onSelect={onSelect}
            detailHref={detailHref}
          />
          {total > shown && (
            <Button variant="secondary" onClick={() => setShown(shown + PAGE)}>
              Show more
            </Button>
          )}
        </section>
      )}

      {browsing && (
        <Link
          to="/exercises/new"
          className={'min-h-touch content-center font-semibold text-accent'}
        >
          Add custom exercise
        </Link>
      )}
    </div>
  );
}
