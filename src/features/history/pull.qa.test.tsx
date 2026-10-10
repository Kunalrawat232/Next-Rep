import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BENCH, renderApp } from '../../test/appHarness';
import { createFakeRemoteLog } from '../../test/fakeRemoteLog';
import { aSet, aWorkout } from '../../test/localDb';

afterEach(() => localStorage.clear());

const rows = async () => within(await screen.findByRole('main')).findAllByRole('listitem');

/** Another phone's finished workout, already on the server. */
function seedFinished(
  server: ReturnType<typeof createFakeRemoteLog>,
  startedAt: string,
  sets: Parameters<typeof aSet>[1][],
) {
  const workout = aWorkout({ startedAt });
  server.seedWorkout({
    ...workout,
    endedAt: new Date(Date.parse(startedAt) + 3_600_000).toISOString(),
  });
  const ids = sets.map((over, i) => {
    const total = over?.totalKg ?? 60;
    const set = aSet(workout.id, {
      barKg: 20,
      perSideKg: (total - 20) / 2,
      loggedAt: new Date(Date.parse(startedAt) + (i + 1) * 60_000).toISOString(),
      ...over,
    });
    server.seedSet(set);
    return set.id;
  });
  return { workout, ids };
}

describe('QA data that arrives from the server while a screen is open', () => {
  it('shows a workout on its detail page when it was missing and then arrives from the server', async () => {
    const server = createFakeRemoteLog();
    server.setOffline(true);
    const { workout } = seedFinished(server, '2026-10-01T09:00:00.000Z', [{ totalKg: 60 }]);
    renderApp(`/history/${workout.id}`, { server });
    expect(await screen.findByRole('heading', { name: 'Workout not found' })).toBeInTheDocument();
    server.setOffline(false);
    act(() => void window.dispatchEvent(new Event('online')));
    const bench = await screen.findByRole('region', { name: 'Barbell Bench Press' });
    expect(bench).toHaveTextContent('60 kg × 8');
    expect(screen.queryByRole('heading', { name: 'Workout not found' })).not.toBeInTheDocument();
  });

  it('puts PR badges on the right sets when the server hands over sets from two phones', async () => {
    const server = createFakeRemoteLog();
    const old = seedFinished(server, '2026-09-01T09:00:00.000Z', [{ totalKg: 60, reps: 8 }]);
    const same = seedFinished(server, '2026-09-08T09:00:00.000Z', [{ totalKg: 60, reps: 8 }]);
    const heavier = seedFinished(server, '2026-09-15T09:00:00.000Z', [{ totalKg: 62.5, reps: 8 }]);
    const { user } = renderApp(`/progress/${BENCH}`, { server });
    const table = await screen.findByRole('table', { name: 'Top set per session' });
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(4));
    const body = within(table).getAllByRole('row').slice(1);
    expect(body[0]).toHaveTextContent('62.5 kg × 8');
    await waitFor(() => expect(within(body[0]!).getByRole('img')).toHaveAccessibleName(/heaviest/));
    expect(within(body[1]!).queryByRole('img')).not.toBeInTheDocument();
    expect(within(body[2]!).queryByRole('img')).not.toBeInTheDocument();
    expect([old, same, heavier]).toHaveLength(3);
    expect(user).toBeDefined();
  });
});

describe('QA a bad row from the server', () => {
  it.each([
    ['reps of 0', { reps: 0 }],
    ['reps of 101', { reps: 101 }],
    ['a total of 500.01 kg', { totalKg: 500.01, barKg: null, perSideKg: null }],
    ['a negative weight', { totalKg: -5, barKg: null, perSideKg: null }],
    ['an unknown input mode', { inputMode: 'voice' as never }],
  ])('keeps the good history and never shows the bad set when a set has %s', async (_name, bad) => {
    const server = createFakeRemoteLog();
    seedFinished(server, '2026-10-01T09:00:00.000Z', [{ totalKg: 60 }]);
    seedFinished(server, '2026-10-02T09:00:00.000Z', [{ totalKg: 65 }, bad]);
    renderApp('/history', { server });
    await waitFor(async () => expect((await rows()).length).toBe(2));
    const list = await rows();
    // The bad set is refused as a whole; nothing half-valid is shown.
    const text = list.map((li) => li.textContent).join('|');
    expect(text).not.toMatch(/2 sets/);
    expect(text).not.toMatch(/-5|500\.01/);
  });
});
