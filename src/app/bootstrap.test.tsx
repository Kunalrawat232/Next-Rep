import { render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { createMemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { createFakeAuthService } from '../test/fakeAuth';
import { createFakeExerciseService } from '../test/fakeExercises';
import { createFakeProfileService } from '../test/fakeProfile';
import { createFakeRemoteLog } from '../test/fakeRemoteLog';
import { createFakeGymService } from '../test/fakeGyms';
import { bootstrap, type BootstrapDeps } from './bootstrap';
import { appRoutes } from './routes';

const env = {
  VITE_SUPABASE_URL: 'https://abcdefghij.supabase.co',
  VITE_SUPABASE_ANON_KEY: `sb_publishable_${'a'.repeat(30)}`,
};

function deps() {
  const fake = createFakeAuthService();
  const value = {
    createSupabase: vi.fn(() => ({ auth: {}, from: vi.fn() })),
    createAuthService: vi.fn(() => fake.service),
    createGymService: vi.fn(() => createFakeGymService().service),
    createExerciseService: vi.fn(() => createFakeExerciseService().service),
    createLogRemote: vi.fn(() => createFakeRemoteLog().remote),
    createProfileService: vi.fn(() => createFakeProfileService().service),
    createParseService: vi.fn(() => ({ parse: async () => null })),
    createCoachService: vi.fn(() => ({ ask: async () => ({ status: 'unavailable' as const }) })),
    createRouter: vi.fn(() => createMemoryRouter(appRoutes, { initialEntries: ['/'] })),
    ensureProfile: vi.fn(async () => undefined),
  };
  return { value: value as unknown as BootstrapDeps, spies: value };
}

describe('bootstrap', () => {
  it('shows the setup screen, and creates nothing, when the environment is wrong', () => {
    const d = deps();
    render(bootstrap({ VITE_SUPABASE_URL: 'http://insecure.example' }, d.value));
    expect(screen.getByRole('alert')).toHaveTextContent('VITE_SUPABASE_URL');
    expect(d.spies.createSupabase).not.toHaveBeenCalled();
  });

  it('creates the client, service and router exactly once, even when rendered twice by StrictMode', async () => {
    const d = deps();
    const element = bootstrap(env, d.value);
    render(<StrictMode>{element}</StrictMode>);
    await screen.findByRole('heading', { name: 'Sign in', level: 2 });
    expect(d.spies.createSupabase).toHaveBeenCalledTimes(1);
    expect(d.spies.createAuthService).toHaveBeenCalledTimes(1);
    expect(d.spies.createGymService).toHaveBeenCalledTimes(1);
    expect(d.spies.createExerciseService).toHaveBeenCalledTimes(1);
    expect(d.spies.createLogRemote).toHaveBeenCalledTimes(1);
    expect(d.spies.createRouter).toHaveBeenCalledTimes(1);
  });
});
