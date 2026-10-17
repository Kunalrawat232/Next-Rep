// Edge and negative cases for tap logging, through the whole app. A failing test here is a suspected bug: do not weaken it.
import { screen, waitFor, within } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import type { GymSnapshot } from '../../data/local/types';
import {
  BENCH,
  DUMBBELL_CURL,
  EZ_CURL,
  HOME_GYM,
  renderApp,
  offlineServer,
} from '../../test/appHarness';
import { aSet, aWorkout } from '../../test/localDb';
import { tapTogether } from '../../test/doubleTap';

const HOME: GymSnapshot = { barbellKg: 15, bars: HOME_GYM.bars };
const NO_EZ: GymSnapshot = { barbellKg: 15, bars: [] };

type Seed = { totalKg: number; perSide?: boolean };

async function openLog(
  exerciseId: string,
  options: { snapshot?: GymSnapshot | null; gymId?: string | null; sets?: Seed[] } = {},
) {
  const userId = `edge-${Math.random()}`;
  const seed = renderApp('/workout', { userId, server: offlineServer() });
  const workout = await seed.store.startWorkout({
    ...aWorkout(),
    gymId: options.gymId === undefined ? HOME_GYM.id : options.gymId,
    gymSnapshot: options.snapshot === undefined ? HOME : options.snapshot,
  });
  for (const [i, s] of (options.sets ?? []).entries())
    await seed.store.logSet(
      aSet(workout.id, {
        exerciseId,
        totalKg: s.totalKg,
        barKg: 15,
        perSideKg: (s.totalKg - 15) / 2,
        inputMode: s.perSide ? 'per_side' : 'total',
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
const logButton = () => screen.getByRole('button', { name: 'Log set' });

describe('reps that are not allowed', () => {
  it.each(['', '0', '101', '1.5', 'abc', '-3', '١٢', '1e1', ' '])(
    'disables Log set for reps %j',
    async (text) => {
      const { user } = await openLog(BENCH);
      await user.type(await weight(), '60');
      await user.clear(reps());
      if (text.trim() !== '') await user.type(reps(), text);
      expect(logButton()).toBeDisabled();
    },
  );

  it.each(['1', '100', ' 8 ', '007'])('accepts reps %j', async (text) => {
    const { user } = await openLog(BENCH);
    await user.type(await weight(), '60');
    await user.clear(reps());
    await user.type(reps(), text);
    expect(logButton()).toBeEnabled();
  });

  it('keeps the reps stepper between 1 and 100, and starts from 1 when the field is empty', async () => {
    const { user } = await openLog(BENCH);
    await weight();
    await user.clear(reps());
    await user.click(screen.getByRole('button', { name: /increase reps/i }));
    expect(reps()).toHaveValue('1');
    await user.clear(reps());
    await user.type(reps(), '100');
    await user.click(screen.getByRole('button', { name: /increase reps/i }));
    expect(reps()).toHaveValue('100');
    await user.clear(reps());
    await user.type(reps(), '1');
    await user.click(screen.getByRole('button', { name: /decrease reps/i }));
    expect(reps()).toHaveValue('1');
  });
});

describe('the weight field and its steppers', () => {
  it('has Log set disabled while the weight is empty or whitespace', async () => {
    const { user } = await openLog(BENCH);
    await weight();
    expect(logButton()).toBeDisabled();
    await user.type(await weight(), '   ');
    expect(logButton()).toBeDisabled();
  });

  it.each([
    ['Total weight', 'increase', '2.5'],
    ['Total weight', 'decrease', '0'],
    ['Per side', 'increase', '1.25'],
    ['Per side', 'decrease', '0'],
  ])('%s: tapping %s on an empty field gives %s', async (chip, direction, expected) => {
    const { user } = await openLog(BENCH);
    await user.click(await screen.findByRole('button', { name: chip }));
    await user.click(screen.getByRole('button', { name: new RegExp(`${direction} weight`, 'i') }));
    expect(await weight()).toHaveValue(expected);
  });

  it('steps a dumbbell by 2.5 Kg', async () => {
    const { user } = await openLog(DUMBBELL_CURL);
    await user.type(await weight(), '12.5');
    await user.click(screen.getByRole('button', { name: /increase weight/i }));
    expect(await weight()).toHaveValue('15');
  });

  it('steps from a typo back to a valid weight, never to NaN', async () => {
    const { user } = await openLog(BENCH);
    await user.type(await weight(), 'abc');
    await user.click(screen.getByRole('button', { name: /increase weight/i }));
    expect(await weight()).toHaveValue('2.5');
  });

  it('brings a typed 600 back to the limit when tapping minus', async () => {
    const { user } = await openLog(BENCH);
    await user.type(await weight(), '600');
    expect(logButton()).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /decrease weight/i }));
    expect(await weight()).toHaveValue('500');
    expect(logButton()).toBeEnabled();
  });

  it('refuses a per-side weight whose total passes the limit', async () => {
    const { user } = await openLog(BENCH);
    await user.click(await screen.findByRole('button', { name: 'Per side' }));
    await user.type(await weight(), '250');
    expect(logButton()).toBeDisabled();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('switching between total and per side', () => {
  it.each(['60', '60.01', '61.23', '62.5', '100', '15'])(
    'comes back to %s after going to per side and back',
    async (typed) => {
      const { user } = await openLog(BENCH);
      await user.type(await weight(), typed);
      await user.click(screen.getByRole('button', { name: 'Per side' }));
      await user.click(screen.getByRole('button', { name: 'Total weight' }));
      expect(await weight()).toHaveValue(typed);
    },
  );

  it('starts in per side when the last set was entered that way', async () => {
    await openLog(BENCH, { sets: [{ totalKg: 60, perSide: true }] });
    expect(await screen.findByRole('textbox', { name: /per side/i })).toHaveValue('22.5');
  });
});

describe('saving', () => {
  it('saves one set for a double tap on Log set', async () => {
    const { user, store, workout } = await openLog(BENCH);
    await user.type(await weight(), '60');
    tapTogether(logButton());
    await waitFor(async () => expect(await store.listSets(workout.id)).not.toHaveLength(0));
    expect(await store.listSets(workout.id)).toHaveLength(1);
  });

  it('saves a tapped big jump straight away, with the number that was tapped', async () => {
    const { user, store, workout } = await openLog(BENCH, { sets: [{ totalKg: 60 }] });
    await user.clear(await weight());
    await user.type(await weight(), '100');
    await user.click(logButton());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(async () => expect(await store.listSets(workout.id)).toHaveLength(2));
    expect((await store.listSets(workout.id)).map((s) => s.totalKg)).toContain(100);
  });

  it('saves the "total without the bar" reading as typed, with no bar, and lists it without a breakdown', async () => {
    const { user, store, workout, router } = await openLog(BENCH);
    await user.type(await weight(), '10');
    await user.click(logButton());
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /without the 15 Kg bar/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/workout'));
    expect((await store.listSets(workout.id))[0]).toMatchObject({
      totalKg: 10,
      barKg: null,
      perSideKg: null,
      inputMode: 'total',
    });
    const [item] = await within(
      await screen.findByRole('region', { name: 'Barbell Bench Press' }),
    ).findAllByRole('listitem');
    expect(item).toHaveTextContent('10 Kg × 8');
    expect(item!.textContent).not.toMatch(/-\d|plates|bar \+/);
  });

  it('links to the gym from the question, to change the bar', async () => {
    const { user } = await openLog(BENCH);
    await user.type(await weight(), '10');
    await user.click(logButton());
    expect(await screen.findByRole('link', { name: 'Change bar' })).toHaveAttribute('href', '/gym');
  });

  it('says it could not save, and lets you try again, when the workout is gone from the device', async () => {
    const { user, db, workout } = await openLog(BENCH);
    await user.type(await weight(), '60');
    await db.workouts.delete(workout.id);
    await user.click(logButton());
    // Either the save fails and can be tried again, or the page has already noticed the workout is gone.
    await waitFor(() => {
      const failed = screen.queryByRole('alert')?.textContent?.match(/could not save/i);
      const gone = screen.queryByRole('heading', { name: 'No workout is open' });
      expect(failed || gone).toBeTruthy();
    });
  });
});

describe('what the page is asked to show', () => {
  it.each(['/workout/log', '/workout/log?exercise=', `/workout/log?exercise=%3Cb%3E`])(
    'says the exercise is not found for %s',
    async (path) => {
      const userId = `edge-${Math.random()}`;
      const seed = renderApp('/workout', { userId, server: offlineServer() });
      await seed.store.startWorkout({ ...aWorkout(), gymId: HOME_GYM.id, gymSnapshot: HOME });
      seed.unmount();
      renderApp(path, { userId });
      expect(
        await screen.findByRole('heading', { name: 'Exercise not found' }),
      ).toBeInTheDocument();
    },
  );

  it('starts an exercise with no history empty, after another exercise with history', async () => {
    const { router } = await openLog(BENCH, { sets: [{ totalKg: 60 }] });
    expect(await weight()).toHaveValue('60');
    await act(() => router.navigate(`/workout/log?exercise=${DUMBBELL_CURL}`));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /dumbbell curl/i })).toBeVisible(),
    );
    expect(await weight()).toHaveValue('');
  });
});

describe('the gym kept on the workout', () => {
  it('uses a bar added to the gym after the workout started, when going back to log', async () => {
    const { gyms, userId, router } = await openLog(EZ_CURL, { snapshot: NO_EZ });
    expect(await screen.findByRole('heading', { name: /no ez bar set up/i })).toBeInTheDocument();
    await gyms.service.save(userId, HOME_GYM.id, {
      barbellKg: 15,
      bars: [{ name: 'EZ bar', weightKg: 7.5, kind: 'ez_bar' }],
    });
    await act(() => router.navigate('/workout'));
    await act(() => router.navigate(`/workout/log?exercise=${EZ_CURL}`));
    expect(await screen.findByRole('button', { name: 'Log set' })).toBeInTheDocument();
  });

  it('still offers to set up the bars when the workout has no saved gym', async () => {
    await openLog(BENCH, { snapshot: null, gymId: null });
    expect(await screen.findByRole('heading', { name: /no barbell set up/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /set up your bars/i })).toHaveAttribute('href', '/gym');
  });

  it('still logs dumbbells and bodyweight in a workout with no saved gym', async () => {
    const { user } = await openLog(DUMBBELL_CURL, { snapshot: null, gymId: null });
    await user.type(await weight(), '12.5');
    expect(logButton()).toBeEnabled();
  });
});
