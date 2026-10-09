import { useState } from 'react';
import { Link } from 'react-router';
import { Button, buttonClasses } from '../components';
import { useAuth } from '../features/auth';
import { useLogStore, useSyncControls } from '../features/sync';

export function HomePage() {
  const { state, service } = useAuth();
  const { purgeSynced } = useSyncControls();
  const store = useLogStore();
  const [signOutFailed, setSignOutFailed] = useState(false);
  const [waiting, setWaiting] = useState<number | null>(null);
  if (state.status !== 'signedIn') return null;

  async function finishSignOut() {
    setSignOutFailed(false);
    // What the server already has is cleared from this device. Sets still waiting stay.
    await purgeSynced().catch(() => undefined);
    try {
      await service.signOut();
    } catch {
      setSignOutFailed(true);
    }
  }

  // The user is told about waiting sets before anything is cleared, so "Stay signed in" changes nothing.
  async function signOut() {
    const counts = await store.counts().catch(() => ({ pending: 0, failed: 0 }));
    const remaining = counts.pending + counts.failed;
    if (remaining > 0) setWaiting(remaining);
    else await finishSignOut();
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-display font-semibold">Ready to lift?</h1>

      <section aria-label="Workout" className="flex flex-col gap-2">
        <Link to="/workout" className={buttonClasses('primary', 'w-full')}>
          Start workout
        </Link>
      </section>

      <section aria-label="Setup" className="flex flex-col gap-2">
        <Link to="/gyms" className={buttonClasses('secondary', 'w-full')}>
          Manage gyms
        </Link>
        <Link to="/exercises" className={buttonClasses('secondary', 'w-full')}>
          Exercises
        </Link>
      </section>

      <section
        aria-label="Account"
        className="flex flex-col gap-4 rounded-md border border-line bg-surface-200 p-4"
      >
        <p className="text-callout text-ink-muted">
          Signed in as {state.user.email ?? 'your account'}
        </p>
        {waiting === null ? (
          <Button variant="secondary" onClick={() => void signOut()} className="self-start">
            Sign out
          </Button>
        ) : (
          <div role="group" aria-label="Sets waiting" className="flex flex-col gap-3">
            <p>
              {waiting} {waiting === 1 ? 'item is' : 'items are'} still waiting to sync. They stay
              on this device until you are online again, and a new sign-in will send them.
            </p>
            <div className="flex gap-2">
              <Button variant="danger" onClick={() => void finishSignOut()}>
                Sign out anyway
              </Button>
              <Button variant="secondary" onClick={() => setWaiting(null)}>
                Stay signed in
              </Button>
            </div>
          </div>
        )}
        {signOutFailed && (
          <p role="alert" className="text-callout text-danger">
            Could not sign out. Please try again.
          </p>
        )}
      </section>
    </div>
  );
}
