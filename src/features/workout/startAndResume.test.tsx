import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sampleGym } from '../../test/fakeGyms';
import { BENCH, HOME_GYM, renderApp } from '../../test/appHarness';
import { aSet, aWorkout } from '../../test/localDb';

afterEach(() => vi.unstubAllGlobals());

describe('starting a workout', () => {
  it('asks for a gym first when there are none', async () => {
    const { router, user } = renderApp('/workout', { gyms: [] });
    expect(await screen.findByRole('heading', { name: /add a gym first/i })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Add a gym' }));
    expect(router.state.location.pathname).toBe('/gyms/new');
  });

  it('starts at the only gym, keeping the gym and its bars on the workout', async () => {
    const { user, store, server } = renderApp('/workout');
    await user.click(await screen.findByRole('button', { name: 'Start workout' }));
    expect(await screen.findByText('Home gym · 15 kg bar')).toBeInTheDocument();
    const workout = await store.activeWorkout();
    expect(workout).toMatchObject({ gymId: HOME_GYM.id, endedAt: null });
    expect(workout?.gymSnapshot).toEqual({ name: 'Home gym', barbellKg: 15, bars: HOME_GYM.bars });
    await waitFor(() => expect(server.workouts.has(workout!.id)).toBe(true));
  });

  it('pre-selects the default gym and starts at the one you choose', async () => {
    const office = sampleGym({
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Office gym',
      barbellKg: 20,
      isDefault: false,
      createdAt: '2026-10-02T10:00:00Z',
    });
    const { user, store } = renderApp('/workout', { gyms: [HOME_GYM, office] });
    expect(await screen.findByRole('radio', { name: /home gym/i })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: /office gym/i }));
    await user.click(screen.getByRole('button', { name: 'Start workout' }));
    expect(await screen.findByText('Office gym · 20 kg bar')).toBeInTheDocument();
    expect((await store.activeWorkout())?.gymId).toBe(office.id);
  });

  it('saves the gym list on the device each time it loads', async () => {
    const { store } = renderApp('/workout');
    await screen.findByRole('button', { name: 'Start workout' });
    await waitFor(async () =>
      expect((await store.cachedGyms())?.map((g) => g.name)).toEqual(['Home gym']),
    );
  });

  it('starts from the saved gyms when there is no connection, and says so', async () => {
    const first = renderApp('/workout', { userId: 'cached-user' });
    await screen.findByRole('button', { name: 'Start workout' });
    await waitFor(async () => expect(await first.store.cachedGyms()).not.toBeNull());
    first.unmount();
    const { user, store } = renderApp('/workout', { userId: 'cached-user', gymsFail: 'offline' });
    expect(await screen.findByText(/using the gyms saved on this device/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start workout' }));
    expect(await screen.findByText('Home gym · 15 kg bar')).toBeInTheDocument();
    expect((await store.activeWorkout())?.gymSnapshot?.barbellKg).toBe(15);
  });

  it('explains that one connection is needed when there is no connection and no saved gyms, and can retry', async () => {
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
      gymSnapshot: { name: 'Home gym', barbellKg: 15, bars: [] },
    });
    harness.unmount();
    return { workout, userId: harness.userId };
  }

  it('shows the open workout instead of starting a second one', async () => {
    const { workout, userId } = await withOpenWorkout();
    const { db } = renderApp('/workout', { userId });
    expect(await screen.findByText('Home gym · 15 kg bar')).toBeInTheDocument();
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
      await screen.findByRole('region', { name: 'Barbell Bench Press' }),
    ).findAllByRole('listitem');
    expect(list).toHaveLength(2);
    expect(list[0]).toHaveTextContent('60 kg × 8');
    expect(list[0]).toHaveTextContent('15 kg bar + 22.5 kg each side');
    expect(list[1]).toHaveTextContent('62.5 kg × 6');
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
      gymSnapshot: { name: 'Home gym', barbellKg: 15, bars: HOME_GYM.bars },
    });
    first.unmount();
    return renderApp(path, { userId });
  }

  it('asks you to choose one first, and tap logging waits for it', async () => {
    await openAt();
    expect(await screen.findByRole('link', { name: 'Choose exercise' })).toBeInTheDocument();
    expect(screen.getByText(/choose an exercise to log your first set/i)).toBeInTheDocument();
    const tap = screen.getByText('Tap instead');
    expect(tap).toHaveAttribute('aria-disabled', 'true');
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
