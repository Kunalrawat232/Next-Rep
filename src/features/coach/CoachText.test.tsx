import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CoachText } from './CoachText';

describe('CoachText', () => {
  it('shows plain paragraphs, keeping a blank line as a break between them', () => {
    const { container } = render(<CoachText text={'Add weight slowly.\n\nRest well.'} />);
    expect([...container.querySelectorAll('p')].map((p) => p.textContent)).toEqual([
      'Add weight slowly.',
      'Rest well.',
    ]);
  });

  it('turns lines that start with a dash, star or bullet into a list', () => {
    render(<CoachText text={'Try this:\n- sleep 8 hours\n* eat enough protein\n• drink water'} />);
    expect(screen.getByText('Try this:')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'sleep 8 hours',
      'eat enough protein',
      'drink water',
    ]);
  });

  it('joins the lines of one paragraph with a space', () => {
    const { container } = render(<CoachText text={'first line\nsecond line'} />);
    expect(container.querySelector('p')?.textContent).toBe('first line second line');
  });

  it('never makes markup: HTML, links and images in a reply stay as text', () => {
    const evil =
      '<img src=x onerror=alert(1)> [click](https://evil.example) <script>alert(1)</script>';
    const { container } = render(<CoachText text={evil} />);
    expect(container.querySelector('img, a, script')).toBeNull();
    expect(container.textContent).toBe(evil);
  });

  it('does not read markdown: stars and hashes are just characters', () => {
    const { container } = render(<CoachText text={'## Heading **bold**'} />);
    expect(container.querySelector('h1, h2, strong, b')).toBeNull();
    expect(container.textContent).toBe('## Heading **bold**');
  });

  it('shows nothing for an empty reply, and no empty list items', () => {
    const { container } = render(<CoachText text={'  \n\n  '} />);
    expect(container.querySelectorAll('p, li')).toHaveLength(0);
  });
});
