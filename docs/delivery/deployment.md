# Deployment guide (manual steps)

The steps **you** do by hand: accounts, secrets and dashboards that Claude Code must not touch. Everything is free tier ([ADR-006](../architecture/decisions/006-free-tier-only-stack.md)). Never paste secrets into chat, commits or docs; they live only in the Vercel/Supabase dashboards, a password manager and your local `.env.local` (git-ignored, and Claude Code is denied from reading it).

Verified against the Supabase, Vercel and Google AI docs on 2026-10-08. Dashboard labels change, so if one differs, follow the intent.

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

**Option A (simplest): SQL editor.** In the dashboard SQL editor, run `supabase/migrations/0001_init.sql`, then `supabase/seed.sql`, then `supabase/migrations/0002_gym_bar_kind.sql`, `0003_exercise_muscle.sql` and `0004_one_gym_per_user.sql`, and then run `supabase/seed.sql` again (it adds the muscle and the imported exercises). Migrations are run once each, in order; the seed is safe to run any number of times.

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
- **Confirm email:** hosted projects have it on by default and the default mail service allows only about 2 emails per hour, which makes sign-ups flaky. During development turn it **off**. **At code freeze turn it back on** (see the [roadmap](../plans/roadmap.md)): the server then answers every sign-up the same way, so the app no longer reveals which addresses are registered. Create the test users from the dashboard (Auth > Users > Add user, auto-confirm) so they work either way.
- Set a sensible minimum password length in the Auth settings.
- **Site URL / redirect URLs:** set the Site URL to your Vercel production URL once you have it; add `http://localhost:5173` for local dev.

### 1.5 Test users (for E2E and the RLS isolation suite)

Create **two dedicated test users** (for example `nextrep-test-a@example.invalid` and `nextrep-test-b@example.invalid`, invented addresses) with generated passwords. They go in `.env.local` as `E2E_USER_A_EMAIL`, `E2E_USER_A_PASSWORD`, `E2E_USER_B_EMAIL`, `E2E_USER_B_PASSWORD`. Never use a real person's account.

### 1.6 Check the connection from your machine

After section 4 (the local env file) is filled in, run:

```bash
npm run check:supabase
```

It loads `.env.local` itself and prints only PASS/FAIL lines, never a key, password or token, so its output is safe to paste. It checks: the URL and key type, that the Auth service answers, that signed-out users are locked out of `exercises`, that both test users can sign in, that the seed has all its global exercises (56 on 2026-10-08, before migration 0003), that tables can be queried, and that the rate-limit function works for signed-in users and is closed to anon. It makes one write: the rate-limit call adds a row to test user A's own counter. Run it yourself rather than through Claude Code, which never touches `.env.local`.

The same credentials let you run `npm run test:integration` (profile access rules on the hosted project, as the two test users) and `npm run test:e2e` (sign-in in a real browser). Both skip themselves when the values are missing, and both are run by you, not by CI.

**Hosted checks: what ran and what has not** (single statement; as recorded in the AI log, 2026-10-10):

- Ran, 2026-10-08, by you: `npm run check:supabase` (16 checks passed, after the DNS fix) and `npm run test:integration` (6 of 6, profile access rules).
- Run on 2026-10-10: `npm run test:e2e` passed 4 of 4 (sign-in, Settings sign-out, and a workout logged online and offline). Checked on 2026-10-11 through the Supabase plugin (read-only): the hosted project already has migrations 0002 and 0003 and the full seed (892 exercises, all with a muscle; 0002 is not in the migration list, so it was applied by hand). Not run yet: the integration tests added later for gyms, exercises, the log sync and the history pull. The profile upsert used by Settings has no integration test yet.

## 2. Gemini API key (free tier, no billing)

1. Open Google AI Studio (aistudio.google.com) > **API keys** > **Create API key**.
2. **Do not enable billing or link a billing account** to the key's Google Cloud project. If AI Studio or Cloud prompts you to, decline. The app treats Gemini as a scarce fallback and handles `429` and errors without blocking logging.
3. Choose a fast, cheap **Flash-class model** that AI Studio lists as available on the free tier at build time (check its rate-limit page). Its id goes in `GEMINI_MODEL`. It is never hardcoded.
4. Set only `GEMINI_API_KEY`. Do **not** also set `GOOGLE_API_KEY`: the SDK gives it precedence if both exist.
5. The key is used only by the serverless function. It must never be prefixed `VITE_`.

Free-tier prompts may be used by Google to improve its products, which is why only the transcript is sent ([threat model](../security/threat-model.md)).

## 3. Vercel (hosting + `/api/parse`)

1. Sign in at vercel.com with the **Hobby** plan.
2. **The repo is on GitHub** (`main`, with PRs up to #11 merged, as of 2026-10-10). Branches that are not pushed yet (the work on `feat/home` and below) need your explicit go-ahead to push. Then **Add New > Project** and import the repo.
3. Settings: Framework preset **Vite** (auto-detected), build command `npm run build`, output directory `dist`, Node.js version **22.x**.
4. **Environment variables** (add before the first deploy). The names are single-sourced in `.env.example`; this table says where each one is set:

| Name                     | Value                          | Environments                     | Notes                                            |
| ------------------------ | ------------------------------ | -------------------------------- | ------------------------------------------------ |
| `VITE_SUPABASE_URL`      | Project URL                    | Production, Preview, Development | Public (baked into the client at build time)     |
| `VITE_SUPABASE_ANON_KEY` | publishable key                | Production, Preview, Development | Public by design; RLS protects data              |
| `SUPABASE_URL`           | Project URL                    | Production, Preview              | Server only (token verification in `/api/parse`) |
| `SUPABASE_ANON_KEY`      | publishable key                | Production, Preview              | Server only                                      |
| `GEMINI_API_KEY`         | key from section 2             | Production, Preview              | Server only; mark as sensitive                   |
| `GEMINI_MODEL`           | free-tier Flash-class model id | Production, Preview              | Server only                                      |

`VITE_*` values are baked in at build time, so redeploy after changing them. Do not add any service-role or secret key. 5. Deploy. `vercel.json` already contains the single-page-app fallback rewrite so React Router deep links work. 6. **Preview deployments** give you HTTPS URLs, which phones need for voice. If previews show a Vercel login wall, adjust **Deployment Protection** in the project settings. 7. Optional: put the functions in the region closest to your Supabase project (Settings > Functions).

### 3.1 Verify the deploy

- The production URL shows the **Next Rep** heading.
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

- Push approval: tell Claude Code explicitly when you want a branch pushed. `chore/phase-0` was merged to `main` as PR #1 long ago; the branches still local are `fix/double-tap-guards`, `feat/settings`, `feat/units`, `refactor/shared-ui` and `feat/home` (as of 2026-10-10).
- **CI** (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, `test:db`, `seed:check`, build, a grep of the built bundle for secrets, and a gitleaks full-history scan; it needs no secrets.
- The hosted integration suite and the E2E smoke are run by you, not by CI (CI has no step for them). Only if you later add such a step, add the Supabase URL, publishable key and the four `E2E_*` values as **repository secrets**.
- **GitHub plugin:** it failed to connect with "Authorization header is badly formatted". Run `/mcp` in Claude Code and re-authenticate it. This is optional; `git` and the web UI are enough.
- Upgrading `gh` (2.4.0 is very old) is optional and needs sudo.

## 6. Checklist

Ticked items are backed by the [AI log](../learning/ai-log.md) or git; a date says when.

- [x] Supabase project created (free); URL and publishable key saved (in use since 2026-10-08)
- [x] `0001_init.sql` and `seed.sql` applied: 7 tables with RLS, 56 seed rows found by `check:supabase` (2026-10-08)
- [x] `0002_gym_bar_kind.sql` and `0003_exercise_muscle.sql` applied and `seed.sql` re-run (`exercises` has a `muscle` column, 892 global exercises; checked 2026-10-11)
- [x] `0004_one_gym_per_user.sql` applied through the Supabase plugin on 2026-10-16 (it removed no gym: one user, one gym; `is_default` is gone, `gyms_one_per_user` exists, the name defaults to 'My gym'). A build older than this change fails against the new schema, so redeploy after pulling.
- [x] Advisors reviewed (healthy, no issues on 2026-10-08)
- [x] Confirm-email decision made (off until code freeze, ADR-007); two test users created (both sign in, 2026-10-08)
- [ ] Site URL set (needs the Vercel production URL)
- [ ] Gemini key created with **no billing**; `GEMINI_MODEL` chosen
- [x] Repo pushed (GitHub, `main` up to PR #11)
- [ ] Vercel project imported; env vars set; deployed (no deployment exists yet)
- [ ] Production page loads; `POST /api/parse` with no token returns 401 JSON
- [x] `.env.local` filled; `npm run check:supabase` passes (16 checks, 2026-10-08, before migrations 0002 and 0003)
- [ ] A phone opens the preview URL over HTTPS

## Troubleshooting

| Symptom                                                                 | Likely cause / fix                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-up emails never arrive                                             | Default mail limit (about 2 per hour); turn off Confirm email or create users in the dashboard                                                                                                                                                                                                                                                                                                 |
| App shows empty data / 401 from Supabase                                | Wrong URL or key in env; `VITE_*` change not redeployed                                                                                                                                                                                                                                                                                                                                        |
| `permission denied` on a table                                          | Migration not fully applied (the grants are at the end of `0001_init.sql`)                                                                                                                                                                                                                                                                                                                     |
| Everything times out                                                    | Free Supabase project is paused; wake it in the dashboard                                                                                                                                                                                                                                                                                                                                      |
| `/api/parse` returns HTML                                               | SPA rewrite capturing the route; check `vercel.json` and the function path `api/parse.ts`                                                                                                                                                                                                                                                                                                      |
| Mic button does nothing on a phone                                      | Not HTTPS or `localhost`, microphone permission denied, or the browser lacks the Web Speech API                                                                                                                                                                                                                                                                                                |
| Gemini returns 429                                                      | Free-tier rate limit; expected, the app falls back to manual confirmation                                                                                                                                                                                                                                                                                                                      |
| `check:supabase` fails with `fetch failed` or `UND_ERR_CONNECT_TIMEOUT` | No HTTP response at all: DNS, firewall, VPN or proxy, not the key. On 2026-10-08 the home router answered IPv6 lookups for `supabase.co` far too slowly (15 to 20 s). Test with `time getent ahosts <ref>.supabase.co`; if it is slow, point the connection at a public DNS such as 1.1.1.1 and 8.8.8.8 (`nmcli connection modify <name> ipv4.dns "1.1.1.1 8.8.8.8" ipv4.ignore-auto-dns yes`) |
