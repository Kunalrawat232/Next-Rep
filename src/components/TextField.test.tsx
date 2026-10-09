import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TextField } from './TextField';

describe('TextField', () => {
  it('labels the input', () => {
    render(<TextField label="Email" />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('passes input props through and lets the user type', async () => {
    render(<TextField label="Email" type="email" autoComplete="email" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('type', 'email');
    expect(input).toHaveAttribute('autocomplete', 'email');
    await userEvent.type(input, 'a@b.co');
    expect(input).toHaveValue('a@b.co');
  });

  it('describes the input with its hint', () => {
    render(<TextField label="Password" hint="Use at least 8 characters." />);
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
      'Use at least 8 characters.',
    );
  });

  it('marks the input invalid and describes it with the error, which replaces the hint', () => {
    render(<TextField label="Password" hint="A hint" error="Too short." />);
    const input = screen.getByLabelText('Password');
    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription('Too short.');
    expect(screen.queryByText('A hint')).not.toBeInTheDocument();
  });

  it('is not marked invalid without an error', () => {
    render(<TextField label="Email" />);
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid');
  });

  it('gives two fields different ids', () => {
    render(
      <>
        <TextField label="One" />
        <TextField label="Two" />
      </>,
    );
    expect(screen.getByLabelText('One').id).not.toBe(screen.getByLabelText('Two').id);
  });

  it('forwards a ref to the input', () => {
    let node: HTMLInputElement | null = null;
    render(<TextField label="Email" ref={(el) => void (node = el)} />);
    expect(node).toBe(screen.getByLabelText('Email'));
  });
});
