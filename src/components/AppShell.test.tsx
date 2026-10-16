import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppShell } from './AppShell';

function renderShell(path = '/') {
  const router = createMemoryRouter(
    [{ element: <AppShell />, children: [{ path: '/', element: <p>Page content</p> }] }],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

describe('AppShell', () => {
  it('has a main navigation and a main landmark holding the page', () => {
    renderShell();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByText('Page content')).toBeInTheDocument();
  });

  it('shows the logo', () => {
    renderShell();
    expect(screen.getByRole('img', { name: 'Next Rep' })).toBeInTheDocument();
  });

  it('marks Home as the current page', () => {
    renderShell();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  });

  it.each([
    ['Home', '/'],
    ['History', '/history'],
    ['Progress', '/progress'],
    ['Settings', '/settings'],
  ])('links %s to %s', (name, href) => {
    renderShell();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name })).toHaveAttribute('href', href);
  });

  it('links Workout in the sidebar to the workout page', () => {
    renderShell();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Workout' })).toHaveAttribute('href', '/workout');
  });

  it('offers a floating Workout button as the phone entry to Workout', () => {
    renderShell();
    const mic = screen
      .getAllByRole('link', { name: 'Workout' })
      .find((link) => link.className.includes('lg:hidden'));
    expect(mic).toHaveAttribute('href', '/workout');
  });
});
