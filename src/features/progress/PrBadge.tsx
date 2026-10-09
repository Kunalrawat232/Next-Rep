import type { RecordKind } from '../../domain/records';

const LABEL: Record<RecordKind, { text: string; name: string }> = {
  weight: { text: 'PR', name: 'Personal record: heaviest weight' },
  reps: { text: 'Rep PR', name: 'Personal record: most reps at this weight' },
};

/** Marks a set that was a personal record when it was logged. */
export function PrBadge({ kind }: { kind: RecordKind }) {
  const { text, name } = LABEL[kind];
  return (
    <span
      role="img"
      aria-label={name}
      className="inline-flex h-6 items-center rounded-full bg-success px-2 text-caption font-semibold text-on-accent"
    >
      {text}
    </span>
  );
}
