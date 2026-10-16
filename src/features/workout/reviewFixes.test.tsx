import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { GymSnapshot } from '../../data/local/types';
import { BENCH, HOME_GYM, renderApp, offlineServer } from '../../test/appHarness';
import { aSet, aWorkout } from '../../test/localDb';
import { tapTogether } from '../../test/doubleTap';

const HOME: GymSnapshot = { barbellKg: 15, bars: HOME_GYM.bars };

async function openWith(
  path: string,
  totals: number[] = [],
  snapshot: unknown = HOME,
  server?: ReturnType<typeof offlineServer>,
) {
  const userId = `fix-${Math.random()}`;
  const first = renderApp('/workout', { userId, server: offlineServer() });
  const workout = await first.store.startWorkout({
    ...aWorkout(),
    startedAt: '2026-10-01T10:00:00.000Z',
    gymId: HOME_GYM.id,
    gymSnapshot: HOME,
  });
  if (snapshot !== HOME)
    await first.db.workouts.update(workout.id, { gymSnapshot: snapshot as never });
  const ids: string[] = [];
  for (const [i, totalKg] of totals.entries()) {
    const set = aSet(workout.id, {
      exerciseId: BENCH,
      totalKg,
      barKg: 15,
      perSideKg: (totalKg - 15) / 2,
      reps: 8,
      loggedAt: `2026-10-02T10:0${i}:00.000Z`,
    });
    await first.store.logSet(set);
    ids.push(set.id);
  }
  first.unmount();
  return { ...renderApp(path, { userId, server }), workout, ids };
}

describe('undo against a status that moved on', () => {
  it('deletes on the server when the set finished syncing after the screen loaded', async () => {
    const { user, db, ids, server, store, workout } = await openWith(
      `/workout?exercise=${BENCH}`,
      [60],
    );
    const undo = await screen.findByRole('button', { name: 'Undo last' });
    await db.sets.update(ids[0]!, { syncStatus: 'synced' });
    await user.click(undo);
    await waitFor(async () => expect(await store.listSets(workout.id)).toHaveLength(0));
    expect(server.callsTo('softDeleteSet').map((c) => c.ids[0])).toEqual([ids[0]]);
  });

  it('removes only one set on a double tap', async () => {
    const { store, workout } = await openWith(`/workout?exercise=${BENCH}`, [50, 60]);
    tapTogether(await screen.findByRole('button', { name: 'Undo last' }));
    await waitFor(async () => expect(await store.listSets(workout.id)).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await store.listSets(workout.id)).toHaveLength(1);
  });
});

describe('starting twice', () => {
  it('opens one workout on a double tap', async () => {
    const { db } = renderApp('/workout');
    tapTogether(await screen.findByRole('button', { name: 'Start workout' }));
    await screen.findByText('15 kg bar');
    expect(await db.workouts.count()).toBe(1);
  });
});

describe('the exercise in the address', () => {
  it.each(['not-an-id', 'x%26y%3D1', ''])('is ignored when it is %j', async (value) => {
    await openWith(`/workout?exercise=${value}`);
    expect(await screen.findByRole('link', { name: 'Choose exercise' })).toBeInTheDocument();
  });
});

describe('switching how the weight is entered', () => {
  it('clears a weight that is less than the bar instead of reading it as per side', async () => {
    const { user } = await openWith(`/workout/log?exercise=${BENCH}`);
    await user.type(await screen.findByRole('textbox', { name: /^weight/i }), '10');
    await user.click(screen.getByRole('button', { name: 'Per side' }));
    expect(screen.getByRole('textbox', { name: /per side/i })).toHaveValue('');
  });
});

describe('damaged data on the device', () => {
  it('treats a damaged gym snapshot as missing, so the bar is asked for, not guessed', async () => {
    await openWith(`/workout/log?exercise=${BENCH}`, [], {
      barbellKg: 'heavy',
      bars: 7,
    });
    expect(await screen.findByRole('heading', { name: /no barbell set up/i })).toBeInTheDocument();
  });

  it('ignores a damaged saved gym', async () => {
    const { store } = renderApp('/workout');
    await store.saveGym({ id: 'g', barbellKg: Number.NaN, bars: [] });
    expect(await store.cachedGym()).toBeNull();
    await store.saveGym('nonsense' as never);
    expect(await store.cachedGym()).toBeNull();
  });
});

describe('the question dialog', () => {
  it('gives focus back to Log set when it is cancelled', async () => {
    const { user } = await openWith(`/workout/log?exercise=${BENCH}`);
    await user.type(await screen.findByRole('textbox', { name: /^weight/i }), '10');
    const log = screen.getByRole('button', { name: 'Log set' });
    await user.click(log);
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(log).toHaveFocus();
  });
});

describe('signing out', () => {
  it('changes nothing on the device when you stay signed in', async () => {
    // Offline, so the set stays waiting and the warning appears whatever the machine's speed.
    const { user, store } = await openWith('/settings', [60], HOME, offlineServer());
    await store.saveGym(HOME_GYM);
    await user.click(await screen.findByRole('button', { name: /sign out/i }));
    await user.click(await screen.findByRole('button', { name: 'Stay signed in' }));
    expect(await store.cachedGym()).not.toBeNull();
  });
});
