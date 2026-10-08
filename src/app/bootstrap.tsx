import type { ComponentProps, ReactElement } from 'react';
import { createBrowserRouter, type RouterProvider } from 'react-router';
import {
  AUTH_STORAGE_KEY,
  createSupabase,
  createSupabaseAuthService,
  ensureProfile,
  parseSupabaseEnv,
  readStoredUser,
} from '../data/remote';
import type { AuthService } from '../features/auth';
import { App } from './App';
import { ConfigError } from './ConfigError';
import { appRoutes } from './routes';

type SupabaseClient = ReturnType<typeof createSupabase>;

export type BootstrapDeps = {
  createSupabase: typeof createSupabase;
  createAuthService: (client: SupabaseClient) => AuthService;
  createRouter: () => ComponentProps<typeof RouterProvider>['router'];
  ensureProfile: (client: SupabaseClient, userId: string) => Promise<void>;
};

const defaultDeps: BootstrapDeps = {
  createSupabase,
  createAuthService: (client) =>
    createSupabaseAuthService(client.auth, () => {
      try {
        return readStoredUser(window.localStorage, AUTH_STORAGE_KEY);
      } catch {
        return null; // storage blocked (some private modes)
      }
    }),
  createRouter: () => createBrowserRouter(appRoutes),
  ensureProfile,
};

/**
 * Builds the app once, outside React's render, so StrictMode's double render cannot create two
 * Supabase clients fighting over one stored session. Returns the setup screen when the env is wrong.
 */
export function bootstrap(
  rawEnv: Record<string, unknown>,
  deps: BootstrapDeps = defaultDeps,
): ReactElement {
  const env = parseSupabaseEnv(rawEnv);
  if (!env.ok) return <ConfigError message={env.message} />;
  const client = deps.createSupabase(env.env);
  return (
    <App
      service={deps.createAuthService(client)}
      router={deps.createRouter()}
      ensureProfile={(userId) => deps.ensureProfile(client, userId)}
    />
  );
}
