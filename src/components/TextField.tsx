import { useId, type ComponentProps } from 'react';

type Props = Omit<ComponentProps<'input'>, 'id'> & {
  label: string;
  hint?: string;
  /** When set, the field is marked invalid and the message replaces the hint. */
  error?: string;
};

export function TextField({ label, hint, error, className, ...input }: Props) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? hint;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-callout font-medium">
        {label}
      </label>
      <input
        {...input}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        className={`min-h-touch w-full rounded-sm border bg-surface-300 px-4 text-body text-ink disabled:opacity-60 ${
          error ? 'border-danger' : 'border-line'
        } ${className ?? ''}`}
      />
      {note && (
        <p id={noteId} className={`text-caption ${error ? 'text-danger' : 'text-ink-muted'}`}>
          {note}
        </p>
      )}
    </div>
  );
}
