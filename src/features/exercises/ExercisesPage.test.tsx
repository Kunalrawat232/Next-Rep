import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { createFakeAuthService } from '../../test/fakeAuth';
import { createFakeExerciseService, customExercise } from '../../test/fakeExercises';
import { createFakeRemoteLog } from '../../test/fakeRemoteLog';
import { AuthProvider } from '../auth';
import { SyncProvider } from '../sync';
import { ExerciseServiceProvider } from './ExerciseServiceContext';
import { ExercisesPage } from './ExercisesPage';

function renderPage(fake = createFakeExerciseService(), path = '/exercises') {
  const router = createMemoryRouter(
    [
      { path: '/exercises', element: <ExercisesPage /> },
      { path: '/exercises/new', element: <p>New exercise form</p> },
      { path: '/', element: <p>Home</p> },
    ],
    { initialEntries: [path] },
  );
  // The page reads the sets on this device (for the history), so it needs a signed-in user and the sync session.
  const auth = createFakeAuthService({ id: 'u-exercises', email: 'ada@example.com' });
  render(
    <AuthProvider service={auth.service}>
      <ExerciseServiceProvider service={fake.service}>
        <SyncProvider remote={createFakeRemoteLog().remote} dexieDeps={{ indexedDB, IDBKeyRange }}>
          <RouterProvider router={router} />
        </SyncProvider>
      </ExerciseServiceProvider>
    </AuthProvider>,
  );
  return { fake, router, user: userEvent.setup() };
}

const search = () => screen.findByRole('searchbox', { name: 'Search exercises' });

describe('ExercisesPage: browsing', () => {
  it('shows a loading status first', async () => {
    renderPage();
    expect(await screen.findByRole('status')).toHaveTextContent(/loading/i);
  });

  it('shows the popular exercises with equipment and muscle, and no fake "Recent" section', async () => {
    renderPage();
    await search();
    const bench = screen.getByText('Barbell Bench Press').closest('li')!;
    expect(bench).toHaveTextContent('Barbell · Chest');
    expect(screen.queryByText(/^recent$/i)).not.toBeInTheDocument();
  });

  it('lists your own exercises first', async () => {
    renderPage(createFakeExerciseService([customExercise()]));
    await search();
    const heading = await screen.findByRole('heading', { name: /your exercises/i });
    expect(heading).toBeInTheDocument();
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Zercher squat');
  });

  it('tells the user how many more exercises a search can find', async () => {
    renderPage();
    await search();
    expect(screen.getByText(/search to find \d+ more/i)).toBeInTheDocument();
  });

  it('links to the custom exercise form and back to Home', async () => {
    const { router, user } = renderPage();
    await search();
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/');
    await user.click(screen.getByRole('link', { name: /add custom exercise/i }));
    expect(router.state.location.pathname).toBe('/exercises/new');
  });
});

describe('ExercisesPage: searching', () => {
  it('finds exercises as the user types, and says how many matched', async () => {
    const { user } = renderPage();
    await user.type(await search(), 'inc');
    expect(await screen.findByText(/\d+ matches/i)).toBeInTheDocument();
    expect(screen.getAllByText(/line bench press/i).length).toBeGreaterThan(0);
  });

  it('finds an exercise from the imported library, not just the popular ones', async () => {
    const { user } = renderPage();
    await user.type(await search(), 'landmine');
    expect(
      (await screen.findAllByText(/landmine/i, { selector: 'strong' })).length,
    ).toBeGreaterThan(0);
  });

  it('finds by muscle', async () => {
    const { user } = renderPage();
    await user.type(await search(), 'glutes');
    expect((await screen.findAllByText(/hip thrust/i)).length).toBeGreaterThan(0);
  });

  it('filters by equipment, and the chip says it is pressed', async () => {
    const { user } = renderPage();
    await search();
    await user.click(screen.getByRole('button', { name: 'Cable' }));
    expect(screen.getByRole('button', { name: 'Cable' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
    const rows = screen.getAllByRole('listitem');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows.slice(0, 40)) expect(row).toHaveTextContent(/Cable/);
  });

  it('shows only the first 40 results, and more on request', async () => {
    const { user } = renderPage();
    await user.type(await search(), 'dumbbell');
    await screen.findByText(/\d+ matches/i);
    const first = screen.getAllByRole('listitem').length;
    expect(first).toBeLessThanOrEqual(41);
    await user.click(screen.getByRole('button', { name: /show more/i }));
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(first);
  });

  it('clears the search with the clear button and returns to browsing', async () => {
    const { user } = renderPage();
    const box = await search();
    await user.type(box, 'curl');
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(box).toHaveValue('');
    expect(screen.getByText(/search to find/i)).toBeInTheDocument();
    expect(box).toHaveFocus();
  });

  it('offers to add what was searched for when nothing matches', async () => {
    const { router, user } = renderPage();
    await user.type(await search(), 'zzqx exercise');
    expect(await screen.findByRole('heading', { name: /no exercises match/i })).toHaveTextContent(
      'zzqx exercise',
    );
    const add = screen.getByRole('link', { name: /add “zzqx exercise”/i });
    await user.click(add);
    expect(router.state.location.pathname).toBe('/exercises/new');
    expect(router.state.location.search).toBe('?name=zzqx+exercise');
  });

  it('can clear a search that found nothing', async () => {
    const { user } = renderPage();
    await user.type(await search(), 'zzqx');
    await user.click(await screen.findByRole('button', { name: 'Show all exercises' }));
    expect(screen.queryByRole('heading', { name: /no exercises match/i })).not.toBeInTheDocument();
  });

  it('shows markup in a custom name as plain text', async () => {
    const { user } = renderPage(
      createFakeExerciseService([customExercise({ name: '<b>Odd</b> press' })]),
    );
    await user.type(await search(), 'odd');
    expect(await screen.findByText(/<b>/)).toBeInTheDocument();
    expect(document.querySelector('li b')).toBeNull();
  });
});

describe('ExercisesPage: when your own exercises cannot load', () => {
  it('still shows the built-in exercises, with a notice and a retry', async () => {
    const fake = createFakeExerciseService([customExercise()]);
    fake.failNext('listCustom', 'offline');
    const { user } = renderPage(fake);
    await search();
    expect(screen.getByText('Barbell Bench Press')).toBeInTheDocument();
    const notice = screen.getByRole('status', { name: /your exercises/i });
    expect(notice).toHaveTextContent(/offline/i);
    await user.click(within(notice).getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('Zercher squat')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: /your exercises/i })).not.toBeInTheDocument();
  });

  it('says a server problem plainly', async () => {
    const fake = createFakeExerciseService();
    fake.failNext('listCustom', 'unknown');
    renderPage(fake);
    await search();
    expect(screen.getByRole('status', { name: /your exercises/i })).toHaveTextContent(
      /could not load/i,
    );
  });
});

describe('ExercisesPage: review fixes', () => {
  it('keeps the search and the filter when your own exercises are retried', async () => {
    const fake = createFakeExerciseService([customExercise()]);
    fake.failNext('listCustom', 'offline');
    const { user } = renderPage(fake);
    const box = await search();
    await user.type(box, 'curl');
    await user.click(screen.getByRole('button', { name: 'Cable' }));
    const before = await screen.findByText(/\d+ matches?/i);
    await user.click(
      within(screen.getByRole('status', { name: /your exercises/i })).getByRole('button', {
        name: /try again/i,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('status', { name: /your exercises/i })).not.toBeInTheDocument(),
    );
    expect(box).toHaveValue('curl');
    expect(screen.getByRole('button', { name: 'Cable' })).toHaveAttribute('aria-pressed', 'true');
    expect(before).toBeInTheDocument();
  });

  it('combines the equipment filter with the search text', async () => {
    const { user } = renderPage();
    await user.type(await search(), 'curl');
    await user.click(screen.getByRole('button', { name: 'Dumbbell' }));
    for (const row of screen.getAllByRole('listitem').slice(0, 40))
      expect(row).toHaveTextContent(/Dumbbell/);
  });

  it('shows the first page again after a new search, not the pages already opened', async () => {
    const { user } = renderPage();
    const box = await search();
    await user.type(box, 'dumbbell');
    await screen.findByText(/\d+ matches/i);
    await user.click(screen.getByRole('button', { name: /show more/i }));
    const opened = screen.getAllByRole('listitem').length;
    await user.clear(box);
    await user.type(box, 'barbell');
    expect(screen.getAllByRole('listitem').length).toBeLessThan(opened);
    expect(screen.getAllByRole('listitem').length).toBeLessThanOrEqual(40);
  });

  it('announces the count in one status region that stays mounted', async () => {
    const { user } = renderPage();
    const box = await search();
    const region = screen
      .getAllByRole('status')
      .find((el) => el.getAttribute('aria-live') === 'polite')!;
    await user.type(box, 'inc');
    expect(region).toHaveTextContent(/\d+ matches/);
    await user.clear(box);
    await user.type(box, 'zzqx');
    expect(region).toHaveTextContent('No matches');
  });

  it('puts focus back in the search box after "Show all exercises"', async () => {
    const { user } = renderPage();
    const box = await search();
    await user.type(box, 'zzqx');
    await user.click(await screen.findByRole('button', { name: 'Show all exercises' }));
    expect(box).toHaveFocus();
  });
});
