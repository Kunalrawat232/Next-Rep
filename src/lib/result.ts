/**
 * Why a call to the backend did not work.
 * - `offline`: the request never reached the server.
 * - `conflict`: a name that is already taken.
 * - `rejected`: the server refused this particular data (a constraint or foreign key).
 * - `unknown`: anything else, including trouble on the server's side or with the session.
 */
export type Failure = 'offline' | 'conflict' | 'rejected' | 'unknown';

export type Result<T = void> = { status: 'ok'; value: T } | { status: 'error'; reason: Failure };
