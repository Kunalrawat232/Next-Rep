import { useSyncControls, useSyncStatus } from './SyncProvider';

const pill =
  'inline-flex h-8 items-center gap-2 rounded-full border border-line bg-surface-200 px-3 text-caption font-medium';

/** How many rows are waiting to reach the server, or that it failed and can be retried. */
export function SyncBadge() {
  const status = useSyncStatus();
  const { retryFailed } = useSyncControls();

  if (status.failed > 0)
    return (
      <button
        type="button"
        onClick={() => void retryFailed()}
        className={`${pill} min-h-touch text-danger`}
      >
        Sync failed, tap to retry
      </button>
    );
  if (status.pending > 0)
    return (
      <p role="status" className={`${pill} text-warning`}>
        {status.syncing ? 'Syncing…' : `${status.pending} waiting to sync`}
      </p>
    );
  return (
    <p role="status" className={`${pill} text-success`}>
      All synced
    </p>
  );
}
