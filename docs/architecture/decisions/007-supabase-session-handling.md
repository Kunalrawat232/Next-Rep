# ADR-007: Email and password auth with a local Supabase session

- **Status:** accepted (2026-10-08), amended the same day after review and measurement

## Context

Users must sign in so that Row Level Security can isolate their data, and the app must keep working in a gym basement with no signal. Sign-in is email and password, chosen over magic links so that Playwright can automate it with a dedicated test account.

## Decision

- **Auth screen:** sign-in and sign-up on one screen, using Supabase Auth with email and password.
- **Only the publishable key reaches the browser.** `src/data/remote/env.ts` uses an allowlist: a `sb_publishable_` key or a legacy anon JWT whose role is provably `anon`. Anything else (secret keys, `service_role`, padded or quoted values, unknown formats) is refused, and messages name variables, never values. Because Vite copies every `VITE_*` value into the public bundle at build time, a Vite plugin also stops the dev server and the build when such a value, or a secret-looking `VITE_` name, is present, and CI greps the built `dist/` for secret-looking keys.
- **The UI reads who is signed in from the stored session, not from the network.** The session lives in local storage under a fixed key (`next-rep-auth`) and `readStoredUser` reads it directly. This was measured, not assumed: with an access token that expired more than an hour ago and no network, the library's `getSession()` takes about 25 seconds and then returns no session, and it fires `INITIAL_SESSION` with no session, although the session is still in storage. So an empty `INITIAL_SESSION` is ignored while a session is stored. An explicit `SIGNED_OUT`, including a real rejection of the refresh token, still signs the user out, and the server checks the real token on every request (RLS). The result: a signed-in user can open the app and log sets offline.
- Features talk to a small `AuthService` interface (`src/features/auth/types.ts`), implemented for Supabase in `src/data/remote/supabaseAuth.ts`. Tests use a fake service instead of mocking modules. The Supabase client, router and auth service are built once, outside React's render (`src/app/bootstrap.tsx`), so StrictMode cannot create two clients.
- **Errors** become a short list of reasons with friendly messages. Raw server messages are never shown or logged (only an error's name is).
- **Duplicate sign-ups:** with "Confirm email" off, the server answers `user_already_exists` and the form shows "an account already exists", so email addresses could be probed. This is accepted during development. At code freeze "Confirm email" is switched on: the server then answers every sign-up the same way and the form reveals nothing (see the roadmap).
- **Profile row:** created by the client after sign-in (`insert ... on conflict do nothing`), started so that a throw can never crash the app, and retried on the next app load.
- **Sign-out** clears the local session only (`scope: local`). Offline, the library clears it and then reports that the server could not be told; that error counts as signed out.
- **Passwords:** at least 8 characters; at most 72 **bytes**, because bcrypt ignores the rest.
- **Redirect after sign-in** goes only to an in-app path made of plain path characters, never to `/sign-in`.
- **Security headers** in `vercel.json`: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (microphone allowed for the voice feature) and `frame-ancestors 'none'`. A fuller Content Security Policy waits until it can be tested on a real preview deployment.

## Alternatives considered

- **Magic link:** no passwords to handle, but the free mail service allows about 2 emails an hour and E2E sign-in is hard to automate.
- **Trusting `getSession()` for the initial state:** simplest, but it fails offline with an expired token (measured above).
- **Calling Supabase directly from components:** less code now, but every component and test would depend on supabase-js types.
- **A trigger that creates the profile on sign-up:** needs a `SECURITY DEFINER` function; the client-side insert needs none.

## Consequences

- No "forgot password" in the MVP: it needs reliable email delivery.
- Switching accounts on one device must clear the other user's local data; this belongs to the offline store (done: one database per user, see [ADR-011](011-local-log-and-sync-worker.md)).
- Local sign-out leaves the refresh token valid on the server until it expires, which matters on a shared device.
- The session sits in local storage, so an XSS bug would expose it. React escaping only, no `dangerouslySetInnerHTML`, the headers above and a later CSP are the mitigations.
- Reading the stored session depends on the library's storage format (`{ user: { id, email } }`); it is validated with Zod and a mismatch simply reads as signed out.
