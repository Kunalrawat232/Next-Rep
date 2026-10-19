import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { GymSnapshot } from '../../data/local/types';
import { BENCH, HOME_GYM, offlineServer, renderApp } from '../../test/appHarness';
import { aWorkout } from '../../test/localDb';

const HOME: GymSnapshot = { barbellKg: 15, bars: HOME_GYM.bars };

/** An open workout on the device, then the tap form for bench press. */
async function openLog() {
  const userId = `journey-${Math.random()}`;
  const seed = renderApp('/workout', { userId, server: offlineServer() });
  await seed.store.startWorkout({ ...aWorkout(), gymId: HOME_GYM.id, gymSnapshot: HOME });
  seed.unmount();
  return renderApp(`/workout/log?exercise=${BENCH}`, { userId, server: offlineServer() });
}

async function logOneSet(app: Pick<Awaited<ReturnType<typeof openLog>>, 'user' | 'router'>) {
  const weight = await screen.findByRole('textbox', { name: /^weight/i });
  await app.user.clear(weight);
  await app.user.type(weight, '20');
  await app.user.clear(screen.getByRole('textbox', { name: 'Reps' }));
  await app.user.type(screen.getByRole('textbox', { name: 'Reps' }), '8');
  await app.user.click(screen.getByRole('button', { name: 'Log set' }));
  await waitFor(() => expect(app.router.state.location.pathname).toBe('/workout'));
}

describe('the round Workout button', () => {
  it('is on the other screens, and is not on the workout screens, where it would cover their buttons', async () => {
    const history = renderApp('/history');
    await screen.findByRole('heading', { name: 'History' });
    // The tab bar link and the round button.
    expect(screen.getAllByRole('link', { name: 'Workout' })).toHaveLength(2);
    history.unmount();

    const workout = renderApp('/workout');
    await screen.findByRole('heading', { name: 'Workout' });
    expect(screen.getAllByRole('link', { name: 'Workout' })).toHaveLength(1);
    workout.unmount();

    renderApp(`/workout/log?exercise=${BENCH}`);
    await screen.findByText('No workout is open');
    expect(screen.getAllByRole('link', { name: 'Workout' })).toHaveLength(1);
  });
});

describe('starting the rest after a set', () => {
  it('starts the usual 1:30 by itself after a set is logged by tapping', async () => {
    const app = await openLog();
    await logOneSet(app);
    expect(await screen.findByRole('button', { name: /^Rest 1:(30|29)$/ })).toBeInTheDocument();
  });

  it('does not start one when the person turned it off, and remembers that', async () => {
    const first = await openLog();
    await logOneSet(first);
    await first.user.click(await screen.findByRole('button', { name: /^Rest/ }));
    await first.user.click(screen.getByRole('button', { name: 'Stop rest' }));
    await first.user.click(await screen.findByRole('button', { name: /^Rest/ }));
    await first.user.click(screen.getByRole('switch', { name: 'Start after each set' }));
    first.unmount();

    const second = renderApp(`/workout/log?exercise=${BENCH}`, {
      userId: first.userId,
      server: offlineServer(),
    });
    await logOneSet(second);
    expect(await screen.findByRole('button', { name: 'Rest' })).toBeInTheDocument();
  });

  it('uses the length the person picked last time', async () => {
    const first = await openLog();
    await logOneSet(first);
    await first.user.click(await screen.findByRole('button', { name: /^Rest/ }));
    await first.user.click(screen.getByRole('button', { name: '120 s' }));
    first.unmount();

    const second = renderApp(`/workout/log?exercise=${BENCH}`, {
      userId: first.userId,
      server: offlineServer(),
    });
    await logOneSet(second);
    expect(
      await screen.findByRole('button', { name: /^Rest 2:00$|^Rest 1:59$/ }),
    ).toBeInTheDocument();
  });
});
