import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const undos: ReturnType<typeof vi.fn>[] = [];
const startLiquidGlass = vi.fn<(element: HTMLElement, preset: string) => Promise<() => void>>(
  async () => {
    const undo = vi.fn();
    undos.push(undo);
    return undo as () => void;
  },
);
vi.mock('./liquidGlass', () => ({
  startLiquidGlass: (element: HTMLElement, preset: string) => startLiquidGlass(element, preset),
}));

import { readGlassEffect, useGlassEffect, useLiquidGlass } from './useGlassEffect';

beforeEach(() => {
  undos.length = 0;
  startLiquidGlass.mockClear();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});
afterEach(() => vi.restoreAllMocks());

describe('the glass effect setting', () => {
  it('is on until the person turns it off', () => {
    expect(readGlassEffect()).toBe(true);
    const { result } = renderHook(() => useGlassEffect());
    expect(result.current.enabled).toBe(true);
  });

  it('keeps the choice on this device and tells every screen at once', () => {
    const first = renderHook(() => useGlassEffect());
    const second = renderHook(() => useGlassEffect());
    act(() => first.result.current.setEnabled(false));
    expect(localStorage.getItem('next-rep-glass')).toBe('off');
    expect(first.result.current.enabled).toBe(false);
    expect(second.result.current.enabled).toBe(false);
    act(() => first.result.current.setEnabled(true));
    expect(second.result.current.enabled).toBe(true);
  });

  it('works, and stays on, when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useGlassEffect());
    expect(result.current.enabled).toBe(true);
    expect(() => act(() => result.current.setEnabled(false))).not.toThrow();
  });
});

describe('keeping the lens on', () => {
  const ref = () => ({ current: document.createElement('div') });
  const turn = (on: boolean) => {
    localStorage.setItem('next-rep-glass', on ? 'on' : 'off');
    window.dispatchEvent(new Event('next-rep-glass-change'));
  };

  it('starts the lens on the element, with the preset, and takes it off when the page goes away', async () => {
    const target = ref();
    const { unmount } = renderHook(() => useLiquidGlass(target, 'dock'));
    await waitFor(() => expect(startLiquidGlass).toHaveBeenCalledTimes(1));
    expect(startLiquidGlass).toHaveBeenCalledWith(target.current, 'dock');
    await waitFor(() => expect(undos).toHaveLength(1));
    unmount();
    expect(undos[0]).toHaveBeenCalledTimes(1);
  });

  it('does nothing while the setting is off', async () => {
    localStorage.setItem('next-rep-glass', 'off');
    renderHook(() => useLiquidGlass(ref(), 'round'));
    await Promise.resolve();
    expect(startLiquidGlass).not.toHaveBeenCalled();
  });

  it('does nothing when there is no element yet', async () => {
    renderHook(() => useLiquidGlass({ current: null }, 'round'));
    await Promise.resolve();
    expect(startLiquidGlass).not.toHaveBeenCalled();
  });

  it('takes the lens off when the setting is switched off, and puts it back when switched on', async () => {
    const target = ref();
    renderHook(() => useLiquidGlass(target, 'round'));
    await waitFor(() => expect(undos).toHaveLength(1));
    act(() => turn(false));
    expect(undos[0]).toHaveBeenCalledTimes(1);
    act(() => turn(true));
    await waitFor(() => expect(startLiquidGlass).toHaveBeenCalledTimes(2));
  });

  it('starts again when the theme changes, because the colour behind the app changed', async () => {
    renderHook(() => useLiquidGlass(ref(), 'round'));
    await waitFor(() => expect(undos).toHaveLength(1));
    act(() => document.documentElement.setAttribute('data-theme', 'light'));
    await waitFor(() => expect(startLiquidGlass).toHaveBeenCalledTimes(2));
    expect(undos[0]).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(undos).toHaveLength(2));
    expect(undos[1]).not.toHaveBeenCalled();
  });

  it('takes off a lens that finished starting after the page was already gone', async () => {
    let finish: (undo: () => void) => void = () => undefined;
    startLiquidGlass.mockImplementationOnce(
      () => new Promise<() => void>((resolve) => (finish = resolve)),
    );
    const { unmount } = renderHook(() => useLiquidGlass(ref(), 'round'));
    unmount();
    const late = vi.fn();
    finish(late);
    await waitFor(() => expect(late).toHaveBeenCalledTimes(1));
  });
});
