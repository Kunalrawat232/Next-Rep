import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HOME_GYM, offlineServer, renderApp } from '../../test/appHarness';
import { aSet, aWorkout } from '../../test/localDb';

describe('ending a workout with no sets', () => {
  it('says it will not be saved, and then keeps nothing on the device or the server', async () => {
    const { user, store, server, router } = renderApp('/workout');
    await user.click(await screen.findByRole('button', { name: 'Start workout' }));
    await user.click(await screen.findByRole('button', { name: 'End workout' }));
    const confirm = screen.getByRole('group', { name: 'End workout' });
    expect(confirm).toHaveTextContent(/no sets, so it will not be saved/i);
    await user.click(within(confirm).getByRole('button', { name: 'Yes, end it' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(await store.endedWorkouts(10)).toEqual([]);
    expect(await store.counts()).toEqual({ pending: 0, failed: 0 });
    // Give the sync a moment: it has nothing to send.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(server.workouts.size).toBe(0);
  });

  it('a workout that is started and never ended does not reach the server either', async () => {
    const { user, server, store } = renderApp('/workout');
    await user.click(await screen.findByRole('button', { name: 'Start workout' }));
    await screen.findByRole('button', { name: 'End workout' });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(server.workouts.size).toBe(0);
    expect(await store.counts()).toEqual({ pending: 0, failed: 0 });
  });

  it('a workout with a set is ended and kept, with the usual question', async () => {
    const userId = `empty-${Math.random()}`;
    const seed = renderApp('/', { userId, server: offlineServer() });
    const workout = await seed.store.startWorkout({
      ...aWorkout(),
      gymId: HOME_GYM.id,
      gymSnapshot: { barbellKg: 15, bars: HOME_GYM.bars },
    });
    await seed.store.logSet(aSet(workout.id));
    seed.unmount();
    const { user, store, router } = renderApp('/workout', { userId, server: offlineServer() });
    await user.click(await screen.findByRole('button', { name: 'End workout' }));
    const confirm = screen.getByRole('group', { name: 'End workout' });
    expect(confirm).toHaveTextContent(/start a new one afterwards/i);
    expect(confirm).not.toHaveTextContent(/will not be saved/i);
    await user.click(within(confirm).getByRole('button', { name: 'Yes, end it' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect((await store.endedWorkouts(10)).map((w) => w.id)).toEqual([workout.id]);
  });

  it('after the only set is undone the question changes back to "not saved"', async () => {
    const userId = `empty-${Math.random()}`;
    const seed = renderApp('/', { userId, server: offlineServer() });
    const workout = await seed.store.startWorkout({
      ...aWorkout(),
      gymId: HOME_GYM.id,
      gymSnapshot: { barbellKg: 15, bars: HOME_GYM.bars },
    });
    const set = await seed.store.logSet(aSet(workout.id));
    await seed.store.removeUnsyncedSet(set.id);
    seed.unmount();
    const { user, store } = renderApp('/workout', { userId, server: offlineServer() });
    await user.click(await screen.findByRole('button', { name: 'End workout' }));
    expect(screen.getByRole('group', { name: 'End workout' })).toHaveTextContent(
      /will not be saved/i,
    );
    await user.click(screen.getByRole('button', { name: 'Yes, end it' }));
    await waitFor(async () => expect(await store.getWorkout(workout.id)).toBeUndefined());
  });
});
