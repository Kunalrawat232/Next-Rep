import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEMO_MEDIA } from '../../domain/exercises/demoMedia';
import { BENCH, renderApp } from '../../test/appHarness';

afterEach(() => vi.restoreAllMocks());

describe('the exercise page', () => {
  it('opens from a row on the Exercises list', async () => {
    const { user } = renderApp('/exercises');
    await user.type(await screen.findByRole('searchbox'), 'barbell bench press');
    await user.click(await screen.findByRole('link', { name: /^Barbell Bench Press/ }));
    expect(await screen.findByRole('heading', { name: 'Barbell Bench Press' })).toBeInTheDocument();
  });

  it('shows equipment, muscles and the animation of an exercise that has one', async () => {
    renderApp(`/exercises/${BENCH}`);
    const details = await screen.findByRole('region', { name: 'Details' });
    expect(within(details).getByText('Equipment').nextSibling).toHaveTextContent('Barbell');
    expect(within(details).getByText('Primary muscle').nextSibling).toHaveTextContent('Chest');
    expect(within(details).getByText('Secondary muscles')).toBeInTheDocument();
    const img = await screen.findByRole('img', { name: 'Demonstration of Barbell Bench Press' });
    expect(img.getAttribute('src')).toMatch(
      new RegExp(`^${DEMO_MEDIA.baseUrl.replaceAll('.', '\\.')}/videos/.+\\.gif$`),
    );
  });

  it('shows the placeholder, not a broken image, when the picture cannot load', async () => {
    renderApp(`/exercises/${BENCH}`);
    fireEvent.error(await screen.findByRole('img', { name: /^Demonstration of/ }));
    expect(screen.queryByRole('img', { name: /^Demonstration of/ })).not.toBeInTheDocument();
    expect(screen.getByText('Demonstration unavailable')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Details' })).toBeInTheDocument();
  });

  it("shows the placeholder for an exercise of the user's own", async () => {
    const id = '11111111-2222-4333-8444-555555555555';
    renderApp(`/exercises/${id}`, {
      customExercises: [
        {
          id,
          name: 'My Cable Thing',
          equipmentType: 'cable',
          bodyPart: 'upper',
          muscle: null,
          aliases: [],
          tier: 'custom',
        },
      ],
    });
    expect(await screen.findByRole('heading', { name: 'My Cable Thing' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText('No demonstration for this exercise')).toBeInTheDocument(),
    );
    expect(screen.getByText('None listed')).toBeInTheDocument();
    expect(screen.getByText('Upper body')).toBeInTheDocument();
  });

  it('says so for an exercise that does not exist', async () => {
    renderApp('/exercises/00000000-0000-4000-8000-000000000000');
    expect(await screen.findByText('Exercise not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to exercises/i })).toBeInTheDocument();
  });

  it('does not need the connection to show the details', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderApp(`/exercises/${BENCH}`);
    expect(await screen.findByRole('region', { name: 'Details' })).toBeInTheDocument();
    expect(await screen.findByText(/need an internet connection/i)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /^Demonstration of/ })).not.toBeInTheDocument();
  });
});
