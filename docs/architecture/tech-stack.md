# Tech stack

All dependency versions are **pinned exactly** (`.npmrc` `save-exact=true`) and the lockfile is committed. Versions were checked against the npm registry on 2026-10-08, not from memory. Node 22.12+ is required.

| Area            | Choice                                       | Version (pinned)        | Notes                                                                                            |
| --------------- | -------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------ |
| Language        | TypeScript (strict)                          | 6.0.3                   | Held below 7: `typescript-eslint` 8.71.1 declares `typescript <6.1.0`. Move to 7 once supported. |
| Frontend        | React + Vite                                 | 19.3.0 / vite 8.3.3     | SPA, mobile-first; `@vitejs/plugin-react` 6.1.2                                                  |
| Styling         | Tailwind CSS (Vite plugin)                   | 4.3.3                   | Design tokens in `src/index.css` from the Claude Design handoff (ADR-008)                        |
| Font            | `@fontsource-variable/geist` (OFL-1.1)       | 5.3.0                   | Self-hosted Geist, no third-party requests (ADR-008)                                             |
| Routing         | React Router                                 | 8.4.0                   |                                                                                                  |
| PWA             | vite-plugin-pwa (Workbox)                    | 2.0.0 (+ workbox 7.4.1) | App shell cached for offline use                                                                 |
| Local data      | Dexie.js (IndexedDB)                         | 4.4.6                   | Local-first sets + sync queue; `fake-indexeddb` 6.2.5 for tests                                  |
| Validation      | Zod                                          | 4.6.5                   | Shared schemas for parser output, API payloads, DB rows                                          |
| Backend         | Supabase (Postgres, Auth, RLS)               | supabase-js 2.117.3     |                                                                                                  |
| Serverless      | Vercel function in `/api`                    | n/a                     | Web-standard `Request`/`Response`; no `@vercel/node` (see below)                                 |
| Token check     | `jose`                                       | 6.2.12                  | Verifies the user's Supabase JWT against the project's JWKS                                      |
| In-app LLM      | Gemini API (free tier), `@google/genai`      | 2.28.0                  | Model name from env var `GEMINI_MODEL`, never hardcoded                                          |
| Voice           | Web Speech API                               | n/a                     | `en-IN` by default                                                                               |
| Charts          | Recharts                                     | 3.10.1                  |                                                                                                  |
| Unit tests      | Vitest + Testing Library + jsdom             | 5.0.3                   |                                                                                                  |
| DB schema tests | PGlite (Postgres in WASM)                    | 0.5.8                   | `npm run test:db`; runs the migration and seed locally, no Docker                                |
| E2E             | Playwright                                   | 1.64.0                  | A handful of critical flows only                                                                 |
| Lint / format   | ESLint 10.12.0 (flat config), Prettier 3.9.9 |                         | CI and pre-commit                                                                                |
| Secret scanning | Gitleaks                                     | 8.30.1                  | Pre-commit hook + CI                                                                             |
| CI              | GitHub Actions                               |                         | Lint, typecheck, tests, build, gitleaks                                                          |

## Dependency risk notes

- `@vercel/node` was removed: its transitive dependencies carried 10 high-severity advisories and it was only needed for types. The function uses the standard web `Response` type.
- `npm audit` is clean at scaffold time (0 vulnerabilities) and is re-run before submission; known issues are documented here.
- `@google/genai` is used only by the serverless function and is currently a dev dependency; it moves to `dependencies` when the function is built.
- Free-tier prompts to Gemini may be used by Google to improve its products, which is why only the transcript is sent. See [threat model](../security/threat-model.md).

## Why these choices

See the ADRs in [`decisions/`](decisions/), in particular [ADR-006](decisions/006-free-tier-only-stack.md) for the free-tier-only constraint.
