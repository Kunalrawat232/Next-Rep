import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useOnline } from './useOnline';

function Probe() {
  return <p>{useOnline() ? 'online' : 'offline'}</p>;
}

afterEach(() => vi.unstubAllGlobals());

describe('useOnline', () => {
  it('starts from what the browser says', () => {
    vi.stubGlobal('navigator', { onLine: false });
    render(<Probe />);
    expect(screen.getByText('offline')).toBeInTheDocument();
  });

  it('follows the offline and online events', () => {
    const nav = { onLine: true };
    vi.stubGlobal('navigator', nav);
    render(<Probe />);
    expect(screen.getByText('online')).toBeInTheDocument();
    act(() => {
      nav.onLine = false;
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByText('offline')).toBeInTheDocument();
    act(() => {
      nav.onLine = true;
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByText('online')).toBeInTheDocument();
  });

  it('stops listening when it unmounts', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<Probe />);
    unmount();
    expect(remove).toHaveBeenCalledWith('online', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('offline', expect.any(Function));
  });
});
