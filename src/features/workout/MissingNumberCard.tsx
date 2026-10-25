import { useState, type SyntheticEvent } from 'react';
import { Button, Card, TextField } from '../../components';
import { REPS_RANGE, type Unit } from '../../domain/schemas';
import { parseNumber, unitLabel, withUnit } from '../../domain/units';
import type { PartialDraft, SpokenWeight } from '../voice';

type Props = {
  transcript: string;
  draft: PartialDraft;
  unit: Unit;
  /** The total of the last set of this exercise, to offer "same as last time" when the weight is asked for. */
  lastTotalKg: number | undefined;
  onReps(reps: number): void;
  onWeight(weight: SpokenWeight): void;
  onCancel(): void;
};

/** The usual rep counts, one tap each. */
const QUICK_REPS = [5, 6, 8, 10, 12];

const spokenWeight = (weight: SpokenWeight) =>
  `${weight.value} ${unitLabel(weight.unit)}${weight.mode === 'per_side' ? ' per side' : ''}`;

/**
 * One number was not said: ask for it instead of making the person say the whole set again. What is answered is
 * only used to build the same confirm card as a spoken set; nothing is stored here.
 */
export function MissingNumberCard({
  transcript,
  draft,
  unit,
  lastTotalKg,
  onReps,
  onWeight,
  onCancel,
}: Props) {
  const [text, setText] = useState('');
  const asksReps = draft.missing === 'reps';
  const typed = text.trim();
  const reps = /^\d+$/.test(typed) ? Number(typed) : null;
  const weight = parseNumber(typed);
  const valid = asksReps
    ? reps !== null && reps >= REPS_RANGE.min && reps <= REPS_RANGE.max
    : weight !== null && weight >= 0;
  const error =
    typed === '' || valid
      ? undefined
      : asksReps
        ? `Reps must be a whole number from ${REPS_RANGE.min} to ${REPS_RANGE.max}.`
        : 'Enter a number, for example 62.5.';

  function use(event: SyntheticEvent) {
    event.preventDefault();
    if (!valid) return;
    if (draft.missing === 'reps' && reps !== null) onReps(reps);
    else if (draft.missing === 'weight' && weight !== null)
      onWeight({ value: weight, unit, mode: 'unspecified' });
  }

  return (
    <Card role="group" aria-label="Missing number" className="flex flex-col gap-4">
      <p className="text-caption text-ink-muted">Heard: “{transcript}”</p>
      <p className="text-headline font-semibold">
        {draft.exercise.name} ·{' '}
        {draft.missing === 'reps'
          ? spokenWeight(draft.weight)
          : `${draft.reps} ${draft.reps === 1 ? 'rep' : 'reps'}`}
      </p>
      <p className="text-body">{asksReps ? 'How many reps?' : 'How much weight?'}</p>
      <div className="flex flex-wrap gap-2">
        {asksReps
          ? QUICK_REPS.map((count) => (
              <Button
                key={count}
                variant="secondary"
                className="px-4"
                onClick={() => onReps(count)}
              >
                {count}
              </Button>
            ))
          : lastTotalKg !== undefined && (
              <Button
                variant="secondary"
                onClick={() => onWeight({ value: lastTotalKg, unit: 'kg', mode: 'total' })}
              >
                Same as last time ({withUnit(lastTotalKg, unit)})
              </Button>
            )}
      </div>
      <form className="flex flex-col gap-3" onSubmit={use}>
        <TextField
          label={asksReps ? 'Reps' : `Weight (${unitLabel(unit)})`}
          value={text}
          inputMode={asksReps ? 'numeric' : 'decimal'}
          autoComplete="off"
          error={error}
          onChange={(event) => setText(event.target.value)}
        />
        <div className="flex gap-2">
          <Button type="submit" disabled={!valid}>
            Use
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
