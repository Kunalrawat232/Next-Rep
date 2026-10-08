import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Logo } from './Logo';

describe('Logo', () => {
  it('is announced once as "Next Rep"', () => {
    render(<Logo />);
    expect(screen.getByRole('img', { name: 'Next Rep' })).toBeInTheDocument();
  });

  it('draws the mark without the wordmark when asked', () => {
    const { container: full } = render(<Logo />);
    const { container: mark } = render(<Logo variant="mark" />);
    expect(full.querySelectorAll('path').length).toBe(4);
    expect(mark.querySelectorAll('path').length).toBe(2);
  });

  it('keeps gradient ids unique when shown twice on a page', () => {
    const { container } = render(
      <>
        <Logo />
        <Logo />
      </>,
    );
    const ids = [...container.querySelectorAll('linearGradient')].map((g) => g.id);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(container.innerHTML).toContain(`url(#${id})`);
  });
});
