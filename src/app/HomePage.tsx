import { useState } from 'react';
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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-3xl font-semibold">Next Rep</h1>
      <p className="text-ink-muted">Signed in as {state.user.email ?? 'your account'}</p>
      <button
        type="button"
        onClick={signOut}
        className="min-h-12 rounded-lg bg-surface-raised px-6"
      >
        Sign out
      </button>
      {signOutFailed && (
        <p role="alert" className="text-red-300">
          Could not sign out. Please try again.
        </p>
      )}
    </main>
  );
}
