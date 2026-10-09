import { Button } from '../../components';
import type { GymFailure } from './types';

export function GymsLoadError({ reason, onRetry }: { reason: GymFailure; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <p role="alert" className="rounded-md border border-danger bg-surface-200 p-4">
        {reason === 'offline'
          ? "You're offline. Connect to the internet to load your gyms."
          : 'Could not load your gyms. Please try again.'}
      </p>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
