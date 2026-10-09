import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GymSnapshot } from '../../data/local/types';
import { BENCH, HOME_GYM, renderApp } from '../../test/appHarness';
import { createFakeRemoteLog } from '../../test/fakeRemoteLog';
import { aSet, aWorkout } from '../../test/localDb';

const HOME: GymSnapshot = { name: 'Home gym', barbellKg: 15, bars: HOME_GYM.bars };

type Seed = {
  startedAt: string;
  endedAt?: string | null;
  sets?: number;
  /** Written straight to the database, past the store's own checks. */
  rawStartedAt?: string;
  rawEndedAt?: string;
};

const main = () => within(screen.getByRole('main'));
const rows = async () => within(await screen.findByRole('main')).findAllByRole('listitem');

const offline = () => {
  const server = createFakeRemoteLog();
  server.setOffline(true);
  return server;
};

/** Workouts already on the device, then the app at a path. */
async function openWith(seeds: Seed[], path = '/history') {
  const userId = `edge-${Math.random()}`;
  const first = renderApp('/', { userId });
  const ids: string[] = [];
  for (const seed of seeds) {
    const workout = await first.store.startWorkout({
      ...aWorkout(),
      startedAt: seed.startedAt,
      gymId: HOME_GYM.id,
      gymSnapshot: HOME,
    });
    ids.push(workout.id);
    const count = seed.sets ?? 1;
    const base = Date.parse(seed.startedAt);
    for (let i = 0; i < count; i += 1)
      await first.store.logSet(
        aSet(workout.id, {
          exerciseId: BENCH,
          loggedAt: new Date(base + (i + 1) * 1000).toISOString(),
        }),
      );
    if (seed.endedAt !== null)
      await first.store.endWorkout(
        workout.id,
        seed.endedAt ?? new Date(base + 45 * 60_000).toISOString(),
      );
    if (seed.rawStartedAt !== undefined)
      await first.db.workouts.update(workout.id, { startedAt: seed.rawStartedAt });
    if (seed.rawEndedAt !== undefined)
      await first.db.workouts.update(workout.id, { endedAt: seed.rawEndedAt });
  }
  first.unmount();
  return { ...renderApp(path, { userId, server: offline() }), ids, userId };
}

const daysAgo = (n: number) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - n, 9, 0).toISOString();
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('history paging', () => {
  it('shows every workout exactly once when many started at the same instant', async () => {
    const same = '2026-09-01T09:00:00.000Z';
    const { user } = await openWith(Array.from({ length: 45 }, () => ({ startedAt: same })));
    expect(await rows()).toHaveLength(20);
    await user.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(main().getAllByRole('listitem')).toHaveLength(40));
    await user.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(main().getAllByRole('listitem')).toHaveLength(45));
    const hrefs = main()
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'));
    expect(new Set(hrefs).size).toBe(45);
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
  });

  it('survives two Show more taps before the list has redrawn', async () => {
    await openWith(Array.from({ length: 45 }, (_, i) => ({ startedAt: daysAgo(i + 1) })));
    await rows();
    const button = screen.getByRole('button', { name: 'Show more' });
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    await waitFor(() => expect(main().getAllByRole('listitem')).toHaveLength(45));
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
  });

  it('still lets the user reach older workouts when the newest twenty finished workouts have no sets', async () => {
    const empty = Array.from({ length: 20 }, (_, i) => ({ startedAt: daysAgo(i + 1), sets: 0 }));
    const older = [30, 31, 32].map((n) => ({ startedAt: daysAgo(n) }));
    const { user } = await openWith([...empty, ...older]);
    await screen.findByRole('main');
    // Either the older workouts are shown, or there is a way to ask for them.
    await waitFor(async () => {
      const more = screen.queryByRole('button', { name: 'Show more' });
      if (more) await user.click(more);
      expect(main().queryAllByRole('listitem')).toHaveLength(3);
    });
  });

  it('does not tell the user there is nothing when older workouts with sets exist', async () => {
    const empty = Array.from({ length: 20 }, (_, i) => ({ startedAt: daysAgo(i + 1), sets: 0 }));
    await openWith([...empty, { startedAt: daysAgo(40) }]);
    await screen.findByRole('main');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByRole('heading', { name: 'No finished workouts yet' })).toBeNull();
  });
});

describe('history rows with odd data', () => {
  it('shows a workout that ended before it started, without a duration or a crash', async () => {
    await openWith([
      {
        startedAt: daysAgo(1),
        rawEndedAt: new Date(Date.parse(daysAgo(1)) - 3_600_000).toISOString(),
      },
    ]);
    const [item] = await rows();
    expect(item).toHaveTextContent('Yesterday');
    expect(item).toHaveTextContent('1 set');
    expect(item).not.toHaveTextContent(/\b\d+ (min|h)\b/);
  });

  it('shows an unreadable start as an unknown date and keeps the rest of the list', async () => {
    await openWith([{ startedAt: daysAgo(1), rawStartedAt: 'garbage' }, { startedAt: daysAgo(2) }]);
    const items = await rows();
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.textContent).join('|')).toContain('Unknown date');
  });

  it('counts a large workout correctly in the list and the detail page', async () => {
    const { user } = await openWith([{ startedAt: daysAgo(1), sets: 250 }]);
    const [item] = await rows();
    expect(item).toHaveTextContent('Home gym · 250 sets · 1 exercise');
    await user.click(item!.querySelector('a')!);
    const region = await screen.findByRole('region', { name: 'Barbell Bench Press' });
    expect(within(region).getAllByRole('listitem')).toHaveLength(250);
    expect(screen.getByText(/Home gym · 250 sets/)).toBeInTheDocument();
  });
});

describe('workout detail with odd data', () => {
  it('shows a workout that ended before it started without a duration', async () => {
    const seeded = await openWith(
      [
        {
          startedAt: daysAgo(1),
          rawEndedAt: new Date(Date.parse(daysAgo(1)) - 3_600_000).toISOString(),
        },
      ],
      '/',
    );
    seeded.unmount();
    renderApp(`/history/${seeded.ids[0]}`, { userId: seeded.userId, server: offline() });
    expect(await screen.findByRole('heading', { name: 'Yesterday' })).toBeInTheDocument();
    expect(screen.getByText(/Home gym · 1 set$/)).toBeInTheDocument();
  });

  it('says not found for sets whose workout is gone, and the list ignores them', async () => {
    const seeded = await openWith([{ startedAt: daysAgo(1) }], '/');
    const orphan = '00000000-0000-4000-8000-0000000000aa';
    const template = (await seeded.db.sets.toCollection().first())!;
    await seeded.db.sets.put({
      ...template,
      id: '00000000-0000-4000-8000-0000000000ab',
      workoutId: orphan,
    });
    seeded.unmount();
    renderApp(`/history/${orphan}`, { userId: seeded.userId, server: offline() });
    expect(await screen.findByRole('heading', { name: 'Workout not found' })).toBeInTheDocument();
  });

  it('lists only the workout that exists when an orphan set is on the device', async () => {
    const seeded = await openWith([{ startedAt: daysAgo(1) }], '/');
    const template = (await seeded.db.sets.toCollection().first())!;
    await seeded.db.sets.put({
      ...template,
      id: '00000000-0000-4000-8000-0000000000ac',
      workoutId: '00000000-0000-4000-8000-0000000000ad',
    });
    seeded.unmount();
    renderApp('/history', { userId: seeded.userId, server: offline() });
    expect(await rows()).toHaveLength(1);
  });

  it.each(['00000000-0000-4000-8000-00000000000G', '%20'])(
    'treats the address %j as not found',
    async (id) => {
      renderApp(`/history/${id}`, { server: offline() });
      expect(await screen.findByRole('heading', { name: 'Workout not found' })).toBeInTheDocument();
    },
  );
});
