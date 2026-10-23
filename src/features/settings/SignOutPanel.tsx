import { useState } from 'react';
import { Button } from '../../components';
import { usePending } from '../../lib/usePending';
import { useAuth } from '../auth';
import { useLogStore, useSyncControls } from '../sync';

/**
 * Sign out, shared by Home and Settings. Sets still waiting to sync are mentioned before anything
 * is cleared, so "Stay signed in" changes nothing. Taps while a sign-out is under way are ignored.
 */
export function SignOutPanel() {
  const { service } = useAuth();
  const { purgeSynced } = useSyncControls();
  const store = useLogStore();
  const { begin, end } = usePending();
  const [failed, setFailed] = useState(false);
  const [waiting, setWaiting] = useState<number | null>(null);

  async function finish() {
    setFailed(false);
    // What the server already has is cleared from this device. Sets still waiting stay.
    await purgeSynced().catch(() => undefined);
    try {
      await service.signOut();
    } catch {
      // One message at a time: "Try again" asks about waiting sets again if there are any.
      setWaiting(null);
      setFailed(true);
    }
  }

  async function once(work: () => Promise<void>) {
    if (!begin()) return;
    try {
      await work();
    } finally {
      end();
    }
  }

  const signOut = () =>
    once(async () => {
      const counts = await store.counts().catch(() => ({ pending: 0, failed: 0 }));
      const remaining = counts.pending + counts.failed;
      if (remaining > 0) setWaiting(remaining);
      else await finish();
    });

  return (
    <div className="flex flex-col gap-4">
      {waiting === null ? (
        <Button variant="secondary" onClick={() => void signOut()} className="self-start">
          Sign out
        </Button>
      ) : (
        <div role="group" aria-label="Sets waiting" className="flex flex-col gap-3">
          <p>
            {waiting} {waiting === 1 ? 'item is' : 'items are'} still waiting to sync. They stay on
            this device until you are online again, and signing in again will send them.
          </p>
          <div className="flex gap-2">
            <Button variant="danger" onClick={() => void once(finish)}>
              Sign out anyway
            </Button>
            <Button variant="secondary" onClick={() => setWaiting(null)}>
              Stay signed in
            </Button>
          </div>
        </div>
      )}
      {failed && (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-callout text-danger">
            Couldn&apos;t sign you out. Check your connection and try again. You are still signed
            in.
          </p>
          <Button variant="secondary" onClick={() => void signOut()}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}
