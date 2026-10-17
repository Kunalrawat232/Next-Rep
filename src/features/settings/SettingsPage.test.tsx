import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { offlineServer, renderApp } from '../../test/appHarness';
import { aSet, aWorkout } from '../../test/localDb';

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  vi.restoreAllMocks();
});

const section = (name: string) => screen.findByRole('region', { name });

describe('Settings', () => {
  it('is reached from the main navigation and has its four sections', async () => {
    const { router, user } = renderApp('/');
    await user.click((await screen.findAllByRole('link', { name: 'Settings' }))[0]!);
    expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/settings');
    for (const name of ['Units', 'Your bars', 'Appearance', 'Account'])
      expect(await section(name)).toBeInTheDocument();
  });

  it('shows who is signed in', async () => {
    renderApp('/settings');
    const account = await section('Account');
    expect(account).toHaveTextContent('ada@example.com');
    expect(account).toHaveTextContent('Signed in');
  });
});

describe('the weight unit', () => {
  it('starts on kg, and saves lb to the profile', async () => {
    const { user, profile } = renderApp('/settings');
    const group = await screen.findByRole('group', { name: 'Weight unit' });
    expect(within(group).getByRole('button', { name: 'Kg' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(group).getByRole('button', { name: 'Lb' }));
    expect(within(group).getByRole('button', { name: 'Lb' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await waitFor(() => expect(profile.saved()).toBe('lb'));
  });

  it('shows the unit the profile already has', async () => {
    renderApp('/settings', { savedUnit: 'lb' });
    const group = await screen.findByRole('group', { name: 'Weight unit' });
    await waitFor(() =>
      expect(within(group).getByRole('button', { name: 'Lb' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
  });

  it('keeps the choice after a reload', async () => {
    const first = renderApp('/settings', { userId: 'reload-user' });
    await first.user.click(
      within(await screen.findByRole('group', { name: 'Weight unit' })).getByRole('button', {
        name: 'Lb',
      }),
    );
    first.unmount();
    renderApp('/settings', { userId: 'reload-user' });
    const group = await screen.findByRole('group', { name: 'Weight unit' });
    expect(within(group).getByRole('button', { name: 'Lb' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('says that weights are saved in kg', async () => {
    renderApp('/settings');
    expect(await section('Units')).toHaveTextContent('always saved in kg');
  });
});

describe('appearance', () => {
  it('switches to light mode, keeps it, and switches back', async () => {
    const { user } = renderApp('/settings');
    const toggle = await screen.findByRole('switch', { name: 'Light mode' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('next-rep-theme')).toBe('light');
    await user.click(toggle);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('next-rep-theme')).toBe('dark');
  });

  it('shows the switch on when light mode was chosen earlier', async () => {
    localStorage.setItem('next-rep-theme', 'light');
    renderApp('/settings');
    expect(await screen.findByRole('switch', { name: 'Light mode' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('keeps the theme when the user signs out and another signs in', async () => {
    const { user } = renderApp('/settings');
    await user.click(await screen.findByRole('switch', { name: 'Light mode' }));
    expect(localStorage.getItem('next-rep-theme')).toBe('light');
    // Nothing in sign-out touches it: it is how this screen looks, not the user's data.
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(localStorage.getItem('next-rep-theme')).toBe('light'));
  });
});

describe('the unit buttons', () => {
  it('look like the other buttons on the page, with the chosen unit filled', async () => {
    renderApp('/settings');
    const group = await screen.findByRole('group', { name: 'Weight unit' });
    const kg = within(group).getByRole('button', { name: 'Kg' });
    const lb = within(group).getByRole('button', { name: 'Lb' });
    for (const button of [kg, lb])
      expect(button).toHaveClass('rounded-md', 'min-h-touch', 'font-semibold');
    expect(kg).toHaveClass('bg-accent');
    expect(lb).not.toHaveClass('bg-accent');
    expect(lb).toHaveClass('glass-flat');
    // The other buttons on the page share that shape.
    const signOut = screen.getByRole('button', { name: 'Sign out' });
    expect(signOut).toHaveClass('rounded-md', 'min-h-touch');
  });
});

describe('the liquid glass effect', () => {
  afterEach(() => localStorage.removeItem('next-rep-glass'));

  it('is on to begin with, and the switch turns it off and on, kept on the device', async () => {
    const { user } = renderApp('/settings');
    const glass = await screen.findByRole('switch', { name: 'Liquid glass effect' });
    expect(glass).toHaveAttribute('aria-checked', 'true');
    await user.click(glass);
    expect(glass).toHaveAttribute('aria-checked', 'false');
    expect(localStorage.getItem('next-rep-glass')).toBe('off');
    await user.click(glass);
    expect(glass).toHaveAttribute('aria-checked', 'true');
  });

  it('starts off for a person who turned it off earlier', async () => {
    localStorage.setItem('next-rep-glass', 'off');
    renderApp('/settings');
    expect(await screen.findByRole('switch', { name: 'Liquid glass effect' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });
});

describe('your bars', () => {
  it('shows your bars with a way to change them', async () => {
    renderApp('/settings');
    const gym = await section('Your bars');
    expect(await within(gym).findByText('Barbell 15 kg · EZ bar 7.5 kg')).toBeInTheDocument();
    expect(within(gym).getByRole('link', { name: 'Change bars' })).toHaveAttribute('href', '/gym');
  });

  it('offers to set the bars up when there is no gym yet', async () => {
    renderApp('/settings', { gym: null });
    const gym = await section('Your bars');
    expect(await within(gym).findByRole('link', { name: 'Set up your bars' })).toHaveAttribute(
      'href',
      '/gym',
    );
    expect(gym).toHaveTextContent(/first workout sets this up/i);
  });

  it('says so, and can retry, when the gym cannot be loaded and none is saved', async () => {
    const { user } = renderApp('/settings', { gymsFail: 'offline' });
    const gym = await section('Your bars');
    expect(await within(gym).findByRole('alert')).toHaveTextContent('Could not load your gym');
    await user.click(within(gym).getByRole('button', { name: 'Try again' }));
    expect(await within(gym).findByText(/Barbell 15 kg/)).toBeInTheDocument();
  });

  it('shows the saved gym when there is no connection', async () => {
    const first = renderApp('/settings', { userId: 'gym-cache-user' });
    await within(await section('Your bars')).findByText(/Barbell 15 kg/);
    await waitFor(async () => expect(await first.store.cachedGym()).not.toBeNull());
    first.unmount();
    renderApp('/settings', { userId: 'gym-cache-user', gymsFail: 'offline' });
    expect(
      await within(await section('Your bars')).findByText(/Barbell 15 kg/),
    ).toBeInTheDocument();
  });
});

describe('signing out from Settings', () => {
  it('signs out and goes to the sign-in page', async () => {
    const { user, auth } = renderApp('/settings');
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Sign in', level: 2 })).toBeInTheDocument();
    expect(auth.service.signOut).toHaveBeenCalledTimes(1);
  });

  it('shows the failure with a way to try again, and stays signed in', async () => {
    const { user, auth } = renderApp('/settings');
    auth.service.signOut.mockRejectedValueOnce(new Error('offline'));
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't sign you out");
    expect(alert).toHaveTextContent('You are still signed in');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Sign in', level: 2 })).toBeInTheDocument();
  });

  it('warns about sets still waiting, and Stay signed in changes nothing', async () => {
    const userId = 'waiting-user';
    const seed = renderApp('/workout', { userId, server: offlineServer() });
    const w = await seed.store.startWorkout(aWorkout());
    await seed.store.logSet(aSet(w.id));
    seed.unmount();
    const { user, db } = renderApp('/settings', { userId, server: offlineServer() });
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    const group = await screen.findByRole('group', { name: 'Sets waiting' });
    expect(group).toHaveTextContent('still waiting to sync');
    await user.click(within(group).getByRole('button', { name: 'Stay signed in' }));
    expect(screen.queryByRole('group', { name: 'Sets waiting' })).not.toBeInTheDocument();
    expect(await db.sets.count()).toBe(1);
  });
});

describe('the page without a connection', () => {
  it('still changes the unit and the theme, and saves the unit later', async () => {
    const { user, profile } = renderApp('/settings', { gymsFail: 'offline' });
    profile.failNext('setUnit', 'offline');
    const group = await screen.findByRole('group', { name: 'Weight unit' });
    await user.click(within(group).getByRole('button', { name: 'Lb' }));
    await user.click(screen.getByRole('switch', { name: 'Light mode' }));
    expect(within(group).getByRole('button', { name: 'Lb' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(document.documentElement.dataset.theme).toBe('light');
    act(() => void window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(profile.saved()).toBe('lb'));
  });
});
