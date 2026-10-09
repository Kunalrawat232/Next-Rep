// Edge and negative cases for starting a workout and the saved gym list. A failing test here is a suspected bug.
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BENCH, HOME_GYM, renderApp, offlineServer } from '../../test/appHarness';
import { sampleGym } from '../../test/fakeGyms';
import { aWorkout } from '../../test/localDb';

const OLD_GYM = sampleGym({
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Old gym',
  barbellKg: 20,
});

describe('the saved gym list', () => {
  async function withSavedGyms(userId: string) {
    const first = renderApp('/workout', { userId, gyms: [OLD_GYM] });
    await screen.findByRole('button', { name: 'Start workout' });
    await waitFor(async () => expect(await first.store.cachedGyms()).toHaveLength(1));
    first.unmount();
  }

  it('is used when the server answers with an error that is not "offline"', async () => {
    const userId = `gyms-${Math.random()}`;
    await withSavedGyms(userId);
    renderApp('/workout', { userId, gymsFail: 'unknown' });
    expect(await screen.findByText('Old gym')).toBeInTheDocument();
    expect(screen.getByText(/saved on this device/i)).toBeInTheDocument();
  });

  it('is replaced by the new list when online, so a gym deleted elsewhere is gone offline too', async () => {
    const userId = `gyms-${Math.random()}`;
    await withSavedGyms(userId);
    const second = renderApp('/workout', { userId, gyms: [HOME_GYM] });
    expect(await screen.findByText('Home gym')).toBeInTheDocument();
    expect(screen.queryByText('Old gym')).not.toBeInTheDocument();
    await waitFor(async () =>
      expect((await second.store.cachedGyms())?.map((g) => g.name)).toEqual(['Home gym']),
    );
  });

  it('is saved as empty when the user has no gyms any more, and offline then asks to add one', async () => {
    const userId = `gyms-${Math.random()}`;
    await withSavedGyms(userId);
    const online = renderApp('/workout', { userId, gyms: [] });
    await screen.findByRole('heading', { name: /add a gym first/i });
    await waitFor(async () => expect(await online.store.cachedGyms()).toEqual([]));
    online.unmount();
    renderApp('/workout', { userId, gyms: [HOME_GYM], gymsFail: 'offline' });
    expect(await screen.findByRole('heading', { name: /add a gym first/i })).toBeInTheDocument();
  });

  it('shows a gym name as text, not as markup', async () => {
    renderApp('/workout', {
      gyms: [sampleGym({ name: '<img src=x alt="pwned"> Gym' })],
    });
    expect(await screen.findByText('<img src=x alt="pwned"> Gym')).toBeInTheDocument();
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
      gymSnapshot: { name: 'Home gym', barbellKg: 15, bars: [] },
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
