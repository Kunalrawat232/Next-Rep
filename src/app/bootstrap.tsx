import type { ComponentProps, ReactElement } from 'react';
import { createBrowserRouter, type RouterProvider } from 'react-router';
import {
  AUTH_STORAGE_KEY,
  createSupabase,
  createFetchCoachService,
  createFetchParseService,
  createSupabaseAuthService,
  createSupabaseExerciseService,
  createSupabaseLogRemote,
  createSupabaseProfileService,
  createSupabaseGymService,
  ensureProfile,
  parseSupabaseEnv,
  readStoredUser,
} from '../data/remote';
import type { AuthService } from '../features/auth';
import type { RemoteLog } from '../data/sync';
import type { ExerciseService } from '../features/exercises';
import type { GymService } from '../features/gyms';
import type { ProfileService } from '../features/settings';
import type { CoachService } from '../features/coach';
import type { ParseService } from '../features/voice';
import { App } from './App';
import { ConfigError } from './ConfigError';
import { appRoutes } from './routes';

type SupabaseClient = ReturnType<typeof createSupabase>;

export type BootstrapDeps = {
  createSupabase: typeof createSupabase;
  createAuthService: (client: SupabaseClient) => AuthService;
  createGymService: (client: SupabaseClient) => GymService;
  createExerciseService: (client: SupabaseClient) => ExerciseService;
  createLogRemote: (client: SupabaseClient) => RemoteLog;
  createProfileService: (client: SupabaseClient) => ProfileService;
  createParseService: (client: SupabaseClient) => ParseService;
  createCoachService: (client: SupabaseClient) => CoachService;
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
  createGymService: createSupabaseGymService,
  createExerciseService: createSupabaseExerciseService,
  createLogRemote: createSupabaseLogRemote,
  createProfileService: createSupabaseProfileService,
  createParseService: (client) => createFetchParseService(client),
  createCoachService: (client) => createFetchCoachService(client),
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
      gymService={deps.createGymService(client)}
      exerciseService={deps.createExerciseService(client)}
      logRemote={deps.createLogRemote(client)}
      parseService={deps.createParseService(client)}
      coachService={deps.createCoachService(client)}
      profileService={deps.createProfileService(client)}
      router={deps.createRouter()}
      ensureProfile={(userId) => deps.ensureProfile(client, userId)}
    />
  );
}
