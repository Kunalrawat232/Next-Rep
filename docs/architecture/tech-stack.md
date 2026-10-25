# Tech stack

Dependency versions live in `package.json`; the table below is a snapshot, checked against `package.json`. All are **pinned exactly** (`.npmrc` `save-exact=true`) and the lockfile is committed. The versions were first checked against the npm registry, not from memory. Node 22.12+ is required.

| Area            | Choice                                       | Version (pinned)        | Notes                                                                                                                                                              |
| --------------- | -------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Language        | TypeScript (strict)                          | 6.0.3                   | Held below 7: `typescript-eslint` 8.71.1 declares `typescript <6.1.0`. Move to 7 once supported.                                                                   |
| Frontend        | React + Vite                                 | 19.3.0 / vite 8.3.3     | SPA, mobile-first; `@vitejs/plugin-react` 6.1.2                                                                                                                    |
| Styling         | Tailwind CSS (Vite plugin)                   | 4.3.3                   | Design tokens in `src/index.css` from the Claude Design handoff (ADR-008)                                                                                          |
| Font            | `@fontsource-variable/geist` (OFL-1.1)       | 5.3.0                   | Self-hosted Geist, no third-party requests (ADR-008)                                                                                                               |
| Routing         | React Router                                 | 8.4.0                   |                                                                                                                                                                    |
| PWA             | vite-plugin-pwa (Workbox)                    | 2.0.0 (+ workbox 7.4.1) | App shell cached for offline use                                                                                                                                   |
| Local data      | Dexie.js (IndexedDB)                         | 4.4.6                   | Local-first sets + sync queue; `fake-indexeddb` 6.2.5 for tests                                                                                                    |
| Validation      | Zod                                          | 4.6.5                   | Shared schemas for parser output, API payloads, DB rows                                                                                                            |
| Backend         | Supabase (Postgres, Auth, RLS)               | supabase-js 2.117.3     |                                                                                                                                                                    |
| Serverless      | Vercel function in `/api`                    | n/a                     | `/api/parse`, `/api/coach` and `/api/transcribe`, built. Web-standard `Request`/`Response`; no `@vercel/node` (see below)                                          |
| Token check     | `supabase.auth.getClaims` (supabase-js)      | n/a                     | `jose` 6.2.12 is only a devDependency and no code imports it; see [API contracts](api-contracts.md)                                                                |
| In-app LLM      | Gemini API (free tier), `@google/genai`      | 2.28.0                  | Built: the voice fallback and the coach. Model name from env var `GEMINI_MODEL`, never hardcoded                                                                   |
| Coach fallback  | Groq (free tier), plain `fetch`              | n/a                     | Optional second provider for the coach (ADR-018) and speech-to-text on `/api/transcribe` (ADR-019), set by `FALLBACK_*` env vars; no new package                   |
| Voice           | Web Speech API, then Groq Whisper (cloud)    | n/a                     | Built (`src/features/voice/speech.ts`), `en-IN` by default. Cloud fallback on `/api/transcribe` (ADR-019); built and tested with fakes, not yet verified on iPhone |
| Glass lens      | `liquid-gl`                                  | 3.0.0                   | Runtime dependency, loaded on demand on small surfaces (ADR-016)                                                                                                   |
| Charts          | Recharts                                     | 3.10.1                  |                                                                                                                                                                    |
| Unit tests      | Vitest + Testing Library + jsdom             | 5.0.3                   |                                                                                                                                                                    |
| DB schema tests | PGlite (Postgres in WASM)                    | 0.5.8                   | `npm run test:db`; runs the migration and seed locally, no Docker                                                                                                  |
| E2E             | Playwright                                   | 1.64.0                  | A handful of critical flows only                                                                                                                                   |
| Lint / format   | ESLint 10.12.0 (flat config), Prettier 3.9.9 |                         | CI and pre-commit                                                                                                                                                  |
| Secret scanning | Gitleaks                                     | 8.30.1                  | Pre-commit hook + CI                                                                                                                                               |
| CI              | GitHub Actions                               |                         | Lint, typecheck, `npm test`, `test:db`, `seed:check`, build, bundle secret grep, gitleaks                                                                          |

Status: voice input, the parser, the Gemini fallback and the coach are built.

## Dependency risk notes

- `@vercel/node` was removed: its transitive dependencies carried 10 high-severity advisories and it was only needed for types. The function uses the standard web `Response` type.
- `npm audit` is clean at scaffold time (0 vulnerabilities) and is re-run before submission; known issues are documented here.
- `@google/genai` is used only by the serverless functions (`api/parse.ts`, `api/coach.ts`) and is still listed under `devDependencies` in `package.json`.
- Free-tier prompts to Gemini may be used by Google to improve its products, which is why only the transcript is sent. The speech-to-text on `/api/transcribe` (Groq, ADR-019) receives the voice recording, but only on phones where the browser's recogniser cannot hear. See [threat model](../security/threat-model.md).

## Why these choices

See the ADRs in [`decisions/`](decisions/), in particular [ADR-006](decisions/006-free-tier-only-stack.md) for the free-tier-only constraint.
