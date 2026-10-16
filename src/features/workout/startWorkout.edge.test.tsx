// Edge and negative cases for starting a workout and the saved gym list. A failing test here is a suspected bug.
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BENCH, HOME_GYM, renderApp, offlineServer } from '../../test/appHarness';
import { sampleGym } from '../../test/fakeGyms';
import { aWorkout } from '../../test/localDb';

const OLD_GYM = sampleGym({
  id: '33333333-3333-4333-8333-333333333333',
  barbellKg: 20,
});

describe('the saved gym', () => {
  async function withSavedGym(userId: string) {
    const first = renderApp('/workout', { userId, gym: OLD_GYM });
    await screen.findByRole('button', { name: 'Start workout' });
    await waitFor(async () =>
      expect(await first.store.cachedGym()).toMatchObject({ gym: { barbellKg: 20 } }),
    );
    first.unmount();
  }

  it('is used when the server answers with an error that is not "offline"', async () => {
    const userId = `gyms-${Math.random()}`;
    await withSavedGym(userId);
    renderApp('/workout', { userId, gymsFail: 'unknown' });
    expect(await screen.findByText(/barbell 20 kg/i)).toBeInTheDocument();
    expect(screen.getByText(/saved on this device/i)).toBeInTheDocument();
  });

  it('is replaced by the new answer when online, so a change made elsewhere shows offline too', async () => {
    const userId = `gyms-${Math.random()}`;
    await withSavedGym(userId);
    const second = renderApp('/workout', { userId, gym: HOME_GYM });
    expect(await screen.findByText(/barbell 15 kg/i)).toBeInTheDocument();
    expect(screen.queryByText(/barbell 20 kg/i)).not.toBeInTheDocument();
    await waitFor(async () =>
      expect(await second.store.cachedGym()).toMatchObject({ gym: { barbellKg: 15 } }),
    );
  });

  it('is saved as "no gym yet", and offline the first workout then says it needs a connection', async () => {
    const userId = `gyms-${Math.random()}`;
    await withSavedGym(userId);
    const online = renderApp('/workout', { userId, gym: null });
    await screen.findByText(/standard 20 kg barbell/i);
    await waitFor(async () => expect(await online.store.cachedGym()).toEqual({ gym: null }));
    online.unmount();
    const { user, gyms } = renderApp('/workout', { userId, gym: HOME_GYM, gymsFail: 'offline' });
    await screen.findByText(/standard 20 kg barbell/i);
    gyms.failNext('save', 'offline');
    await user.click(screen.getByRole('button', { name: 'Start workout' }));
    expect(await screen.findByText(/setting up your gym needs a connection/i)).toBeInTheDocument();
  });

  it('shows a bar name as text, not as markup', async () => {
    renderApp('/workout', {
      gym: sampleGym({
        bars: [{ id: 'b1', name: '<img src=x alt="pwned"> bar', weightKg: 7.5, kind: 'other' }],
      }),
    });
    expect(await screen.findByText(/<img src=x alt="pwned"> bar/)).toBeInTheDocument();
    expect(screen.queryByAltText('pwned')).not.toBeInTheDocument();
  });
});

describe('the workout page for an exercise it does not know', () => {
  it('shows the open workout with a generic name instead of failing', async () => {
    const userId = `unknown-${Math.random()}`;
    const seed = renderApp('/workout', { userId, server: offlineServer() });
    await seed.store.startWorkout({
      ...aWorkout(),
      gymId: HOME_GYM.id,
      gymSnapshot: { barbellKg: 15, bars: [] },
    });
    seed.unmount();
    renderApp('/workout?exercise=00000000-0000-4000-8000-000000000000', { userId });
    expect(await screen.findByRole('link', { name: 'Exercise' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tap instead' })).toBeInTheDocument();
  });

  it('does not offer to log before an exercise is chosen', async () => {
    const userId = `unknown-${Math.random()}`;
    const seed = renderApp('/workout', { userId, server: offlineServer() });
    await seed.store.startWorkout({ ...aWorkout(), gymId: HOME_GYM.id });
    seed.unmount();
    renderApp('/workout', { userId });
    await screen.findByText(/choose an exercise/i);
    expect(screen.queryByRole('link', { name: 'Tap instead' })).not.toBeInTheDocument();
    expect(BENCH).toBeTruthy();
  });
});
