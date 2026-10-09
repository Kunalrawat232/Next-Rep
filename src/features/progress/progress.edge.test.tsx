import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GymSnapshot } from '../../data/local/types';
import {
  BENCH,
  DUMBBELL_CURL,
  HOME_GYM,
  PUSH_UP,
  renderApp,
  offlineServer,
} from '../../test/appHarness';
import { createFakeRemoteLog } from '../../test/fakeRemoteLog';
import { aSet, aWorkout, freshLocal, uuid } from '../../test/localDb';

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

/** Workouts already on the device (oldest first in time), then the app at a path, offline. */
async function openWith(seeds: WorkoutSeed[], path: string, beforeRender?: () => void) {
  const userId = `edge-${Math.random()}`;
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
  beforeRender?.();
  return { ...renderApp(path, { userId, server: offline() }), ids, userId, firstDb: first.db };
}

afterEach(() => vi.restoreAllMocks());

describe('bodyweight (0 kg) exercise', () => {
  const pushUps: WorkoutSeed[] = [
    { daysAgo: 3, sets: [{ exerciseId: PUSH_UP, totalKg: 0, reps: 10 }] },
    { daysAgo: 1, sets: [{ exerciseId: PUSH_UP, totalKg: 0, reps: 12 }] },
  ];

  it('claims no heaviest weight on the exercise page (a PR is never at 0 kg)', async () => {
    await openWith(pushUps, `/progress/${PUSH_UP}`);
    const records = await screen.findByRole('region', { name: 'Records' });
    expect(
      within(records).queryByRole('img', { name: /heaviest weight/i }),
    ).not.toBeInTheDocument();
    expect(records).not.toHaveTextContent(/Heaviest/);
    expect(records).toHaveTextContent('Most reps with body weight: 12');
  });

  it('claims no heaviest weight in the progress list', async () => {
    await openWith(pushUps, '/progress');
    const item = (await within(await screen.findByRole('main')).findAllByRole('listitem'))[0]!;
    expect(item).toHaveTextContent('Push-Up');
    expect(item).not.toHaveTextContent(/Heaviest/);
  });

  it('shows the rep record in the table and no weight record', async () => {
    await openWith(pushUps, `/progress/${PUSH_UP}`);
    const rows = within(await screen.findByRole('table'))
      .getAllByRole('row')
      .slice(1);
    expect(
      within(rows[0]!).getByRole('img', { name: /most reps at this weight/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /heaviest weight/i })).not.toBeInTheDocument();
  });
});

describe('what the screens do with odd data', () => {
  it('lists many exercises once each without duplicate-key warnings', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const exercises = Array.from({ length: 40 }, (_, i) => uuid(9000 + i));
    await openWith(
      [{ daysAgo: 1, sets: exercises.map((exerciseId) => ({ exerciseId, totalKg: 10, reps: 5 })) }],
      '/progress',
    );
    const items = await within(await screen.findByRole('main')).findAllByRole('listitem');
    expect(items).toHaveLength(40);
    expect(items.every((li) => li.textContent?.startsWith('Custom exercise'))).toBe(true);
    const keyWarnings = error.mock.calls.filter((call) => String(call[0]).includes('key'));
    expect(keyWarnings).toEqual([]);
  });

  it('shows an unknown but valid exercise that has sets, named as a custom exercise', async () => {
    const unknown = uuid(9500);
    await openWith(
      [
        { daysAgo: 4, sets: [{ exerciseId: unknown, totalKg: 20, reps: 5 }] },
        { daysAgo: 1, sets: [{ exerciseId: unknown, totalKg: 22.5, reps: 5 }] },
      ],
      `/progress/${unknown}`,
    );
    expect(await screen.findByRole('heading', { name: 'Custom exercise' })).toBeInTheDocument();
    const rows = within(await screen.findByRole('table'))
      .getAllByRole('row')
      .slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('22.5 kg × 5');
  });

  it('still charts sets whose workout is gone, without crashing', async () => {
    const seeded = await openWith(
      [
        { daysAgo: 4, sets: [{ totalKg: 60, reps: 8 }] },
        { daysAgo: 2, sets: [{ totalKg: 65, reps: 5 }] },
      ],
      '/',
    );
    await seeded.store; // the app is already mounted; the next lines change the device behind it
    await seeded.firstDb.workouts.delete(seeded.ids[0]!.workout);
    await act(async () => {
      await seeded.router.navigate(`/progress/${BENCH}`);
    });
    const rows = within(await screen.findByRole('table'))
      .getAllByRole('row')
      .slice(1);
    expect(rows).toHaveLength(2);
    expect(await screen.findByRole('region', { name: 'Records' })).toHaveTextContent(
      'Heaviest: 65 kg × 5',
    );
  });

  it('handles 100 reps and float-dust weights in the records list', async () => {
    await openWith(
      [
        { daysAgo: 3, sets: [{ exerciseId: DUMBBELL_CURL, totalKg: 0.3, reps: 99 }] },
        { daysAgo: 1, sets: [{ exerciseId: DUMBBELL_CURL, totalKg: 0.1 + 0.2, reps: 100 }] },
      ],
      `/progress/${DUMBBELL_CURL}`,
    );
    const records = await screen.findByRole('region', { name: 'Records' });
    expect(records).toHaveTextContent('Most reps at 0.3 kg: 100');
    expect(within(records).getAllByRole('listitem')).toHaveLength(1);
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(
      within(rows[0]!).getByRole('img', { name: /most reps at this weight/i }),
    ).toBeInTheDocument();
  });

  it('renders a long history of sessions as one row each', async () => {
    const seeds: WorkoutSeed[] = Array.from({ length: 60 }, (_, i) => ({
      daysAgo: 60 - i,
      sets: [{ totalKg: 40 + (i % 7) * 2.5, reps: 5 + (i % 4) }],
    }));
    const started = performance.now();
    await openWith(seeds, `/progress/${BENCH}`);
    const rows = within(await screen.findByRole('table'))
      .getAllByRole('row')
      .slice(1);
    expect(rows).toHaveLength(60);
    expect(performance.now() - started).toBeLessThan(5000);
  }, 10_000);

  it('offers Try again when the sets cannot be read, and recovers', async () => {
    // Each database makes its own table class, so find the shared prototype that owns `toArray`.
    let proto = Object.getPrototypeOf(freshLocal().db.sets) as object;
    while (!Object.prototype.hasOwnProperty.call(proto, 'toArray'))
      proto = Object.getPrototypeOf(proto) as object;
    const tableProto = proto as { toArray: (...args: unknown[]) => Promise<unknown[]> };
    const real = tableProto.toArray;
    const failFirstRead = () => {
      let failures = 1;
      vi.spyOn(tableProto, 'toArray').mockImplementation(function (
        this: { name: string },
        ...args
      ) {
        if (this.name === 'sets' && failures > 0) {
          failures -= 1;
          return Promise.reject(new Error('disk gone'));
        }
        return real.apply(this, args);
      });
    };
    const { user } = await openWith(
      [{ daysAgo: 1, sets: [{ totalKg: 60, reps: 8 }] }],
      '/progress',
      failFirstRead,
    );
    expect(
      await screen.findByText('Could not read your sets from this device.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: /Barbell Bench Press/ })).toBeInTheDocument();
    expect(
      screen.queryByText('Could not read your sets from this device.'),
    ).not.toBeInTheDocument();
  });
});

describe('moving between exercise pages', () => {
  const history: WorkoutSeed[] = [
    {
      daysAgo: 3,
      sets: [
        { totalKg: 70, reps: 3 },
        { exerciseId: DUMBBELL_CURL, totalKg: 12.5, reps: 10 },
      ],
    },
    { daysAgo: 1, sets: [{ exerciseId: DUMBBELL_CURL, totalKg: 15, reps: 8 }] },
  ];

  it('never shows the previous exercise sets under the next exercise', async () => {
    const { router } = await openWith(history, `/progress/${BENCH}`);
    await screen.findByRole('table');
    const seen: string[] = [];
    const observer = new MutationObserver(() => seen.push(document.body.textContent ?? ''));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    await act(async () => {
      await router.navigate(`/progress/${DUMBBELL_CURL}`);
    });
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Dumbbell Curl' })).toBeInTheDocument(),
    );
    await screen.findByText('15 kg × 8');
    observer.disconnect();
    expect(seen.some((text) => text.includes('Dumbbell Curl') && text.includes('70 kg × 3'))).toBe(
      false,
    );
    expect(screen.getByRole('region', { name: 'Records' })).toHaveTextContent(
      'Heaviest: 15 kg × 8',
    );
  });

  it('ends on the last page asked for after rapid navigation, with no stray errors', async () => {
    const { router } = await openWith(history, `/progress/${BENCH}`);
    await screen.findByRole('table');
    await act(async () => {
      void router.navigate(`/progress/${DUMBBELL_CURL}`);
      void router.navigate('/progress');
      void router.navigate(`/progress/${BENCH}`);
      void router.navigate(`/progress/${DUMBBELL_CURL}`);
      await router.navigate('/progress/not-an-id');
    });
    expect(await screen.findByRole('heading', { name: 'Exercise not found' })).toBeInTheDocument();
    await act(async () => {
      await router.navigate(`/progress/${BENCH}`);
    });
    expect(await screen.findByText('70 kg × 3')).toBeInTheDocument();
    expect(screen.queryByText('15 kg × 8')).not.toBeInTheDocument();
  });

  it('leaving the page while it is still loading does not break the next screen', async () => {
    const { router } = await openWith(history, `/progress/${BENCH}`);
    await act(async () => {
      await router.navigate('/history');
    });
    expect(await screen.findByRole('heading', { name: 'History' })).toBeInTheDocument();
  });
});

describe('undo and personal records', () => {
  const open = (sets: SetSeed[]): WorkoutSeed[] => [
    { daysAgo: 3, sets: [{ totalKg: 60, reps: 8 }] },
    { daysAgo: 0, open: true, sets },
  ];

  it('moves the banner to the earlier record set when the last one is undone', async () => {
    const { user } = await openWith(
      open([
        { totalKg: 62.5, reps: 5 },
        { totalKg: 65, reps: 5 },
      ]),
      `/workout?exercise=${BENCH}`,
    );
    expect(
      await screen.findByText(/New personal record: Barbell Bench Press, 65 kg × 5/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo last' }));
    expect(
      await screen.findByText(/New personal record: Barbell Bench Press, 62.5 kg × 5/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/65 kg × 5/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo last' }));
    await waitFor(() => expect(screen.queryByText(/New personal record/)).not.toBeInTheDocument());
  });

  it('shows the banner for a record that was hidden behind a later set once that set is undone', async () => {
    const { user } = await openWith(
      open([
        { totalKg: 62.5, reps: 5 },
        { totalKg: 60, reps: 8 },
      ]),
      `/workout?exercise=${BENCH}`,
    );
    await screen.findByRole('region', { name: 'Barbell Bench Press' });
    await waitFor(() =>
      expect(screen.getAllByRole('img', { name: /personal record/i })).toHaveLength(1),
    );
    expect(screen.queryByText(/New personal record/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo last' }));
    expect(
      await screen.findByText(/New personal record: Barbell Bench Press, 62.5 kg × 5/),
    ).toBeInTheDocument();
  });

  it('shows the lower record on the progress page after the record set is undone', async () => {
    const { user, router } = await openWith(
      open([{ totalKg: 65, reps: 5 }]),
      `/workout?exercise=${BENCH}`,
    );
    await screen.findByText(/New personal record/);
    await user.click(screen.getByRole('button', { name: 'Undo last' }));
    await waitFor(() => expect(screen.queryByText(/New personal record/)).not.toBeInTheDocument());
    await act(async () => {
      await router.navigate(`/progress/${BENCH}`);
    });
    expect(await screen.findByRole('region', { name: 'Records' })).toHaveTextContent(
      'Heaviest: 60 kg × 8',
    );
    expect(screen.queryByRole('img', { name: /personal record/i })).not.toBeInTheDocument();
  });
});

describe('record badges in a past workout', () => {
  it('does not mark a set that was beaten before it, even when a later session is heavier', async () => {
    const seeded = await openWith(
      [
        { daysAgo: 5, sets: [{ totalKg: 60, reps: 8 }] },
        { daysAgo: 3, sets: [{ totalKg: 70, reps: 3 }] },
        { daysAgo: 1, sets: [{ totalKg: 65, reps: 5 }] },
      ],
      '/',
    );
    await act(async () => {
      await seeded.router.navigate(`/history/${seeded.ids[2]!.workout}`);
    });
    const regions = await screen.findAllByRole('region', { name: 'Barbell Bench Press' });
    await within(regions.at(-1)!).findByText(/65 kg/);
    expect(screen.queryByRole('img', { name: /personal record/i })).not.toBeInTheDocument();
    await act(async () => {
      await seeded.router.navigate(`/history/${seeded.ids[1]!.workout}`);
    });
    await waitFor(() =>
      expect(screen.getByRole('img', { name: /heaviest weight/i })).toBeInTheDocument(),
    );
  });
});
