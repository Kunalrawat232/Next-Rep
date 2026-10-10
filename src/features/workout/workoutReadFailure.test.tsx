import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BENCH, renderApp } from '../../test/appHarness';
import type { WorkoutState } from './useWorkout';

const reload = vi.fn(() => Promise.resolve());
const state: WorkoutState = { status: 'error' };

vi.mock('./useWorkout', () => ({ useWorkout: () => ({ state, reload }) }));

describe('the workout screens when the workout cannot be read', () => {
  beforeEach(() => reload.mockClear());

  it('the workout page says so and offers Try again', async () => {
    const { user } = renderApp('/workout');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not read your workout from this device.',
    );
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('the log set page says so too, not "No workout is open"', async () => {
    const { user } = renderApp(`/workout/log?exercise=${BENCH}`);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not read your workout from this device.',
    );
    expect(screen.queryByText('No workout is open')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('Home and History still work, treating it as no open workout', async () => {
    renderApp('/');
    expect(await screen.findByRole('link', { name: 'Start workout' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Continue workout' })).not.toBeInTheDocument();
  });
});
