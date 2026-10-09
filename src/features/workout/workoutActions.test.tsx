import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GymSnapshot } from '../../data/local/types';
import { BENCH, HOME_GYM, renderApp } from '../../test/appHarness';
import { createFakeRemoteLog } from '../../test/fakeRemoteLog';
import { aSet, aWorkout } from '../../test/localDb';

afterEach(() => vi.restoreAllMocks());

const HOME: GymSnapshot = { name: 'Home gym', barbellKg: 15, bars: HOME_GYM.bars };

type Seed = { status?: 'pending' | 'synced' | 'failed'; totalKg?: number };

/** An open workout with sets already on the device, then the workout page showing the exercise. */
async function openWith(
  seeds: Seed[],
  path = `/workout?exercise=${BENCH}`,
  server = createFakeRemoteLog(),
) {
  const userId = `act-${Math.random()}`;
  const first = renderApp('/workout', { userId });
  const workout = await first.store.startWorkout({
    ...aWorkout(),
    startedAt: '2026-10-01T10:00:00.000Z',
    gymId: HOME_GYM.id,
    gymSnapshot: HOME,
  });
  const ids: string[] = [];
  for (const [i, seed] of seeds.entries()) {
    const set = aSet(workout.id, {
      exerciseId: BENCH,
      totalKg: seed.totalKg ?? 60,
      barKg: 15,
      perSideKg: ((seed.totalKg ?? 60) - 15) / 2,
      reps: 8,
      loggedAt: `2026-10-10T10:0${i}:00.000Z`,
    });
    await first.store.logSet(set);
    ids.push(set.id);
    if (seed.status && seed.status !== 'pending')
      await first.db.sets.update(set.id, { syncStatus: seed.status });
  }
  first.unmount();
  return { ...renderApp(path, { userId, server }), workout, ids };
}

/** A server that cannot be reached, so a waiting set stays waiting. */
function offline() {
  const server = createFakeRemoteLog();
  server.setOffline(true);
  return server;
}

function goOffline() {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
}

describe('undoing the last set', () => {
  it('removes a set that has not reached the server, on the device only', async () => {
    const { user, store, workout, server } = await openWith([{ status: 'pending' }]);
    server.setOffline(true);
    await user.click(await screen.findByRole('button', { name: 'Undo last' }));
    await waitFor(async () => expect(await store.listSets(workout.id)).toHaveLength(0));
    expect(server.callsTo('softDeleteSet')).toHaveLength(0);
    expect(await screen.findByText(/no sets yet/i)).toBeInTheDocument();
  });

  it('deletes a saved set on the server first, then on the device', async () => {
    const { user, store, workout, server, ids } = await openWith([{ status: 'synced' }]);
    await user.click(await screen.findByRole('button', { name: 'Undo last' }));
    await waitFor(async () => expect(await store.listSets(workout.id)).toHaveLength(0));
    expect(server.callsTo('softDeleteSet').map((c) => c.ids[0])).toEqual([ids[0]]);
  });

  it('only undoes the last set', async () => {
    const { user, store, workout } = await openWith([
      { status: 'pending', totalKg: 50 },
      { status: 'pending', totalKg: 60 },
    ]);
    await user.click(await screen.findByRole('button', { name: 'Undo last' }));
    await waitFor(async () =>
      expect((await store.listSets(workout.id)).map((s) => s.totalKg)).toEqual([50]),
    );
  });

  it('is unavailable for a saved set with no connection, and says why', async () => {
    goOffline();
    await openWith([{ status: 'synced' }]);
    expect(await screen.findByRole('button', { name: 'Undo last' })).toBeDisabled();
    expect(screen.getByText(/already saved, so removing it needs internet/i)).toBeInTheDocument();
  });

  it('keeps the set and says so when the server cannot be reached', async () => {
    const { user, store, workout, server } = await openWith([{ status: 'synced' }]);
    server.failNext('softDeleteSet', 'offline');
    await user.click(await screen.findByRole('button', { name: 'Undo last' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/needs internet/i);
    expect(await store.listSets(workout.id)).toHaveLength(1);
  });

  it('keeps the set and says so when the server refuses', async () => {
    const { user, store, workout, server } = await openWith([{ status: 'synced' }]);
    server.failNext('softDeleteSet', 'unknown');
    await user.click(await screen.findByRole('button', { name: 'Undo last' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not delete/i);
    expect(await store.listSets(workout.id)).toHaveLength(1);
  });

  it('is disabled when there are no sets', async () => {
    await openWith([]);
    expect(await screen.findByRole('button', { name: 'Undo last' })).toBeDisabled();
  });
});

describe('ending the workout', () => {
  it('asks first, and keeps going if you change your mind', async () => {
    const { user, store } = await openWith([{ status: 'pending' }]);
    await user.click(await screen.findByRole('button', { name: 'End workout' }));
    const group = screen.getByRole('group', { name: 'End workout' });
    await user.click(within(group).getByRole('button', { name: 'Keep going' }));
    expect(screen.queryByRole('group', { name: 'End workout' })).not.toBeInTheDocument();
    expect((await store.activeWorkout())?.endedAt).toBeNull();
  });

  it('ends it, goes Home, and the next visit starts a fresh workout', async () => {
    const { user, store, router } = await openWith([{ status: 'pending' }]);
    await user.click(await screen.findByRole('button', { name: 'End workout' }));
    await user.click(
      within(screen.getByRole('group', { name: 'End workout' })).getByRole('button', {
        name: 'Yes, end it',
      }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(await store.activeWorkout()).toBeUndefined();
    await router.navigate('/workout');
    expect(await screen.findByRole('button', { name: 'Start workout' })).toBeInTheDocument();
  });
});

describe('the sync badge', () => {
  it('says how many are waiting while the server cannot be reached, then that all is synced', async () => {
    const server = createFakeRemoteLog();
    server.setOffline(true);
    await openWith([{ status: 'pending' }], '/workout', server);
    expect(await screen.findByText(/waiting to sync/i)).toBeInTheDocument();
    server.setOffline(false);
    act(() => void window.dispatchEvent(new Event('online')));
    expect(await screen.findByText('All synced')).toBeInTheDocument();
  });

  it('offers a retry when a set failed, and sends it', async () => {
    const { user, server, ids } = await openWith([{ status: 'failed' }], '/workout');
    await user.click(await screen.findByRole('button', { name: /sync failed, tap to retry/i }));
    expect(await screen.findByText('All synced')).toBeInTheDocument();
    expect(server.sets.has(ids[0]!)).toBe(true);
  });
});

describe('the offline banner', () => {
  it('shows that tap logging works and voice needs internet, only when offline', async () => {
    const { unmount } = await openWith([]);
    expect(await screen.findByRole('button', { name: /voice logging/i })).toBeDisabled();
    expect(screen.queryByText(/you are offline/i)).not.toBeInTheDocument();
    unmount();
    goOffline();
    await openWith([]);
    expect(await screen.findByText(/you are offline/i)).toBeInTheDocument();
    expect(screen.getAllByText(/tap logging works/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /unavailable offline/i })).toBeDisabled();
  });
});

describe('signing out from Home', () => {
  it('clears what the server already has from this device', async () => {
    const { user, db, workout } = await openWith([{ status: 'synced' }], '/');
    await db.workouts.update(workout.id, { syncStatus: 'synced' });
    await user.click(await screen.findByRole('button', { name: /sign out/i }));
    await waitFor(async () => expect(await db.sets.count()).toBe(0));
  });

  it('warns about sets still waiting, and can stay signed in', async () => {
    const { user, db } = await openWith([{ status: 'pending' }], '/', offline());
    await user.click(await screen.findByRole('button', { name: /sign out/i }));
    const group = await screen.findByRole('group', { name: 'Sets waiting' });
    expect(group).toHaveTextContent(/still waiting to sync/i);
    await user.click(within(group).getByRole('button', { name: 'Stay signed in' }));
    expect(screen.queryByRole('group', { name: 'Sets waiting' })).not.toBeInTheDocument();
    expect(await db.sets.count()).toBe(1);
  });

  it('signs out anyway on request, and keeps the waiting sets on the device', async () => {
    const { user, db, auth } = await openWith([{ status: 'pending' }], '/', offline());
    await user.click(await screen.findByRole('button', { name: /sign out/i }));
    await user.click(await screen.findByRole('button', { name: 'Sign out anyway' }));
    await waitFor(() => expect(auth.service.signOut).toHaveBeenCalledTimes(1));
    expect(await db.sets.count()).toBe(1);
  });
});
