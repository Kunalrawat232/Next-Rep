import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Unit } from '../../domain/schemas';
import { BENCH, HOME_GYM, offlineServer, renderApp } from '../../test/appHarness';
import { aSet, aWorkout } from '../../test/localDb';

afterEach(() => localStorage.clear());

type Seed = { daysAgo: number; sets: { totalKg: number; reps: number }[] };

async function openWith(seeds: Seed[], path: string, unit: Unit) {
  const userId = `pq-${Math.random()}`;
  const first = renderApp('/', { userId, server: offlineServer() });
  for (const seed of seeds) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - seed.daysAgo, 9, 0);
    const w = await first.store.startWorkout({
      ...aWorkout(),
      startedAt: start.toISOString(),
      gymId: HOME_GYM.id,
      gymSnapshot: { barbellKg: 15, bars: HOME_GYM.bars },
    });
    for (const [i, s] of seed.sets.entries())
      await first.store.logSet(
        aSet(w.id, {
          exerciseId: BENCH,
          totalKg: s.totalKg,
          barKg: 15,
          perSideKg: (s.totalKg - 15) / 2,
          reps: s.reps,
          loggedAt: new Date(start.getTime() + (i + 1) * 60_000).toISOString(),
        }),
      );
    await first.store.endWorkout(w.id, new Date(start.getTime() + 3_600_000).toISOString());
  }
  first.unmount();
  return renderApp(path, { userId, server: offlineServer(), unit });
}

describe('QA exercise progress shows what is stored, in the unit chosen', () => {
  it.each([
    ['kg', '65 Kg × 5', 'Heaviest: 65 Kg × 5', 'Most reps at 60 Kg: 10'],
    ['lb', '143.3 Lb × 5', 'Heaviest: 143.3 Lb × 5', 'Most reps at 132.3 Lb: 10'],
  ] as const)('in %s', async (unit, top, heaviest, mostReps) => {
    await openWith(
      [
        { daysAgo: 3, sets: [{ totalKg: 60, reps: 8 }] },
        {
          daysAgo: 1,
          sets: [
            { totalKg: 60, reps: 10 },
            { totalKg: 65, reps: 5 },
          ],
        },
      ],
      `/progress/${BENCH}`,
      unit,
    );
    const records = await screen.findByRole('region', { name: 'Records' });
    expect(records).toHaveTextContent(heaviest);
    expect(records).toHaveTextContent(mostReps);
    const table = screen.getByRole('table', { name: 'Top set per session' });
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent(top);
  });

  // BUG: two stored weights 0.01 kg apart (60 and 60.01) show as the same 132.3 lb, so the records
  // list has two lines that read "Most reps at 132.3 Lb". Same root cause as the false record for
  // the same displayed weight (records compare hundredths of a kg, not the unit shown).
  it('lists one line per displayed weight in lb', async () => {
    await openWith(
      [
        { daysAgo: 2, sets: [{ totalKg: 60, reps: 8 }] },
        { daysAgo: 1, sets: [{ totalKg: 60.01, reps: 6 }] },
      ],
      `/progress/${BENCH}`,
      'lb',
    );
    const records = await screen.findByRole('region', { name: 'Records' });
    const lines = within(records)
      .getAllByRole('listitem')
      .map((li) => li.textContent!.split(':')[0]);
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('a stored weight is never changed by looking at it in lb', async () => {
    const { db } = await openWith(
      [
        {
          daysAgo: 1,
          sets: [
            { totalKg: 60, reps: 8 },
            { totalKg: 61.23, reps: 8 },
          ],
        },
      ],
      `/progress/${BENCH}`,
      'lb',
    );
    await screen.findByRole('region', { name: 'Records' });
    expect((await db.sets.toArray()).map((s) => s.totalKg).sort()).toEqual([60, 61.23]);
  });
});
