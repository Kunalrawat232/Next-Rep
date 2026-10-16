import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { dayLabel } from '../../domain/history';
import type { GymSnapshot } from '../../data/local/types';
import { BENCH, DUMBBELL_CURL, HOME_GYM, renderApp, offlineServer } from '../../test/appHarness';
import { createFakeRemoteLog } from '../../test/fakeRemoteLog';
import { aSet, aWorkout } from '../../test/localDb';

const HOME: GymSnapshot = { barbellKg: 15, bars: HOME_GYM.bars };

type SetSeed = { exerciseId?: string; totalKg?: number; reps?: number; synced?: boolean };
type WorkoutSeed = {
  daysAgo: number;
  minutes?: number;
  sets?: SetSeed[];
  open?: boolean;
  synced?: boolean;
};

const main = () => within(screen.getByRole('main'));
const rows = async () => within(await screen.findByRole('main')).findAllByRole('listitem');

const at = (daysAgo: number, hour = 9, minute = 0) =>
  new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    new Date().getDate() - daysAgo,
    hour,
    minute,
  );

/** A server that cannot be reached, so seeded rows keep the status they were given. */
function offline() {
  const server = createFakeRemoteLog();
  server.setOffline(true);
  return server;
}

/** Workouts already on the device, then the app at a path. */
async function openWith(seeds: WorkoutSeed[], path = '/history', userId = `hist-${Math.random()}`) {
  const first = renderApp('/', { userId, server: offlineServer() });
  const ids: string[] = [];
  for (const seed of seeds) {
    const start = at(seed.daysAgo);
    const workout = await first.store.startWorkout({
      ...aWorkout(),
      startedAt: start.toISOString(),
      gymId: HOME_GYM.id,
      gymSnapshot: HOME,
    });
    ids.push(workout.id);
    for (const [i, s] of (seed.sets ?? [{}]).entries()) {
      const totalKg = s.totalKg ?? 60;
      const bar = (s.exerciseId ?? BENCH) === BENCH;
      const set = aSet(workout.id, {
        exerciseId: s.exerciseId ?? BENCH,
        totalKg,
        barKg: bar ? 15 : null,
        perSideKg: bar ? (totalKg - 15) / 2 : null,
        inputMode: bar ? 'per_side' : 'total',
        reps: s.reps ?? 8,
        loggedAt: new Date(start.getTime() + (i + 1) * 60_000).toISOString(),
      });
      await first.store.logSet(set);
      if (s.synced) await first.db.sets.update(set.id, { syncStatus: 'synced' });
    }
    if (!seed.open) {
      const end = new Date(start.getTime() + (seed.minutes ?? 45) * 60_000);
      await first.store.endWorkout(workout.id, end.toISOString());
    }
    if (seed.synced) await first.db.workouts.update(workout.id, { syncStatus: 'synced' });
  }
  first.unmount();
  return { ...renderApp(path, { userId, server: offline() }), ids, userId };
}

describe('the history list', () => {
  it('says so when there are no finished workouts, and offers to start one', async () => {
    const { router, user } = await openWith([]);
    expect(
      await screen.findByRole('heading', { name: 'No finished workouts yet' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Start workout' }));
    expect(router.state.location.pathname).toBe('/workout');
  });

  it('lists finished workouts newest first with the day, gym, counts and duration', async () => {
    await openWith([
      { daysAgo: 3, minutes: 65, sets: [{}, { exerciseId: DUMBBELL_CURL, totalKg: 12 }] },
      { daysAgo: 0, minutes: 45, sets: [{}, {}, {}] },
      { daysAgo: 1, minutes: 30 },
    ]);
    const items = await rows();
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Today');
    expect(items[0]).toHaveTextContent('45 min');
    expect(items[0]).toHaveTextContent('3 sets · 1 exercise');
    expect(items[1]).toHaveTextContent('Yesterday');
    expect(items[1]).toHaveTextContent('1 set · 1 exercise');
    expect(items[2]).toHaveTextContent(dayLabel(at(3).toISOString(), new Date()));
    expect(items[2]).toHaveTextContent('1 h 05 min');
    expect(items[2]).toHaveTextContent('2 sets · 2 exercises');
  });

  it('pins the open workout as in progress, outside the list', async () => {
    const { user, router } = await openWith([
      { daysAgo: 0, open: true, sets: [{}, {}] },
      { daysAgo: 1 },
    ]);
    const card = await screen.findByRole('link', { name: /workout in progress/i });
    expect(card).toHaveTextContent('2 sets so far');
    expect(main().getAllByRole('listitem')).toHaveLength(1);
    await user.click(card);
    expect(router.state.location.pathname).toBe('/workout');
  });

  it('leaves out a finished workout that has no sets', async () => {
    await openWith([{ daysAgo: 1, sets: [] }, { daysAgo: 2 }]);
    expect(await rows()).toHaveLength(1);
  });

  it('marks workouts that are still waiting to sync, and not the ones that are done', async () => {
    await openWith([
      { daysAgo: 1, synced: true, sets: [{ synced: true }] },
      { daysAgo: 2, synced: true, sets: [{ synced: false }] },
      { daysAgo: 3 },
      { daysAgo: 4, synced: false, sets: [{ synced: true }] },
    ]);
    const items = await rows();
    expect(items[0]).not.toHaveTextContent(/waiting to sync/i);
    expect(items[1]).toHaveTextContent(/waiting to sync/i);
    expect(items[2]).toHaveTextContent(/waiting to sync/i);
    expect(items[3]).toHaveTextContent(/waiting to sync/i);
  });

  it('finds older workouts behind a whole page of empty ones, and fills the page', async () => {
    const empty = Array.from({ length: 21 }, (_, i) => ({ daysAgo: i + 1, sets: [] }));
    await openWith([...empty, { daysAgo: 30 }, { daysAgo: 31 }]);
    expect(await rows()).toHaveLength(2);
    expect(
      screen.queryByRole('heading', { name: 'No finished workouts yet' }),
    ).not.toBeInTheDocument();
  });

  it('says a workout failed to sync, apart from one that is only waiting', async () => {
    const seeded = await openWith([{ daysAgo: 1 }, { daysAgo: 2 }]);
    await seeded.db.sets.toCollection().modify((set, ref) => {
      if (set.workoutId === seeded.ids[0]) ref.value = { ...set, syncStatus: 'failed' };
    });
    expect(await screen.findByText('Sync failed')).toBeInTheDocument();
    expect(screen.getByText('Waiting to sync')).toBeInTheDocument();
  });

  it('shows twenty at a time, and the rest on request', async () => {
    const seeds = Array.from({ length: 25 }, (_, i) => ({ daysAgo: i + 1 }));
    const { user } = await openWith(seeds);
    expect(await rows()).toHaveLength(20);
    await user.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(main().getAllByRole('listitem')).toHaveLength(25));
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
  });

  it('has no Show more for exactly twenty', async () => {
    await openWith(Array.from({ length: 20 }, (_, i) => ({ daysAgo: i + 1 })));
    expect(await rows()).toHaveLength(20);
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
  });

  it('is reached from the main navigation', async () => {
    const { router, user } = await openWith([], '/');
    await user.click((await screen.findAllByRole('link', { name: 'History' }))[0]!);
    expect(router.state.location.pathname).toBe('/history');
  });
});

describe('a past workout', () => {
  it('shows the sets by exercise, numbered, with the bar breakdown', async () => {
    const { user, ids } = await openWith([
      {
        daysAgo: 1,
        minutes: 50,
        sets: [
          { totalKg: 60 },
          { exerciseId: DUMBBELL_CURL, totalKg: 12.5, reps: 10 },
          { totalKg: 62.5, reps: 6 },
        ],
      },
    ]);
    await user.click(await screen.findByRole('link', { name: /Yesterday/ }));
    expect(await screen.findByRole('heading', { name: 'Yesterday' })).toBeInTheDocument();
    expect(screen.getByText(/3 sets · 50 min/)).toBeInTheDocument();
    const bench = screen.getByRole('region', { name: 'Barbell Bench Press' });
    const rows = within(bench).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('60 kg × 8');
    expect(rows[1]).toHaveTextContent('62.5 kg × 6');
    expect(rows[0]).toHaveTextContent('15 kg bar + 22.5 kg each side');
    expect(screen.getByRole('region', { name: 'Dumbbell Curl' })).toHaveTextContent('12.5 kg × 10');
    expect(ids).toHaveLength(1);
  });

  it('never shows a known exercise as a custom one while the names load', async () => {
    const { user } = await openWith([{ daysAgo: 1 }]);
    const seen: string[] = [];
    const observer = new MutationObserver(() => seen.push(document.body.textContent ?? ''));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    await user.click(await screen.findByRole('link', { name: /Yesterday/ }));
    await screen.findByRole('region', { name: 'Barbell Bench Press' });
    observer.disconnect();
    expect(seen.some((text) => text.includes('Custom exercise'))).toBe(false);
  });

  it('names an exercise that cannot be found as a custom exercise', async () => {
    const { user } = await openWith([
      { daysAgo: 1, sets: [{ exerciseId: '00000000-0000-4000-8000-000000000001' }] },
    ]);
    await user.click(await screen.findByRole('link', { name: /Yesterday/ }));
    expect(await screen.findByRole('region', { name: 'Custom exercise' })).toBeInTheDocument();
  });

  it('opens straight from the address, and goes back to the list', async () => {
    const seeded = await openWith([{ daysAgo: 1 }]);
    const { router, user } = renderApp(`/history/${seeded.ids[0]}`, {
      userId: seeded.userId,
      server: offline(),
    });
    expect(await screen.findByRole('heading', { name: 'Yesterday' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /back/i }));
    expect(router.state.location.pathname).toBe('/history');
  });

  it.each(['not-an-id', '00000000-0000-4000-8000-000000000009'])(
    'says it is not found for %s, with a way back',
    async (id) => {
      renderApp(`/history/${id}`, { server: offline() });
      expect(await screen.findByRole('heading', { name: 'Workout not found' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Back to history' })).toHaveAttribute(
        'href',
        '/history',
      );
    },
  );

  it('offers to continue a workout that is still open', async () => {
    const seeded = await openWith([{ daysAgo: 0, open: true }]);
    renderApp(`/history/${seeded.ids[0]}`, { userId: seeded.userId, server: offline() });
    expect(await screen.findByRole('link', { name: /still open/i })).toHaveAttribute(
      'href',
      '/workout',
    );
  });

  it('says when a finished workout has no sets', async () => {
    const seeded = await openWith([{ daysAgo: 1, sets: [] }]);
    renderApp(`/history/${seeded.ids[0]}`, { userId: seeded.userId, server: offline() });
    expect(await screen.findByText(/no sets in this workout/i)).toBeInTheDocument();
  });
});
