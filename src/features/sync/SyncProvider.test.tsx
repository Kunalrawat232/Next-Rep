import { render, screen, waitFor } from '@testing-library/react';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { StrictMode, useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createFakeRemoteLog } from '../../test/fakeRemoteLog';
import { createFakeAuthService } from '../../test/fakeAuth';
import { aSet, aWorkout, uuid } from '../../test/localDb';
import { AuthProvider, useAuth } from '../auth';
import { SyncProvider, useLogStore, useSyncControls, useSyncStatus } from '.';

const dexieDeps = { indexedDB, IDBKeyRange };

function Probe({
  onReady,
}: {
  onReady?: (api: { store: ReturnType<typeof useLogStore>; notify: () => void }) => void;
}) {
  const store = useLogStore();
  const { notify } = useSyncControls();
  const status = useSyncStatus();
  onReady?.({ store, notify });
  return (
    <p>
      pending {status.pending} failed {status.failed} {status.syncing ? 'syncing' : 'idle'}
    </p>
  );
}

/** Renders its children only once sign-in has resolved, as the protected routes do. */
function Gate({ children }: { children: React.ReactNode }) {
  const { state } = useAuth();
  return state.status === 'signedIn' ? <>{children}</> : <p>signed out page</p>;
}

function renderWith(
  user: { id: string; email: string } | null,
  onReady?: Parameters<typeof Probe>[0]['onReady'],
) {
  const auth = createFakeAuthService(user);
  const server = createFakeRemoteLog();
  const view = render(
    <AuthProvider service={auth.service}>
      <SyncProvider remote={server.remote} dexieDeps={dexieDeps}>
        <Gate>
          <Probe onReady={onReady} />
        </Gate>
      </SyncProvider>
    </AuthProvider>,
  );
  return { auth, server, ...view };
}

describe('SyncProvider', () => {
  it('shows its children when signed out, and starts no sync', async () => {
    const { server } = renderWith(null);
    expect(await screen.findByText('signed out page')).toBeInTheDocument();
    expect(server.calls).toEqual([]);
  });

  it('gives a signed-in user a log store and a status', async () => {
    renderWith({ id: `u-${uuid()}`, email: 'a@b.co' });
    expect(await screen.findByText(/pending 0 failed 0/)).toBeInTheDocument();
  });

  it('pushes a workout started on this device once notified, and shows the waiting count', async () => {
    let api: Parameters<NonNullable<Parameters<typeof Probe>[0]['onReady']>>[0] | undefined;
    const { server } = renderWith({ id: `u-${uuid()}`, email: 'a@b.co' }, (a) => void (api = a));
    await screen.findByText(/pending 0/);
    const w = await api!.store.startWorkout(aWorkout());
    api!.notify();
    await waitFor(() => expect(server.workouts.has(w.id)).toBe(true));
    await waitFor(() => expect(screen.getByText(/pending 0 failed 0 idle/)).toBeInTheDocument());
    expect(server.callsTo('upsertWorkouts')[0]?.userId).toBeTruthy();
  });

  it('syncs sets left unsynced from an earlier session as soon as the user is signed in', async () => {
    const id = `u-${uuid()}`;
    const first = renderWith({ id, email: 'a@b.co' });
    let api: Parameters<NonNullable<Parameters<typeof Probe>[0]['onReady']>>[0] | undefined;
    first.unmount();
    // A workout written while the app was closed (as if the network had been down).
    const second = renderWith({ id, email: 'a@b.co' }, (a) => void (api = a));
    await screen.findByText(/pending/);
    const w = await api!.store.startWorkout(aWorkout());
    second.server.setOffline(true);
    api!.notify();
    await screen.findByText(/pending 1/);
    second.unmount();
    const third = renderWith({ id, email: 'a@b.co' });
    await waitFor(() => expect(third.server.workouts.has(w.id)).toBe(true));
  });

  it("keeps each user's unsynced data apart on a shared device", async () => {
    let apiA: Parameters<NonNullable<Parameters<typeof Probe>[0]['onReady']>>[0] | undefined;
    const idA = `a-${uuid()}`;
    const a = renderWith({ id: idA, email: 'a@b.co' }, (x) => void (apiA = x));
    await screen.findByText(/pending/);
    a.server.setOffline(true);
    const w = await apiA!.store.startWorkout(aWorkout());
    apiA!.notify();
    await screen.findByText(/pending 1/);
    a.unmount();
    const b = renderWith({ id: `b-${uuid()}`, email: 'c@d.co' });
    await screen.findByText(/pending 0 failed 0/);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(b.server.workouts.has(w.id)).toBe(false);
  });

  it('stops syncing when the user signs out: a push already started is not completed', async () => {
    let api: Parameters<NonNullable<Parameters<typeof Probe>[0]['onReady']>>[0] | undefined;
    const { auth, server } = renderWith(
      { id: `u-${uuid()}`, email: 'a@b.co' },
      (a) => void (api = a),
    );
    await screen.findByText(/pending 0/);
    const w = await api!.store.startWorkout(aWorkout());
    const release = server.hold('upsertWorkouts');
    api!.notify();
    await waitFor(() => expect(server.callsTo('upsertWorkouts')).toHaveLength(1));
    auth.emit(null);
    await screen.findByText('signed out page');
    release();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(server.callsTo('upsertSets')).toEqual([]);
    expect(server.callsTo('upsertWorkouts')).toHaveLength(1);
    expect(w.id).toBeTruthy();
  });

  it('works under StrictMode, which closes and reopens the session: a logged workout still reaches the server', async () => {
    const auth = createFakeAuthService({ id: `u-${uuid()}`, email: 'a@b.co' });
    const server = createFakeRemoteLog();
    let api: { store: ReturnType<typeof useLogStore>; notify: () => void } | undefined;
    render(
      <StrictMode>
        <AuthProvider service={auth.service}>
          <SyncProvider remote={server.remote} dexieDeps={dexieDeps}>
            <Gate>
              <Probe onReady={(a) => void (api = a)} />
            </Gate>
          </SyncProvider>
        </AuthProvider>
      </StrictMode>,
    );
    await screen.findByText(/pending 0 failed 0/);
    // The database must be usable after StrictMode's simulated unmount, not closed for good.
    const w = await api!.store.startWorkout(aWorkout());
    api!.notify();
    await waitFor(() => expect(server.workouts.has(w.id)).toBe(true));
    await waitFor(() => expect(screen.getByText(/pending 0 failed 0 idle/)).toBeInTheDocument());
  });

  it('asks the browser to keep the data only when the screens ask, and only once', async () => {
    const captured: { controls?: ReturnType<typeof useSyncControls> } = {};
    function Capture() {
      const current = useSyncControls();
      useEffect(() => {
        captured.controls = current;
      }, [current]);
      return null;
    }
    const persist = vi.fn(async () => true);
    vi.stubGlobal('navigator', { storage: { persist, persisted: async () => false } });
    const auth = createFakeAuthService({ id: `u-${uuid()}`, email: 'a@b.co' });
    render(
      <AuthProvider service={auth.service}>
        <SyncProvider remote={createFakeRemoteLog().remote} dexieDeps={dexieDeps}>
          <Gate>
            <Capture />
          </Gate>
        </SyncProvider>
      </AuthProvider>,
    );
    await waitFor(() => expect(captured.controls).toBeDefined());
    expect(persist).not.toHaveBeenCalled();
    captured.controls!.ensurePersistence();
    captured.controls!.ensurePersistence();
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    vi.unstubAllGlobals();
  });

  it('refuses to hand out a store outside the provider', () => {
    const spy = () => undefined;
    const original = console.error;
    console.error = spy;
    expect(() => render(<Probe />)).toThrow(/signed-in user/);
    console.error = original;
  });
});

describe('deleteSyncedSet and purgeSynced', () => {
  async function ready() {
    const captured: {
      controls?: ReturnType<typeof useSyncControls>;
      store?: ReturnType<typeof useLogStore>;
    } = {};
    function Capture() {
      const controls = useSyncControls();
      const store = useLogStore();
      useEffect(() => {
        captured.controls = controls;
        captured.store = store;
      }, [controls, store]);
      return null;
    }
    const auth = createFakeAuthService({ id: `u-${uuid()}`, email: 'a@b.co' });
    const server = createFakeRemoteLog();
    render(
      <AuthProvider service={auth.service}>
        <SyncProvider remote={server.remote} dexieDeps={dexieDeps}>
          <Gate>
            <Capture />
          </Gate>
        </SyncProvider>
      </AuthProvider>,
    );
    await waitFor(() => expect(captured.store).toBeDefined());
    return { ...captured, server } as {
      controls: ReturnType<typeof useSyncControls>;
      store: ReturnType<typeof useLogStore>;
      server: ReturnType<typeof createFakeRemoteLog>;
    };
  }

  async function syncedSet(
    store: ReturnType<typeof useLogStore>,
    server: ReturnType<typeof createFakeRemoteLog>,
    notify: () => void,
  ) {
    const w = await store.startWorkout(aWorkout());
    const s = await store.logSet(aSet(w.id));
    notify();
    await waitFor(() => expect(server.sets.has(s.id)).toBe(true));
    await waitFor(async () => expect((await store.listSets(w.id))[0]?.syncStatus).toBe('synced'));
    return { w, s };
  }

  it('deletes a synced set on the server and then here', async () => {
    const { controls, store, server } = await ready();
    const { w, s } = await syncedSet(store, server, controls.notify);
    expect(await controls.deleteSyncedSet(s.id)).toBe('deleted');
    expect(server.sets.get(s.id)?.deletedAt).toBeTruthy();
    expect(await store.listSets(w.id)).toEqual([]);
  });

  it('keeps the set here when the network is down, and says so', async () => {
    const { controls, store, server } = await ready();
    const { w, s } = await syncedSet(store, server, controls.notify);
    server.setOffline(true);
    expect(await controls.deleteSyncedSet(s.id)).toBe('offline');
    expect(await store.listSets(w.id)).toHaveLength(1);
  });

  it('keeps the set here when the server refuses, and says it failed', async () => {
    const { controls, store, server } = await ready();
    const { w, s } = await syncedSet(store, server, controls.notify);
    server.failNext('softDeleteSet', 'unknown');
    expect(await controls.deleteSyncedSet(s.id)).toBe('failed');
    expect(await store.listSets(w.id)).toHaveLength(1);
  });

  it('purges what the server has and reports what is still waiting', async () => {
    const { controls, store, server } = await ready();
    const { w } = await syncedSet(store, server, controls.notify);
    server.setOffline(true);
    await store.logSet(aSet(w.id));
    const { remaining } = await controls.purgeSynced();
    expect(remaining).toBeGreaterThan(0);
    expect(await store.listSets(w.id)).toHaveLength(1);
  });
});
