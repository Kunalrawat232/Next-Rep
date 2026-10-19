// QA pass: where the round Workout button shows. It must be on every non-workout page and on none of the workout screens.
import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppShell } from './AppShell';

function renderAt(path: string) {
  const router = createMemoryRouter(
    [{ element: <AppShell />, children: [{ path: '*', element: <p>Page content</p> }] }],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

/** The round button is the Workout link that is hidden from 1024 px up; the sidebar one is shown there only. */
const roundButton = () =>
  screen
    .queryAllByRole('link', { name: 'Workout' })
    .filter((l) => l.className.includes('rounded-full'));

describe('the round Workout button by path', () => {
  it.each([
    ['/', true],
    ['/history', true],
    ['/history/abc', true],
    ['/progress', true],
    ['/progress/xyz', true],
    ['/exercises', true],
    ['/settings', true],
    ['/gym', true],
    // Names that only start like the workout routes are other pages.
    ['/workouts', true],
    ['/workoutx', true],
    ['/workout-history', true],
    ['/history/workout', true],
    ['/workout', false],
    ['/workout/', false],
    ['/workout/exercise', false],
    ['/workout/log', false],
    ['/workout/anything-else', false],
  ])('%s shows it: %s', (path, shown) => {
    renderAt(path);
    expect(roundButton()).toHaveLength(shown ? 1 : 0);
  });

  it('keeps the sidebar Workout link on the workout screens, so there is always a way to the workout', () => {
    renderAt('/workout/log');
    expect(screen.getAllByRole('link', { name: 'Workout' })).toHaveLength(1);
    expect(screen.getByRole('navigation', { name: 'Main' })).toContainElement(
      screen.getByRole('link', { name: 'Workout' }),
    );
  });

  it('the round button links to /workout and has one accessible name', () => {
    renderAt('/history');
    expect(roundButton()[0]).toHaveAttribute('href', '/workout');
  });

  it('goes when the route changes to a workout screen, and returns when it changes back', async () => {
    const router = renderAt('/history');
    expect(roundButton()).toHaveLength(1);
    await act(() => router.navigate('/workout/exercise'));
    expect(roundButton()).toHaveLength(0);
    await act(() => router.navigate('/progress'));
    expect(roundButton()).toHaveLength(1);
  });
});
