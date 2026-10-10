import { act, render, screen, waitFor } from '@testing-library/react';
import { IDBIndex, IDBKeyRange, IDBObjectStore, indexedDB } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BENCH, renderApp } from '../../test/appHarness';
import { createFakeAuthService } from '../../test/fakeAuth';
import { createFakeRemoteLog } from '../../test/fakeRemoteLog';
import { AuthProvider, useAuth } from '../auth';
import { SyncProvider, useLogStore } from '../sync';
import { useWorkout } from './useWorkout';

type Api = { reload: () => Promise<void>; store: ReturnType<typeof useLogStore> };

function Probe({ onApi }: { onApi: (api: Api) => void }) {
  const { state, reload } = useWorkout();
  const store = useLogStore();
  onApi({ reload, store });
  return <p>{state.status}</p>;
}

function Gate({ children }: { children: React.ReactNode }) {
  return useAuth().state.status === 'signedIn' ? <>{children}</> : null;
}

function mount() {
  const holder: { api?: Api } = {};
  render(
    <AuthProvider
      service={createFakeAuthService({ id: `u-${Math.random()}`, email: 'a@b.co' }).service}
    >
      <SyncProvider remote={createFakeRemoteLog().remote} dexieDeps={{ indexedDB, IDBKeyRange }}>
        <Gate>
          <Probe onApi={(a) => void (holder.api = a)} />
        </Gate>
      </SyncProvider>
    </AuthProvider>,
  );
  return holder;
}

afterEach(() => vi.restoreAllMocks());

describe('useWorkout when the device cannot be read', () => {
  it('says error, not Loading, when a read fails, and recovers on the next read', async () => {
    const holder = mount();
    await screen.findByText('none');
    vi.spyOn(holder.api!.store, 'activeWorkout').mockRejectedValueOnce(new Error('disk'));
    await act(async () => holder.api!.reload());
    expect(screen.getByText('error')).toBeInTheDocument();
    await act(async () => holder.api!.reload());
    await waitFor(() => expect(screen.getByText('none')).toBeInTheDocument());
  });

  it('does not throw out of reload when the read fails', async () => {
    const holder = mount();
    await screen.findByText('none');
    vi.spyOn(holder.api!.store, 'activeWorkout').mockRejectedValueOnce(new Error('disk'));
    await expect(holder.api!.reload()).resolves.toBeUndefined();
  });
});

describe('reads that fail the first time the screen looks', () => {
  type OpenCursor = (this: unknown, ...args: unknown[]) => unknown;
  const failCursors = (only?: (args: unknown[]) => boolean) => {
    const original = IDBObjectStore.prototype.openCursor as unknown as OpenCursor;
    vi.spyOn(IDBObjectStore.prototype, 'openCursor').mockImplementation(function (
      this: unknown,
      ...args: unknown[]
    ) {
      if (!only || only(args)) throw new Error('disk');
      return original.apply(this, args);
    } as never);
  };

  it('useWorkout says error instead of staying on loading', async () => {
    failCursors();
    mount();
    expect(await screen.findByText('error')).toBeInTheDocument();
  });

  it('the log set page starts from its defaults when the last set cannot be read, not stuck loading', async () => {
    // The last set is read through an index; with no open workout nothing else is.
    vi.spyOn(IDBIndex.prototype, 'getAll').mockImplementation(() => {
      throw new Error('disk');
    });
    renderApp(`/workout/log?exercise=${BENCH}`);
    expect(await screen.findByText('No workout is open')).toBeInTheDocument();
  });
});
