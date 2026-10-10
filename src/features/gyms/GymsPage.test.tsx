import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { createFakeGymService, sampleGym } from '../../test/fakeGyms';
import { GymServiceProvider } from './GymServiceContext';
import { GymsPage } from './GymsPage';
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
  render(
    <AuthProvider service={createFakeAuthService({ id: 'u1', email: 'a@b.co' }).service}>
      <UnitsForTest>
        <GymServiceProvider service={fake.service}>
          <RouterProvider router={router} />
        </GymServiceProvider>
      </UnitsForTest>
    </AuthProvider>,
  );
  return { fake, router, user: userEvent.setup() };
}

describe('GymsPage', () => {
  it('shows a loading status first', async () => {
    renderPage();
    expect(await screen.findByRole('status')).toHaveTextContent(/loading/i);
  });

  it('lists each gym with its bars, and marks the default one', async () => {
    renderPage(
      createFakeGymService([
        sampleGym({
          bars: [{ id: 'b1', name: 'EZ bar', weightKg: 7.5, kind: 'ez_bar' }],
        }),
        sampleGym({ id: 'g2', name: 'Office gym', barbellKg: 20, isDefault: false }),
      ]),
    );
    const home = await screen.findByRole('link', { name: /home gym/i });
    expect(home).toHaveTextContent('Barbell 15 kg · EZ bar 7.5 kg');
    expect(within(home).getByText('Default')).toBeInTheDocument();
    const office = screen.getByRole('link', { name: /office gym/i });
    expect(office).toHaveTextContent('Barbell 20 kg');
    expect(within(office).queryByText('Default')).not.toBeInTheDocument();
  });

  it('links each gym to its edit page', async () => {
    const { router, user } = renderPage(createFakeGymService([sampleGym()]));
    await user.click(await screen.findByRole('link', { name: /home gym/i }));
    expect(router.state.location.pathname).toBe('/gyms/g1');
  });

  it('has an Add link to the new-gym page and a way back', async () => {
    const { router, user } = renderPage(createFakeGymService([sampleGym()]));
    await screen.findByRole('link', { name: /home gym/i });
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/');
    await user.click(screen.getByRole('link', { name: 'Add' }));
    expect(router.state.location.pathname).toBe('/gyms/new');
  });

  it('invites the user to add a first gym when there are none', async () => {
    const { router, user } = renderPage();
    expect(await screen.findByRole('heading', { name: /add your first gym/i })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /add a gym/i }));
    expect(router.state.location.pathname).toBe('/gyms/new');
  });

  it('shows an error with a retry, and the list after a successful retry', async () => {
    const fake = createFakeGymService([sampleGym()]);
    fake.failNext('list');
    const { user } = renderPage(fake);
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load/i);
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByRole('link', { name: /home gym/i })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says when the device is offline', async () => {
    const fake = createFakeGymService();
    fake.failNext('list', 'offline');
    renderPage(fake);
    expect(await screen.findByRole('alert')).toHaveTextContent(/offline/i);
  });
});

describe('GymsPage default fallback', () => {
  it('badges the oldest gym as the default when none is marked', async () => {
    renderPage(
      createFakeGymService([
        sampleGym({
          id: 'new',
          name: 'Newer',
          isDefault: false,
          createdAt: '2026-10-05T00:00:00Z',
        }),
        sampleGym({
          id: 'old',
          name: 'Older',
          isDefault: false,
          createdAt: '2026-09-01T00:00:00Z',
        }),
      ]),
    );
    const older = await screen.findByRole('link', { name: /older/i });
    expect(within(older).getByText('Default')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /newer/i })).queryByText('Default')).toBeNull();
  });
});
