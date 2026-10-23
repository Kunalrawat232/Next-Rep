import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { buttonClasses } from './Button';

/** A page for something that is not there (a bad address, a cleared workout), with a way back. */
export function NotFound({
  title,
  message,
  to,
  label,
}: {
  title: ReactNode;
  message?: ReactNode;
  /** Where the way back goes, and what it says. */
  to: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="text-title font-semibold">{title}</h1>
      {message && <p className="text-callout text-ink-muted">{message}</p>}
      <Link to={to} className={buttonClasses('secondary')}>
        {label}
      </Link>
    </div>
  );
}
