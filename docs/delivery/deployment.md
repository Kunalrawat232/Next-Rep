# Deployment guide (manual steps)

The steps **you** do by hand: accounts, secrets and dashboards that Claude Code must not touch. Everything is free tier ([ADR-006](../architecture/decisions/006-free-tier-only-stack.md)). Never paste secrets into chat, commits or docs; they live only in the Vercel/Supabase dashboards, a password manager and your local `.env.local` (git-ignored, and Claude Code is denied from reading it).

Verified against the Supabase, Vercel and Google AI docs. Dashboard labels change, so if one differs, follow the intent.

## 1. Supabase (Auth + Postgres)

### 1.1 Create the project

1. Sign in at supabase.com and create a **free** project named `next-rep`. Pick the region closest to you (and later to your Vercel functions).
2. Set a strong database password and store it in your password manager. It is only needed for CLI `db push`; the app never uses it.
3. From **Settings > API Keys** (or the **Connect** dialog) copy:
   - the **Project URL** (`https://<ref>.supabase.co`)
   - the **publishable key** (`sb_publishable_...`). Use this as the "anon" key. The legacy `anon` JWT key still works but is being deprecated by the end of 2026.
4. **Never** copy the `secret` / `service_role` key anywhere in this project. The MVP does not need it.

Free projects pause after inactivity: check the project is awake before demos and colleague testing.

### 1.2 Apply the schema and seed

**Option A (simplest): SQL editor.** In the dashboard SQL editor, run `supabase/migrations/0001_init.sql`, then `supabase/seed.sql`, then `supabase/migrations/0002_gym_bar_kind.sql`, `0003_exercise_muscle.sql`, `0004_one_gym_per_user.sql`, `0005_rate_limit_scopes.sql` and `0006_revoke_rls_auto_enable.sql`, and then run `supabase/seed.sql` again (it adds the muscle and the imported exercises). Migrations are run once each, in order; the seed is safe to run any number of times.

**Option B: Supabase CLI** (installed, v2.120.0).

```bash
supabase init                     # creates supabase/config.toml (commit it)
supabase login
supabase link --project-ref <ref>
supabase db push --dry-run        # shows what would be applied
supabase db push                  # applies migrations
supabase db push --include-seed   # only if config.toml points at supabase/seed.sql
```

Use the dry run first. The migration file is named `0001_init.sql`; later migrations should be created with `supabase migration new <name>`.

### 1.3 Verify

- **Table Editor:** `profiles`, `gyms`, `gym_bars`, `exercises`, `workouts`, `sets`, `api_rate_limits` exist, each shown with RLS enabled.
- SQL editor: `select count(*) from public.exercises where user_id is null;` returns about **890** (56 curated plus about 836 imported; it was 56 before migration 0003 and the larger seed). The seed JSON files hold the exact numbers.
- Advisors: `supabase db advisors --linked` (or the dashboard **Advisors** page) and note anything reported. Expected to discuss: `consume_rate_limit` is a `SECURITY DEFINER` function in `public` by design (see [data model](../architecture/data-model.md)).

If the SQL fails, stop and send the exact error; do not edit tables by hand in the dashboard (schema changes must go through migration files).

### 1.4 Auth settings

- **Email provider** is enabled by default. The app uses email + password.
- **Confirm email:** **on** (Sign In / Providers > User Signups). The server then answers every sign-up the same way, so the app does not reveal which addresses are registered (ADR-007). The built-in mail service sends only to members of the Supabase organisation, about 2 an hour, so it is not enough for real sign-ups.
- **Custom SMTP** (Emails > SMTP Settings): Brevo free plan (300 emails a day). Host `smtp-relay.brevo.com`, port 587, the username is the SMTP login shown in Brevo (SMTP & API > SMTP), the password is a Brevo **SMTP key** (not the API key), and the sender is an address verified in Brevo (Senders). The key lives only in the Supabase dashboard, never in the repo or `.env*`. Without a domain of our own the sender is a personal Gmail address, which Brevo flags as not recommended: emails can land in spam. Leave Brevo's "block unauthorized IPs" off (Supabase sends from its own addresses).
- **Email template** (Emails > Templates > Confirm sign up): subject "Confirm your Next Rep account", body copied from `supabase/templates/confirm-signup.html` (the repo copy is the source; paste it back into the dashboard after editing it). Inline styles and tables only, no images, so email apps keep the layout. Its link is `{{ .SiteURL }}/sign-in?token_hash={{ .TokenHash }}&type=email`, which only a build with `verifyEmail` (the sign-in page) understands: deploy that build before saving this template, or new accounts cannot be confirmed.
- **Rate Limits:** emails sent per hour raised to 100 (custom SMTP starts at 30).
- Create test and demo users from the dashboard (Auth > Users > Add user, Auto Confirm User) so they sign in without an email.
- Set a sensible minimum password length in the Auth settings.
- **Site URL / redirect URLs:** the confirmation link is built from the Site URL (`{{ .SiteURL }}/sign-in?token_hash=…`, see the email template below), so the Site URL must be the deployed app: it is set to https://nextrep-gym.vercel.app (preview links need a Vercel sign-in, Deployment Protection, so they cannot be used). The redirect URLs hold only `http://localhost:5173`. **Never add a wildcard such as `https://*-next-rep3.vercel.app/**`**: other Vercel users can create projects whose names match it and collect the sessions of anyone who follows an auth email link.

### 1.5 Test users (for E2E and the RLS isolation suite)

Create **two dedicated test users** (for example `nextrep-test-a@example.invalid` and `nextrep-test-b@example.invalid`, invented addresses) with generated passwords. They go in `.env.local` as `E2E_USER_A_EMAIL`, `E2E_USER_A_PASSWORD`, `E2E_USER_B_EMAIL`, `E2E_USER_B_PASSWORD`. Never use a real person's account.

### 1.6 Check the connection from your machine

After section 4 (the local env file) is filled in, run:

```bash
npm run check:supabase
```

It loads `.env.local` itself and prints only PASS/FAIL lines, never a key, password or token, so its output is safe to paste. It checks: the URL and key type, that the Auth service answers, that signed-out users are locked out of `exercises`, that both test users can sign in, that the seed has all its global exercises (56 at first, before migration 0003), that tables can be queried, and that the rate-limit function works for signed-in users and is closed to anon. It makes one write: the rate-limit call adds a row to test user A's own counter. Run it yourself rather than through Claude Code, which never touches `.env.local`.

The same credentials let you run `npm run test:integration` (profile access rules on the hosted project, as the two test users) and `npm run test:e2e` (sign-in in a real browser). Both skip themselves when the values are missing, and both are run by you, not by CI.

**Hosted checks: what ran and what has not** (single statement; as recorded in the AI log):

- Ran, by you: `npm run check:supabase` (16 checks passed, after the DNS fix) and `npm run test:integration` (6 of 6, profile access rules).
- Run: `npm run test:e2e` passed 4 of 4 (sign-in, Settings sign-out, and a workout logged online and offline). The suite now has 5 tests in 4 files (auth x2, workout, exerciseDemo, smoke) and all passed. Checked through the Supabase plugin (read-only): the hosted project already has migrations 0002 and 0003 and the full seed (892 exercises, all with a muscle; 0002 is not in the migration list, so it was applied by hand). Not run yet: the integration tests added later for gyms, exercises, the log sync and the history pull. The profile upsert used by Settings has no integration test yet.

## 2. Gemini API key (free tier, no billing)

1. Open Google AI Studio (aistudio.google.com) > **API keys** > **Create API key**.
2. **Do not enable billing or link a billing account** to the key's Google Cloud project. If AI Studio or Cloud prompts you to, decline. The app treats Gemini as a scarce fallback and handles `429` and errors without blocking logging.
3. Choose a fast, cheap **Flash-class model** that AI Studio lists as available on the free tier at build time (check its rate-limit page). Its id goes in `GEMINI_MODEL`. It is never hardcoded.
4. Set only `GEMINI_API_KEY`. Do **not** also set `GOOGLE_API_KEY`: the SDK gives it precedence if both exist.
5. The key is used only by the serverless function. It must never be prefixed `VITE_`.

Free-tier prompts may be used by Google to improve its products, which is why only the transcript is sent ([threat model](../security/threat-model.md)). Speech-to-text does not use Gemini; it uses Groq (section 2.1, [ADR-019](../architecture/decisions/019-cloud-speech-to-text.md)).

### 2.1 AI coach and the Groq second provider (optional)

The AI coach (`/api/coach`, [ADR-017](../architecture/decisions/017-ai-coach.md)) uses the same `GEMINI_API_KEY`. It may use another free-tier model through `COACH_MODEL`; empty means `GEMINI_MODEL`. When Gemini cannot answer, the coach asks one second free provider with the same prompt and checks ([ADR-018](../architecture/decisions/018-coach-second-provider.md)): create a key at console.groq.com on its free tier, with no billing, and set `FALLBACK_API_KEY`, `FALLBACK_BASE_URL` and `FALLBACK_MODEL` (all three or none; the model id comes from your account's model list). Without them the coach has no second provider. Check with `npm run check:coach`, which you run yourself.

**Voice on iPhone** (`/api/transcribe`, [ADR-019](../architecture/decisions/019-cloud-speech-to-text.md)) uses the same Groq account. It needs only `FALLBACK_API_KEY` and `FALLBACK_BASE_URL` (`FALLBACK_MODEL` is not used). `TRANSCRIBE_MODEL` is optional and defaults to `whisper-large-v3-turbo`. Set them in Vercel for Production and Preview, then redeploy: the function reads them from Vercel, not from `.env.local`. Without them the endpoint answers "unavailable" and iPhone voice keeps failing as before.

## 3. Vercel (hosting + `/api/parse`, `/api/coach` and `/api/transcribe`)

1. Sign in at vercel.com with the **Hobby** plan.
2. **The repo is on GitHub** (`main` and 12 other branches pushed; CI is green on `main`). The Vercel project `next-rep` is imported (**Add New > Project**).
3. Settings: Framework preset **Vite** (auto-detected), build command `npm run build`, output directory `dist`, Node.js version **22.x**.
4. **Environment variables** (add before the first deploy). The names are single-sourced in `.env.example`; this table says where each one is set:

| Name                     | Value                            | Environments                     | Notes                                             |
| ------------------------ | -------------------------------- | -------------------------------- | ------------------------------------------------- |
| `VITE_SUPABASE_URL`      | Project URL                      | Production, Preview, Development | Public (baked into the client at build time)      |
| `VITE_SUPABASE_ANON_KEY` | publishable key                  | Production, Preview, Development | Public by design; RLS protects data               |
| `SUPABASE_URL`           | Project URL                      | Production, Preview              | Server only (token verification in `/api/*`)      |
| `SUPABASE_ANON_KEY`      | publishable key                  | Production, Preview              | Server only                                       |
| `GEMINI_API_KEY`         | key from section 2               | Production, Preview              | Server only; mark as sensitive                    |
| `GEMINI_MODEL`           | free-tier Flash-class model id   | Production, Preview              | Server only                                       |
| `COACH_MODEL`            | another free-tier model id       | Production, Preview              | Optional, server only; empty means `GEMINI_MODEL` |
| `FALLBACK_API_KEY`       | key from section 2.1             | Production, Preview              | Optional, server only; mark as sensitive          |
| `FALLBACK_BASE_URL`      | `https://api.groq.com/openai/v1` | Production, Preview              | Optional, server only; https only                 |
| `FALLBACK_MODEL`         | model id from the Groq console   | Production, Preview              | Optional, server only; the coach only             |
| `TRANSCRIBE_MODEL`       | default `whisper-large-v3-turbo` | Production, Preview              | Optional, server only; empty means the default    |

`VITE_*` values are baked in at build time, so redeploy after changing them. Do not add any service-role or secret key. 5. Deploy. `vercel.json` already contains the single-page-app fallback rewrite so React Router deep links work. 6. **Preview deployments** give you HTTPS URLs, which phones need for voice. They are behind Vercel Authentication (see "Deployment Protection" below). 7. Optional: put the functions in the region closest to your Supabase project (Settings > Functions).

### Production addresses

| Address                               | Public                            |
| ------------------------------------- | --------------------------------- |
| https://nextrep-gym.vercel.app        | Yes, the live address             |
| https://next-rep-next-rep3.vercel.app | No, Vercel login; do not give out |

The nicer name `nextrep-gym.vercel.app` is a domain added to the project in Vercel > Settings > Domains. A one-off alias would not follow new deploys. The address Vercel first assigned to the project (a random name) was removed from the project once this one worked; it now answers 404.

### Deployment Protection

Preview deployments (`next-*-next-rep3.vercel.app`) need a Vercel login. The production address listed as public does not.

### 3.1 Verify the deploy

- The production URL (https://nextrep-gym.vercel.app) shows the **Next Rep** heading.
- Function check with no token, expected status 401 and `{"status":"unauthorized"}` (a 200 HTML page means the SPA rewrite is swallowing `/api`):

```bash
curl -i -X POST https://<your-app>.vercel.app/api/parse
```

This also confirms `/api/*` is served by the function and not swallowed by the SPA rewrite. If it returns HTML instead, tell Claude Code.

## 4. Local environment

```bash
cp .env.example .env.local
# fill in the values from sections 1 to 3
```

`.env.local` is git-ignored, and Claude Code is denied from reading it. Run `npm run dev` (`http://localhost:5173`). Voice works on `localhost` and HTTPS only.

## 5. GitHub

- Push approval: tell Claude Code explicitly when you want a branch pushed. `main` and 12 other branches are pushed, and `feat/coach`, `feat/home`, `feat/liquid-glass`, `feat/settings`, `feat/units`, `fix/double-tap-guards` and `refactor/shared-ui` (still local only) are all merged into `main`.
- **CI** (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, `test:db`, `seed:check`, build, a grep of the built bundle for secrets, and a gitleaks full-history scan; it needs no secrets.
- The hosted integration suite and the E2E smoke are run by you, not by CI (CI has no step for them). Only if you later add such a step, add the Supabase URL, publishable key and the four `E2E_*` values as **repository secrets**.
- **GitHub plugin:** it failed to connect with "Authorization header is badly formatted". Run `/mcp` in Claude Code and re-authenticate it. This is optional; `git` and the web UI are enough.
- Upgrading `gh` (2.4.0 is very old) is optional and needs sudo.

## 6. Checklist

Ticked items are backed by the [AI log](../learning/ai-log.md) or git; a date says when.

- [x] Supabase project created (free); URL and publishable key saved (in use)
- [x] `0001_init.sql` and `seed.sql` applied: 7 tables with RLS, 56 seed rows found by `check:supabase`
- [x] `0002_gym_bar_kind.sql` and `0003_exercise_muscle.sql` applied and `seed.sql` re-run (`exercises` has a `muscle` column, 892 global exercises)
- [x] `0005_rate_limit_scopes.sql` written, tested in PGlite and applied through the Supabase plugin (it cleared 11 old counter rows; `api_rate_limits` has `scope` and `window_seconds`, `api_daily_totals` exists with RLS on, the three functions are executable by `authenticated` only; the one-argument `consume_rate_limit` stays so an older `/api/parse` keeps working). The security advisor shows only the by-design notices for these tables and functions.
- [x] `0006_revoke_rls_auto_enable.sql` written, tested in PGlite and applied through the Supabase plugin: the security advisor had flagged Supabase's own `rls_auto_enable()` helper as callable by `anon` and `authenticated`; now only its owner can call it, and its event trigger is still active.
- [x] `0004_one_gym_per_user.sql` applied through the Supabase plugin (it removed no gym: one user, one gym; `is_default` is gone, `gyms_one_per_user` exists, the name defaults to 'My gym'). A build older than this change fails against the new schema, so redeploy after pulling.
- [x] Advisors reviewed (healthy, no issues)
- [x] Confirm-email decision made (off until code freeze, ADR-007); two test users created (both sign in)
- [x] Confirm email switched on, with custom SMTP (Brevo), the email limit at 100 an hour and two confirmed demo accounts; a confirmation email received and signed in with on a preview
- [x] Site URL set to https://nextrep-gym.vercel.app (the redirect URLs hold only `http://localhost:5173`, no wildcards)
- [x] Gemini key created with **no billing**; `GEMINI_MODEL` chosen (Gemini verified live on a preview deploy)
- [x] Repo pushed (GitHub: `main` and 12 other branches, CI green on `main`)
- [x] Vercel project `next-rep` imported; env vars set; preview deployed
- [x] Production deployed: https://nextrep-gym.vercel.app (same code as `main`)
- [x] Production page loads; `POST /api/parse` and `/api/coach` with no token return 401 (checked from outside, no login)
- [x] A sign-up test on the live address: with a throwaway address the confirmation email arrived, the link worked and sign-in worked (an address that does not exist, such as a Gmail `name+tag` whose base mailbox is not yours, is accepted by the form but hard-bounces at Brevo, so no email arrives and the screen still says "Check your email")
- [x] `.env.local` filled; `npm run check:supabase` passes (16 checks, before migrations 0002 and 0003)
- [ ] A phone opens https://nextrep-gym.vercel.app over HTTPS: microphone, offline and install (not done yet; check it yourself)
- [x] After the deploy that adds `/api/transcribe` (with the Groq settings in Vercel): test voice on a real iPhone. Say "bench press 60 kilo 8 reps" and check that the cloud notice appears, the words and the confirm card are right, and nothing is saved until Log set. Done on an iPhone 15 in Safari and Chrome.

## Troubleshooting

| Symptom                                                                 | Likely cause / fix                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-up emails never arrive                                             | Check the spam folder (the sender is a Gmail address without a domain of our own); check custom SMTP is still on and the Brevo SMTP key is valid (Brevo > SMTP & API); check the Brevo daily limit (300) and the Supabase email limit (100 an hour); or create the user in the dashboard with Auto Confirm User                                                                       |
| App shows empty data / 401 from Supabase                                | Wrong URL or key in env; `VITE_*` change not redeployed                                                                                                                                                                                                                                                                                                                               |
| `permission denied` on a table                                          | Migration not fully applied (the grants are at the end of `0001_init.sql`)                                                                                                                                                                                                                                                                                                            |
| Everything times out                                                    | Free Supabase project is paused; wake it in the dashboard                                                                                                                                                                                                                                                                                                                             |
| `/api/parse` returns HTML                                               | SPA rewrite capturing the route; check `vercel.json` and the function path `api/parse.ts`                                                                                                                                                                                                                                                                                             |
| Mic button does nothing on a phone                                      | Not HTTPS or `localhost`, microphone permission denied, or the browser lacks the Web Speech API                                                                                                                                                                                                                                                                                       |
| Gemini returns 429                                                      | Free-tier rate limit; expected, the app falls back to manual confirmation                                                                                                                                                                                                                                                                                                             |
| `check:supabase` fails with `fetch failed` or `UND_ERR_CONNECT_TIMEOUT` | No HTTP response at all: DNS, firewall, VPN or proxy, not the key. Once the home router answered IPv6 lookups for `supabase.co` far too slowly (15 to 20 s). Test with `time getent ahosts <ref>.supabase.co`; if it is slow, point the connection at a public DNS such as 1.1.1.1 and 8.8.8.8 (`nmcli connection modify <name> ipv4.dns "1.1.1.1 8.8.8.8" ipv4.ignore-auto-dns yes`) |
