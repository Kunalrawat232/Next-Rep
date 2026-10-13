import { useState } from 'react';
import { Button, Card, Chip, ErrorMessage } from '../../components';
import type { Exercise } from '../../domain/exercises';
import type { Unit } from '../../domain/schemas';
import { withUnit } from '../../domain/units';
import {
  validateSet,
  type Option,
  type ResolvedWeight,
  type SetCandidate,
} from '../../domain/validation';
import { breakdownFor } from '../../domain/workout';
import { usesBar } from '../../domain/schemas';
import { AmbiguityPrompt } from './AmbiguityPrompt';
import { BreakdownCard } from './BreakdownCard';

type Props = {
  transcript: string;
  /** Gemini read this phrase, not the local parser: say so, and ask for a closer look. */
  readByAi: boolean;
  exercise: Exercise;
  reps: number;
  candidate: SetCandidate;
  lastTotalKg: number | undefined;
  unit: Unit;
  gymName: string;
  saving: boolean;
  problem: string | null;
  onLog(resolved: ResolvedWeight): void;
  onCancel(): void;
};

function promptTitle(code: string | undefined): string {
  if (code === 'TOTAL_BELOW_BAR') return 'Total or without the bar?';
  if (code === 'LARGE_JUMP') return 'Is this right?';
  return 'Check this weight';
}

/** What was heard, as a set the user must confirm. Nothing is stored until Log set is tapped. */
export function VoiceConfirmCard({
  transcript,
  readByAi,
  exercise,
  reps,
  candidate,
  lastTotalKg,
  unit,
  gymName,
  saving,
  problem,
  onLog,
  onCancel,
}: Props) {
  const hasBar = usesBar(exercise.equipmentType);
  // No "per side" or "total" word was said: read it as a total, and let the user flip it before logging.
  const [chosen, setChosen] = useState<'total' | 'per_side' | null>(null);
  const [asking, setAsking] = useState(false);
  const spoken = candidate.weight.mode;
  const shown = chosen ?? (spoken === 'per_side' ? 'per_side' : 'total');
  const result = validateSet(
    { ...candidate, weight: { ...candidate.weight, mode: chosen ?? spoken } },
    { lastTotalKg, displayUnit: unit },
  );
  const resolved = result.status === 'ok' || result.status === 'warn' ? result.resolved : null;

  function log() {
    if (result.status === 'ask') setAsking(true);
    else if (resolved) onLog(resolved);
  }

  return (
    <Card role="group" aria-label="Confirm voice set" className="flex flex-col gap-4">
      <p className="text-caption text-ink-muted">Heard: “{transcript}”</p>
      {readByAi && (
        <p role="note" className="text-callout text-warning">
          Read by AI. Check the exercise and numbers before you log.
        </p>
      )}
      <p className="text-headline font-semibold">
        {exercise.name} · {reps} {reps === 1 ? 'rep' : 'reps'}
      </p>
      {hasBar && (
        <div role="group" aria-label="Weight entry" className="flex gap-2">
          <Chip selected={shown === 'total'} onClick={() => setChosen('total')}>
            Total weight
          </Chip>
          <Chip selected={shown === 'per_side'} onClick={() => setChosen('per_side')}>
            Per side
          </Chip>
        </div>
      )}
      {hasBar ? (
        <BreakdownCard
          gymName={gymName}
          breakdown={resolved ? breakdownFor(resolved, unit) : undefined}
          message={
            result.status === 'ask'
              ? 'Choose how to read this weight when you log the set.'
              : (result.issues[0]?.message ?? '')
          }
        />
      ) : (
        <p className="text-body">
          {resolved ? withUnit(resolved.totalKg, unit) : (result.issues[0]?.message ?? '')}
        </p>
      )}
      {result.status !== 'ask' && result.issues.length > 0 && (
        <ul
          role={result.status === 'reject' ? 'alert' : 'status'}
          className={`flex flex-col gap-1 rounded-md border p-4 text-callout ${result.status === 'reject' ? 'border-danger' : 'border-warning'}`}
        >
          {result.issues.map((issue) => (
            <li key={issue.code}>{issue.message}</li>
          ))}
        </ul>
      )}
      {problem && <ErrorMessage>{problem}</ErrorMessage>}
      <div className="flex gap-2">
        <Button disabled={result.status === 'reject' || saving} onClick={log}>
          {saving ? 'Saving…' : 'Log set'}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {asking && result.status === 'ask' && (
        <AmbiguityPrompt
          title={promptTitle(result.issues[0]?.code)}
          message={result.issues[0]?.message ?? 'Choose how to read this weight.'}
          options={result.options.map((option: Option) => ({
            label: option.label,
            hint: `${withUnit(option.resolved.totalKg, unit)} in total`,
          }))}
          onChoose={(index) => {
            setAsking(false);
            const option = result.options[index];
            if (option) onLog(option.resolved);
          }}
          onCancel={() => setAsking(false)}
        />
      )}
    </Card>
  );
}
