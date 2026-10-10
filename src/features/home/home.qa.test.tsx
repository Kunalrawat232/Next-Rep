// QA pass: Home with odd data on the device. A failing test here is a suspected bug.
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { GymSnapshot } from '../../data/local/types';
import { BENCH, HOME_GYM, PUSH_UP, offlineServer, renderApp } from '../../test/appHarness';
import { aSet, aWorkout, uuid } from '../../test/localDb';

const HOME: GymSnapshot = { name: 'Home gym', barbellKg: 15, bars: HOME_GYM.bars };

type Seed = {
  daysAgo: number;
  exerciseId?: string;
  /** Set to give the sets a fixed time, instead of one minute apart. */
  sameTime?: boolean;
  sets: [totalKg: number, reps: number][];
  open?: boolean;
  extra?: { exerciseId: string; totalKg: number; reps: number }[];
};

const day = (daysAgo: number) => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, 9, 0);
};

async function openHome(seeds: Seed[], options: { unit?: 'kg' | 'lb' } = {}) {
  const userId = `homeqa-${Math.random()}`;
  const first = renderApp('/', { userId, server: offlineServer() });
  for (const seed of seeds) {
    const start = day(seed.daysAgo);
    const workout = await first.store.startWorkout({
      ...aWorkout(),
      startedAt: start.toISOString(),
      gymId: HOME_GYM.id,
      gymSnapshot: HOME,
    });
    const exerciseId = seed.exerciseId ?? BENCH;
    const barbell = exerciseId === BENCH;
    for (const [i, [totalKg, reps]] of seed.sets.entries())
      await first.store.logSet(
        aSet(workout.id, {
          exerciseId,
          totalKg,
          reps,
          barKg: barbell ? 15 : null,
          perSideKg: barbell ? (totalKg - 15) / 2 : null,
          inputMode: barbell ? 'per_side' : 'total',
          loggedAt: new Date(
            start.getTime() + (seed.sameTime ? 60_000 : (i + 1) * 60_000),
          ).toISOString(),
        }),
      );
    for (const [i, x] of (seed.extra ?? []).entries())
      await first.store.logSet(
        aSet(workout.id, {
          exerciseId: x.exerciseId,
          totalKg: x.totalKg,
          reps: x.reps,
          barKg: null,
          perSideKg: null,
          inputMode: 'total',
          loggedAt: new Date(start.getTime() + (50 + i) * 60_000).toISOString(),
        }),
      );
    if (!seed.open)
      await first.store.endWorkout(
        workout.id,
        new Date(start.getTime() + 45 * 60_000).toISOString(),
      );
  }
  first.unmount();
  const app = renderApp('/', { userId, server: offlineServer(), ...options });
  await screen.findByRole('main');
  return { ...app, userId, seed: first };
}

const main = () => within(screen.getByRole('main'));

describe('Home with odd workouts', () => {
  it('shows the empty state when every finished workout has no sets', async () => {
    await openHome([
      { daysAgo: 1, sets: [] },
      { daysAgo: 2, sets: [] },
    ]);
    expect(await main().findByText('Your workouts will show up here.')).toBeInTheDocument();
    expect(
      main().getByText('After your first workout, Next Rep suggests what to lift next.'),
    ).toBeInTheDocument();
  });

  it('skips a newer empty workout and shows the older one that has sets', async () => {
    await openHome([
      { daysAgo: 3, sets: [[60, 8]] },
      { daysAgo: 1, sets: [] },
    ]);
    expect(await main().findByText('60 kg × 8 · 1 set')).toBeInTheDocument();
  });

  // BUG: src/features/home/useHomeData.ts:31 only the 10 newest finished workouts are looked at, so 10 empty (started and ended at once) ones hide the last real workout.
  it('still finds the last workout with sets behind ten empty finished workouts', async () => {
    const empties: Seed[] = Array.from({ length: 10 }, (_, i) => ({ daysAgo: i + 1, sets: [] }));
    await openHome([{ daysAgo: 30, sets: [[60, 8]] }, ...empties]);
    expect(await main().findByText('60 kg × 8 · 1 set', {}, { timeout: 1500 })).toBeInTheDocument();
  });

  it('names an exercise that is not in the catalog "Custom exercise" and explains why there is no suggestion', async () => {
    await openHome([{ daysAgo: 1, exerciseId: uuid(9001), sets: [[40, 10]] }]);
    expect(await main().findByText('Custom exercise')).toBeInTheDocument();
    expect(main().getByText('40 kg × 10 · 1 set')).toBeInTheDocument();
    expect(
      main().getByText(/not in your list, so there is nothing to suggest/),
    ).toBeInTheDocument();
    expect(main().getByRole('link', { name: 'Start workout' })).toHaveAttribute(
      'href',
      `/workout?exercise=${uuid(9001)}`,
    );
  });

  it('lists at most three exercises of the last workout, in the order they were first done', async () => {
    await openHome([
      {
        daysAgo: 1,
        sets: [[60, 8]],
        extra: [
          { exerciseId: uuid(9101), totalKg: 10, reps: 1 },
          { exerciseId: uuid(9102), totalKg: 20, reps: 2 },
          { exerciseId: uuid(9103), totalKg: 30, reps: 3 },
        ],
      },
    ]);
    const list = (await main().findByText('60 kg × 8 · 1 set')).closest('ul')!;
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Barbell Bench Press');
    expect(list).not.toHaveTextContent('30 kg × 3');
  });

  it('counts sets logged at the same instant, and picks the earlier one as the first exercise', async () => {
    await openHome([
      {
        daysAgo: 1,
        sameTime: true,
        sets: [
          [60, 8],
          [60, 8],
          [60, 6],
        ],
      },
    ]);
    expect(await main().findByText('60 kg × 8 · 3 sets')).toBeInTheDocument();
  });

  it('suggests from the latest finished session when two workouts started at the same instant', async () => {
    await openHome([
      { daysAgo: 1, sets: [[60, 8]] },
      { daysAgo: 1, sets: [[60, 8]] },
    ]);
    expect(await main().findByText('62.5 kg × 8')).toBeInTheDocument();
  });

  it('does not suggest from a pushed-up bodyweight exercise, and still lists it', async () => {
    await openHome([{ daysAgo: 1, exerciseId: PUSH_UP, sets: [[0, 20]] }]);
    expect(await main().findByText(/no weight to build on/)).toBeInTheDocument();
    expect(main().getByText('0 kg × 20 · 1 set')).toBeInTheDocument();
  });

  it('shows pounds in the last-workout list and the suggestion for a pounds user without changing stored kg', async () => {
    const { seed } = await openHome([{ daysAgo: 1, sets: [[60, 8]] }], { unit: 'lb' });
    expect(await main().findByText('132.3 lb × 8 · 1 set')).toBeInTheDocument();
    const stored = await seed.store.allSets();
    expect(stored.map((x) => x.totalKg)).toEqual([60]);
  });

  it('labels the only link into the workout "Continue workout" even when history is empty', async () => {
    await openHome([{ daysAgo: 0, sets: [], open: true }]);
    expect(await main().findByRole('link', { name: 'Continue workout' })).toHaveAttribute(
      'href',
      '/workout',
    );
  });

  it('gives each section a heading, and the page one h1', async () => {
    await openHome([{ daysAgo: 1, sets: [[60, 8]] }]);
    await main().findByText('62.5 kg × 8');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: "Today's suggestion" })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Last workout' })).toBeInTheDocument();
  });
});

describe('Home with damaged rows on the device', () => {
  // BUG: src/domain/progression/index.ts:62 (via HomePage.tsx:45) a stored set with a non-numeric totalKg makes `working` read sets[0] of an empty list and Home throws; the local rows are not validated on read (listSetsFor/setsForExercises).
  it('does not crash on a set row whose weight is not a number', async () => {
    const userId = `homeqa-bad-${Math.random()}`;
    const first = renderApp('/', { userId, server: offlineServer() });
    const w = await first.store.startWorkout({
      ...aWorkout(),
      startedAt: day(1).toISOString(),
      gymId: HOME_GYM.id,
      gymSnapshot: HOME,
    });
    await first.store.logSet(aSet(w.id, { exerciseId: BENCH, loggedAt: day(1).toISOString() }));
    await first.store.endWorkout(w.id, new Date(day(1).getTime() + 60_000).toISOString());
    const rows = await first.db.sets.toArray();
    await first.db.sets.update(rows[0]!.id, { totalKg: 'heavy' as unknown as number });
    first.unmount();
    renderApp('/', { userId, server: offlineServer() });
    await screen.findByRole('main');
    // Either a friendly error or a page: never stuck loading, blank, or showing NaN.
    await waitFor(() => expect(screen.getByRole('main').textContent).not.toMatch(/^Loading/), {
      timeout: 2000,
    });
    const text = screen.getByRole('main').textContent ?? '';
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/NaN|undefined|\[object/);
  });
});
