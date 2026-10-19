import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { GymSnapshot } from '../../data/local/types';
import { BENCH, DUMBBELL_CURL, HOME_GYM, renderApp, offlineServer } from '../../test/appHarness';
import { createFakeRemoteLog } from '../../test/fakeRemoteLog';
import { aSet, aWorkout } from '../../test/localDb';

const HOME: GymSnapshot = { barbellKg: 15, bars: HOME_GYM.bars };

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

describe('the progress list: trends and weekly workouts', () => {
  const rising = [
    { daysAgo: 21, sets: [{ totalKg: 60, reps: 8 }] },
    { daysAgo: 14, sets: [{ totalKg: 65, reps: 8 }] },
    { daysAgo: 7, sets: [{ totalKg: 70, reps: 8 }] },
  ];

  it('says how far an exercise has moved since its first session, in green when it went up', async () => {
    await openWith(rising, '/progress');
    const text = await screen.findByText(/^\+10 Kg since \d+ \w{3}$/);
    expect(text.className).toMatch(/text-success/);
  });

  it('says so when the weight has not changed, and writes nothing for a single session', async () => {
    await openWith(
      [
        { daysAgo: 14, sets: [{ totalKg: 60, reps: 8 }] },
        { daysAgo: 7, sets: [{ totalKg: 60, reps: 8 }] },
        { daysAgo: 7, sets: [{ exerciseId: DUMBBELL_CURL, totalKg: 12.5, reps: 10 }] },
      ],
      '/progress',
    );
    expect(await screen.findByText(/^Same weight since/)).toBeInTheDocument();
    const curl = screen.getByRole('link', { name: /Dumbbell Curl/ });
    expect(curl).not.toHaveTextContent(/since/);
  });

  it('draws the workouts of each week, with the same numbers in a table for a screen reader', async () => {
    await openWith(rising, '/progress');
    expect(await screen.findByRole('heading', { name: 'Workouts per week' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Workouts per week' });
    const counts = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[0]!.textContent);
    // Three weeks with one workout each, then this week with none.
    expect(counts).toEqual(['1', '1', '1', '0']);
  });

  it('shows no weekly chart until there are two weeks to compare', async () => {
    await openWith([{ daysAgo: 0, sets: [{ totalKg: 60, reps: 8 }] }], '/progress');
    await screen.findByRole('link', { name: /Barbell Bench Press/ });
    expect(screen.queryByRole('heading', { name: 'Workouts per week' })).not.toBeInTheDocument();
  });
});

describe('the exercise chart', () => {
  it('can show the weight or the reps, starting with the weight', async () => {
    const { user } = await openWith(
      [
        { daysAgo: 14, sets: [{ totalKg: 60, reps: 8 }] },
        { daysAgo: 7, sets: [{ totalKg: 60, reps: 10 }] },
      ],
      `/progress/${BENCH}`,
    );
    const group = await screen.findByRole('group', { name: 'Chart shows' });
    expect(within(group).getByRole('button', { name: 'Weight' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(group).getByRole('button', { name: 'Reps' }));
    expect(within(group).getByRole('button', { name: 'Reps' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(group).getByRole('button', { name: 'Weight' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('has no chart toggle with a single session', async () => {
    await openWith([{ daysAgo: 3, sets: [{ totalKg: 60, reps: 8 }] }], `/progress/${BENCH}`);
    await screen.findByText(/log another session to see a trend/i);
    expect(screen.queryByRole('group', { name: 'Chart shows' })).not.toBeInTheDocument();
  });
});
