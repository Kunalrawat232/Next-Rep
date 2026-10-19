import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEMO_MEDIA, PHOTO_MEDIA } from '../../domain/exercises/demoMedia';
import { renderApp } from '../../test/appHarness';

describe('About and credits', () => {
  it('is reached from Settings, and goes back to it', async () => {
    const { user, router } = renderApp('/settings');
    await user.click(await screen.findByRole('link', { name: 'About and credits' }));
    expect(router.state.location.pathname).toBe('/about');
    await user.click(await screen.findByRole('link', { name: 'Back' }));
    expect(router.state.location.pathname).toBe('/settings');
  });

  it('credits the owner of the demonstrations, the dataset and the photos, with the non-commercial limit', async () => {
    renderApp('/about');
    await screen.findByRole('heading', { name: 'About and credits' });
    const main = within(screen.getByRole('main'));
    expect(main.getByText(/non-commercial/i)).toBeInTheDocument();
    expect(main.getByRole('link', { name: DEMO_MEDIA.credit.owner })).toHaveAttribute(
      'href',
      DEMO_MEDIA.credit.ownerUrl,
    );
    expect(main.getByRole('link', { name: DEMO_MEDIA.credit.dataset })).toHaveAttribute(
      'href',
      DEMO_MEDIA.credit.datasetUrl,
    );
    expect(main.getByRole('link', { name: PHOTO_MEDIA.credit.dataset })).toHaveAttribute(
      'href',
      PHOTO_MEDIA.credit.datasetUrl,
    );
    expect(main.getByText(/unlicense/i)).toBeInTheDocument();
    expect(main.getByRole('link', { name: 'liquid-gl' })).toHaveAttribute(
      'href',
      'https://github.com/naughtyduk/liquidGL',
    );
  });

  it('opens every outside link safely in a new tab', async () => {
    renderApp('/about');
    await screen.findByRole('heading', { name: 'About and credits' });
    const outside = within(screen.getByRole('main'))
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('http'));
    expect(outside.length).toBeGreaterThanOrEqual(4);
    for (const link of outside) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toMatch(/noopener/);
      expect(link.getAttribute('rel')).toMatch(/noreferrer/);
    }
  });
});
