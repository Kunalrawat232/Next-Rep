import { vi } from 'vitest';
import type { AuthResult, AuthService, AuthUser } from '../features/auth/types';

/** A controllable AuthService for tests. `emit` simulates the backend signing a user in or out. */
export function createFakeAuthService(initialUser: AuthUser | null = null) {
  let user = initialUser;
  const listeners = new Set<(user: AuthUser | null) => void>();
  let subscribed = 0;
  let unsubscribed = 0;

  const emit = (next: AuthUser | null) => {
    user = next;
    listeners.forEach((listener) => listener(next));
  };

  const service = {
    getUser: vi.fn<AuthService['getUser']>(async () => user),
    onChange: vi.fn<AuthService['onChange']>((listener) => {
      listeners.add(listener);
      subscribed += 1;
      return () => {
        listeners.delete(listener);
        unsubscribed += 1;
      };
    }),
    signIn: vi.fn<AuthService['signIn']>(async (email): Promise<AuthResult> => {
      emit({ id: 'user-1', email });
      return { status: 'signed_in' };
    }),
    signUp: vi.fn<AuthService['signUp']>(async (email): Promise<AuthResult> => {
      emit({ id: 'user-1', email });
      return { status: 'signed_in' };
    }),
    verifyEmail: vi.fn<AuthService['verifyEmail']>(async (): Promise<AuthResult> => {
      emit({ id: 'user-1', email: 'new@example.com' });
      return { status: 'signed_in' };
    }),
    signOut: vi.fn<AuthService['signOut']>(async () => {
      emit(null);
    }),
  } satisfies AuthService;

  return {
    service,
    emit,
    counts: () => ({ subscribed, unsubscribed, active: listeners.size }),
  };
}
