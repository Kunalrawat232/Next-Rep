/** Why a call to the backend did not work. `conflict` is a name that is already taken. */
export type Failure = 'offline' | 'conflict' | 'unknown';

export type Result<T = void> = { status: 'ok'; value: T } | { status: 'error'; reason: Failure };
