import type { ComponentProps } from 'react';

type Props = ComponentProps<'button'> & {
  variant?: 'primary' | 'secondary' | 'danger';
};

const base =
  'inline-flex min-h-touch items-center justify-center gap-2 rounded-md px-6 text-body font-semibold disabled:cursor-not-allowed disabled:opacity-60';

const variants = {
  primary: 'bg-accent text-on-accent',
  secondary: 'border border-line bg-surface-200 text-ink',
  danger: 'border border-danger bg-surface-200 text-danger',
};

/** The button look for something that is not a `<button>`, such as a router link. */
export function buttonClasses(variant: keyof typeof variants = 'primary', extra = ''): string {
  return `${base} ${variants[variant]} ${extra}`.trim();
}

export function Button({ variant = 'primary', type = 'button', className, ...rest }: Props) {
  return <button type={type} className={buttonClasses(variant, className)} {...rest} />;
}
