import { useState } from 'react';

/**
 * False until `ready` has been true once, then true for good. A screen uses it to show one loader until all
 * its data has arrived, and never to go back to the loader later while it re-reads in the background (which
 * would throw away what the person has typed).
 */
export function useSettled(ready: boolean): boolean {
  const [settled, setSettled] = useState(ready);
  if (ready && !settled) setSettled(true);
  return settled || ready;
}
