import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeAuthService } from '../../test/fakeAuth';
import { createFakeProfileService } from '../../test/fakeProfile';
import { AuthProvider } from '../auth';
import { ProfileServiceProvider } from './ProfileServiceContext';
import { UnitProvider, useUnit } from './UnitProvider';

afterEach(() => localStorage.clear());

function Show() {
  const { unit, setUnit } = useUnit();
  return (
    <>
      <p data-testid="unit">{unit}</p>
      <button onClick={() => setUnit('lb')}>choose lb</button>
      <button onClick={() => setUnit('kg')}>choose kg</button>
    </>
  );
}

function setup(profile = createFakeProfileService(), userId = 'u1') {
  const auth = createFakeAuthService({ id: userId, email: 'a@b.co' });
  const view = render(
    <AuthProvider service={auth.service}>
      <ProfileServiceProvider service={profile.service}>
        <UnitProvider>
          <Show />
        </UnitProvider>
      </ProfileServiceProvider>
    </AuthProvider>,
  );
  return { profile, auth, ...view };
}

const unit = () => screen.findByTestId('unit');

describe('the weight unit', () => {
  it('is kg for a new user with nothing saved anywhere', async () => {
    setup();
    expect(await unit()).toHaveTextContent('kg');
  });

  it('takes the server value on a new device', async () => {
    setup(createFakeProfileService('lb'));
    await waitFor(async () => expect(await unit()).toHaveTextContent('lb'));
    expect(localStorage.getItem('next-rep-unit-u1')).toBe('lb');
  });

  it('applies a choice at once and saves it to the profile', async () => {
    const { profile } = setup();
    await unit();
    fireEvent.click(screen.getByRole('button', { name: 'choose lb' }));
    expect(await unit()).toHaveTextContent('lb');
    await waitFor(() => expect(profile.saved()).toBe('lb'));
    expect(localStorage.getItem('next-rep-unit-pending-u1')).toBeNull();
  });

  it('keeps a choice made offline, and sends it when the network returns', async () => {
    const profile = createFakeProfileService('kg');
    profile.failNext('setUnit', 'offline');
    setup(profile);
    await unit();
    fireEvent.click(screen.getByRole('button', { name: 'choose lb' }));
    await waitFor(() => expect(profile.service.setUnit).toHaveBeenCalledTimes(1));
    expect(await unit()).toHaveTextContent('lb');
    expect(localStorage.getItem('next-rep-unit-pending-u1')).toBe('yes');
    expect(profile.saved()).toBe('kg');
    act(() => void window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(profile.saved()).toBe('lb'));
    expect(localStorage.getItem('next-rep-unit-pending-u1')).toBeNull();
  });

  it('does not let the server overwrite a choice that has not been sent yet', async () => {
    localStorage.setItem('next-rep-unit-u1', 'lb');
    localStorage.setItem('next-rep-unit-pending-u1', 'yes');
    const profile = createFakeProfileService('kg');
    setup(profile);
    await waitFor(() => expect(profile.saved()).toBe('lb'));
    expect(await unit()).toHaveTextContent('lb');
  });

  it('keeps the device choice when the server cannot be reached at start', async () => {
    localStorage.setItem('next-rep-unit-u1', 'lb');
    const profile = createFakeProfileService('kg');
    profile.failNext('getUnit', 'offline');
    setup(profile);
    await waitFor(() => expect(profile.service.getUnit).toHaveBeenCalled());
    expect(await unit()).toHaveTextContent('lb');
  });

  it('keeps one user’s choice away from another', async () => {
    localStorage.setItem('next-rep-unit-u1', 'lb');
    setup(createFakeProfileService(), 'u2');
    expect(await unit()).toHaveTextContent('kg');
  });

  it('shows kg to a signed-out visitor, and ignores a choice made then', async () => {
    const auth = createFakeAuthService(null);
    render(
      <AuthProvider service={auth.service}>
        <ProfileServiceProvider service={createFakeProfileService().service}>
          <UnitProvider>
            <Show />
          </UnitProvider>
        </ProfileServiceProvider>
      </AuthProvider>,
    );
    expect(await unit()).toHaveTextContent('kg');
    fireEvent.click(screen.getByRole('button', { name: 'choose lb' }));
    expect(await unit()).toHaveTextContent('kg');
  });

  it('works with storage blocked: the choice applies for this visit', async () => {
    const real = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('blocked');
      },
      configurable: true,
    });
    try {
      setup();
      await unit();
      await act(async () => undefined);
      fireEvent.click(screen.getByRole('button', { name: 'choose lb' }));
      expect(await unit()).toHaveTextContent('lb');
    } finally {
      Object.defineProperty(window, 'localStorage', real);
    }
  });

  it('keeps the second of two quick choices, even when the first save is still on its way', async () => {
    const profile = createFakeProfileService('kg');
    setup(profile);
    await unit();
    await act(async () => undefined);
    const release = profile.hold('setUnit');
    fireEvent.click(screen.getByRole('button', { name: 'choose lb' }));
    await waitFor(() => expect(profile.service.setUnit).toHaveBeenCalledWith('u1', 'lb'));
    fireEvent.click(screen.getByRole('button', { name: 'choose kg' }));
    release();
    await waitFor(() => expect(profile.service.setUnit).toHaveBeenLastCalledWith('u1', 'kg'));
    await waitFor(() => expect(profile.saved()).toBe('kg'));
    expect(await unit()).toHaveTextContent('kg');
    expect(localStorage.getItem('next-rep-unit-pending-u1')).toBeNull();
  });

  it('does not let an old answer from the server undo a choice made while it was on its way', async () => {
    const profile = createFakeProfileService('kg');
    const release = profile.hold('getUnit');
    setup(profile);
    await unit();
    await act(async () => undefined);
    fireEvent.click(screen.getByRole('button', { name: 'choose lb' }));
    release();
    await waitFor(() => expect(profile.saved()).toBe('lb'));
    expect(await unit()).toHaveTextContent('lb');
  });

  it('still sends the choice when storage is blocked', async () => {
    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    try {
      const profile = createFakeProfileService('kg');
      setup(profile);
      await unit();
      await act(async () => undefined);
      fireEvent.click(screen.getByRole('button', { name: 'choose lb' }));
      await waitFor(() => expect(profile.saved()).toBe('lb'));
      expect(await unit()).toHaveTextContent('lb');
    } finally {
      blocked.mockRestore();
    }
  });

  it('stops waiting to send a choice the server refused', async () => {
    const profile = createFakeProfileService('kg');
    profile.failNext('setUnit', 'rejected');
    setup(profile);
    await unit();
    await act(async () => undefined);
    fireEvent.click(screen.getByRole('button', { name: 'choose lb' }));
    await waitFor(() => expect(profile.service.setUnit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(localStorage.getItem('next-rep-unit-pending-u1')).toBeNull());
  });

  it('is not held up for ever by a request that never answers', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const profile = createFakeProfileService('kg');
      setup(profile);
      await unit();
      await act(async () => undefined);
      profile.hold('setUnit');
      fireEvent.click(screen.getByRole('button', { name: 'choose lb' }));
      await waitFor(() => expect(profile.service.setUnit).toHaveBeenCalledTimes(1));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(16_000);
      });
      // The held call is still open, but the next pass goes ahead: the network returns.
      act(() => void window.dispatchEvent(new Event('online')));
      await waitFor(() => expect(profile.service.setUnit).toHaveBeenCalledTimes(2));
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not flip a screen that is open when another device changes the unit later', async () => {
    const profile = createFakeProfileService('kg');
    setup(profile);
    expect(await unit()).toHaveTextContent('kg');
    await waitFor(() => expect(profile.service.getUnit).toHaveBeenCalledTimes(1));
    profile.setSaved('lb');
    act(() => void window.dispatchEvent(new Event('online')));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await unit()).toHaveTextContent('kg');
  });
});
