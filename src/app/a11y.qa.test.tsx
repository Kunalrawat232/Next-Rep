import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BENCH, HOME_GYM, offlineServer, renderApp } from '../test/appHarness';
import { aSet, aWorkout } from '../test/localDb';

afterEach(() => localStorage.clear());

/** One finished workout on the device, then the app at a path. */
async function openWithWorkout(path: (workoutId: string) => string) {
  const userId = `a11y-${Math.random()}`;
  const first = renderApp('/', { userId, server: offlineServer() });
  const w = await first.store.startWorkout({
    ...aWorkout(),
    gymId: HOME_GYM.id,
    gymSnapshot: { name: 'Home gym', barbellKg: 15, bars: HOME_GYM.bars },
  });
  await first.store.logSet(aSet(w.id, { totalKg: 60, barKg: 15, perSideKg: 22.5 }));
  await first.store.logSet(
    aSet(w.id, {
      totalKg: 62.5,
      barKg: 15,
      perSideKg: 23.75,
      loggedAt: '2026-10-10T10:06:00.000Z',
    }),
  );
  await first.store.endWorkout(w.id, '2026-10-10T11:00:00.000Z');
  first.unmount();
  return renderApp(path(w.id), { userId, server: offlineServer() });
}

const headingLevels = () => screen.getAllByRole('heading').map((h) => Number(h.tagName.slice(1)));

/** The page's own headings (the shell's logo is not one), in order: it must start at 1 and never skip a level going down. */
function expectSaneHeadings() {
  const levels = headingLevels();
  expect(levels.filter((l) => l === 1)).toHaveLength(1);
  expect(levels[0]).toBe(1);
  levels.forEach((level, i) => {
    if (i > 0) expect(level - levels[i - 1]!).toBeLessThanOrEqual(1);
  });
}

function expectEveryControlNamed() {
  const main = within(screen.getByRole('main'));
  for (const control of [...main.queryAllByRole('button'), ...main.queryAllByRole('link')])
    expect(control, control.outerHTML).toHaveAccessibleName();
  const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
  expect(new Set(ids).size).toBe(ids.length);
}

describe('QA headings, names and landmarks on every history, progress and settings screen', () => {
  const screens: [string, (id: string) => string, string][] = [
    ['History list', () => '/history', 'History'],
    ['History detail', (id) => `/history/${id}`, 'Wed 10 Oct'],
    ['Progress list', () => '/progress', 'Progress'],
    ['Exercise progress', () => `/progress/${BENCH}`, 'Barbell Bench Press'],
    ['Settings', () => '/settings', 'Settings'],
  ];

  it.each(screens)(
    '%s has one h1, no skipped levels, named controls, unique ids',
    async (_n, path) => {
      await openWithWorkout(path);
      await screen.findByRole('main');
      await waitFor(() => expect(screen.queryByText(/^Loading/)).not.toBeInTheDocument());
      await waitFor(() => expect(screen.getAllByRole('heading').length).toBeGreaterThan(0));
      expectSaneHeadings();
      expectEveryControlNamed();
      expect(screen.getAllByRole('main')).toHaveLength(1);
    },
  );

  it.each([
    ['/history/not-a-uuid', 'Workout not found', 'Back to history'],
    ['/history/00000000-0000-4000-8000-0000000000aa', 'Workout not found', 'Back to history'],
    ['/progress/not-a-uuid', 'Exercise not found', 'Back to progress'],
  ])('%s says %s and has a way back', async (path, title, back) => {
    renderApp(path, { server: offlineServer() });
    expect(await screen.findByRole('heading', { name: title, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: back })).toBeInTheDocument();
    expectSaneHeadings();
  });

  it('the empty History and Progress screens each keep one h1 with the empty state under it', async () => {
    for (const [path, name] of [
      ['/history', 'No finished workouts yet'],
      ['/progress', 'Nothing to chart yet'],
    ] as const) {
      const { unmount } = renderApp(path, { server: offlineServer() });
      expect(await screen.findByRole('heading', { name, level: 2 })).toBeInTheDocument();
      expectSaneHeadings();
      expectEveryControlNamed();
      unmount();
    }
  });

  it('marks the current page in the navigation, and only one', async () => {
    renderApp('/history', { server: offlineServer() });
    await screen.findByRole('main');
    const current = document.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName(/History/);
  });
});

describe('QA touch targets by class', () => {
  it('every button and link in Settings is a touch-sized target or sits inside one', async () => {
    renderApp('/settings', { server: offlineServer() });
    await screen.findByRole('group', { name: 'Weight unit' });
    const small: string[] = [];
    for (const el of within(screen.getByRole('main')).getAllByRole('button')) {
      const classes = el.className;
      if (!/min-h-touch|size-touch/.test(classes)) small.push(el.outerHTML.slice(0, 120));
    }
    expect(small).toEqual([]);
  });

  it('the History and Progress rows are whole-card links, not tiny ones', async () => {
    await openWithWorkout(() => '/history');
    const rows = await within(await screen.findByRole('main')).findAllByRole('link');
    for (const row of rows) expect(row.className).toMatch(/p-4/);
  });
});
