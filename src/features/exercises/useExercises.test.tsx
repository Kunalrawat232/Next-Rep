import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExerciseService } from './types';
import { useExercises } from './useExercises';

const silentServer = (): ExerciseService => ({
  listCustom: () => new Promise(() => undefined),
  create: () => new Promise(() => undefined),
});

describe('useExercises', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is ready at once when the browser is offline, without waiting for the server', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { result } = renderHook(() => useExercises(silentServer()));
    await waitFor(() => expect(result.current.state.status).toBe('ready'), { timeout: 2000 });
    const state = result.current.state;
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.exercises.length).toBeGreaterThan(0);
    expect(state.customProblem).toEqual('offline');
  });

  it('still waits for the server when the browser says it is online', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const { result } = renderHook(() => useExercises(silentServer()));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(result.current.state.status).toBe('loading');
  });
});
