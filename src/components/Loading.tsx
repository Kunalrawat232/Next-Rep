import type { ReactNode } from 'react';
import { Logo } from './Logo';

/** A ring that turns. Still (not turning) when the person asked for less motion. */
export function Spinner({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      className={`motion-safe:animate-spin ${className}`}
      style={{ animationDuration: '0.85s' }}
    >
      <circle cx="20" cy="20" r="16" strokeWidth="4" className="stroke-line" opacity="0.7" />
      <path
        d="M20 4a16 16 0 0 1 16 16"
        strokeWidth="4"
        strokeLinecap="round"
        className="stroke-accent"
      />
    </svg>
  );
}

/** A grey block with a light sweep, standing in for text or a picture that has not arrived. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton rounded-sm ${className}`} />;
}

function SkeletonCard({ lines }: { lines: string[] }) {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col gap-3 rounded-md border border-glass-line glass-flat p-4"
    >
      {lines.map((width, i) => (
        <Skeleton key={i} className={`${i === 0 ? 'h-5' : 'h-4'} ${width}`} />
      ))}
    </div>
  );
}

type Props = {
  /** What a screen reader hears. It is not drawn: the picture is the loader. */
  children?: ReactNode;
  /** `page` is the shape of a screen (a title and some cards); `inline` is a small row for inside a card. */
  variant?: 'page' | 'inline';
};

/**
 * A screen or a part of one waiting for its data. It is a skeleton of what is coming, not a word, and it
 * fades in after a moment, so data that arrives at once shows no loader at all. Announced as a status.
 */
export function LoadingMessage({ children = 'Loading…', variant = 'page' }: Props) {
  if (variant === 'inline')
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className="loader-in flex items-center gap-3"
      >
        <Spinner size={24} />
        <div aria-hidden="true" className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <span className="sr-only">{children}</span>
      </div>
    );
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="loader-in flex flex-col gap-6"
    >
      <div aria-hidden="true" className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <Skeleton className="h-7 w-44" />
      </div>
      <SkeletonCard lines={['w-1/3', 'w-2/3', 'w-1/2']} />
      <SkeletonCard lines={['w-2/5', 'w-3/4']} />
      <SkeletonCard lines={['w-1/2', 'w-1/3', 'w-2/3']} />
      <span className="sr-only">{children}</span>
    </div>
  );
}

/** The whole screen while the app starts and finds out who is signed in: the mark, with a ring around it. */
export function FullPageLoader({ children = 'Loading…' }: { children?: ReactNode }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="loader-in flex min-h-dvh flex-col items-center justify-center gap-8"
    >
      <div aria-hidden="true" className="relative flex size-36 items-center justify-center">
        <Spinner size={144} className="absolute inset-0" />
        <Logo variant="mark" width={64} className="motion-safe:animate-pulse" />
      </div>
      <span className="sr-only">{children}</span>
    </div>
  );
}
