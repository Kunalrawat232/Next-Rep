import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('is a type=button by default, so it never submits a form by accident', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
  });

  it('can be a submit button', () => {
    render(<Button type="submit">Go</Button>);
    expect(screen.getByRole('button', { name: 'Go' })).toHaveAttribute('type', 'submit');
  });

  it('calls onClick, but not while disabled', async () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Tap</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Tap' }));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <Button onClick={onClick} disabled>
        Tap
      </Button>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Tap' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps the 48 px touch target on every variant', () => {
    render(
      <>
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
      </>,
    );
    for (const button of screen.getAllByRole('button'))
      expect(button.className).toContain('min-h-touch');
  });

  it('uses the accent colour only for the primary variant', () => {
    render(
      <>
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Primary' }).className).toContain('bg-accent');
    expect(screen.getByRole('button', { name: 'Secondary' }).className).not.toContain('bg-accent');
  });
});
