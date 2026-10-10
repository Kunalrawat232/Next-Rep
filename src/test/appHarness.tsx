import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { createLogStore, openLocalDb } from '../data/local';
import type { Exercise } from '../domain/exercises';
import type { Gym } from '../domain/gyms';
import type { Unit } from '../domain/schemas';
import { appRoutes } from '../app/routes';
import { AuthProvider } from '../features/auth';
import { ExerciseServiceProvider } from '../features/exercises';
import { GymServiceProvider } from '../features/gyms';
import { ProfileServiceProvider, UnitProvider } from '../features/settings';
import { SyncProvider } from '../features/sync';
import { createFakeAuthService } from './fakeAuth';
import { createFakeExerciseService } from './fakeExercises';
import { createFakeGymService, sampleGym } from './fakeGyms';
import { createFakeProfileService } from './fakeProfile';
import { createFakeRemoteLog } from './fakeRemoteLog';

/** A server that cannot be reached: for the setup phase of a test, so the app does not sync or pull while rows are being put in place. */
export function offlineServer() {
  const server = createFakeRemoteLog();
  server.setOffline(true);
  return server;
}

export const HOME_GYM: Gym = sampleGym({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Home gym',
  barbellKg: 15,
  isDefault: true,
  bars: [{ id: 'bar-ez', name: 'EZ bar', weightKg: 7.5, kind: 'ez_bar' }],
});

export const BENCH = '2c49d84c-42d6-5729-8791-bdf87686998a'; // Barbell Bench Press, barbell
export const EZ_CURL = 'b233fd5c-857b-53a9-84cd-020aea82dbe8'; // EZ Bar Curl, ez_bar
export const SMITH_SQUAT = '5ba6ba41-0814-587b-9806-1c47ab57eaf6'; // Smith Machine Squat, smith
export const DUMBBELL_CURL = '814bdc82-53bf-53c1-b20e-ff5e43b46e1a'; // Dumbbell Curl, dumbbell
export const PUSH_UP = '2dde008c-509c-5d7c-853f-da59e1756a81'; // Push-Up, bodyweight

type Options = {
  gyms?: Gym[];
  /** Makes the gym list fail, as when there is no connection. */
  gymsFail?: 'offline' | 'unknown';
  customExercises?: Exercise[];
  userId?: string;
  /** The unit the server already has for this user. */
  savedUnit?: Unit | null;
  /** The unit already chosen on this device, as when the user picked it in Settings earlier. */
  unit?: Unit;
  /** A server made earlier, to set it up (offline, held) before the app starts talking to it. */
  server?: ReturnType<typeof createFakeRemoteLog>;
};

/** The whole app on a fake server and a fake IndexedDB, at a path, for a signed-in user. */
export function renderApp(path: string, options: Options = {}) {
  const userId = options.userId ?? `u-${Math.random().toString(36).slice(2)}`;
  const deps = { indexedDB, IDBKeyRange };
  const auth = createFakeAuthService({ id: userId, email: 'ada@example.com' });
  const gyms = createFakeGymService(options.gyms ?? [HOME_GYM]);
  if (options.gymsFail) gyms.failNext('list', options.gymsFail);
  const exercises = createFakeExerciseService(options.customExercises ?? []);
  const server = options.server ?? createFakeRemoteLog();
  const profile = createFakeProfileService(options.savedUnit ?? options.unit ?? null);
  if (options.unit) localStorage.setItem(`next-rep-unit-${userId}`, options.unit);
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  const view = render(
    <AuthProvider service={auth.service}>
      <ProfileServiceProvider service={profile.service}>
        <UnitProvider>
          <GymServiceProvider service={gyms.service}>
            <ExerciseServiceProvider service={exercises.service}>
              <SyncProvider remote={server.remote} dexieDeps={deps}>
                <RouterProvider router={router} />
              </SyncProvider>
            </ExerciseServiceProvider>
          </GymServiceProvider>
        </UnitProvider>
      </ProfileServiceProvider>
    </AuthProvider>,
  );
  /** A second handle on the same on-device database, to set things up and to look inside. */
  const db = openLocalDb(userId, deps);
  return {
    ...view,
    router,
    user: userEvent.setup(),
    server,
    profile,
    gyms,
    exercises,
    auth,
    userId,
    db,
    store: createLogStore(db),
  };
}
