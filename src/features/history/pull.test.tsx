import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BENCH, renderApp } from '../../test/appHarness';
import { createFakeRemoteLog } from '../../test/fakeRemoteLog';
import { aSet, aWorkout } from '../../test/localDb';

/** A server that already holds two finished workouts, as if the user had logged them on another phone. */
function serverWithHistory() {
  const server = createFakeRemoteLog();
  const older = aWorkout({ startedAt: '2026-10-01T09:00:00.000Z' });
  const newer = aWorkout({ startedAt: '2026-10-03T09:00:00.000Z' });
  server.seedWorkout({ ...older, endedAt: '2026-10-01T10:00:00.000Z' });
  server.seedWorkout({ ...newer, endedAt: '2026-10-03T10:00:00.000Z' });
  server.seedSet(aSet(older.id, { totalKg: 60, loggedAt: '2026-10-01T09:10:00.000Z' }));
  server.seedSet(
    aSet(newer.id, {
      totalKg: 65,
      barKg: 20,
      perSideKg: 22.5,
      loggedAt: '2026-10-03T09:10:00.000Z',
    }),
  );
  return { server, older, newer };
}

describe('signing in on a device with no history', () => {
  it('fills History from the server', async () => {
    const { server } = serverWithHistory();
    renderApp('/history', { server });
    const items = await within(await screen.findByRole('main')).findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('1 set · 1 exercise');
    expect(items[0]).not.toHaveTextContent(/waiting to sync/i);
  });

  it('says it is loading, not that there is nothing, while the history is being read', async () => {
    const { server } = serverWithHistory();
    const release = server.hold('fetchWorkouts');
    renderApp('/history', { server });
    expect(await screen.findByText('Loading your history…')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'No finished workouts yet' }),
    ).not.toBeInTheDocument();
    release();
    expect(await within(await screen.findByRole('main')).findAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByText('Loading your history…')).not.toBeInTheDocument();
  });

  it('fills Progress, with the same records as the device that logged them', async () => {
    const { server } = serverWithHistory();
    const { user } = renderApp('/progress', { server });
    await user.click(await screen.findByRole('link', { name: /Barbell Bench Press/ }));
    const records = await screen.findByRole('region', { name: 'Records' });
    expect(records).toHaveTextContent('Heaviest: 65 Kg × 8');
    const table = screen.getByRole('table');
    expect(within(table).getByRole('img', { name: /heaviest weight/i })).toBeInTheDocument();
  });

  it('shows the plain empty state when the server cannot be reached', async () => {
    const { server } = serverWithHistory();
    server.setOffline(true);
    renderApp('/history', { server });
    expect(
      await screen.findByRole('heading', { name: 'No finished workouts yet' }),
    ).toBeInTheDocument();
  });

  it('shows history that arrives after the connection returns', async () => {
    const { server } = serverWithHistory();
    server.setOffline(true);
    renderApp('/history', { server });
    await screen.findByRole('heading', { name: 'No finished workouts yet' });
    server.setOffline(false);
    window.dispatchEvent(new Event('online'));
    expect(await within(await screen.findByRole('main')).findAllByRole('listitem')).toHaveLength(2);
  });

  it('leaves a workout in progress on this device alone', async () => {
    const { server } = serverWithHistory();
    const { store, db } = renderApp('/workout?exercise=' + BENCH, { server });
    const open = await store.startWorkout(aWorkout());
    await store.logSet(aSet(open.id));
    await screen.findByRole('region', { name: /./ });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect((await db.workouts.toArray()).filter((w) => w.endedAt === null)).toHaveLength(1);
    expect(await db.sets.where('workoutId').equals(open.id).count()).toBe(1);
  });
});
