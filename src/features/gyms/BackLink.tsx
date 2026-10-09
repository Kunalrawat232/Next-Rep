import { Link } from 'react-router';

export function BackLink({ to }: { to: string }) {
  return (
    <Link
      to={to}
      aria-label="Back"
      className="-ml-3 flex size-touch items-center justify-center text-ink"
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M15 6l-6 6 6 6" />
      </svg>
    </Link>
  );
}
