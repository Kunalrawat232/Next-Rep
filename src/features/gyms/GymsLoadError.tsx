import { Button, ErrorMessage } from '../../components';
import type { GymFailure } from './types';

export function GymsLoadError({ reason, onRetry }: { reason: GymFailure; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <ErrorMessage>
        {reason === 'offline'
          ? "You're offline. Connect to the internet to load your gym."
          : 'Could not load your gym. Please try again.'}
      </ErrorMessage>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
