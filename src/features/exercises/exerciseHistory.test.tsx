import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import seed from '../../domain/exercises.seed.json';
import { HOME_GYM, offlineServer, renderApp } from '../../test/appHarness';
import { aSet, aWorkout } from '../../test/localDb';

const ids = seed.slice(0, 8).map((e) => ({ id: e.id, name: e.name }));

/** One workout per day on the device, each with a set of one exercise, oldest first. */
async function openWithHistory(path: string, count: number) {
  const userId = `history-${Math.random()}`;
  const first = renderApp('/', { userId, server: offlineServer() });
  for (const [i, exercise] of ids.slice(0, count).entries()) {
    const start = new Date(2026, 9, 10 + i, 9);
    const workout = await first.store.startWorkout({
      ...aWorkout(),
      startedAt: start.toISOString(),
      gymId: HOME_GYM.id,
      gymSnapshot: { barbellKg: 15, bars: HOME_GYM.bars },
    });
    await first.store.logSet(
      aSet(workout.id, {
        exerciseId: exercise.id,
        totalKg: 40,
        barKg: null,
        perSideKg: null,
        inputMode: 'total',
        reps: 8,
        loggedAt: new Date(start.getTime() + 60_000).toISOString(),
      }),
    );
    await first.store.endWorkout(workout.id, new Date(start.getTime() + 3_600_000).toISOString());
  }
  first.unmount();
  return renderApp(path, { userId, server: offlineServer() });
}

describe('the exercise history on the Exercises screen', () => {
  it('lists what was done before, most recent first, above the popular exercises', async () => {
    await openWithHistory('/exercises', 3);
    const section = await screen.findByRole('region', { name: 'History' });
    const rows = within(section).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    // The last one done (the third) is first.
    expect(rows[0]).toHaveTextContent(ids[2]!.name);
    expect(rows[2]).toHaveTextContent(ids[0]!.name);
    expect(rows[0]).toHaveTextContent(/Last done/);
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings.indexOf('History')).toBeLessThan(headings.indexOf('Popular exercises'));
  });

  it('shows six of eight, and all of them after Show all', async () => {
    const { user } = await openWithHistory('/exercises', 8);
    const section = await screen.findByRole('region', { name: 'History' });
    expect(within(section).getAllByRole('listitem')).toHaveLength(6);
    await user.click(within(section).getByRole('button', { name: 'Show all 8' }));
    expect(within(section).getAllByRole('listitem')).toHaveLength(8);
  });

  it('is not there for someone who has not logged anything', async () => {
    renderApp('/exercises');
    await screen.findByRole('searchbox', { name: 'Search exercises' });
    expect(screen.queryByRole('heading', { name: 'History' })).not.toBeInTheDocument();
  });

  it('is also on the screen that picks the exercise for a workout, and a row picks it', async () => {
    const { user, router } = await openWithHistory('/workout/exercise', 2);
    const section = await screen.findByRole('region', { name: 'History' });
    await user.click(within(section).getAllByRole('button')[0]!);
    expect(router.state.location.pathname).toBe('/workout');
    expect(router.state.location.search).toBe(`?exercise=${ids[1]!.id}`);
  });
});
