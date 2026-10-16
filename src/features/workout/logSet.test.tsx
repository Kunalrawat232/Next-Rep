import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { GymSnapshot } from '../../data/local/types';
import {
  BENCH,
  DUMBBELL_CURL,
  EZ_CURL,
  HOME_GYM,
  PUSH_UP,
  renderApp,
  offlineServer,
} from '../../test/appHarness';
import { aSet, aWorkout } from '../../test/localDb';

const HOME: GymSnapshot = { barbellKg: 15, bars: HOME_GYM.bars };
const NO_EZ: GymSnapshot = { barbellKg: 15, bars: [] };

/** An open workout already on the device, then the log screen for an exercise. */
async function openLog(exerciseId: string, snapshot: GymSnapshot = HOME, withSets: number[] = []) {
  const userId = `log-${Math.random()}`;
  const seed = renderApp('/workout', { userId, server: offlineServer() });
  const workout = await seed.store.startWorkout({
    ...aWorkout(),
    gymId: HOME_GYM.id,
    gymSnapshot: snapshot,
  });
  for (const [i, totalKg] of withSets.entries())
    await seed.store.logSet(
      aSet(workout.id, {
        exerciseId,
        totalKg,
        barKg: 15,
        perSideKg: (totalKg - 15) / 2,
        inputMode: 'total',
        reps: 8,
        loggedAt: `2026-10-10T10:0${i}:00.000Z`,
      }),
    );
  seed.unmount();
  const app = renderApp(`/workout/log?exercise=${exerciseId}`, { userId });
  return { ...app, workout };
}

const weight = () => screen.findByRole('textbox', { name: /^weight/i });
const reps = () => screen.getByRole('textbox', { name: 'Reps' });

describe('logging a barbell set by tapping', () => {
  it('works out the total from a weight per side, and shows the breakdown', async () => {
    const { user } = await openLog(BENCH);
    await user.click(await screen.findByRole('button', { name: 'Per side' }));
    await user.type(await weight(), '22.5');
    const card = screen.getByRole('region', { name: 'Weight breakdown' });
    expect(card).toHaveTextContent('15 kg');
    expect(card).toHaveTextContent('22.5 kg');
    expect(within(card).getByText('Total').nextSibling).toHaveTextContent('60 kg');
  });

  it('saves the total including the bar, the bar used, the mode and source tap', async () => {
    const { user, store, workout, router } = await openLog(BENCH);
    await user.click(await screen.findByRole('button', { name: 'Per side' }));
    await user.type(await weight(), '22.5');
    await user.clear(reps());
    await user.type(reps(), '8');
    await user.click(screen.getByRole('button', { name: 'Log set' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/workout'));
    const [set] = await store.listSets(workout.id);
    expect(set).toMatchObject({
      totalKg: 60,
      barKg: 15,
      perSideKg: 22.5,
      reps: 8,
      source: 'tap',
      inputMode: 'per_side',
      rawTranscript: null,
    });
  });

  it('keeps the same real weight when switching between total and per side', async () => {
    const { user } = await openLog(BENCH);
    await user.type(await weight(), '60');
    await user.click(screen.getByRole('button', { name: 'Per side' }));
    expect(screen.getByRole('textbox', { name: /per side/i })).toHaveValue('22.5');
    await user.click(screen.getByRole('button', { name: 'Total weight' }));
    expect(screen.getByRole('textbox', { name: /total/i })).toHaveValue('60');
  });

  it('steps a total by 2.5 kg, a weight per side by 1.25 kg, and reps by one', async () => {
    const { user } = await openLog(BENCH);
    await user.type(await weight(), '60');
    await user.click(screen.getByRole('button', { name: /increase weight/i }));
    expect(screen.getByRole('textbox', { name: /total/i })).toHaveValue('62.5');
    await user.click(screen.getByRole('button', { name: 'Per side' }));
    await user.click(screen.getByRole('button', { name: /increase weight/i }));
    expect(screen.getByRole('textbox', { name: /per side/i })).toHaveValue('25');
    await user.click(screen.getByRole('button', { name: /increase reps/i }));
    expect(reps()).toHaveValue('9');
    await user.click(screen.getByRole('button', { name: /decrease reps/i }));
    await user.click(screen.getByRole('button', { name: /decrease reps/i }));
    expect(reps()).toHaveValue('7');
  });

  it('accepts a decimal comma and refuses a thousands separator', async () => {
    const { user } = await openLog(BENCH);
    await user.type(await weight(), '62,5');
    expect(screen.getByRole('button', { name: 'Log set' })).toBeEnabled();
    await user.clear(await weight());
    await user.type(await weight(), '1,000');
    expect(screen.getByText(/enter a number/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log set' })).toBeDisabled();
  });

  it('starts from the last set of this exercise, even from an earlier workout', async () => {
    await openLog(BENCH, HOME, [57.5]);
    expect(await weight()).toHaveValue('57.5');
    expect(reps()).toHaveValue('8');
  });

  it('starts empty when the exercise has never been logged', async () => {
    await openLog(BENCH);
    expect(await weight()).toHaveValue('');
  });
});

describe('asking before saving', () => {
  it('offers both readings when the total is below the bar, and saves the chosen one', async () => {
    const { user, store, workout } = await openLog(BENCH);
    await user.type(await weight(), '10');
    await user.click(screen.getByRole('button', { name: 'Log set' }));
    const dialog = await screen.findByRole('dialog');
    const options = within(dialog)
      .getAllByRole('button')
      .filter((b) => b.textContent !== 'Cancel');
    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(await store.listSets(workout.id)).toHaveLength(0);
    await user.click(options[0]!);
    await waitFor(async () => expect(await store.listSets(workout.id)).toHaveLength(1));
  });

  it('saves nothing when the prompt is cancelled, by button or Escape', async () => {
    const { user, store, workout } = await openLog(BENCH);
    await user.type(await weight(), '10');
    await user.click(screen.getByRole('button', { name: 'Log set' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Log set' }));
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await store.listSets(workout.id)).toHaveLength(0);
  });

  it('saves a tapped 16 after a 60 with a warning, and never asks "Did you mean 60?"', async () => {
    const { user, store, workout } = await openLog(BENCH, HOME, [60]);
    await user.clear(await weight());
    await user.type(await weight(), '16');
    expect(screen.queryByText(/did you mean|sounds like/i)).not.toBeInTheDocument();
    expect((await screen.findAllByRole('status')).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Log set' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(async () =>
      expect(
        (await store.listSets(workout.id)).map((x) => x.totalKg).sort((a, b) => a - b),
      ).toEqual([16, 60]),
    );
  });

  it('disables Log set and says why when the weight is refused', async () => {
    const { user } = await openLog(BENCH);
    await user.type(await weight(), '9999');
    expect(screen.getByRole('button', { name: 'Log set' })).toBeDisabled();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('other equipment', () => {
  it('logs a dumbbell weight as it is, per dumbbell, with no bar breakdown', async () => {
    const { user, store, workout } = await openLog(DUMBBELL_CURL);
    expect(screen.queryByRole('button', { name: 'Per side' })).not.toBeInTheDocument();
    await user.type(await weight(), '12.5');
    await user.click(screen.getByRole('button', { name: 'Log set' }));
    await waitFor(async () =>
      expect((await store.listSets(workout.id))[0]).toMatchObject({ totalKg: 12.5, barKg: null }),
    );
  });

  it('allows zero added weight for a bodyweight exercise', async () => {
    const { user, store, workout } = await openLog(PUSH_UP);
    await user.type(await weight(), '0');
    await user.click(screen.getByRole('button', { name: 'Log set' }));
    await waitFor(async () =>
      expect((await store.listSets(workout.id))[0]).toMatchObject({ totalKg: 0 }),
    );
  });

  it('blocks an EZ bar exercise when the gym has no EZ bar, and links to set it', async () => {
    const { workout } = await openLog(EZ_CURL, NO_EZ);
    expect(await screen.findByRole('heading', { name: /no ez bar set up/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Set up your bars' })).toHaveAttribute('href', '/gym');
    expect(screen.queryByRole('button', { name: 'Log set' })).not.toBeInTheDocument();
    expect(workout.id).toBeTruthy();
  });

  it('uses the EZ bar weight from the gym', async () => {
    const { user, store, workout } = await openLog(EZ_CURL);
    await user.type(await weight(), '20');
    await user.click(screen.getByRole('button', { name: 'Log set' }));
    await waitFor(async () =>
      expect((await store.listSets(workout.id))[0]).toMatchObject({ totalKg: 20, barKg: 7.5 }),
    );
  });

  it('says so when the exercise does not exist', async () => {
    await openLog('00000000-0000-4000-8000-000000000000');
    expect(await screen.findByRole('heading', { name: 'Exercise not found' })).toBeInTheDocument();
  });

  it('says so when no workout is open', async () => {
    renderApp(`/workout/log?exercise=${BENCH}`);
    expect(await screen.findByRole('heading', { name: 'No workout is open' })).toBeInTheDocument();
  });
});

describe('after saving', () => {
  it('syncs the set to the server, and asks for lasting storage once', async () => {
    const { user, server, workout } = await openLog(BENCH);
    await user.type(await weight(), '60');
    await user.click(screen.getByRole('button', { name: 'Log set' }));
    await waitFor(() => expect(server.sets.size).toBe(1));
    expect(workout.id).toBeTruthy();
  });
});
