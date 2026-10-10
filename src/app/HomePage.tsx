import { Link } from 'react-router';
import { buttonClasses, Card } from '../components';
import { useAuth } from '../features/auth';
import { SignOutPanel } from '../features/settings';

export function HomePage() {
  const { state } = useAuth();
  if (state.status !== 'signedIn') return null;

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

      <Card as="section" aria-label="Account" className="flex flex-col gap-4">
        <p className="text-callout text-ink-muted">
          Signed in as {state.user.email ?? 'your account'}
        </p>
        <SignOutPanel />
      </Card>
    </div>
  );
}
