import type { ReactNode } from 'react';

/** The coach's round picture beside its messages: a dumbbell in glass. Decoration only. */
export function CoachAvatar() {
  return (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center self-end rounded-full border border-glass-line glass-flat text-accent"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      >
        <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />
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
      aria-label="The coach is thinking"
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
