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

**Option A (simplest): SQL editor.** In the dashboard SQL editor, run `supabase/migrations/0001_init.sql`, then `supabase/seed.sql`. Run them in that order; the seed is safe to run again.

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
- SQL editor: `select count(*) from public.exercises where user_id is null;` returns **56**.
- Advisors: `supabase db advisors --linked` (or the dashboard **Advisors** page) and note anything reported. Expected to discuss: `consume_rate_limit` is a `SECURITY DEFINER` function in `public` by design (see [data model](../architecture/data-model.md)).

If the SQL fails, stop and send the exact error; do not edit tables by hand in the dashboard (schema changes must go through migration files).

### 1.4 Auth settings

- **Email provider** is enabled by default. The app uses email + password.
- **Confirm email:** hosted projects have it on by default and the default mail service allows only about 2 emails per hour, which makes sign-ups flaky. Recommended for this hackathon project: turn **Confirm email off** (Auth providers page), and accept that sign-ups are not verified. If you keep it on, create test users from the dashboard (Auth > Users > Add user, auto-confirm).
- Set a sensible minimum password length in the Auth settings.
- **Site URL / redirect URLs:** set the Site URL to your Vercel production URL once you have it; add `http://localhost:5173` for local dev.

### 1.5 Test users (for E2E and the RLS isolation suite)

Create **two dedicated test users** (for example `nextrep-test-a@example.invalid` and `nextrep-test-b@example.invalid`, invented addresses) with generated passwords. They go in `.env.local` as `E2E_USER_A_EMAIL`, `E2E_USER_A_PASSWORD`, `E2E_USER_B_EMAIL`, `E2E_USER_B_PASSWORD`. Never use a real person's account.

## 2. Gemini API key (free tier, no billing)

1. Open Google AI Studio (aistudio.google.com) > **API keys** > **Create API key**.
2. **Do not enable billing or link a billing account** to the key's Google Cloud project. If AI Studio or Cloud prompts you to, decline. The app treats Gemini as a scarce fallback and handles `429` and errors without blocking logging.
3. Choose a fast, cheap **Flash-class model** that AI Studio lists as available on the free tier at build time (check its rate-limit page). Its id goes in `GEMINI_MODEL`. It is never hardcoded.
4. Set only `GEMINI_API_KEY`. Do **not** also set `GOOGLE_API_KEY`: the SDK gives it precedence if both exist.
5. The key is used only by the serverless function. It must never be prefixed `VITE_`.

Free-tier prompts may be used by Google to improve its products, which is why only the transcript is sent ([threat model](../security/threat-model.md)).

## 3. Vercel (hosting + `/api/parse`)

1. Sign in at vercel.com with the **Hobby** plan.
2. **Push the repo to GitHub first.** Nothing has been pushed yet; pushing needs your explicit go-ahead. Then **Add New > Project** and import the repo.
3. Settings: Framework preset **Vite** (auto-detected), build command `npm run build`, output directory `dist`, Node.js version **22.x**.
4. **Environment variables** (add before the first deploy):

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
- Function check (stub until Phase 3), expected status 501 and `{"status":"unavailable"}`:

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

- Push approval: tell Claude Code explicitly when you want `chore/phase-0` pushed and merged to `main`.
- **CI** (`.github/workflows/ci.yml`) runs lint, typecheck, tests, build and a gitleaks full-history scan; it needs no secrets.
- Only if you later run the RLS/E2E suites in CI, add the Supabase URL, publishable key and the four `E2E_*` values as **repository secrets**. They are skipped when absent.
- **GitHub plugin:** it failed to connect with "Authorization header is badly formatted". Run `/mcp` in Claude Code and re-authenticate it. This is optional; `git` and the web UI are enough.
- Upgrading `gh` (2.4.0 is very old) is optional and needs sudo.

## 6. Checklist

- [ ] Supabase project created (free); URL and publishable key saved
- [ ] `0001_init.sql` then `seed.sql` applied; 7 tables with RLS; 56 global exercises
- [ ] Advisors reviewed
- [ ] Confirm-email decision made; Site URL set; two test users created
- [ ] Gemini key created with **no billing**; `GEMINI_MODEL` chosen
- [ ] Repo pushed (after approval); Vercel project imported; env vars set; deployed
- [ ] Production page loads; `POST /api/parse` returns 501 JSON
- [ ] `.env.local` filled; `npm run dev` works
- [ ] A phone opens the preview URL over HTTPS

## Troubleshooting

| Symptom                                  | Likely cause / fix                                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Sign-up emails never arrive              | Default mail limit (about 2 per hour); turn off Confirm email or create users in the dashboard  |
| App shows empty data / 401 from Supabase | Wrong URL or key in env; `VITE_*` change not redeployed                                         |
| `permission denied` on a table           | Migration not fully applied (the grants are at the end of `0001_init.sql`)                      |
| Everything times out                     | Free Supabase project is paused; wake it in the dashboard                                       |
| `/api/parse` returns HTML                | SPA rewrite capturing the route; check `vercel.json` and the function path `api/parse.ts`       |
| Mic button does nothing on a phone       | Not HTTPS or `localhost`, microphone permission denied, or the browser lacks the Web Speech API |
| Gemini returns 429                       | Free-tier rate limit; expected, the app falls back to manual confirmation                       |
