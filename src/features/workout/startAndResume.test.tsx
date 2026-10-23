import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BENCH, HOME_GYM, renderApp } from '../../test/appHarness';
import { aSet, aWorkout } from '../../test/localDb';

afterEach(() => vi.unstubAllGlobals());

describe('starting a workout', () => {
  it('sets the gym up with a standard barbell on the first workout, then starts', async () => {
    const { user, store, gyms } = renderApp('/workout', { gym: null });
    expect(await screen.findByText(/standard 20 Kg barbell/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start workout' }));
    expect(await screen.findByText('20 Kg bar')).toBeInTheDocument();
    expect(gyms.service.save).toHaveBeenCalledTimes(1);
    expect(gyms.service.save.mock.calls[0]![2]).toEqual({ barbellKg: 20, bars: [] });
    const workout = await store.activeWorkout();
    expect(workout?.gymId).toBe(gyms.current()?.id);
    expect(workout?.gymSnapshot).toEqual({ barbellKg: 20, bars: [] });
  });

  it('starts a user who works in pounds with a 45 Lb barbell', async () => {
    const { user, gyms } = renderApp('/workout', { gym: null, unit: 'lb' });
    expect(await screen.findByText(/standard 45 Lb barbell/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start workout' }));
    await waitFor(() => expect(gyms.service.save).toHaveBeenCalled());
    expect(gyms.service.save.mock.calls[0]![2]).toMatchObject({ barbellKg: 20.41 });
  });

  it('needs a connection once to set the gym up, and a retry makes the same gym, not a second', async () => {
    const { user, store, gyms } = renderApp('/workout', { gym: null });
    await screen.findByText(/standard 20 Kg barbell/i);
    gyms.failNext('save', 'offline');
    await user.click(screen.getByRole('button', { name: 'Start workout' }));
    expect(await screen.findByText(/setting up your gym needs a connection/i)).toBeInTheDocument();
    expect(await store.activeWorkout()).toBeUndefined();
    await user.click(screen.getByRole('button', { name: 'Start workout' }));
    expect(await screen.findByText('20 Kg bar')).toBeInTheDocument();
    expect(gyms.service.save).toHaveBeenCalledTimes(2);
    expect(gyms.service.save.mock.calls[0]![1]).toBe(gyms.service.save.mock.calls[1]![1]);
    expect(await store.activeWorkout()).toMatchObject({ gymId: gyms.current()?.id });
  });

  it('says so when the gym was set up on another device in the meantime', async () => {
    const { user, gyms } = renderApp('/workout', { gym: null });
    await screen.findByText(/standard 20 Kg barbell/i);
    gyms.failNext('save', 'conflict');
    await user.click(screen.getByRole('button', { name: 'Start workout' }));
    expect(await screen.findByText(/set up on another device/i)).toBeInTheDocument();
  });

  it('starts at your gym, keeping the gym and its bars on the workout', async () => {
    const { user, store, server, gyms } = renderApp('/workout');
    await user.click(await screen.findByRole('button', { name: 'Start workout' }));
    expect(await screen.findByText('15 Kg bar')).toBeInTheDocument();
    const workout = await store.activeWorkout();
    expect(workout).toMatchObject({ gymId: HOME_GYM.id, endedAt: null });
    expect(workout?.gymSnapshot).toEqual({ barbellKg: 15, bars: HOME_GYM.bars });
    expect(gyms.service.save).not.toHaveBeenCalled();
    // An empty workout is not kept: it is not sent until its first set is logged.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(server.workouts.has(workout!.id)).toBe(false);
  });

  it('shows your bars and a way to change them', async () => {
    renderApp('/workout');
    const bars = await screen.findByRole('region', { name: 'Your bars' });
    expect(within(bars).getByText(/barbell 15 Kg · ez bar 7.5 Kg/i)).toBeInTheDocument();
    expect(within(bars).getByRole('link', { name: 'Change bars' })).toHaveAttribute('href', '/gym');
  });

  it('saves the gym on the device each time it loads', async () => {
    const { store } = renderApp('/workout');
    await screen.findByRole('button', { name: 'Start workout' });
    await waitFor(async () =>
      expect(await store.cachedGym()).toMatchObject({ gym: { id: HOME_GYM.id, barbellKg: 15 } }),
    );
  });

  it('starts from the saved gym when there is no connection, and says so', async () => {
    const first = renderApp('/workout', { userId: 'cached-user' });
    await screen.findByRole('button', { name: 'Start workout' });
    await waitFor(async () => expect(await first.store.cachedGym()).not.toBeNull());
    first.unmount();
    const { user, store } = renderApp('/workout', { userId: 'cached-user', gymsFail: 'offline' });
    expect(await screen.findByText(/using the gym saved on this device/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start workout' }));
    expect(await screen.findByText('15 Kg bar')).toBeInTheDocument();
    expect((await store.activeWorkout())?.gymSnapshot?.barbellKg).toBe(15);
  });

  it('explains that one connection is needed when there is no connection and no saved gym, and can retry', async () => {
    const { user } = renderApp('/workout', { gymsFail: 'offline' });
    expect(await screen.findByRole('alert')).toHaveTextContent(/connect once/i);
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByRole('button', { name: 'Start workout' })).toBeInTheDocument();
  });

  it('reaches the page from Home, from the floating mic and from the sidebar', async () => {
    const { router, user } = renderApp('/');
    await user.click(await screen.findByRole('link', { name: 'Start workout' }));
    expect(router.state.location.pathname).toBe('/workout');
    await router.navigate('/');
    await user.click((await screen.findAllByRole('link', { name: 'Workout' }))[0]!);
    expect(router.state.location.pathname).toBe('/workout');
    expect(screen.getAllByRole('link', { name: 'Workout' }).length).toBeGreaterThan(0);
  });
});

describe('resuming', () => {
  async function withOpenWorkout() {
    const harness = renderApp('/workout', { userId: `resume-${Math.random()}` });
    const workout = await harness.store.startWorkout({
      ...aWorkout(),
      gymId: HOME_GYM.id,
      gymSnapshot: { barbellKg: 15, bars: [] },
    });
    harness.unmount();
    return { workout, userId: harness.userId };
  }

  it('shows the open workout instead of starting a second one', async () => {
    const { workout, userId } = await withOpenWorkout();
    const { db } = renderApp('/workout', { userId });
    expect(await screen.findByText('15 Kg bar')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start workout' })).not.toBeInTheDocument();
    expect(await db.workouts.count()).toBe(1);
    expect((await db.workouts.toArray())[0]?.id).toBe(workout.id);
  });

  it('lists the sets already logged, under their exercise, numbered, with the bar breakdown', async () => {
    const { workout, userId } = await withOpenWorkout();
    const { store } = renderApp('/workout?exercise=' + BENCH, { userId });
    await store.logSet(
      aSet(workout.id, { exerciseId: BENCH, totalKg: 60, barKg: 15, perSideKg: 22.5, reps: 8 }),
    );
    await store.logSet(
      aSet(workout.id, {
        exerciseId: BENCH,
        totalKg: 62.5,
        barKg: 15,
        perSideKg: 23.75,
        reps: 6,
        loggedAt: '2026-10-10T10:10:00.000Z',
      }),
    );
    // a reload shows them
    const second = renderApp('/workout?exercise=' + BENCH, { userId });
    const list = await within(
      await screen.findByRole('region', { name: 'Sets so far' }),
    ).findAllByRole('listitem');
    expect(list).toHaveLength(2);
    expect(list[0]).toHaveTextContent('60 Kg × 8');
    expect(list[0]).toHaveTextContent('15 Kg bar + 22.5 Kg each side');
    expect(list[1]).toHaveTextContent('62.5 Kg × 6');
    second.unmount();
  });
});

describe('the exercise', () => {
  async function openAt(path = '/workout') {
    const userId = `ex-${Math.random()}`;
    const first = renderApp(path, { userId });
    await first.store.startWorkout({
      ...aWorkout(),
      gymId: HOME_GYM.id,
      gymSnapshot: { barbellKg: 15, bars: HOME_GYM.bars },
    });
    first.unmount();
    return renderApp(path, { userId });
  }

  it('asks you to choose one first, and tap logging waits for it', async () => {
    await openAt();
    expect(await screen.findByRole('link', { name: 'Choose exercise' })).toBeInTheDocument();
    expect(screen.getByText(/choose an exercise to log your first set/i)).toBeInTheDocument();
    // There is no dead "Tap instead": the way forward is a real link to the picker.
    expect(screen.queryByText('Tap instead')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pick an exercise' })).toHaveAttribute(
      'href',
      '/workout/exercise',
    );
  });

  it('is chosen from the picker and then shown in the header', async () => {
    const { user, router } = await openAt();
    await user.click(await screen.findByRole('link', { name: 'Choose exercise' }));
    expect(router.state.location.pathname).toBe('/workout/exercise');
    await user.type(
      await screen.findByRole('searchbox', { name: 'Search exercises' }),
      'barbell bench press',
    );
    await user.click(await screen.findByRole('button', { name: /^Barbell Bench Press/ }));
    expect(router.state.location.pathname).toBe('/workout');
    expect(router.state.location.search).toBe(`?exercise=${BENCH}`);
    expect(await screen.findByRole('link', { name: 'Barbell Bench Press' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tap instead' })).toHaveAttribute(
      'href',
      `/workout/log?exercise=${BENCH}`,
    );
  });

  it('can be closed without choosing', async () => {
    const { user, router } = await openAt('/workout/exercise');
    await user.click(await screen.findByRole('link', { name: 'Close' }));
    expect(router.state.location.pathname).toBe('/workout');
  });
});
