import { useState } from 'react';
import { Link } from 'react-router';
import { Button, buttonClasses } from '../components';
import { useAuth } from '../features/auth';

export function HomePage() {
  const { state, service } = useAuth();
  const [signOutFailed, setSignOutFailed] = useState(false);
  if (state.status !== 'signedIn') return null;

  async function signOut() {
    setSignOutFailed(false);
    try {
      await service.signOut();
    } catch {
      setSignOutFailed(true);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-display font-semibold">Ready to lift?</h1>

      <section aria-label="Workout" className="flex flex-col gap-2">
        <Button disabled aria-describedby="workout-note" className="w-full">
          Start workout
        </Button>
        <p id="workout-note" className="text-caption text-ink-muted">
          Workout logging is coming soon.
        </p>
      </section>

      <section aria-label="Gyms">
        <Link to="/gyms" className={buttonClasses('secondary', 'w-full')}>
          Manage gyms
        </Link>
      </section>

      <section
        aria-label="Account"
        className="flex flex-col gap-4 rounded-md border border-line bg-surface-200 p-4"
      >
        <p className="text-callout text-ink-muted">
          Signed in as {state.user.email ?? 'your account'}
        </p>
        <Button variant="secondary" onClick={signOut} className="self-start">
          Sign out
        </Button>
        {signOutFailed && (
          <p role="alert" className="text-callout text-danger">
            Could not sign out. Please try again.
          </p>
        )}
      </section>
    </div>
  );
}
