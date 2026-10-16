import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { createFakeAuthService } from '../../test/fakeAuth';
import { tapTogether } from '../../test/doubleTap';
import { createFakeGymService, sampleGym } from '../../test/fakeGyms';
import { UnitsForTest } from '../../test/UnitsForTest';
import { AuthProvider } from '../auth';
import { GymPage } from './GymPage';
import { GymServiceProvider } from './GymServiceContext';

function renderPage(fake = createFakeGymService(null), signedIn = true) {
  const auth = createFakeAuthService(signedIn ? { id: 'u1', email: 'a@b.co' } : null);
  const router = createMemoryRouter(
    [
      { path: '/settings', element: <p>Settings page</p> },
      { path: '/gym', element: <GymPage /> },
    ],
    { initialEntries: ['/gym'] },
  );
  render(
    <AuthProvider service={auth.service}>
      <UnitsForTest>
        <GymServiceProvider service={fake.service}>
          <RouterProvider router={router} />
        </GymServiceProvider>
      </UnitsForTest>
    </AuthProvider>,
  );
  return { fake, router, user: userEvent.setup() };
}

const ezGym = sampleGym({
  bars: [
    { id: 'b1', name: 'EZ bar', weightKg: 7.5, kind: 'ez_bar' },
    { id: 'b2', name: 'Trap bar', weightKg: 25, kind: 'other' },
  ],
});

describe('your gym: there is one, with no name, list, default or delete', () => {
  it('has only the bars: no name field, no default, no delete', async () => {
    renderPage(createFakeGymService(ezGym));
    expect(await screen.findByRole('heading', { name: 'Your gym' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/gym name/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /default/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/settings');
  });
});

describe('setting it up for the first time', () => {
  it('starts with a 20 kg barbell and offers 20 and 15 kg presets', async () => {
    const { user } = renderPage();
    const barbell = await screen.findByLabelText('Barbell weight (kg)');
    expect(barbell).toHaveValue('20');
    expect(screen.getByRole('button', { name: '20 kg' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: '15 kg' }));
    expect(barbell).toHaveValue('15');
  });

  it('saves the gym and goes back to Settings', async () => {
    const { fake, router, user } = renderPage();
    await user.click(await screen.findByRole('button', { name: '15 kg' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings'));
    expect(fake.service.save).toHaveBeenCalledWith('u1', expect.any(String), {
      barbellKg: 15,
      bars: [],
    });
    expect(fake.current()).toMatchObject({ barbellKg: 15 });
  });

  it('shows the error, focuses the bad field and saves nothing', async () => {
    const { fake, user } = renderPage();
    const barbell = await screen.findByLabelText('Barbell weight (kg)');
    await user.clear(barbell);
    await user.type(barbell, '500');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/use a weight between/i)).toBeInTheDocument();
    expect(barbell).toHaveFocus();
    expect(fake.service.save).not.toHaveBeenCalled();
  });

  it('retries a failed save with the same ids, so it cannot make a second gym', async () => {
    const { fake, user } = renderPage();
    const save = await screen.findByRole('button', { name: 'Save' });
    fake.failNext('save', 'offline');
    await user.click(save);
    await screen.findByText(/you're offline/i);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(fake.service.save).toHaveBeenCalledTimes(2));
    const [first, second] = fake.service.save.mock.calls;
    expect(first![1]).toBe(second![1]);
  });

  it('saves once when Save is tapped twice at once', async () => {
    const { fake } = renderPage();
    tapTogether(await screen.findByRole('button', { name: 'Save' }));
    await waitFor(() => expect(fake.service.save).toHaveBeenCalled());
    expect(fake.service.save).toHaveBeenCalledTimes(1);
  });

  it('explains a conflict, such as the gym having been set up on another device meanwhile', async () => {
    const { fake, user } = renderPage();
    fake.failNext('save', 'conflict');
    await user.click(await screen.findByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/set up on another device/i)).toBeInTheDocument();
  });
});

describe('changing the bars', () => {
  it('loads the gym into the form', async () => {
    renderPage(createFakeGymService(ezGym));
    expect(await screen.findByLabelText('Barbell weight (kg)')).toHaveValue('15');
    expect(screen.getByLabelText('EZ bar weight (kg)')).toHaveValue('7.5');
    expect(screen.getByLabelText('Trap bar weight (kg)')).toHaveValue('25');
  });

  it('saves changes under the same gym id, keeping the ids of bars that stay', async () => {
    const { fake, user } = renderPage(createFakeGymService(ezGym));
    const barbell = await screen.findByLabelText('Barbell weight (kg)');
    await user.clear(barbell);
    await user.type(barbell, '20');
    await user.click(screen.getByRole('button', { name: 'Remove Trap bar' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(fake.service.save).toHaveBeenCalled());
    const [, id, input] = fake.service.save.mock.calls[0]!;
    expect(id).toBe(ezGym.id);
    expect(input.barbellKg).toBe(20);
    expect(input.bars).toEqual([{ id: 'b1', name: 'EZ bar', weightKg: 7.5, kind: 'ez_bar' }]);
  });

  it('adds a bar of a kind, prefilling its name, and sends it', async () => {
    const { fake, user } = renderPage(createFakeGymService(sampleGym()));
    await user.click(await screen.findByRole('button', { name: 'Smith bar' }));
    expect(screen.getByLabelText('Bar name')).toHaveValue('Smith bar');
    await user.type(screen.getByLabelText('Bar weight (kg)'), '15');
    await user.click(screen.getByRole('button', { name: 'Add bar' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(fake.service.save).toHaveBeenCalled());
    expect(fake.service.save.mock.calls[0]![2].bars).toMatchObject([
      { name: 'Smith bar', weightKg: 15, kind: 'smith' },
    ]);
  });

  it('only offers each special bar once', async () => {
    renderPage(createFakeGymService(ezGym));
    expect(await screen.findByRole('button', { name: 'EZ bar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Smith bar' })).toBeEnabled();
  });

  it('refuses a bar name that is already used, even in another case', async () => {
    const { user } = renderPage(createFakeGymService(ezGym));
    await user.type(await screen.findByLabelText('Bar name'), '  trap BAR ');
    await user.type(screen.getByLabelText('Bar weight (kg)'), '20');
    await user.click(screen.getByRole('button', { name: 'Add bar' }));
    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
  });

  it('does not silently drop a bar that was typed but never added', async () => {
    const { fake, user } = renderPage(createFakeGymService(sampleGym()));
    await user.type(await screen.findByLabelText('Bar weight (kg)'), '12');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/tap add bar to include this bar/i)).toBeInTheDocument();
    expect(fake.service.save).not.toHaveBeenCalled();
  });

  it('adds the bar when Enter is pressed in the add-bar fields, and does not save', async () => {
    const { fake, user } = renderPage(createFakeGymService(sampleGym()));
    await user.type(await screen.findByLabelText('Bar name'), 'Trap bar');
    await user.type(screen.getByLabelText('Bar weight (kg)'), '25{Enter}');
    expect(await screen.findByLabelText('Trap bar weight (kg)')).toHaveValue('25');
    expect(fake.service.save).not.toHaveBeenCalled();
  });

  it('explains a duplicate name or kind reported by the server', async () => {
    const fake = createFakeGymService(ezGym);
    const { user } = renderPage(fake);
    fake.failNext('save', 'conflict');
    await user.click(await screen.findByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText(/already have a bar with that name or of that kind/i),
    ).toBeInTheDocument();
  });
});

describe('loading', () => {
  it('shows a retry when the gym cannot be loaded', async () => {
    const fake = createFakeGymService(ezGym);
    fake.failNext('get', 'offline');
    const { user } = renderPage(fake);
    expect(await screen.findByText(/you're offline/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('Barbell weight (kg)')).toHaveValue('15');
  });

  it('shows the error state when get rejects instead of staying on loading', async () => {
    const fake = createFakeGymService(ezGym);
    fake.service.get.mockRejectedValueOnce(new Error('boom'));
    renderPage(fake);
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('renders nothing and calls no write while signed out', async () => {
    const { fake } = renderPage(createFakeGymService(ezGym), false);
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Your gym' })).toBeNull());
    expect(fake.service.save).not.toHaveBeenCalled();
    expect(within(document.body).queryByLabelText('Barbell weight (kg)')).toBeNull();
  });
});
