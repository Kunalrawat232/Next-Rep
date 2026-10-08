import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConfigError } from './ConfigError';

describe('ConfigError', () => {
  it('shows the product name, the problem and how to fix it', () => {
    render(<ConfigError message="VITE_SUPABASE_URL: is missing" />);
    expect(screen.getByRole('heading', { name: 'Next Rep', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('VITE_SUPABASE_URL: is missing');
    expect(screen.getByText(/\.env\.local/)).toBeInTheDocument();
  });
});
