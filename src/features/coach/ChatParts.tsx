import type { ReactNode } from 'react';
import { COACH_NAME } from '../../domain/coach';

/** The coach's round picture: a person in glass. Decoration only. */
export function CoachAvatar({ size = 32 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center self-end rounded-full border border-glass-line glass-flat text-accent"
    >
      <svg
        width={Math.round(size * 0.62)}
        height={Math.round(size * 0.62)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      >
        <circle cx="12" cy="8" r="3.6" />
        <path d="M4.5 20.5c0-3.8 3.4-6.2 7.5-6.2s7.5 2.4 7.5 6.2" />
      </svg>
    </span>
  );
}

/** A message from the coach: its picture, and a bubble with the corner nearest the picture squared off. */
export function CoachBubble({ children }: { children: ReactNode }) {
  return (
    <>
      <CoachAvatar />
      <div className="min-w-0 rounded-2xl rounded-bl-md border border-glass-line glass-flat px-4 py-3">
        {children}
      </div>
    </>
  );
}

/** "The coach is typing": three dots that bounce one after the other, in the coach's bubble, as in a chat app. */
export function TypingBubble() {
  return (
    <li
      role="status"
      aria-label={`${COACH_NAME} is typing`}
      className="flex max-w-[92%] items-end gap-2 self-start"
    >
      <CoachBubble>
        <span aria-hidden="true" className="flex h-6 items-center gap-1.5">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              data-testid="typing-dot"
              className="typing-dot size-2 rounded-full bg-ink-muted"
            />
          ))}
        </span>
      </CoachBubble>
    </li>
  );
}
