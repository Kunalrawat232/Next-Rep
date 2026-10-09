import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { aSet, aWorkout, freshLocal } from '../../test/localDb';
import { createFakeRemoteLog } from '../../test/fakeRemoteLog';
import { createFakeAuthService } from '../../test/fakeAuth';
import { AuthProvider, useAuth } from '../auth';
import { SyncProvider, useLogStore } from '../sync';
import { useWorkout } from './useWorkout';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';

function Probe({
  onApi,
}: {
  onApi: (api: { reload: () => Promise<void>; store: ReturnType<typeof useLogStore> }) => void;
}) {
  const { state, reload } = useWorkout();
  const store = useLogStore();
  onApi({ reload, store });
  return <p>{state.status === 'open' ? `open with ${state.sets.length} sets` : state.status}</p>;
}

function Gate({ children }: { children: React.ReactNode }) {
  return useAuth().state.status === 'signedIn' ? <>{children}</> : null;
}

describe('useWorkout', () => {
  it('says there is no workout, then finds one, with its sets, after a reload', async () => {
    void freshLocal;
    void aWorkout;
    void aSet;
    let api: Parameters<Parameters<typeof Probe>[0]['onApi']>[0] | undefined;
    render(
      <AuthProvider
        service={createFakeAuthService({ id: `u-${Math.random()}`, email: 'a@b.co' }).service}
      >
        <SyncProvider remote={createFakeRemoteLog().remote} dexieDeps={{ indexedDB, IDBKeyRange }}>
          <Gate>
            <Probe onApi={(a) => void (api = a)} />
          </Gate>
        </SyncProvider>
      </AuthProvider>,
    );
    expect(await screen.findByText('none')).toBeInTheDocument();
    const w = await api!.store.startWorkout(aWorkout());
    await api!.store.logSet(aSet(w.id));
    await act(async () => api!.reload());
    await waitFor(() => expect(screen.getByText('open with 1 sets')).toBeInTheDocument());
  });
});
