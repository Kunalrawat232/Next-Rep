import type { ComponentProps } from 'react';

type Props = ComponentProps<'button'> & {
  variant?: 'primary' | 'secondary';
};

const base =
  'inline-flex min-h-touch items-center justify-center gap-2 rounded-md px-6 text-body font-semibold disabled:cursor-not-allowed disabled:opacity-60';

const variants = {
  primary: 'bg-accent text-on-accent',
  secondary: 'border border-line bg-surface-200 text-ink',
};

export function Button({ variant = 'primary', type = 'button', className, ...rest }: Props) {
  return (
    <button type={type} className={`${base} ${variants[variant]} ${className ?? ''}`} {...rest} />
  );
}
