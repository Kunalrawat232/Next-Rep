export type PersistResult = 'granted' | 'denied' | 'unsupported';

type StorageManagerLike = { persist?: () => Promise<boolean>; persisted?: () => Promise<boolean> };

/**
 * Asks the browser not to clear this site's data under storage pressure. Unsynced sets live only in
 * IndexedDB, and iOS Safari in particular may evict it. The answer is a request, not a guarantee,
 * so syncing as soon as possible stays the real protection.
 */
export async function requestPersistentStorage(
  storage: StorageManagerLike | undefined = (
    globalThis as { navigator?: { storage?: StorageManagerLike } }
  ).navigator?.storage,
): Promise<PersistResult> {
  if (!storage?.persist) return 'unsupported';
  try {
    // A failing "already persistent?" check must not stop the real request.
    const already = await storage.persisted?.().catch(() => false);
    if (already) return 'granted';
    return (await storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}
