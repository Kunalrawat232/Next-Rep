import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePending } from './usePending';

describe('usePending', () => {
  it('lets the first begin through and refuses the next ones in the same instant', () => {
    const { result } = renderHook(() => usePending());
    let answers: boolean[] = [];
    act(() => {
      answers = [result.current.begin(), result.current.begin(), result.current.begin()];
    });
    expect(answers).toEqual([true, false, false]);
    expect(result.current.pending).toBe(true);
  });

  it('allows a new begin after end', () => {
    const { result } = renderHook(() => usePending());
    act(() => void result.current.begin());
    act(() => result.current.end());
    expect(result.current.pending).toBe(false);
    let again = false;
    act(() => {
      again = result.current.begin();
    });
    expect(again).toBe(true);
  });

  it('ignores an end when nothing began', () => {
    const { result } = renderHook(() => usePending());
    act(() => result.current.end());
    expect(result.current.pending).toBe(false);
  });

  it('says at once whether something is under way, before a render', () => {
    const { result } = renderHook(() => usePending());
    expect(result.current.active()).toBe(false);
    act(() => {
      result.current.begin();
      expect(result.current.active()).toBe(true);
    });
    act(() => result.current.end());
    expect(result.current.active()).toBe(false);
  });
});
