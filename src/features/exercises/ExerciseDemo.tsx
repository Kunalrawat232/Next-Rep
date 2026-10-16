import { useState } from 'react';
import { Card } from '../../components';
import type { DemoMedia } from '../../domain/exercises/demoMedia';
import { useOnline } from '../../lib/useOnline';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';

type Props = {
  exerciseName: string;
  /** What to show; null when this exercise has no demonstration or demonstrations are off. */
  media: DemoMedia | null;
};

/** The same landscape box whatever is inside, so nothing on the page moves when the picture arrives or fails. */
const FRAME =
  'relative mx-auto aspect-[3/2] w-full max-w-sm overflow-hidden rounded-sm bg-surface-300';

/** The empty box shown while the animation or the exercise's data is on its way. */
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

type Status = 'loading' | 'loaded' | 'failed';

function Skeleton() {
  return (
    <div
      data-testid="demo-skeleton"
      className="absolute inset-0 bg-surface-300 motion-safe:animate-pulse"
    />
  );
}

/** The animation, at its own 180 px: stretching it only blurs it. Starts over for a new address (it is keyed). */
function GifPicture({ src, alt }: { src: string; alt: string }) {
  const [status, setStatus] = useState<Status>('loading');
  if (status === 'failed') return <Placeholder message="Demonstration unavailable" />;
  return (
    <div className={FRAME}>
      {status === 'loading' && <Skeleton />}
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
        className={`absolute inset-0 m-auto size-[180px] max-h-full max-w-full object-contain ${status === 'loaded' ? '' : 'opacity-0'}`}
      />
    </div>
  );
}

/**
 * Two photos, the start pose and the end pose. The end pose fades in over the start pose and back, which
 * reads as the movement (up and down) without being video. With "reduce motion" only the start pose shows.
 * If the end photo fails the start photo stays; if the start photo fails the placeholder shows.
 */
function PhotoPair({
  startUrl,
  endUrl,
  alt,
  still,
}: {
  startUrl: string;
  endUrl: string;
  alt: string;
  still: boolean;
}) {
  const [status, setStatus] = useState<Status>('loading');
  const [endFailed, setEndFailed] = useState(false);
  if (status === 'failed') return <Placeholder message="Demonstration unavailable" />;
  const common = {
    width: 750,
    height: 500,
    decoding: 'async' as const,
    referrerPolicy: 'no-referrer' as const,
    className: 'absolute inset-0 size-full object-contain',
  };
  return (
    <div className={FRAME}>
      {status === 'loading' && <Skeleton />}
      <img
        {...common}
        src={startUrl}
        alt={alt}
        loading="lazy"
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('failed')}
        className={`${common.className} ${status === 'loaded' ? '' : 'opacity-0'}`}
      />
      {!still && !endFailed && status === 'loaded' && (
        <img
          {...common}
          src={endUrl}
          alt=""
          aria-hidden="true"
          data-testid="demo-end-pose"
          onError={() => setEndFailed(true)}
          className={`${common.className} demo-fade`}
        />
      )}
    </div>
  );
}

/**
 * A demonstration of how to do the exercise. Never an error: with no picture, no connection, or a broken
 * address it shows a quiet placeholder in the same space. With "reduce motion" on it shows a still picture.
 */
export function ExerciseDemo({ exerciseName, media }: Props) {
  const online = useOnline();
  const stillOnly = usePrefersReducedMotion();
  const alt = `Demonstration of ${exerciseName}`;

  let body;
  if (!media) body = <Placeholder message="No demonstration for this exercise" />;
  else if (!online) body = <Placeholder message="Demonstrations need an internet connection" />;
  else if (media.kind === 'photos')
    body = (
      <PhotoPair
        key={media.startUrl}
        startUrl={media.startUrl}
        endUrl={media.endUrl}
        alt={alt}
        still={stillOnly}
      />
    );
  else {
    const src = stillOnly ? media.thumbUrl : media.gifUrl;
    body = <GifPicture key={src} src={src} alt={alt} />;
  }

  return (
    <Card as="section" aria-label="Demonstration" className="w-full">
      {body}
    </Card>
  );
}
