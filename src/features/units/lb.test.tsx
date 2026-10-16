import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { fromDisplay } from '../../domain/units';
import {
  BENCH,
  DUMBBELL_CURL,
  HOME_GYM,
  offlineServer,
  renderApp,
  PUSH_UP,
} from '../../test/appHarness';
import { sampleGym } from '../../test/fakeGyms';
import { aSet, aWorkout } from '../../test/localDb';
import type { GymSnapshot } from '../../data/local/types';

afterEach(() => localStorage.clear());

const BAR_45 = fromDisplay(45, 'lb'); // a 45 lb bar, stored as 20.41 kg
const LB_GYM = sampleGym({
  id: '33333333-3333-4333-8333-333333333333',
  barbellKg: BAR_45,
  bars: [{ id: 'ez', name: 'EZ bar', weightKg: fromDisplay(25, 'lb'), kind: 'ez_bar' }],
});
const SNAPSHOT: GymSnapshot = { barbellKg: LB_GYM.barbellKg, bars: LB_GYM.bars };

type SetSeed = { exerciseId?: string; totalKg: number; reps?: number; mode?: 'total' | 'per_side' };

/** Finished workouts and an open one on the device, then the app at a path, in lb. */
async function openLb(
  path: string,
  options: {
    open?: SetSeed[];
    past?: SetSeed[][];
    userId?: string;
    unit?: 'kg' | 'lb';
    /** The bar of the gym the workout started in, in kg. */
    barKg?: number;
    /** Seed the past sets as entered per side, as stored in kg. */
    perSide?: boolean;
    /** The gym on the server; null for a user who has none. The lb gym when missing. */
    gym?: typeof LB_GYM | null;
  } = {},
) {
  const barKg = options.barKg ?? BAR_45;
  const snapshot: GymSnapshot = { ...SNAPSHOT, barbellKg: barKg };
  // The gym list the app reads has the same bar, or the workout would take the list's bar.
  const gym = { ...LB_GYM, barbellKg: barKg };
  const userId = options.userId ?? `lb-${Math.random()}`;
  const seed = renderApp('/', { userId, server: offlineServer(), gym: gym });
  const ids: string[] = [];
  const addSets = async (workoutId: string, sets: SetSeed[], day: number) => {
    for (const [i, s] of sets.entries()) {
      const exerciseId = s.exerciseId ?? BENCH;
      const hasBar = exerciseId === BENCH;
      await seed.store.logSet(
        aSet(workoutId, {
          exerciseId,
          totalKg: s.totalKg,
          barKg: hasBar ? barKg : null,
          perSideKg: hasBar && options.perSide ? (s.totalKg - barKg) / 2 : null,
          inputMode: hasBar && options.perSide ? 'per_side' : 'total',
          reps: s.reps ?? 8,
          loggedAt: new Date(2026, 9, day, 9, i + 1).toISOString(),
        }),
      );
    }
  };
  for (const [n, sets] of (options.past ?? []).entries()) {
    const w = await seed.store.startWorkout({
      ...aWorkout(),
      startedAt: new Date(2026, 9, 1 + n, 9).toISOString(),
      gymId: LB_GYM.id,
      gymSnapshot: snapshot,
    });
    ids.push(w.id);
    await addSets(w.id, sets, 1 + n);
    await seed.store.endWorkout(w.id, new Date(2026, 9, 1 + n, 10).toISOString());
  }
  if (options.open) {
    const w = await seed.store.startWorkout({
      ...aWorkout(),
      startedAt: new Date(2026, 9, 8, 9).toISOString(),
      gymId: LB_GYM.id,
      gymSnapshot: snapshot,
    });
    ids.push(w.id);
    await addSets(w.id, options.open, 8);
  }
  seed.unmount();
  return {
    ...renderApp(path, {
      userId,
      unit: options.unit ?? 'lb',
      server: offlineServer(),
      gym: options.gym === undefined ? gym : options.gym,
    }),
    ids,
    userId,
  };
}

const weight = () => screen.findByRole('textbox', { name: /^weight/i });
const kgWord = /\bkg\b/i;

describe('every screen in lb shows no kg', () => {
  const history = [
    [
      { totalKg: fromDisplay(135, 'lb'), reps: 8 },
      { exerciseId: DUMBBELL_CURL, totalKg: fromDisplay(30, 'lb'), reps: 10 },
    ],
    [
      { totalKg: fromDisplay(155, 'lb'), reps: 5 },
      { exerciseId: PUSH_UP, totalKg: 0, reps: 12 },
    ],
  ];

  const pages: [string, () => string, string][] = [
    ['Home', () => '/', 'Ready to lift?'],
    ['the workout', () => '/workout?exercise=' + BENCH, 'Barbell Bench Press'],
    ['Log set', () => '/workout/log?exercise=' + BENCH, 'Weight breakdown'],
    ['Log set for a dumbbell', () => '/workout/log?exercise=' + DUMBBELL_CURL, 'Log set'],
    ['History', () => '/history', 'History'],
    ['Progress', () => '/progress', 'Progress'],
    ['an exercise’s progress', () => `/progress/${BENCH}`, 'Records'],
    ['your gym', () => '/gym', 'Barbell weight'],
    ['Settings', () => '/settings', 'Settings'],
  ];

  it.each(pages)('%s', async (_name, path, marker) => {
    await openLb(path(), { past: history, open: [{ totalKg: fromDisplay(135, 'lb') }] });
    await screen.findAllByText(new RegExp(marker, 'i'));
    await new Promise((resolve) => setTimeout(resolve, 150));
    const text = (document.body.textContent ?? '').replace('They are always saved in kg.', '');
    expect(text).not.toMatch(kgWord);
  });

  it('a past workout', async () => {
    const seeded = await openLb('/history', { past: history });
    await screen.findAllByText(/Barbell Bench Press|History/);
    seeded.unmount();
    renderApp(`/history/${seeded.ids[0]}`, {
      userId: seeded.userId,
      unit: 'lb',
      server: offlineServer(),
      gym: LB_GYM,
    });
    await screen.findByRole('region', { name: 'Barbell Bench Press' });
    expect(document.body.textContent).not.toMatch(kgWord);
    expect(document.body.textContent).toContain('135 lb × 8');
  });

  it('the question about a weight below the bar', async () => {
    const { user } = await openLb('/workout/log?exercise=' + BENCH, { open: [] });
    await user.type(await weight(), '30');
    await user.click(screen.getByRole('button', { name: 'Log set' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).not.toMatch(kgWord);
    expect(dialog.textContent).toContain('30 lb is less than the 45 lb bar');
  });

  it('still shows kg for a kg user', async () => {
    await openLb('/progress', { past: [[{ totalKg: 60 }]], unit: 'kg' });
    expect(await screen.findByText(/Heaviest 60 kg/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\blb\b/);
  });
});

describe('logging a set in lb', () => {
  it('shows 135 lb on a 45 lb bar as 45 lb on each side, and stores 61.23 kg', async () => {
    const { user, store, ids, router } = await openLb('/workout/log?exercise=' + BENCH, {
      open: [],
    });
    await user.type(await weight(), '135');
    const card = screen.getByRole('region', { name: 'Weight breakdown' });
    expect(card).toHaveTextContent('45 lb each side × 2');
    expect(card).toHaveTextContent('+ bar45 lb');
    expect(within(card).getByText('Total').nextSibling).toHaveTextContent('135 lb');
    await user.click(screen.getByRole('button', { name: 'Log set' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/workout'));
    const [set] = await store.listSets(ids[0]!);
    expect(set).toMatchObject({ totalKg: 61.23, barKg: BAR_45, source: 'tap' });
    expect(await screen.findByText('135 lb × 8')).toBeInTheDocument();
    expect(screen.getByText('45 lb bar + 45 lb each side')).toBeInTheDocument();
  });

  it('stores a weight typed per side as the same kg as the same total', async () => {
    const total = await openLb('/workout/log?exercise=' + BENCH, { open: [] });
    await total.user.type(await weight(), '140');
    await total.user.click(screen.getByRole('button', { name: 'Log set' }));
    await waitFor(() => expect(total.router.state.location.pathname).toBe('/workout'));
    const [viaTotal] = await total.store.listSets(total.ids[0]!);
    total.unmount();

    const side = await openLb('/workout/log?exercise=' + BENCH, { open: [] });
    await side.user.click(await screen.findByRole('button', { name: 'Per side' }));
    await side.user.type(await weight(), '47.5');
    expect(screen.getByRole('region', { name: 'Weight breakdown' })).toHaveTextContent('140 lb');
    await side.user.click(screen.getByRole('button', { name: 'Log set' }));
    await waitFor(() => expect(side.router.state.location.pathname).toBe('/workout'));
    const [viaSide] = await side.store.listSets(side.ids[0]!);
    expect(viaSide!.totalKg).toBe(viaTotal!.totalKg);
    expect(viaSide!.totalKg).toBe(fromDisplay(140, 'lb'));
  });

  it('does not call the same weight logged twice, once per side, a record', async () => {
    const { user, router, store, ids } = await openLb('/workout/log?exercise=' + BENCH, {
      past: [[{ totalKg: fromDisplay(140, 'lb'), reps: 8 }]],
      open: [],
    });
    await user.click(await screen.findByRole('button', { name: 'Per side' }));
    await user.clear(await weight());
    await user.type(await weight(), '47.5');
    await user.click(screen.getByRole('button', { name: 'Log set' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/workout'));
    expect((await store.listSets(ids.at(-1)!))[0]!.totalKg).toBe(fromDisplay(140, 'lb'));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(screen.queryByText(/New personal record/)).not.toBeInTheDocument();
  });

  it('starts from the last set, and saves it untouched as exactly the same kg (no false record)', async () => {
    const { user, router, store, ids } = await openLb('/workout/log?exercise=' + BENCH, {
      past: [[{ totalKg: 60, reps: 8 }]],
      open: [],
    });
    expect(await weight()).toHaveValue('132.3');
    await user.click(screen.getByRole('button', { name: 'Log set' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/workout'));
    expect((await store.listSets(ids.at(-1)!))[0]!.totalKg).toBe(60);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(screen.queryByText(/New personal record/)).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /personal record/i })).not.toBeInTheDocument();
  });

  it('saves a last set that was entered per side as exactly the same kg, untouched (no false record)', async () => {
    // 60 kg on a 20 kg bar, entered per side: 44.1 lb a side, and 132.3 lb would be 60.01 kg.
    const { user, router, store, ids } = await openLb('/workout/log?exercise=' + BENCH, {
      past: [[{ totalKg: 60, reps: 8 }]],
      open: [],
      barKg: 20,
      perSide: true,
    });
    expect(await screen.findByRole('textbox', { name: /per side/i })).toHaveValue('44.1');
    await user.click(screen.getByRole('button', { name: 'Log set' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/workout'));
    expect((await store.listSets(ids.at(-1)!))[0]!.totalKg).toBe(60);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(screen.queryByText(/New personal record/)).not.toBeInTheDocument();
  });

  it('does not say the bar is heavier than a total that shows the same', async () => {
    // A 25 kg bar shows as 55.1 lb, and 55.1 lb is 24.99 kg.
    const { user, router, store, ids } = await openLb('/workout/log?exercise=' + BENCH, {
      open: [],
      barKg: 25,
    });
    await user.type(await weight(), '55.1');
    expect(screen.queryByText(/less than the/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Log set' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/workout'));
    expect((await store.listSets(ids.at(-1)!))[0]!.totalKg).toBe(25);
  });

  it('keeps 135.5 lb typed as 45.25 lb a side', async () => {
    const { user, router, store, ids } = await openLb('/workout/log?exercise=' + BENCH, {
      open: [],
    });
    await user.click(await screen.findByRole('button', { name: 'Per side' }));
    await user.type(await weight(), '45.25');
    expect(screen.getByRole('region', { name: 'Weight breakdown' })).toHaveTextContent('135.5 lb');
    await user.click(screen.getByRole('button', { name: 'Log set' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/workout'));
    expect((await store.listSets(ids.at(-1)!))[0]!.totalKg).toBe(fromDisplay(135.5, 'lb'));
  });

  it('steps by 5 lb for a total and 2.5 lb per side', async () => {
    const { user } = await openLb('/workout/log?exercise=' + BENCH, { open: [] });
    await user.type(await weight(), '135');
    await user.click(screen.getByRole('button', { name: /increase weight/i }));
    expect(screen.getByRole('textbox', { name: /total/i })).toHaveValue('140');
    await user.click(screen.getByRole('button', { name: 'Per side' }));
    expect(screen.getByRole('textbox', { name: /per side/i })).toHaveValue('47.5');
    await user.click(screen.getByRole('button', { name: /increase weight/i }));
    expect(screen.getByRole('textbox', { name: /per side/i })).toHaveValue('50');
    await user.click(screen.getByRole('button', { name: 'Total weight' }));
    expect(screen.getByRole('textbox', { name: /total/i })).toHaveValue('145');
  });

  it('labels the field in lb', async () => {
    await openLb('/workout/log?exercise=' + BENCH, { open: [] });
    await weight();
    expect(screen.getByText('lb', { selector: 'span' })).toBeInTheDocument();
  });

  it('warns about a weight that is not a whole 2.5 lb plate pair, and not about 135, 185 or 225', async () => {
    const { user } = await openLb('/workout/log?exercise=' + BENCH, { open: [] });
    for (const total of ['135', '185', '225']) {
      await user.clear(await weight());
      await user.type(await weight(), total);
      expect(screen.queryByText(/not a multiple/i)).not.toBeInTheDocument();
    }
    await user.clear(await weight());
    await user.type(await weight(), '137.5');
    expect(
      await screen.findByText('46.3 lb per side is not a multiple of 2.5 lb. Check the plates.'),
    ).toBeInTheDocument();
  });
});

describe('the gym screen in lb', () => {
  it('offers 45 and 35 lb presets for a new gym, and stores 45 lb as 20.41 kg', async () => {
    const { user, gyms } = await openLb('/gym', { unit: 'lb', gym: null });
    const group = await screen.findByRole('group', { name: 'Barbell presets' });
    expect(group).toHaveTextContent('45 lb35 lb');
    expect(await screen.findByLabelText('Barbell weight (lb)')).toHaveValue('45');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(gyms.service.save).toHaveBeenCalled());
    expect(gyms.service.save.mock.calls[0]![2]).toMatchObject({ barbellKg: 20.41 });
  });

  it('shows a 15 kg bar as 33.1 lb, and saves the gym untouched with exactly 15 kg', async () => {
    const userId = 'gym-lb-user';
    const { user, gyms } = renderApp('/gym', {
      userId,
      unit: 'lb',
      gym: sampleGym({
        ...HOME_GYM,
        barbellKg: 15,
        bars: [{ id: 'ez', name: 'EZ bar', weightKg: 7.5, kind: 'ez_bar' }],
      }),
    });
    expect(await screen.findByLabelText('Barbell weight (lb)')).toHaveValue('33.1');
    expect(screen.getByLabelText('EZ bar weight (lb)')).toHaveValue('16.5');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(gyms.service.save).toHaveBeenCalled());
    const input = gyms.service.save.mock.calls[0]![2];
    expect(input.barbellKg).toBe(15);
    expect(input.bars[0]!.weightKg).toBe(7.5);
  });

  it('says what is wrong in lb', async () => {
    const { user } = await openLb('/gym', { unit: 'lb', gym: null });
    const field = await screen.findByLabelText('Barbell weight (lb)');
    await user.clear(field);
    await user.type(field, '300');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Use a weight between 0 and 220.4 lb.')).toBeInTheDocument();
  });

  it('lists the bars in lb', async () => {
    await openLb('/workout', { unit: 'lb' });
    expect(await screen.findByText('Barbell 45 lb · EZ bar 25 lb')).toBeInTheDocument();
  });
});

describe('Settings in lb', () => {
  it('shows your bars in lb', async () => {
    await openLb('/settings', { unit: 'lb' });
    expect(await screen.findByText('Barbell 45 lb · EZ bar 25 lb')).toBeInTheDocument();
  });

  it('switches every screen at once, without a reload', async () => {
    const { user, router } = await openLb('/settings', {
      past: [[{ totalKg: fromDisplay(135, 'lb') }]],
      unit: 'kg',
    });
    await router.navigate('/history');
    expect(await screen.findByText(/1 set/)).toBeInTheDocument();
    await router.navigate('/settings');
    const group = await screen.findByRole('group', { name: 'Weight unit' });
    await user.click(within(group).getByRole('button', { name: 'lb' }));
    expect(await screen.findByText('Barbell 45 lb · EZ bar 25 lb')).toBeInTheDocument();
    await user.click(
      within(await screen.findByRole('group', { name: 'Weight unit' })).getByRole('button', {
        name: 'kg',
      }),
    );
    expect(await screen.findByText('Barbell 20.41 kg · EZ bar 11.34 kg')).toBeInTheDocument();
  });
});

describe('records are the same in both units', () => {
  it('shows the heaviest set in lb on the exercise page, and as a record', async () => {
    await openLb(`/progress/${BENCH}`, {
      past: [
        [{ totalKg: fromDisplay(135, 'lb'), reps: 8 }],
        [{ totalKg: fromDisplay(145, 'lb'), reps: 5 }],
      ],
    });
    const records = await screen.findByRole('region', { name: 'Records' });
    expect(records).toHaveTextContent('Heaviest: 145 lb × 5');
    expect(records).toHaveTextContent('Most reps at 135 lb: 8');
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('145 lb × 5');
  });
});
