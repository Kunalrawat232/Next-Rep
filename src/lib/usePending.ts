import { useCallback, useRef, useState } from 'react';

/**
 * Says whether a save, delete or similar is under way, and lets only one start. `begin` answers
 * at once from a ref, so two taps in the same instant cannot both pass: the state alone is
 * still the old value until the next render.
 */
export function usePending(): {
  pending: boolean;
  begin: () => boolean;
  end: () => void;
  /** Whether something began and has not ended: answers at once, unlike `pending`, which waits for a render. */
  active: () => boolean;
} {
  const started = useRef(false);
  const [pending, setPending] = useState(false);

  const begin = useCallback(() => {
    if (started.current) return false;
    started.current = true;
    setPending(true);
    return true;
  }, []);

  const end = useCallback(() => {
    started.current = false;
    setPending(false);
  }, []);

  const active = useCallback(() => started.current, []);

  return { pending, begin, end, active };
}
