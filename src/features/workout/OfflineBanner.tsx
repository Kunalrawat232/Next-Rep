import { useOnline } from '../../lib/useOnline';

/** Shown while the browser has no connection: what still works and what does not. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="rounded-md border border-warning bg-surface-200 p-4">
      <p className="text-body font-semibold">You are offline</p>
      <p className="text-callout text-ink-muted">Tap logging works. Voice needs internet.</p>
    </div>
  );
}
