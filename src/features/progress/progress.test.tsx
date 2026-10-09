import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { GymSnapshot } from '../../data/local/types';
import { BENCH, DUMBBELL_CURL, HOME_GYM, renderApp, offlineServer } from '../../test/appHarness';
import { createFakeRemoteLog } from '../../test/fakeRemoteLog';
import { aSet, aWorkout } from '../../test/localDb';

const HOME: GymSnapshot = { name: 'Home gym', barbellKg: 15, bars: HOME_GYM.bars };

type SetSeed = { exerciseId?: string; totalKg: number; reps: number };
type WorkoutSeed = { daysAgo: number; sets: SetSeed[]; open?: boolean };

const at = (daysAgo: number) => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, 9, 0);
};

function offline() {
  const server = createFakeRemoteLog();
  server.setOffline(true);
  return server;
}

/** Workouts already on the device (oldest first in time), then the app at a path. */
async function openWith(seeds: WorkoutSeed[], path: string, userId = `prog-${Math.random()}`) {
  const first = renderApp('/', { userId, server: offlineServer() });
  const ids: { workout: string; sets: string[] }[] = [];
  for (const seed of seeds) {
    const start = at(seed.daysAgo);
    const workout = await first.store.startWorkout({
      ...aWorkout(),
      startedAt: start.toISOString(),
      gymId: HOME_GYM.id,
      gymSnapshot: HOME,
    });
    const setIds: string[] = [];
    for (const [i, s] of seed.sets.entries()) {
      const exerciseId = s.exerciseId ?? BENCH;
      const bar = exerciseId === BENCH;
      const set = aSet(workout.id, {
        exerciseId,
        totalKg: s.totalKg,
        barKg: bar ? 15 : null,
        perSideKg: bar ? (s.totalKg - 15) / 2 : null,
        inputMode: bar ? 'per_side' : 'total',
        reps: s.reps,
        loggedAt: new Date(start.getTime() + (i + 1) * 60_000).toISOString(),
      });
      await first.store.logSet(set);
      setIds.push(set.id);
    }
    if (!seed.open)
      await first.store.endWorkout(workout.id, new Date(start.getTime() + 3_600_000).toISOString());
    ids.push({ workout: workout.id, sets: setIds });
  }
  first.unmount();
  return { ...renderApp(path, { userId, server: offline() }), ids, userId };
}

const main = () => within(screen.getByRole('main'));

describe('the progress list', () => {
  it('says so when nothing is logged, and offers to start a workout', async () => {
    await openWith([], '/progress');
    expect(
      await screen.findByRole('heading', { name: 'Nothing to chart yet' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start workout' })).toHaveAttribute('href', '/workout');
  });

  it('lists each exercise once with its heaviest set, the one done last first', async () => {
    await openWith(
      [
        {
          daysAgo: 5,
          sets: [
            { totalKg: 60, reps: 8 },
            { totalKg: 70, reps: 3 },
          ],
        },
        { daysAgo: 2, sets: [{ exerciseId: DUMBBELL_CURL, totalKg: 12.5, reps: 10 }] },
        { daysAgo: 4, sets: [{ totalKg: 65, reps: 5 }] },
      ],
      '/progress',
    );
    const items = await within(await screen.findByRole('main')).findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Dumbbell Curl');
    expect(items[0]).toHaveTextContent('Heaviest 12.5 kg × 10');
    expect(items[1]).toHaveTextContent('Barbell Bench Press');
    expect(items[1]).toHaveTextContent('Heaviest 70 kg × 3');
  });

  it('opens an exercise, and is reached from the navigation', async () => {
    const { user, router } = await openWith(
      [{ daysAgo: 1, sets: [{ totalKg: 60, reps: 8 }] }],
      '/',
    );
    await user.click((await screen.findAllByRole('link', { name: 'Progress' }))[0]!);
    await user.click(await screen.findByRole('link', { name: /Barbell Bench Press/ }));
    expect(await screen.findByRole('heading', { name: 'Barbell Bench Press' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/progress/${BENCH}`);
  });
});

describe('one exercise', () => {
  const history: WorkoutSeed[] = [
    { daysAgo: 6, sets: [{ totalKg: 60, reps: 8 }] },
    {
      daysAgo: 4,
      sets: [
        { totalKg: 60, reps: 10 },
        { totalKg: 55, reps: 12 },
      ],
    },
    { daysAgo: 2, sets: [{ totalKg: 65, reps: 5 }] },
  ];

  it('shows the top set of each session as a table, newest first, with record badges', async () => {
    await openWith(history, `/progress/${BENCH}`);
    const table = await screen.findByRole('table', { name: 'Top set per session' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('65 kg × 5');
    expect(within(rows[0]!).getByRole('img', { name: /heaviest weight/i })).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent('60 kg × 10');
    expect(
      within(rows[1]!).getByRole('img', { name: /most reps at this weight/i }),
    ).toBeInTheDocument();
    expect(rows[2]).toHaveTextContent('60 kg × 8');
    expect(within(rows[2]!).queryByRole('img')).not.toBeInTheDocument();
  });

  it('lists the records: heaviest, and most reps at each weight', async () => {
    await openWith(history, `/progress/${BENCH}`);
    const records = await screen.findByRole('region', { name: 'Records' });
    expect(records).toHaveTextContent('Heaviest: 65 kg × 5');
    expect(records).toHaveTextContent('Most reps at 60 kg: 10');
    expect(records).toHaveTextContent('Most reps at 55 kg: 12');
  });

  it('draws the chart for sighted users only, without errors', async () => {
    await openWith(history, `/progress/${BENCH}`);
    await screen.findByRole('table');
    expect(main().queryByText('Log another session to see a trend.')).not.toBeInTheDocument();
    expect(
      document.querySelector('[aria-hidden="true"] .recharts-responsive-container'),
    ).not.toBeNull();
  });

  it('asks for another session when there is only one', async () => {
    await openWith([{ daysAgo: 1, sets: [{ totalKg: 60, reps: 8 }] }], `/progress/${BENCH}`);
    expect(await screen.findByText('Log another session to see a trend.')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('says there are no sets for an exercise never logged', async () => {
    await openWith([], `/progress/${BENCH}`);
    expect(await screen.findByRole('heading', { name: 'No sets logged yet' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Barbell Bench Press' })).toBeInTheDocument();
  });

  it('names an exercise it cannot find as a custom exercise', async () => {
    await openWith([], '/progress/00000000-0000-4000-8000-000000000001');
    expect(await screen.findByRole('heading', { name: 'Custom exercise' })).toBeInTheDocument();
  });

  it('never calls a built-in exercise custom while names load', async () => {
    const seen: string[] = [];
    const observer = new MutationObserver(() => seen.push(document.body.textContent ?? ''));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    await openWith(history, `/progress/${BENCH}`);
    await screen.findByRole('table');
    observer.disconnect();
    expect(seen.some((text) => text.includes('Custom exercise'))).toBe(false);
  });

  it.each(['not-an-id', '123'])('says it is not found for %s', async (id) => {
    await openWith([], `/progress/${id}`);
    expect(await screen.findByRole('heading', { name: 'Exercise not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to progress' })).toHaveAttribute(
      'href',
      '/progress',
    );
  });
});

describe('record badges on the workout', () => {
  it('marks a set that beat every earlier one, and announces a new record on the last set', async () => {
    await openWith(
      [
        { daysAgo: 3, sets: [{ totalKg: 60, reps: 8 }] },
        { daysAgo: 0, open: true, sets: [{ totalKg: 62.5, reps: 5 }] },
      ],
      `/workout?exercise=${BENCH}`,
    );
    const list = await screen.findByRole('region', { name: 'Barbell Bench Press' });
    expect(await within(list).findByRole('img', { name: /heaviest weight/i })).toBeInTheDocument();
    expect(
      await screen.findByText(/New personal record: Barbell Bench Press, 62.5 kg × 5/),
    ).toBeInTheDocument();
  });

  it('shows nothing for a set that is not a record', async () => {
    await openWith(
      [
        { daysAgo: 3, sets: [{ totalKg: 70, reps: 8 }] },
        { daysAgo: 0, open: true, sets: [{ totalKg: 60, reps: 8 }] },
      ],
      `/workout?exercise=${BENCH}`,
    );
    await screen.findByRole('region', { name: 'Barbell Bench Press' });
    await waitFor(() =>
      expect(screen.queryByRole('img', { name: /personal record/i })).not.toBeInTheDocument(),
    );
    expect(screen.queryByText(/New personal record/)).not.toBeInTheDocument();
  });

  it('takes the banner and badge away when the record set is undone', async () => {
    const { user } = await openWith(
      [
        { daysAgo: 3, sets: [{ totalKg: 60, reps: 8 }] },
        { daysAgo: 0, open: true, sets: [{ totalKg: 62.5, reps: 5 }] },
      ],
      `/workout?exercise=${BENCH}`,
    );
    await screen.findByText(/New personal record/);
    await user.click(screen.getByRole('button', { name: 'Undo last' }));
    await waitFor(() => expect(screen.queryByText(/New personal record/)).not.toBeInTheDocument());
    expect(screen.queryByRole('img', { name: /personal record/i })).not.toBeInTheDocument();
  });

  it('marks records in a past workout too', async () => {
    const userId = `past-${Math.random()}`;
    const seeded = await openWith(
      [
        { daysAgo: 3, sets: [{ totalKg: 60, reps: 8 }] },
        { daysAgo: 1, sets: [{ totalKg: 65, reps: 5 }] },
      ],
      '/history',
      userId,
    );
    seeded.unmount();
    renderApp(`/history/${seeded.ids[1]!.workout}`, { userId, server: offline() });
    const region = await screen.findByRole('region', { name: 'Barbell Bench Press' });
    expect(
      await within(region).findByRole('img', { name: /heaviest weight/i }),
    ).toBeInTheDocument();
  });

  it('does not badge the heaviest line when that set was never a record', async () => {
    await openWith([{ daysAgo: 1, sets: [{ totalKg: 60, reps: 8 }] }], `/progress/${BENCH}`);
    const records = await screen.findByRole('region', { name: 'Records' });
    expect(within(records).queryByRole('img')).not.toBeInTheDocument();
  });

  it('plots two sessions on the same day as two rows', async () => {
    await openWith(
      [
        { daysAgo: 1, sets: [{ totalKg: 60, reps: 8 }] },
        { daysAgo: 1, sets: [{ totalKg: 62.5, reps: 8 }] },
      ],
      `/progress/${BENCH}`,
    );
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(3);
  });
});
