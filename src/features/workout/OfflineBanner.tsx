import { useOnline } from '../../lib/useOnline';
import { Card } from '../../components';

/** Shown while the browser has no connection: what still works and what does not. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <Card role="status" tone="warning">
      <p className="text-body font-semibold">You are offline</p>
      <p className="text-callout text-ink-muted">Tap logging works. Voice needs internet.</p>
    </Card>
  );
}
