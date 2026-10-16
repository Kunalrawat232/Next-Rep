import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { GymSnapshot } from '../../data/local/types';
import type { Unit } from '../../domain/schemas';
import { BENCH, HOME_GYM, PUSH_UP, offlineServer, renderApp } from '../../test/appHarness';
import { aSet, aWorkout } from '../../test/localDb';

const HOME: GymSnapshot = { barbellKg: 15, bars: HOME_GYM.bars };

type Seed = {
  daysAgo: number;
  exerciseId?: string;
  sets: [totalKg: number, reps: number][];
  open?: boolean;
};

const day = (daysAgo: number) => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, 9, 0);
};

/** Workouts already on the device, then the app on Home. */
async function openHome(
  seeds: Seed[],
  options: { gym?: typeof HOME_GYM | null; unit?: Unit } = {},
) {
  const userId = `home-${Math.random()}`;
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
    for (const [i, [totalKg, reps]] of seed.sets.entries()) {
      await first.store.logSet(
        aSet(workout.id, {
          exerciseId,
          totalKg,
          reps,
          barKg: barbell ? 15 : null,
          perSideKg: barbell ? (totalKg - 15) / 2 : null,
          inputMode: barbell ? 'per_side' : 'total',
          loggedAt: new Date(start.getTime() + (i + 1) * 60_000).toISOString(),
        }),
      );
    }
    if (!seed.open)
      await first.store.endWorkout(
        workout.id,
        new Date(start.getTime() + 45 * 60_000).toISOString(),
      );
  }
  first.unmount();
  const app = renderApp('/', { userId, server: offlineServer(), ...options });
  await screen.findByRole('main');
  return app;
}

const main = () => within(screen.getByRole('main'));

describe('Home', () => {
  it('welcomes a new user and sends them straight to their first workout', async () => {
    await openHome([], { gym: null });
    expect(
      await screen.findByRole('heading', { name: 'Welcome to Next Rep', level: 1 }),
    ).toBeInTheDocument();
    expect(main().getByText(/standard 20 kg barbell/i)).toBeInTheDocument();
    expect(main().getAllByRole('link', { name: 'Start workout' })).toHaveLength(1);
    expect(main().getByRole('link', { name: 'Start workout' })).toHaveAttribute('href', '/workout');
    expect(main().queryByText(/add your gym/i)).not.toBeInTheDocument();
  });

  it('shows the gym and its bar, and a placeholder, before the first workout', async () => {
    await openHome([]);
    expect(
      await screen.findByRole('heading', { name: 'Ready to lift?', level: 1 }),
    ).toBeInTheDocument();
    expect(await main().findByText('15 kg bar')).toBeInTheDocument();
    expect(main().getByText(/after your first workout/i)).toBeInTheDocument();
    expect(main().getByRole('link', { name: 'Start workout' })).toHaveAttribute('href', '/workout');
    expect(main().getByText('Your workouts will show up here.')).toBeInTheDocument();
  });

  it('suggests a little more after hitting the target, and opens that exercise', async () => {
    const { router, user } = await openHome([
      {
        daysAgo: 1,
        sets: [
          [60, 8],
          [60, 8],
        ],
      },
    ]);
    expect(await main().findByText('62.5 kg × 8')).toBeInTheDocument();
    expect(
      main().getByText(/you hit 2 × 8 at 60 kg last time, so try 2.5 kg more\./i),
    ).toBeInTheDocument();
    expect(main().getByText(/it is a suggestion, you decide\./i)).toBeInTheDocument();
    expect(main().getByText('60 kg × 8 · 2 sets')).toBeInTheDocument();
    await user.click(main().getByRole('link', { name: 'Start workout' }));
    expect(router.state.location.pathname).toBe('/workout');
    expect(router.state.location.search).toBe(`?exercise=${BENCH}`);
  });

  it('suggests the same weight after a miss', async () => {
    await openHome([
      {
        daysAgo: 1,
        sets: [
          [60, 8],
          [60, 6],
        ],
      },
    ]);
    expect(await main().findByText('60 kg × 8')).toBeInTheDocument();
    expect(main().getByText(/stay at that weight/i)).toBeInTheDocument();
  });

  it('shows the suggestion in pounds for a pounds user', async () => {
    await openHome([{ daysAgo: 1, sets: [[60, 8]] }], { unit: 'lb' });
    const text = (await main().findByText(/last time, so try/i)).textContent ?? '';
    expect(text).toMatch(/lb/);
    expect(text).not.toMatch(/kg/);
    expect(await main().findByText(/33\.1 lb bar/)).toBeInTheDocument();
  });

  it('suggests nothing for a bodyweight exercise', async () => {
    await openHome([{ daysAgo: 1, exerciseId: PUSH_UP, sets: [[0, 15]] }]);
    expect(await main().findByText(/nothing to suggest for this exercise/i)).toBeInTheDocument();
  });

  it('suggests about 10% less after missing twice at the same weight', async () => {
    await openHome([
      {
        daysAgo: 3,
        sets: [
          [60, 8],
          [60, 6],
        ],
      },
      {
        daysAgo: 1,
        sets: [
          [60, 8],
          [60, 5],
        ],
      },
    ]);
    expect(await main().findByText('52.5 kg × 8')).toBeInTheDocument();
    expect(main().getByText(/twice in a row, so try about 10% less/i)).toBeInTheDocument();
  });

  it('gives exact pounds: 132.3 lb last time, 138.1 lb next', async () => {
    await openHome([{ daysAgo: 1, sets: [[60, 8]] }], { unit: 'lb' });
    expect(await main().findByText('138.1 lb × 8')).toBeInTheDocument();
    expect(main().getByText(/at 132\.3 lb last time/)).toBeInTheDocument();
  });

  it('ignores the open workout for the suggestion and the last workout', async () => {
    await openHome([
      { daysAgo: 2, sets: [[60, 8]] },
      { daysAgo: 0, sets: [[100, 5]], open: true },
    ]);
    expect(await main().findByText('62.5 kg × 8')).toBeInTheDocument();
    expect(main().getByText('60 kg × 8 · 1 set')).toBeInTheDocument();
    expect(main().queryByText(/100 kg/)).not.toBeInTheDocument();
  });

  it('never shows the ready state for a moment to a user with no gym', async () => {
    const seen: string[] = [];
    const observer = new MutationObserver(() => seen.push(document.body.textContent ?? ''));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    renderApp('/', { gym: null, server: offlineServer() });
    await screen.findByRole('heading', { name: 'Welcome to Next Rep', level: 1 });
    observer.disconnect();
    expect(seen.some((text) => /Ready to lift\?/.test(text))).toBe(false);
  });

  it('continues an open workout instead of starting another', async () => {
    await openHome([{ daysAgo: 0, sets: [[60, 8]], open: true }]);
    expect(await main().findByRole('link', { name: 'Continue workout' })).toHaveAttribute(
      'href',
      '/workout',
    );
  });

  it('no longer holds the account card', async () => {
    await openHome([]);
    await main().findByText('15 kg bar');
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();
  });
});
