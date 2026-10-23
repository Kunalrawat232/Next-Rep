import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FullPageLoader, LoadingMessage, Skeleton, Spinner } from '.';

describe('LoadingMessage', () => {
  it('is an announced status that says Loading…, or what it is given, but draws no words', () => {
    render(
      <>
        <LoadingMessage />
        <LoadingMessage>Loading your history…</LoadingMessage>
      </>,
    );
    const [first, second] = screen.getAllByRole('status');
    expect(first).toHaveTextContent('Loading…');
    expect(second).toHaveTextContent('Loading your history…');
    for (const status of [first!, second!]) {
      expect(status).toHaveAttribute('aria-busy', 'true');
      expect(status).toHaveAttribute('aria-live', 'polite');
      // Heard, not drawn.
      expect(screen.getAllByText(/^Loading/).every((el) => el.classList.contains('sr-only'))).toBe(
        true,
      );
    }
  });

  it('is the shape of a screen: a title and cards of placeholder blocks, hidden from screen readers', () => {
    const { container } = render(<LoadingMessage />);
    const blocks = container.querySelectorAll('.skeleton');
    expect(blocks.length).toBeGreaterThanOrEqual(8);
    for (const block of blocks) expect(block).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('.glass-flat')).toHaveLength(3);
  });

  it('fades in after a moment, so a fast load never flashes a loader', () => {
    render(<LoadingMessage />);
    expect(screen.getByRole('status')).toHaveClass('loader-in');
  });

  it('has a small inline form, with a spinner, for inside a card', () => {
    const { container } = render(
      <LoadingMessage variant="inline">Loading your gym…</LoadingMessage>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Loading your gym…');
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelectorAll('.glass-flat')).toHaveLength(0);
    expect(container.querySelectorAll('.skeleton').length).toBeLessThanOrEqual(3);
  });
});

describe('Spinner and Skeleton', () => {
  it('turns only when motion is allowed, and is hidden from screen readers', () => {
    const { container } = render(<Spinner size={32} />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveClass('motion-safe:animate-spin');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('width', '32');
  });

  it('is a hidden placeholder block that takes the classes it is given', () => {
    const { container } = render(<Skeleton className="h-4 w-1/2" />);
    expect(container.firstElementChild).toHaveClass('skeleton', 'h-4', 'w-1/2');
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('FullPageLoader', () => {
  it('fills the screen with the mark and a ring, and tells screen readers it is loading', () => {
    const { container } = render(<FullPageLoader />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Loading…');
    expect(status).toHaveClass('min-h-dvh', 'loader-in');
    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(2);
    // The picture is decoration: only one thing is announced.
    expect(screen.queryByRole('img')).toBeNull();
  });
});
