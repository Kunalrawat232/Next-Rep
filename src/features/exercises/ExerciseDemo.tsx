import { useState } from 'react';
import { Card } from '../../components';
import type { DemoMedia } from '../../domain/exercises/demoMedia';
import { useOnline } from '../../lib/useOnline';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';

type Props = {
  exerciseName: string;
  /** The addresses to show; null when this exercise has no demonstration or demonstrations are off. */
  media: DemoMedia | null;
};

/** The same square whatever is inside, so nothing on the page moves when the picture arrives or fails. */
const FRAME = 'relative aspect-square w-full overflow-hidden rounded-sm bg-surface-300';

/** The empty square shown while the animation or the exercise's data is on its way. */
export function DemoSkeleton() {
  return (
    <Card aria-hidden="true" className="w-full">
      <div className={`${FRAME} motion-safe:animate-pulse`} />
    </Card>
  );
}

function Placeholder({ message }: { message: string }) {
  return (
    <div className={`${FRAME} flex flex-col items-center justify-center gap-2 p-4 text-center`}>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-10 text-ink-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />
      </svg>
      <p className="text-caption text-ink-muted">{message}</p>
    </div>
  );
}

/** One picture, with its own loading and failure state; a new address starts over (it is keyed by it). */
function Picture({ src, alt }: { src: string; alt: string }) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>('loading');
  if (status === 'failed') return <Placeholder message="Demonstration unavailable" />;
  return (
    <div className={FRAME}>
      {status === 'loading' && (
        <div
          data-testid="demo-skeleton"
          className="absolute inset-0 bg-surface-300 motion-safe:animate-pulse"
        />
      )}
      <img
        src={src}
        alt={alt}
        width={180}
        height={180}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('failed')}
        className={`size-full object-contain ${status === 'loaded' ? '' : 'opacity-0'}`}
      />
    </div>
  );
}

/**
 * A demonstration of how to do the exercise. Never an error: with no picture, no connection, or a broken
 * address it shows a quiet placeholder in the same space. With "reduce motion" on it shows the still
 * thumbnail instead of the animation.
 */
export function ExerciseDemo({ exerciseName, media }: Props) {
  const online = useOnline();
  const stillOnly = usePrefersReducedMotion();
  const alt = `Demonstration of ${exerciseName}`;

  let body;
  if (!media) body = <Placeholder message="No demonstration for this exercise" />;
  else if (!online) body = <Placeholder message="Demonstrations need an internet connection" />;
  else {
    const src = stillOnly ? media.thumbUrl : media.gifUrl;
    body = <Picture key={src} src={src} alt={alt} />;
  }

  return (
    <Card as="section" aria-label="Demonstration" className="w-full">
      {body}
    </Card>
  );
}
