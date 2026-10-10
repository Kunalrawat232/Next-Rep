import type { ComponentProps } from 'react';

type Tone = 'normal' | 'danger' | 'warning' | 'success' | 'accent';

const base: Record<Tone, string> = {
  normal: 'rounded-md border border-line bg-surface-200 p-4',
  danger: 'rounded-md border border-danger bg-surface-200 p-4',
  warning: 'rounded-md border border-warning bg-surface-200 p-4',
  success: 'rounded-md border border-success bg-surface-200 p-4',
  accent: 'rounded-md border border-accent bg-surface-200 p-4',
};

/** The look of a card, for things that are not a plain box (a link, a list item). Add only layout classes. */
export const cardClasses = (extra = '', tone: Tone = 'normal'): string =>
  `${base[tone]} ${extra}`.trim();

type Props = ComponentProps<'div'> & {
  as?: 'div' | 'section';
  /** The border colour says what kind of box it is: `danger` for an error or a question about something that cannot be undone, `warning`, `success` and `accent` for notes. */
  tone?: Tone;
};

/**
 * A bordered box. Callers add layout (`flex flex-col gap-3`); the border, background, radius and
 * padding are fixed here, because two conflicting Tailwind classes are decided by the stylesheet,
 * not by their order, so they cannot be overridden.
 */
export function Card({ as: Tag = 'div', tone = 'normal', className, ...rest }: Props) {
  return <Tag className={cardClasses(className, tone)} {...rest} />;
}
