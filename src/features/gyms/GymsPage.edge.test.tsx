import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Gym } from '../../domain/gyms';
import { createFakeGymService, sampleGym } from '../../test/fakeGyms';
import { GymServiceProvider } from './GymServiceContext';
import { GymsPage } from './GymsPage';
import type { GymResult } from './types';
import { UnitsForTest } from '../../test/UnitsForTest';
import { createFakeAuthService } from '../../test/fakeAuth';
import { AuthProvider } from '../auth';

function renderPage(fake = createFakeGymService()) {
  const router = createMemoryRouter(
    [
      { path: '/gyms', element: <GymsPage /> },
      { path: '/gyms/new', element: <p>New gym form</p> },
      { path: '/gyms/:gymId', element: <p>Edit gym form</p> },
      { path: '/', element: <p>Home</p> },
    ],
    { initialEntries: ['/gyms'] },
  );
  const view = render(
    <AuthProvider service={createFakeAuthService({ id: 'u1', email: 'a@b.co' }).service}>
      <UnitsForTest>
        <GymServiceProvider service={fake.service}>
          <RouterProvider router={router} />
        </GymServiceProvider>
      </UnitsForTest>
    </AuthProvider>,
  );
  return { fake, router, view, user: userEvent.setup() };
}

afterEach(() => vi.restoreAllMocks());

describe('GymsPage: list contents', () => {
  it('shows names as plain text, never as markup', async () => {
    const name = '<img src=x onerror=alert(1)> & "quotes"';
    renderPage(createFakeGymService([sampleGym({ name })]));
    expect(await screen.findByText(name)).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('shows Devanagari and emoji names and bar names intact', async () => {
    renderPage(
      createFakeGymService([
        sampleGym({
          name: 'जिम 💪',
          bars: [{ id: 'b', name: 'ईज़ी बार', weightKg: 7.5, kind: 'ez_bar' }],
        }),
      ]),
    );
    expect(await screen.findByText('जिम 💪')).toBeInTheDocument();
    expect(screen.getByText(/ईज़ी बार 7.5 kg/)).toBeInTheDocument();
  });

  it('renders 60 gyms, each with a link to its own page, and marks only the default', async () => {
    const gyms: Gym[] = Array.from({ length: 60 }, (_, i) =>
      sampleGym({ id: `g${i}`, name: `Gym ${i}`, isDefault: i === 17 }),
    );
    renderPage(createFakeGymService(gyms));
    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(60);
    expect(screen.getAllByText('Default')).toHaveLength(1);
    expect(within(items[17]!).getByText('Default')).toBeInTheDocument();
    expect(within(items[59]!).getByRole('link')).toHaveAttribute('href', '/gyms/g59');
  });

  it('shows a 300 character name without crashing', async () => {
    const name = 'W'.repeat(300);
    renderPage(createFakeGymService([sampleGym({ name })]));
    expect(await screen.findByText(name)).toBeInTheDocument();
  });

  it('shows the only gym as the default even when the service marks none', async () => {
    renderPage(createFakeGymService([sampleGym({ isDefault: false })]));
    await screen.findByText('Home gym');
    expect(screen.getByText('Default')).toBeInTheDocument();
  });
});

describe('GymsPage: failures and retries', () => {
  it('shows the error state, not a blank page, when list() rejects', async () => {
    const fake = createFakeGymService();
    fake.service.list.mockRejectedValueOnce(new Error('socket hang up'));
    renderPage(fake);
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load/i);
    expect(screen.queryByText(/Add your first gym/)).not.toBeInTheDocument();
  });

  it('recovers after a rejected list(), then an offline failure, then success', async () => {
    const fake = createFakeGymService([sampleGym()]);
    fake.service.list.mockRejectedValueOnce(new Error('x'));
    const { user } = renderPage(fake);
    const retry = await screen.findByRole('button', { name: 'Try again' });
    fake.failNext('list', 'offline');
    await user.click(retry);
    expect(await screen.findByRole('alert')).toHaveTextContent(/offline/i);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Home gym')).toBeInTheDocument();
    expect(fake.service.list).toHaveBeenCalledTimes(3);
  });

  it('hides the old error while retrying and asks the service once per tap', async () => {
    const fake = createFakeGymService();
    fake.failNext('list');
    const { user } = renderPage(fake);
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(fake.service.list).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Add your first gym')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a loading state with no retry button while the first answer is slow, then the list', async () => {
    const fake = createFakeGymService();
    let releaseFirst: (r: GymResult<Gym[]>) => void = () => undefined;
    fake.service.list.mockReturnValueOnce(
      new Promise((resolve) => {
        releaseFirst = resolve;
      }),
    );
    renderPage(fake);
    // The first call is still pending, so the page is loading and has no retry button yet.
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    releaseFirst({ status: 'ok', value: [sampleGym({ name: 'Late answer' })] });
    expect(await screen.findByText('Late answer')).toBeInTheDocument();
  });

  it('does nothing, and logs no error, when the list arrives after the page is gone', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fake = createFakeGymService();
    let release: (r: GymResult<Gym[]>) => void = () => undefined;
    fake.service.list.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const { view } = renderPage(fake);
    view.unmount();
    release({ status: 'ok', value: [sampleGym()] });
    await Promise.resolve();
    expect(errors).not.toHaveBeenCalled();
  });

  it('does nothing, and logs no error, when a rejection arrives after the page is gone', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fake = createFakeGymService();
    let fail: (e: Error) => void = () => undefined;
    fake.service.list.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    const { view } = renderPage(fake);
    // The page mounts once the user is known; the request has to be under way before it is gone.
    await waitFor(() => expect(fake.service.list).toHaveBeenCalled());
    view.unmount();
    fail(new Error('late'));
    await Promise.resolve();
    expect(errors).not.toHaveBeenCalled();
  });
});

describe('GymsPage: navigation', () => {
  it('opens the edit page for a gym whose id has unusual characters', async () => {
    const { router, user } = renderPage(createFakeGymService([sampleGym({ id: 'a-b_c.1' })]));
    await user.click(await screen.findByRole('link', { name: /Home gym/ }));
    expect(router.state.location.pathname).toBe('/gyms/a-b_c.1');
  });

  it('can go back home and forward again without a second list failure', async () => {
    const { fake, router, user } = renderPage(createFakeGymService([sampleGym()]));
    await screen.findByText('Home gym');
    await user.click(screen.getByRole('link', { name: /back/i }));
    expect(router.state.location.pathname).toBe('/');
    await router.navigate('/gyms');
    expect(await screen.findByText('Home gym')).toBeInTheDocument();
    expect(fake.service.list).toHaveBeenCalledTimes(2);
  });
});
