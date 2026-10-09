import type { ComponentProps } from 'react';

type Props = Omit<ComponentProps<'button'>, 'aria-pressed'> & { selected: boolean };

/** A toggle button for choosing one option among a few, such as a bar weight preset. */
export function Chip({ selected, className, ...rest }: Props) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`min-h-touch rounded-full border px-4 text-callout font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
        selected
          ? 'border-accent bg-surface-300 text-accent'
          : 'border-line bg-surface-200 text-ink'
      } ${className ?? ''}`}
      {...rest}
    />
  );
}
