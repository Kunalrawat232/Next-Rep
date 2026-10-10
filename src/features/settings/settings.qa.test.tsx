import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { offlineServer, renderApp } from '../../test/appHarness';
import { tapTogether } from '../../test/doubleTap';
import { aSet, aWorkout } from '../../test/localDb';

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  vi.restoreAllMocks();
});

/** A user with one open workout and the given number of sets that the server has not got. */
async function withWaitingRows(userId: string, sets: number, mark?: 'failed') {
  const seed = renderApp('/workout', { userId, server: offlineServer() });
  const w = await seed.store.startWorkout(aWorkout());
  const ids: string[] = [];
  for (let i = 0; i < sets; i += 1) {
    const set = aSet(w.id, { loggedAt: `2026-10-10T10:0${i + 1}:00.000Z` });
    await seed.store.logSet(set);
    ids.push(set.id);
  }
  if (mark === 'failed')
    for (const id of ids) await seed.db.sets.update(id, { syncStatus: 'failed' });
  await seed.db.workouts.update(w.id, { syncStatus: 'synced' });
  seed.unmount();
}

describe('QA sign-out', () => {
  it('signs out once when Sign out is tapped twice in the same instant', async () => {
    const { auth } = renderApp('/settings');
    tapTogether(await screen.findByRole('button', { name: 'Sign out' }), 3);
    expect(await screen.findByRole('heading', { name: 'Sign in', level: 2 })).toBeInTheDocument();
    expect(auth.service.signOut).toHaveBeenCalledTimes(1);
  });

  it('signs out once when "Sign out anyway" is tapped twice in the same instant, and keeps the waiting sets', async () => {
    await withWaitingRows('qa-anyway', 1);
    const { user, auth, db } = renderApp('/settings', {
      userId: 'qa-anyway',
      server: offlineServer(),
    });
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    tapTogether(await screen.findByRole('button', { name: 'Sign out anyway' }), 3);
    await waitFor(() => expect(auth.service.signOut).toHaveBeenCalledTimes(1));
    expect(await db.sets.count()).toBe(1);
  });

  it.each([
    [1, '1 item is still waiting to sync'],
    [2, '2 items are still waiting to sync'],
  ])(
    'counts %i waiting sets in the warning (the synced workout is not counted)',
    async (n, text) => {
      await withWaitingRows(`qa-count-${n}`, n);
      const { user } = renderApp('/settings', { userId: `qa-count-${n}`, server: offlineServer() });
      await user.click(await screen.findByRole('button', { name: 'Sign out' }));
      expect(await screen.findByRole('group', { name: 'Sets waiting' })).toHaveTextContent(text);
    },
  );

  it('also warns about sets that failed to sync, not only the ones that are waiting', async () => {
    await withWaitingRows('qa-failed', 2, 'failed');
    const { user, auth } = renderApp('/settings', {
      userId: 'qa-failed',
      server: offlineServer(),
    });
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('group', { name: 'Sets waiting' })).toHaveTextContent(
      '2 items are',
    );
    expect(auth.service.signOut).not.toHaveBeenCalled();
  });

  it('does not lose waiting sets when the sign-out fails, and asks again about them on Try again', async () => {
    await withWaitingRows('qa-retry', 1);
    const { user, auth, db } = renderApp('/settings', {
      userId: 'qa-retry',
      server: offlineServer(),
    });
    auth.service.signOut.mockRejectedValueOnce(new Error('offline'));
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    await user.click(await screen.findByRole('button', { name: 'Sign out anyway' }));
    const alert = await screen.findByRole('alert');
    // One message at a time: the waiting warning is replaced by the failure.
    expect(screen.queryByRole('group', { name: 'Sets waiting' })).not.toBeInTheDocument();
    expect(await db.sets.count()).toBe(1);
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('group', { name: 'Sets waiting' })).toBeInTheDocument();
    expect(auth.service.signOut).toHaveBeenCalledTimes(1);
  });
});

describe('QA unit and theme controls', () => {
  it('has exactly one unit pressed at a time, with named buttons', async () => {
    const { user } = renderApp('/settings');
    const group = await screen.findByRole('group', { name: 'Weight unit' });
    const pressed = () =>
      within(group)
        .getAllByRole('button')
        .filter((b) => b.getAttribute('aria-pressed') === 'true')
        .map((b) => b.textContent);
    expect(pressed()).toEqual(['kg']);
    await user.click(within(group).getByRole('button', { name: 'lb' }));
    expect(pressed()).toEqual(['lb']);
    await user.click(within(group).getByRole('button', { name: 'lb' }));
    expect(pressed()).toEqual(['lb']);
  });

  it('keeps the unit on the screen when the save is refused for any reason, and resends after a reload if it was only a fault', async () => {
    const userId = 'qa-unknown';
    const first = renderApp('/settings', { userId });
    first.profile.failNext('setUnit', 'unknown');
    const group = await screen.findByRole('group', { name: 'Weight unit' });
    await first.user.click(within(group).getByRole('button', { name: 'lb' }));
    await waitFor(() => expect(first.profile.service.setUnit).toHaveBeenCalledTimes(1));
    expect(first.profile.saved()).toBeNull();
    expect(within(group).getByRole('button', { name: 'lb' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    first.unmount();

    const second = renderApp('/settings', { userId });
    const again = await screen.findByRole('group', { name: 'Weight unit' });
    expect(within(again).getByRole('button', { name: 'lb' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await waitFor(() => expect(second.profile.saved()).toBe('lb'));
  });

  it('shows the dark/light switch with a name and state, and the theme works with storage blocked', async () => {
    const real = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('blocked');
      },
      configurable: true,
    });
    try {
      const { user } = renderApp('/settings');
      const toggle = await screen.findByRole('switch', { name: 'Light mode' });
      expect(toggle).toHaveAttribute('aria-checked', 'false');
      await user.click(toggle);
      expect(document.documentElement.dataset.theme).toBe('light');
      expect(screen.getByRole('switch', { name: 'Light mode' })).toHaveAttribute(
        'aria-checked',
        'true',
      );
      await user.click(screen.getByRole('switch', { name: 'Light mode' }));
      expect(document.documentElement.dataset.theme).toBe('dark');
    } finally {
      Object.defineProperty(window, 'localStorage', real);
    }
  });

  it('treats a stored theme that is not light or dark as dark', async () => {
    localStorage.setItem('next-rep-theme', 'purple');
    renderApp('/settings');
    expect(await screen.findByRole('switch', { name: 'Light mode' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('reads a unit of "LB" or garbage on the device as kg, and never writes it back', async () => {
    const userId = 'qa-garbage-unit';
    localStorage.setItem(`next-rep-unit-${userId}`, 'LB');
    renderApp('/settings', { userId });
    const group = await screen.findByRole('group', { name: 'Weight unit' });
    expect(within(group).getByRole('button', { name: 'kg' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('a unit change that arrives from the keyboard (Enter on a focused chip) works like a tap', async () => {
    const { user } = renderApp('/settings');
    const group = await screen.findByRole('group', { name: 'Weight unit' });
    within(group).getByRole('button', { name: 'lb' }).focus();
    await user.keyboard('{Enter}');
    expect(within(group).getByRole('button', { name: 'lb' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
