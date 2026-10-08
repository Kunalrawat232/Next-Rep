import { render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { createFakeAuthService } from '../test/fakeAuth';
import { App } from './App';
import { appRoutes } from './routes';

describe('App', () => {
  it('shows the product name on the first screen a signed-out visitor sees', async () => {
    const fake = createFakeAuthService();
    render(
      <App
        service={fake.service}
        router={createMemoryRouter(appRoutes, { initialEntries: ['/'] })}
      />,
    );
    expect(await screen.findByRole('heading', { name: 'Next Rep', level: 1 })).toBeInTheDocument();
  });

  it('creates the profile for the signed-in user through the injected function', async () => {
    const fake = createFakeAuthService({ id: 'u1', email: 'a@b.co' });
    const calls: string[] = [];
    render(
      <App
        service={fake.service}
        router={createMemoryRouter(appRoutes, { initialEntries: ['/'] })}
        ensureProfile={async (id) => void calls.push(id)}
      />,
    );
    await screen.findByText(/signed in as/i);
    expect(calls).toEqual(['u1']);
  });
});
