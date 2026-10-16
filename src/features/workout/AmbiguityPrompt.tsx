import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from '../../components';

export type PromptOption = { label: string; hint?: string };

type Props = {
  title: string;
  message: string;
  options: PromptOption[];
  onChoose(index: number): void;
  onCancel(): void;
  /** Extra actions under the options, such as a link to change the bar. */
  extra?: ReactNode;
};

/** A question the validator needs answered before a set is saved. Choosing is required; Cancel saves nothing. */
export function AmbiguityPrompt({ title, message, options, onChoose, onCancel, extra }: Props) {
  const titleId = useId();
  const first = useRef<HTMLButtonElement>(null);

  const cancel = useRef(onCancel);
  useEffect(() => {
    cancel.current = onCancel;
  });

  // Once, when it opens: focus the first choice, and give focus back to what opened it on close.
  useEffect(() => {
    const opener = document.activeElement;
    first.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 lg:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex w-full max-w-md flex-col gap-4 rounded-t-md border border-glass-line glass p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] lg:rounded-md"
      >
        <h2 id={titleId} className="text-headline font-semibold">
          {title}
        </h2>
        <p className="text-body text-ink-muted">{message}</p>
        <ul className="flex flex-col gap-2">
          {options.map((option, index) => (
            <li key={option.label}>
              <button
                ref={index === 0 ? first : undefined}
                type="button"
                onClick={() => onChoose(index)}
                className="flex min-h-touch w-full flex-col items-start rounded-md border border-line bg-surface-300 p-4 text-left"
              >
                <span className="text-body font-semibold">{option.label}</span>
                {option.hint && <span className="text-callout text-ink-muted">{option.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
        {extra}
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
