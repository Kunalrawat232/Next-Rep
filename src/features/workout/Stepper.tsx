import { useId } from 'react';

type Props = {
  /** Names the field and its buttons: "Decrease <label>". */
  label: string;
  value: string;
  onChange(value: string): void;
  onStep(direction: 1 | -1): void;
  unit?: string;
  error?: string;
  inputMode?: 'decimal' | 'numeric';
};

const button =
  'flex size-14 shrink-0 items-center justify-center rounded-full border border-glass-line glass-flat text-ink disabled:opacity-60';

function Icon({ plus }: { plus: boolean }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d={plus ? 'M12 5v14M5 12h14' : 'M5 12h14'} />
    </svg>
  );
}

/** A number with big minus and plus buttons, and a field to type it. */
export function Stepper({
  label,
  value,
  onChange,
  onStep,
  unit,
  error,
  inputMode = 'decimal',
}: Props) {
  const id = useId();
  const noteId = `${id}-error`;
  // An acronym such as RPE keeps its capitals; only an ordinary first letter is lowered.
  const lower = /^[A-Z]{2}/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1);
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-callout font-medium text-ink-muted">
        {label}
      </label>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className={button}
          aria-label={`Decrease ${lower}`}
          onClick={() => onStep(-1)}
        >
          <Icon plus={false} />
        </button>
        <div className="flex min-w-0 flex-1 items-baseline justify-center gap-2">
          <input
            id={id}
            value={value}
            inputMode={inputMode}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? noteId : undefined}
            onChange={(e) => onChange(e.target.value)}
            className="w-28 min-w-0 rounded-sm bg-transparent text-center text-metric font-semibold tabular-nums text-ink"
          />
          {unit && <span className="text-headline text-ink-muted">{unit}</span>}
        </div>
        <button
          type="button"
          className={button}
          aria-label={`Increase ${lower}`}
          onClick={() => onStep(1)}
        >
          <Icon plus />
        </button>
      </div>
      {error && (
        <p id={noteId} className="text-center text-caption text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
