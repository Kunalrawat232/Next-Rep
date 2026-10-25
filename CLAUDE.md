# Next Rep

Voice-first gym workout logger, an installable PWA. Say "bench press 60 kilo 8 reps" between sets and it is logged correctly, even offline, with bar weight and per-side maths handled for you. Built solo for the Build With AI Hackathon 2026 (feature freeze 25 Oct, submit 30 Oct 2026). Status: the voice parser and the mic on the workout screen work (tap to speak, confirm, log); `/api/parse` (Gemini fallback) is built, tested with fakes and verified once against live Gemini on a preview deploy; tap logging works; an AI coach (`/coach`, `/api/coach`) is built and merged to `main` (text only, gym and diet only); cloud speech-to-text for iPhone voice (`/api/transcribe`, ADR-019) is built, tested with fakes and checked on an iPhone 15 in Safari and Chrome. Production is deployed at https://nextrep-gym.vercel.app.

**Principle: "AI listens, code verifies."** Speech recognition and Gemini are untrusted input. Every number that reaches storage passes deterministic validation and is shown to the user first.

## How to work here (read this first)

- **Always read the relevant docs in `agent_docs/` first, starting from [agent_docs/index.md](agent_docs/index.md), and only then read the code if necessary.** Verify against the code before relying on anything marked "unverified".
- **After implementing a feature or changing behaviour, update the relevant existing doc, or create a new doc (and add it to that folder's `index.md`) if none exists.**
- `docs/` is the human and judge documentation (ADRs, product, security, AI docs): open an ADR when an agent doc points to it. `docs/learning/ai-log.md` is an append-only log: add an entry for each finished feature, but do not read it for context.

## 1. Quick reference

Stack: React, Vite, TypeScript (strict), Tailwind, react-router, Zod, Dexie (IndexedDB), Supabase, Recharts, vite-plugin-pwa, Vitest, Playwright. All dependencies are pinned to exact versions in `package.json` (the source for versions). Node >= 22.12.

| Task                                      | Command                                                                                         |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Install                                   | `npm install` (also enables the git hook `.githooks/pre-commit` via `prepare`)                  |
| Dev server                                | `npm run dev` (http://localhost:5173)                                                           |
| Unit tests (jsdom, fake IndexedDB)        | `npm test`                                                                                      |
| DB schema + RLS tests (PGlite)            | `npm run test:db`                                                                               |
| One test file or one test                 | `npx vitest run path/to/file.test.ts` (add `-t "test name"` for one test)                       |
| Lint / typecheck / format                 | `npm run lint` / `npm run typecheck` / `npm run format`                                         |
| Build                                     | `npm run build`                                                                                 |
| E2E smoke, hosted-project tests, DB check | `npm run test:e2e`, `npm run test:integration`, `npm run check:supabase`, `npm run check:coach` |

Env vars live in `.env.local` (git-ignored); the names are in `.env.example` and AGENT_CONTEXT.md section 8.

## 2. Project map

```
src/domain/     pure logic (no React, network, storage): weight, units, validation, workout, records, progression, rest, history, gyms, exercises, coach (shared schemas and the coach's name), parser (English and Hindi number words)
src/data/       local/ (Dexie log store + outbox), remote/ (Supabase services), sync/ (worker, scheduler, pull)
src/features/   UI by feature: auth, gyms, exercises, workout, history, progress, home, settings, sync, voice (speech hook and phrase-to-draft logic; the mic UI is in workout), coach (chat page)
src/components/ shared UI (AppShell, Card, Section, PageHeader, messages, Button, Chip, TextField, Switch, ...)
src/app/        routes, bootstrap (wires Supabase), App
src/lib/        Result/Failure types, usePending, useOnline
src/test/       test harness: appHarness.tsx, fakes, doubleTap.ts
api/            Vercel functions (parse.ts wires `_lib/parse.ts`, the Gemini fallback handler; coach.ts wires `_lib/coach.ts`, the coach handler; transcribe.ts wires `_lib/transcribe.ts`, the speech-to-text handler)
supabase/       migrations, seed.sql (generated)
tests/          db/ (PGlite), integration/ (hosted, you run), e2e/ (Playwright), design/
agent_docs/    per-area docs for agents, start at agent_docs/index.md (local-data, workout, api, database, testing)
docs/  .claude/ docs by topic; agents, skills, hooks
```

Full map with every folder and file: AGENT_CONTEXT.md section 2.

## 3. Code rules (always / never)

- **Plan before coding.** Show a short plan (files, approach, tests) and wait for "go" on any non-trivial task. Start a new session (or `/clear`) for each task, and `/compact` a long one before moving to another area.
- **Ask first** before adding a dependency, changing the data model, changing an architectural decision, or deviating from the docs.
- **One finished task = one commit:** a single short Conventional Commit subject line, no body, plus the Co-Authored-By attribution trailer when the harness asks for one (the trailer is the only allowed body). Ask before any other commit. Never push without approval. If the user says they handle git themselves, do not commit.
- **Tests ship with the code.** Domain logic (parser, weight maths, validators, sync) gets unit tests in the same task.
- **`src/domain/` stays pure.** No React, network or storage there: it is the only code allowed to decide a weight is valid.
- **Screens never import Supabase.** They use service interfaces (`GymService`, `ExerciseService`, `AuthService`, `RemoteLog`) implemented in `src/data/remote/`: this is what makes fakes and offline possible.
- **Local first for sets.** Sets and workouts are written to the Dexie store, then pushed by the sync worker. Never write a set straight to Supabase from a screen.
- **TypeScript strict. No `any`** without a justifying comment (the lint rule is an error). No `dangerouslySetInnerHTML`. No dead or commented-out code.
- **Check data at every boundary** with the shared Zod schemas (`src/domain/schemas.ts`): rows read from IndexedDB or the server are untrusted.
- **Errors are values.** Backend calls return `Result` (`src/lib/result.ts`) with a `Failure` of `offline | conflict | rejected | unknown`; screens show a friendly message, never a raw error.
- **Styling:** Tailwind with design tokens (`@theme` in `src/index.css`); no hard-coded colours. Dark is the default theme, light via `[data-theme='light']`.
- **Use the shared UI components** (`src/components`: `Card`, `ErrorMessage`, `RetryMessage`, `LoadingMessage`, `EmptyState`, `NotFound`, `PageHeader`, `Section`) and never copy their classes into a screen; a test (`noCopies.test.ts`) fails if the box classes or a hand-made back link and title come back.
- **One-shot actions** (save, delete, sign in, undo) are guarded with `usePending()` (`src/lib/usePending.ts`), not a bare `useState` flag: two taps in the same instant both see the old state. Test them with `tapTogether()` (`src/test/doubleTap.ts`), not `user.dblClick`.
- **Hooks that read the local store** re-read on `pending, failed, syncing, pulledVersion` from `useSyncStatus()` and ignore `DatabaseClosedError` via `ignoreClosed`.
- **Never touch secrets.** Do not read, print or commit `.env*` files. Gitleaks guards commits and CI. Free tiers only; never link a billing account to Gemini. Invented sample data only.
- Gemini is only a fallback behind `/api/parse`; its output goes through the same validators (ADR-003). The coach (`/api/coach`, ADR-017) is the one other Gemini use: text advice only, read only, gym and diet only, never writes anything, its replies shown as plain text. When Gemini cannot answer, the coach asks one second free provider (Groq, ADR-018) with the same prompt and the same checks. Groq also does speech-to-text on `/api/transcribe` (ADR-019), only where the browser's own recogniser fails; the audio is never stored or logged. Claude is never used inside the app.
- Reviewers (`code-reviewer`, `security-auditor`) change nothing; the `qa-tester` agent may only add new test files. Definition of done: code + tests passing + lint and types clean + docs updated if behaviour changed + `docs/learning/ai-log.md` entry.

## 4. Domain rules

- **A user has exactly one gym**: the bars that are added to their weights (ADR-015, enforced by a unique index; no list, name, default or delete). The first workout creates it with a standard barbell.
- **Logged weight is always the TOTAL in kg including the bar** (ADR-002). `total = bar + 2 x per side`. Dumbbells are per dumbbell; machines use the stack weight; bodyweight stores added weight (0 allowed).
- Storage unit is kg only. The user's unit (kg or lb, Settings) decides how weights are **shown and typed**, via `src/domain/units` and `useUnit()`: never write a literal "kg" in a screen. Units are written "Kg" and "Lb" everywhere on screen (`unitLabel()`; the stored values `kg` and `lb` stay lowercase). A field that starts from a stored weight must keep the stored value (`WeightField`), because kg to lb and back is not exact. Weights have 2 decimals; records compare them as shown, in hundredths of the shown unit.
- **Timestamps** are stored as UTC ISO strings (`...Z`, milliseconds) locally and `timestamptz` on the server; local rows are canonicalised on write so they sort as plain strings. Display uses the device time zone. Ids for workouts and sets are minted on the device (`crypto.randomUUID()`).
- **Personal records** (`src/domain/records`): a set is a PR if heavier than every earlier set of that exercise ("PR"), or has more reps than any earlier set at exactly that weight ("Rep PR"). The first set is never a PR; 0 kg is never a weight PR. Computed on read, never stored. **Volume is not implemented** (dumbbell doubling needs a decision, see ADR-002).
- Validator ranges and the 40% jump check live in `src/domain/validation/config.ts` (prose in `docs/domain/weight-rules.md`).

## 5. Known quirks and gotchas

- **Never run commands that load `.env.local`** (`dev`, `build`, `test:e2e`, `test:integration`, `check:supabase`, `check:coach`): ask the developer to run them. Use `npm run typecheck` to check that code compiles. `test:integration` wipes the data of test users A and B, so never run it after seeding demo data into them.
- There is **no Stop hook**: run `npm test` yourself before finishing a task (an unhandled error fails the run). Whole-app tests that seed rows as "synced" must use an unreachable fake server (`offlineServer()` in `src/test/appHarness.tsx`) or the first pull deletes them.
- **Prettier rewraps code**, so scripted find/replace edits must tolerate whitespace; check each edit applied.
- **`npm run dev` serves `/api/parse`, `/api/coach` and `/api/transcribe` itself** (`vite.devApi.ts`, dev server only, never a build or the tests), using the server-only settings in `.env.local`; without it the dev server answers `/api/*` with the app's own page and the coach says it is unavailable.
- **`api/` runs as native ES modules on Vercel:** every relative import in the function and in the `src/` files it reaches needs a `.js` extension (a test, `api/_lib/imports.test.ts`, checks this); the editor and Vite do not complain, the deployed function crashes.
- `tests/` and `pwa.config.ts` are compiled with the node tsconfig (no DOM types).
- A QA agent once overwrote an existing test file: check `git diff --stat` for unexpected deletions after agent runs.
- Workouts cleared at sign-out (synced rows are purged) come back only through the history pull (`src/data/sync/pull.ts`, see AGENT_CONTEXT.md section 12 for its state).

## 6. After modifying the project

Apply the second rule above: update the matching doc, or create one and add it to its `index.md`. **After every reply, check whether CLAUDE.md and the docs it points to still match the code, and update whichever is out of date in the same reply** (skip it when nothing they describe changed; the user commits CLAUDE.md, AGENT_CONTEXT.md and `agent_docs/` themselves, so never commit them). Update **AGENT_CONTEXT.md** whenever you add or change a route, table or column, component or hook, env var, endpoint, domain rule or command. Update the matching file in `docs/` (ADR for an architectural decision) and add a `docs/learning/ai-log.md` entry for each finished feature.

Docs index (the main docs; the rest is under `docs/`): [requirements](docs/product/requirements.md), [architecture](docs/architecture/overview.md), [data model](docs/architecture/data-model.md), [offline sync](docs/architecture/offline-sync.md), [ADRs](docs/architecture/decisions/), [weight rules](docs/domain/weight-rules.md), [coding standards](docs/standards/coding-standards.md), [testing strategy](docs/standards/testing-strategy.md), [design system](docs/design/design-system.md), [security checklist](docs/security/security-checklist.md), [roadmap](docs/plans/roadmap.md).
