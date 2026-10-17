import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GymSnapshot } from '../../data/local/types';
import {
  BENCH,
  DUMBBELL_CURL,
  HOME_GYM,
  PUSH_UP,
  offlineServer,
  renderApp,
} from '../../test/appHarness';
import { aSet, aWorkout } from '../../test/localDb';
import type { Unit } from '../../domain/schemas';

const HOME: GymSnapshot = { barbellKg: 15, bars: HOME_GYM.bars };

type SetSeed = { exerciseId?: string; totalKg: number; reps: number; bar?: boolean };
type Seed = { start: Date; end?: Date | null; sets: SetSeed[] };

const localTime = (daysAgo: number, hour: number, minute = 0) => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, hour, minute);
};

function offline() {
  return offlineServer();
}

async function openWith(seeds: Seed[], path: string, unit?: Unit) {
  const userId = `qa-${Math.random()}`;
  const first = renderApp('/', { userId, server: offlineServer() });
  const ids: { workout: string; sets: string[] }[] = [];
  for (const seed of seeds) {
    const workout = await first.store.startWorkout({
      ...aWorkout(),
      startedAt: seed.start.toISOString(),
      gymId: HOME_GYM.id,
      gymSnapshot: HOME,
    });
    const setIds: string[] = [];
    for (const [i, s] of seed.sets.entries()) {
      const exerciseId = s.exerciseId ?? BENCH;
      const withBar = s.bar ?? exerciseId === BENCH;
      const set = aSet(workout.id, {
        exerciseId,
        totalKg: s.totalKg,
        reps: s.reps,
        barKg: withBar ? 15 : null,
        perSideKg: withBar ? (s.totalKg - 15) / 2 : null,
        inputMode: withBar ? 'per_side' : 'total',
        loggedAt: new Date(seed.start.getTime() + (i + 1) * 60_000).toISOString(),
      });
      await first.store.logSet(set);
      setIds.push(set.id);
    }
    if (seed.end !== null)
      await first.store.endWorkout(
        workout.id,
        (seed.end ?? new Date(seed.start.getTime() + 3_600_000)).toISOString(),
      );
    ids.push({ workout: workout.id, sets: setIds });
  }
  first.unmount();
  return { ...renderApp(path, { userId, server: offline(), unit }), ids, userId };
}

const main = () => within(screen.getByRole('main'));
const listRows = async () => within(await screen.findByRole('main')).findAllByRole('listitem');
const many = (n: number): Seed[] =>
  Array.from({ length: n }, (_, i) => ({
    start: localTime(i + 1, 9),
    sets: [{ totalKg: 60, reps: 8 }],
  }));

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('QA history paging boundaries', () => {
  it.each([
    [0, 0, false],
    [1, 1, false],
    [19, 19, false],
    [20, 20, false],
    [21, 20, true],
    [40, 20, true],
  ])('with %i finished workouts shows %i rows, Show more: %s', async (total, shown, more) => {
    await openWith(many(total), '/history');
    if (total === 0) {
      expect(await screen.findByText('No finished workouts yet')).toBeInTheDocument();
    } else {
      expect(await listRows()).toHaveLength(shown);
    }
    const button = screen.queryByRole('button', { name: 'Show more' });
    expect(Boolean(button)).toBe(more);
  });

  it('reaches workout 41 through two taps, then the button is gone', async () => {
    const { user } = await openWith(many(41), '/history');
    expect(await listRows()).toHaveLength(20);
    await user.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(main().getAllByRole('listitem')).toHaveLength(40));
    await user.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(main().getAllByRole('listitem')).toHaveLength(41));
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
  });

  it('has no Show more at exactly 40 after one tap (no empty last page)', async () => {
    const { user } = await openWith(many(40), '/history');
    await user.click(await screen.findByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(main().getAllByRole('listitem')).toHaveLength(40));
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
  });
});

describe('QA history across midnight', () => {
  it('names a workout by the day it started, with its real duration, when it ends after midnight', async () => {
    await openWith(
      [{ start: localTime(1, 23, 50), end: localTime(0, 0, 20), sets: [{ totalKg: 60, reps: 8 }] }],
      '/history',
    );
    const [row] = await listRows();
    expect(row).toHaveTextContent('Yesterday');
    expect(row).toHaveTextContent('30 min');
    expect(row).not.toHaveTextContent('Today');
  });

  it('lists a workout that began just before midnight above an older one, and keeps both', async () => {
    await openWith(
      [
        { start: localTime(2, 23, 59), sets: [{ totalKg: 60, reps: 8 }] },
        { start: localTime(1, 0, 1), sets: [{ totalKg: 60, reps: 8 }] },
      ],
      '/history',
    );
    const rows = await listRows();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Yesterday');
  });
});

describe('QA history detail for every kind of weight', () => {
  const seeds: Seed[] = [
    {
      start: localTime(3, 9),
      sets: [
        { exerciseId: DUMBBELL_CURL, totalKg: 22.5, reps: 10, bar: false },
        { exerciseId: PUSH_UP, totalKg: 0, reps: 12, bar: false },
        { exerciseId: PUSH_UP, totalKg: 10, reps: 6, bar: false },
        { exerciseId: BENCH, totalKg: 60, reps: 8 },
      ],
    },
  ];

  it('shows a dumbbell per dumbbell with no bar line, and bodyweight as added weight (0 allowed)', async () => {
    const { ids, user } = await openWith(seeds, '/history');
    const row = (await listRows())[0]!;
    expect(row).toHaveTextContent('4 sets');
    expect(row).toHaveTextContent('3 exercises');
    // Open it from the list.
    await user.click(within(row).getByRole('link'));
    const detail = await screen.findByRole('heading', { level: 1 });
    expect(detail).toBeInTheDocument();
    const curl = await screen.findByRole('region', { name: 'Dumbbell Curl' });
    expect(within(curl).getByText('22.5 Kg × 10')).toBeInTheDocument();
    expect(curl).not.toHaveTextContent('bar');
    const pushUp = screen.getByRole('region', { name: 'Push-Up' });
    expect(within(pushUp).getByText('0 Kg × 12')).toBeInTheDocument();
    expect(within(pushUp).getByText('10 Kg × 6')).toBeInTheDocument();
    expect(pushUp).not.toHaveTextContent('bar');
    const bench = screen.getByRole('region', { name: 'Barbell Bench Press' });
    expect(bench).toHaveTextContent('15 Kg bar + 22.5 Kg each side');
    expect(ids).toHaveLength(1);
  });

  it('shows the same sets in lb, and never touches the stored kg', async () => {
    const { ids, db, user } = await openWith(seeds, '/history', 'lb');
    await user.click(within((await listRows())[0]!).getByRole('link'));
    const curl = await screen.findByRole('region', { name: 'Dumbbell Curl' });
    expect(within(curl).getByText('49.6 Lb × 10')).toBeInTheDocument();
    const bench = screen.getByRole('region', { name: 'Barbell Bench Press' });
    expect(bench).toHaveTextContent('132.3 Lb × 8');
    expect(bench).toHaveTextContent('33.1 Lb bar');
    const rows = await db.sets.toArray();
    expect(rows.map((r) => r.totalKg).sort((a, b) => a - b)).toEqual([0, 10, 22.5, 60]);
    expect(ids).toHaveLength(1);
  });

  it('gives a bodyweight rep record and no weight record for 0 Kg, across two workouts', async () => {
    const { user } = await openWith(
      [
        {
          start: localTime(5, 9),
          sets: [{ exerciseId: PUSH_UP, totalKg: 0, reps: 10, bar: false }],
        },
        {
          start: localTime(1, 9),
          sets: [
            { exerciseId: PUSH_UP, totalKg: 0, reps: 12, bar: false },
            { exerciseId: PUSH_UP, totalKg: 0, reps: 12, bar: false },
            { exerciseId: PUSH_UP, totalKg: 5, reps: 3, bar: false },
          ],
        },
      ],
      '/history',
    );
    await user.click(within((await listRows())[0]!).getByRole('link'));
    const pushUp = await screen.findByRole('region', { name: 'Push-Up' });
    await waitFor(() =>
      expect(
        within(pushUp)
          .getAllByRole('img')
          .map((b) => b.getAttribute('aria-label')),
      ).toEqual(['Personal record: most reps at this weight', 'Personal record: heaviest weight']),
    );
    const items = within(pushUp).getAllByRole('listitem');
    // 12 reps (beats 10), the same 12 again (a tie is not a record), then 5 kg (heavier).
    expect(within(items[0]!).getByRole('img')).toHaveAccessibleName(/most reps/);
    expect(within(items[1]!).queryByRole('img')).not.toBeInTheDocument();
    expect(within(items[2]!).getByRole('img')).toHaveAccessibleName(/heaviest/);
  });
});

describe('QA kg to lb to kg changes nothing in the records', () => {
  it.each(['kg', 'lb'] as const)(
    'in %s, a 60 Kg set logged twice is not a record, while a heavier one is (positive control)',
    async (unit) => {
      const { user } = await openWith(
        [
          { start: localTime(3, 9), sets: [{ totalKg: 60, reps: 8 }] },
          { start: localTime(2, 9), sets: [{ totalKg: 60, reps: 8 }] },
          { start: localTime(1, 9), sets: [{ totalKg: 62.5, reps: 8 }] },
        ],
        '/history',
        unit,
      );
      await user.click(within((await listRows())[0]!).getByRole('link'));
      const heavier = await screen.findByRole('region', { name: 'Barbell Bench Press' });
      expect(await within(heavier).findByRole('img')).toHaveAccessibleName(/heaviest/);
      await user.click(screen.getByRole('link', { name: 'Back' }));
      await user.click(within((await listRows())[1]!).getByRole('link'));
      const same = await screen.findByRole('region', { name: 'Barbell Bench Press' });
      expect(same).toHaveTextContent(unit === 'kg' ? '60 Kg × 8' : '132.3 Lb × 8');
      // Marks are read from the device after the first paint: give them time to show up.
      await act(async () => new Promise((resolve) => setTimeout(resolve, 100)));
      expect(within(same).queryAllByRole('img')).toHaveLength(0);
    },
  );
});
