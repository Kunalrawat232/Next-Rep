// QA pass: the progress screens for lb users, many exercises, and people who train an exercise more than once a week.
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Unit } from '../../domain/schemas';
import seed from '../../domain/exercises.seed.json';
import { BENCH, HOME_GYM, offlineServer, renderApp } from '../../test/appHarness';
import { aSet, aWorkout } from '../../test/localDb';

type Session = {
  weeksAgo: number;
  weekday: number;
  totalKg: number;
  reps: number;
  exerciseId?: string;
};

/** The Monday of this week at 09:00 local, so every seeded day is deterministic and never in the future. */
function mondayThisWeek() {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

async function openWith(sessions: Session[], path: string, unit: Unit = 'kg') {
  const userId = `progweeks-${Math.random()}`;
  const first = renderApp('/', { userId, server: offlineServer(), unit });
  for (const s of sessions) {
    const start = mondayThisWeek();
    start.setDate(start.getDate() - 7 * s.weeksAgo + s.weekday); // weekday 0 = Monday
    const workout = await first.store.startWorkout({
      ...aWorkout(),
      startedAt: start.toISOString(),
      gymId: HOME_GYM.id,
      gymSnapshot: { barbellKg: 15, bars: HOME_GYM.bars },
    });
    await first.store.logSet(
      aSet(workout.id, {
        exerciseId: s.exerciseId ?? BENCH,
        totalKg: s.totalKg,
        barKg: null,
        perSideKg: null,
        inputMode: 'total',
        reps: s.reps,
        loggedAt: new Date(start.getTime() + 60_000).toISOString(),
      }),
    );
    await first.store.endWorkout(workout.id, new Date(start.getTime() + 3_600_000).toISOString());
  }
  first.unmount();
  return renderApp(path, { userId, server: offlineServer(), unit });
}

describe('a heavy day and a light day every week', () => {
  const zigzag: Session[] = [
    { weeksAgo: 2, weekday: 0, totalKg: 70, reps: 5 },
    { weeksAgo: 2, weekday: 3, totalKg: 60, reps: 8 },
    { weeksAgo: 1, weekday: 0, totalKg: 70, reps: 5 },
    { weeksAgo: 1, weekday: 3, totalKg: 60, reps: 8 },
  ];

  it('the list says "Same weight", not a fall of 10 Kg, because each week is judged by its best set', async () => {
    await openWith(zigzag, '/progress');
    expect(await screen.findByText(/^Same weight since/)).toBeInTheDocument();
    expect(screen.queryByText(/-10 Kg/)).not.toBeInTheDocument();
  });

  it('the exercise page still lists every session in its table', async () => {
    await openWith(zigzag, `/progress/${BENCH}`);
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 4);
  });

  it('with only one week of data the list falls back to per-session points and shows the real fall', async () => {
    await openWith(
      [
        { weeksAgo: 1, weekday: 0, totalKg: 70, reps: 5 },
        { weeksAgo: 1, weekday: 3, totalKg: 60, reps: 8 },
      ],
      '/progress',
    );
    expect(await screen.findByText(/^-10 Kg since/)).toBeInTheDocument();
  });
});

describe('lb users', () => {
  const rising: Session[] = [
    { weeksAgo: 3, weekday: 1, totalKg: 60, reps: 8 },
    { weeksAgo: 1, weekday: 1, totalKg: 70, reps: 8 },
  ];

  it('see the trend, records and table in Lb with no Kg anywhere', async () => {
    await openWith(rising, '/progress', 'lb');
    expect(await screen.findByText(/^\+22 Lb since/)).toBeInTheDocument();
    expect(screen.getByText(/Heaviest 154\.3 Lb × 8/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\bKg\b|\bkg\b/);
  });

  it('see the exercise page in Lb, and the Weight/Reps toggle works without changing the table', async () => {
    const { user } = await openWith(rising, `/progress/${BENCH}`, 'lb');
    await screen.findByRole('group', { name: 'Chart shows' });
    expect(screen.getByText(/Heaviest: 154\.3 Lb × 8/)).toBeInTheDocument();
    expect(screen.getByText('Most reps at 132.3 Lb: 8')).toBeInTheDocument();
    const table = screen.getByRole('table');
    const before = table.textContent;
    await user.click(screen.getByRole('button', { name: 'Reps' }));
    await user.click(screen.getByRole('button', { name: 'Weight' }));
    await user.click(screen.getByRole('button', { name: 'Reps' }));
    expect(screen.getByRole('button', { name: 'Reps' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('table').textContent).toBe(before);
    expect(document.body.textContent).not.toMatch(/\bKg\b|\bkg\b/);
  });

  it('see one session as "log another session", with no toggle, and its record in Lb', async () => {
    await openWith(
      [{ weeksAgo: 0, weekday: 0, totalKg: 61.25, reps: 6 }],
      `/progress/${BENCH}`,
      'lb',
    );
    expect(await screen.findByText(/log another session/i)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Chart shows' })).not.toBeInTheDocument();
    expect(screen.getByText(/Heaviest: 135\.0? Lb|Heaviest: 135 Lb/)).toBeInTheDocument();
  });
});

describe('many exercises', () => {
  it('lists 30 exercises, each with its own row link and no more than one weekly chart', async () => {
    const sessions: Session[] = seed.slice(0, 30).flatMap((e, i) => [
      { weeksAgo: 2, weekday: i % 7, totalKg: 20 + i, reps: 8, exerciseId: e.id },
      { weeksAgo: 1, weekday: i % 7, totalKg: 22.5 + i, reps: 8, exerciseId: e.id },
    ]);
    await openWith(sessions, '/progress');
    await screen.findByRole('heading', { name: 'Workouts per week' });
    const rows = screen
      .getAllByRole('link')
      .filter((l) => /^\/progress\/[0-9a-f-]{36}$/.test(l.getAttribute('href') ?? ''));
    expect(rows).toHaveLength(30);
    expect(new Set(rows.map((r) => r.getAttribute('href'))).size).toBe(30);
    expect(screen.getAllByRole('heading', { name: 'Workouts per week' })).toHaveLength(1);
    const table = screen.getByRole('table', { name: 'Workouts per week' });
    // 30 workouts a week, in the two weeks that have any; this week has none.
    const counts = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[0]!.textContent);
    expect(counts).toEqual(['30', '30', '0']);
  });
});
