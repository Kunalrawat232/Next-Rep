import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEMO_MEDIA } from '../../domain/exercises/demoMedia';
import { renderApp } from '../../test/appHarness';

describe('credits in Settings', () => {
  it('credits the owner of the demonstrations and the dataset, with the non-commercial limit', async () => {
    renderApp('/settings');
    const credits = await screen.findByRole('region', { name: 'About and credits' });
    expect(credits).toHaveTextContent(/non-commercial/i);
    const owner = within(credits).getByRole('link', { name: DEMO_MEDIA.credit.owner });
    expect(owner).toHaveAttribute('href', DEMO_MEDIA.credit.ownerUrl);
    const dataset = within(credits).getByRole('link', { name: DEMO_MEDIA.credit.dataset });
    expect(dataset).toHaveAttribute('href', DEMO_MEDIA.credit.datasetUrl);
  });

  it('opens the links safely in a new tab', async () => {
    renderApp('/settings');
    const credits = await screen.findByRole('region', { name: 'About and credits' });
    for (const link of within(credits).getAllByRole('link')) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toMatch(/noopener/);
      expect(link.getAttribute('rel')).toMatch(/noreferrer/);
    }
  });
});
