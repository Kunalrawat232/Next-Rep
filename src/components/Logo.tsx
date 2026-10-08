import { useId } from 'react';
import { LOGO_N_PATH, LOGO_R_PATH, WORDMARK_NEXT_PATH, WORDMARK_REP_PATH } from './logoPaths';

type Props = {
  /** `full` is the mark with the wordmark under it; `mark` is the N and R alone. */
  variant?: 'full' | 'mark';
  /** Rendered width in px. The height follows the aspect ratio. */
  width?: number;
  className?: string;
};

// Coordinates are those of the design handoff's artwork.
const VIEW_BOX = { full: '128 120 1144 765', mark: '251 120 898 550' };

export function Logo({ variant = 'full', width = 150, className }: Props) {
  const gradientId = `logo-${useId().replace(/:/g, '')}`;
  return (
    <svg
      width={width}
      viewBox={VIEW_BOX[variant]}
      role="img"
      aria-label="Next Rep"
      className={`text-ink ${className ?? ''}`}
    >
      <defs>
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1="150"
          y1="122"
          x2="420"
          y2="657"
        >
          <stop offset="0" stopColor="#C4D8FF" />
          <stop offset="1" stopColor="#4F86FF" />
        </linearGradient>
      </defs>
      <g transform="translate(163.5 12)">
        <path fill={`url(#${gradientId})`} d={LOGO_N_PATH} />
        <path fill="currentColor" d={LOGO_R_PATH} />
      </g>
      {variant === 'full' && (
        <g transform="translate(128 885)" fill="currentColor">
          <path d={WORDMARK_NEXT_PATH} />
          <path transform="translate(722.6 0)" d={WORDMARK_REP_PATH} />
        </g>
      )}
    </svg>
  );
}
