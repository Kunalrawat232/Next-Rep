import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GymSnapshot } from '../../data/local/types';
import { HOME_GYM, offlineServer, renderApp } from '../../test/appHarness';
import { aWorkout } from '../../test/localDb';

const HOME: GymSnapshot = { name: 'Home gym', barbellKg: 15, bars: HOME_GYM.bars };
const START = new Date('2026-10-10T10:00:00.000Z').getTime();

let vibrate: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(START);
  vibrate = vi.fn();
  Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'vibrate');
});

const keyFor = (userId: string) => `next-rep-rest-${userId}`;

/** An open workout on the device, then the workout page. */
async function openWorkout(before?: (ids: { userId: string; workoutId: string }) => void) {
  const userId = `rest-${Math.random()}`;
  const first = renderApp('/workout', { userId, server: offlineServer() });
  const workout = await first.store.startWorkout({
    ...aWorkout(),
    startedAt: new Date(START).toISOString(),
    gymId: HOME_GYM.id,
    gymSnapshot: HOME,
  });
  first.unmount();
  before?.({ userId, workoutId: workout.id });
  const app = renderApp('/workout', { userId, server: offlineServer() });
  await screen.findByRole('button', { name: /^Rest/ });
  return { ...app, userId, workoutId: workout.id };
}

const pill = () => screen.getByRole('button', { name: /^Rest/ });
const panel = () => screen.getByRole('group', { name: 'Rest timer' });
const passSeconds = (seconds: number) => vi.setSystemTime(Date.now() + seconds * 1000);

describe('the rest timer', () => {
  it('starts idle, with the pill saying Rest', async () => {
    await openWorkout();
    expect(pill()).toHaveTextContent(/^Rest$/);
    expect(screen.queryByRole('group', { name: 'Rest timer' })).not.toBeInTheDocument();
  });

  it('offers 60, 90, 120 and 180 seconds, and a preset starts the countdown', async () => {
    const { user } = await openWorkout();
    await user.click(pill());
    for (const seconds of [60, 90, 120, 180])
      expect(within(panel()).getByRole('button', { name: `${seconds} s` })).toBeInTheDocument();
    await user.click(within(panel()).getByRole('button', { name: '90 s' }));
    expect(pill()).toHaveTextContent('Rest 1:30');
    expect(screen.queryByRole('group', { name: 'Rest timer' })).not.toBeInTheDocument();
  });

  it('counts down from the stored end time, however long the tab slept', async () => {
    const { user } = await openWorkout();
    await user.click(pill());
    await user.click(within(panel()).getByRole('button', { name: '120 s' }));
    passSeconds(45);
    await waitFor(() => expect(pill()).toHaveTextContent('Rest 1:15'));
  });

  it('starts a custom rest of whole seconds from 30 to 900', async () => {
    const { user } = await openWorkout();
    await user.click(pill());
    await user.type(within(panel()).getByLabelText('Custom rest (seconds)'), '75');
    await user.click(within(panel()).getByRole('button', { name: 'Start custom rest' }));
    expect(pill()).toHaveTextContent('Rest 1:15');
  });

  it.each([
    ['20', 'Rest must be 30 to 900 seconds.'],
    ['901', 'Rest must be 30 to 900 seconds.'],
    ['1.5', 'Enter the rest in whole seconds, such as 75.'],
    ['', 'Enter the rest in whole seconds, such as 75.'],
  ])('refuses a custom rest of %j and says why', async (text, message) => {
    const { user, userId } = await openWorkout();
    await user.click(pill());
    const field = within(panel()).getByLabelText('Custom rest (seconds)');
    if (text) await user.type(field, text);
    await user.click(within(panel()).getByRole('button', { name: 'Start custom rest' }));
    expect(within(panel()).getByText(message)).toBeInTheDocument();
    expect(field).toBeInvalid();
    expect(pill()).toHaveTextContent(/^Rest$/);
    expect(localStorage.getItem(keyFor(userId))).toBeNull();
  });

  it('clears the message once the user types again', async () => {
    const { user } = await openWorkout();
    await user.click(pill());
    const field = within(panel()).getByLabelText('Custom rest (seconds)');
    await user.type(field, '5');
    await user.click(within(panel()).getByRole('button', { name: 'Start custom rest' }));
    await user.type(field, '0');
    expect(field).toBeValid();
  });

  it('adds 30 seconds to a running rest, and Stop ends it', async () => {
    const { user, userId } = await openWorkout();
    await user.click(pill());
    await user.click(within(panel()).getByRole('button', { name: '60 s' }));
    await user.click(pill());
    await user.click(within(panel()).getByRole('button', { name: '+30 s' }));
    expect(pill()).toHaveTextContent('Rest 1:30');
    await user.click(within(panel()).getByRole('button', { name: 'Stop rest' }));
    expect(pill()).toHaveTextContent(/^Rest$/);
    expect(localStorage.getItem(keyFor(userId))).toBeNull();
  });

  it('says Rest over and vibrates once when the time is up', async () => {
    const { user } = await openWorkout();
    await user.click(pill());
    await user.click(within(panel()).getByRole('button', { name: '60 s' }));
    passSeconds(59);
    await waitFor(() => expect(pill()).toHaveTextContent('Rest 0:01'));
    expect(vibrate).not.toHaveBeenCalled();
    passSeconds(2);
    await waitFor(() => expect(pill()).toHaveTextContent('Rest over'));
    expect(screen.getAllByRole('status').some((node) => node.textContent === 'Rest over')).toBe(
      true,
    );
    expect(vibrate).toHaveBeenCalledTimes(1);
    passSeconds(30);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('offers Dismiss, not +30 s, once the rest is over', async () => {
    const { user } = await openWorkout();
    await user.click(pill());
    await user.click(within(panel()).getByRole('button', { name: '60 s' }));
    passSeconds(61);
    await waitFor(() => expect(pill()).toHaveTextContent('Rest over'));
    await user.click(pill());
    expect(within(panel()).queryByRole('button', { name: '+30 s' })).not.toBeInTheDocument();
    await user.click(within(panel()).getByRole('button', { name: 'Dismiss' }));
    expect(pill()).toHaveTextContent(/^Rest$/);
  });

  it('starts a new rest after one is over, and can buzz again', async () => {
    const { user } = await openWorkout();
    await user.click(pill());
    await user.click(within(panel()).getByRole('button', { name: '60 s' }));
    passSeconds(61);
    await waitFor(() => expect(vibrate).toHaveBeenCalledTimes(1));
    await user.click(pill());
    await user.click(within(panel()).getByRole('button', { name: '90 s' }));
    expect(pill()).toHaveTextContent('Rest 1:30');
    passSeconds(91);
    await waitFor(() => expect(vibrate).toHaveBeenCalledTimes(2));
  });

  it('survives a reload: the countdown carries on from the stored end time', async () => {
    const first = await openWorkout();
    await first.user.click(pill());
    await first.user.click(within(panel()).getByRole('button', { name: '180 s' }));
    first.unmount();
    passSeconds(60);
    renderApp('/workout', { userId: first.userId, server: offlineServer() });
    await waitFor(() => expect(pill()).toHaveTextContent('Rest 2:00'));
  });

  it('shows Rest over, without buzzing, when the page opens after the time was up', async () => {
    await openWorkout(({ userId, workoutId }) =>
      localStorage.setItem(keyFor(userId), JSON.stringify({ workoutId, endsAt: START - 5000 })),
    );
    expect(pill()).toHaveTextContent('Rest over');
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('ignores a rest left by another workout', async () => {
    await openWorkout(({ userId }) =>
      localStorage.setItem(
        keyFor(userId),
        JSON.stringify({ workoutId: 'an-earlier-workout', endsAt: START + 60_000 }),
      ),
    );
    expect(pill()).toHaveTextContent(/^Rest$/);
  });

  it.each(['not json', '{"workoutId":5}', '{"workoutId":"x","endsAt":"soon"}', 'null'])(
    'ignores stored garbage %j',
    async (garbage) => {
      await openWorkout(({ userId }) => localStorage.setItem(keyFor(userId), garbage));
      expect(pill()).toHaveTextContent(/^Rest$/);
    },
  );

  it('still runs for this visit when the browser blocks storage', async () => {
    const { user } = await openWorkout();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await user.click(pill());
    await user.click(within(panel()).getByRole('button', { name: '60 s' }));
    expect(pill()).toHaveTextContent('Rest 1:00');
  });

  it('is cleared when the workout ends', async () => {
    const { user, userId, router } = await openWorkout();
    await user.click(pill());
    await user.click(within(panel()).getByRole('button', { name: '60 s' }));
    expect(localStorage.getItem(keyFor(userId))).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'End workout' }));
    await user.click(screen.getByRole('button', { name: 'Yes, end it' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(localStorage.getItem(keyFor(userId))).toBeNull();
  });

  it('does not buzz while the page is hidden, but still says Rest over', async () => {
    const { user } = await openWorkout();
    await user.click(pill());
    await user.click(within(panel()).getByRole('button', { name: '60 s' }));
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    try {
      passSeconds(61);
      document.dispatchEvent(new Event('visibilitychange'));
      await waitFor(() => expect(pill()).toHaveTextContent('Rest over'));
      expect(vibrate).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(document, 'visibilityState');
    }
  });

  it('ignores a stored end time further ahead than any rest, or over for more than an hour', async () => {
    await openWorkout(({ userId, workoutId }) =>
      localStorage.setItem(keyFor(userId), JSON.stringify({ workoutId, endsAt: 8.64e15 })),
    );
    expect(pill()).toHaveTextContent(/^Rest$/);
    const stale = await openWorkout(({ userId, workoutId }) =>
      localStorage.setItem(
        keyFor(userId),
        JSON.stringify({ workoutId, endsAt: START - 3601 * 1000 }),
      ),
    );
    expect(pill()).toHaveTextContent(/^Rest$/);
    stale.unmount();
  });

  it('does not buzz late when the page becomes visible again after the time was up', async () => {
    const { user } = await openWorkout();
    await user.click(pill());
    await user.click(within(panel()).getByRole('button', { name: '60 s' }));
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    try {
      passSeconds(61);
      document.dispatchEvent(new Event('visibilitychange'));
      await waitFor(() => expect(pill()).toHaveTextContent('Rest over'));
    } finally {
      Reflect.deleteProperty(document, 'visibilityState');
    }
    document.dispatchEvent(new Event('visibilitychange'));
    await user.click(pill());
    await user.click(pill());
    expect(pill()).toHaveTextContent('Rest over');
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('buzzes once even when the screen redraws while the rest stays over', async () => {
    const { user } = await openWorkout();
    await user.click(pill());
    await user.click(within(panel()).getByRole('button', { name: '60 s' }));
    passSeconds(61);
    await waitFor(() => expect(vibrate).toHaveBeenCalledTimes(1));
    await user.click(pill());
    await user.click(pill());
    document.dispatchEvent(new Event('visibilitychange'));
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('puts focus back on the pill when the panel closes, and Escape closes it', async () => {
    const { user } = await openWorkout();
    await user.click(pill());
    await user.click(within(panel()).getByRole('button', { name: '60 s' }));
    expect(pill()).toHaveFocus();
    await user.click(pill());
    expect(pill()).toHaveAttribute('aria-expanded', 'true');
    expect(pill()).toHaveAttribute('aria-controls', panel().id);
    await user.keyboard('{Tab}{Escape}');
    expect(screen.queryByRole('group', { name: 'Rest timer' })).not.toBeInTheDocument();
    expect(pill()).toHaveFocus();
    expect(pill()).toHaveAttribute('aria-expanded', 'false');
    expect(pill()).not.toHaveAttribute('aria-controls');
  });

  it('does not bring back an old message or custom text when the panel is reopened', async () => {
    const { user } = await openWorkout();
    await user.click(pill());
    await user.type(within(panel()).getByLabelText('Custom rest (seconds)'), '5');
    await user.click(within(panel()).getByRole('button', { name: 'Start custom rest' }));
    expect(within(panel()).getByText(/30 to 900 seconds\./, { selector: 'p' })).toBeInTheDocument();
    await user.click(pill());
    await user.click(pill());
    expect(within(panel()).getByLabelText('Custom rest (seconds)')).toHaveValue('');
    expect(within(panel()).getByLabelText('Custom rest (seconds)')).toBeValid();
  });

  it('does not buzz where the browser cannot vibrate', async () => {
    Reflect.deleteProperty(navigator, 'vibrate');
    const { user } = await openWorkout();
    await user.click(pill());
    await user.click(within(panel()).getByRole('button', { name: '60 s' }));
    passSeconds(61);
    await waitFor(() => expect(pill()).toHaveTextContent('Rest over'));
  });

  it('keeps the rest of one user from showing for another', async () => {
    const first = await openWorkout();
    await first.user.click(pill());
    await first.user.click(within(panel()).getByRole('button', { name: '60 s' }));
    first.unmount();
    await openWorkout();
    expect(pill()).toHaveTextContent(/^Rest$/);
  });
});
