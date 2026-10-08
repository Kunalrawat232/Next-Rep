# KICKOFF.md: Next Rep, Project Brief for Claude Code

> **Read this entire file before writing any code.**
> This is the single source of truth for kicking off the project. In this first session you will turn it into a proper repo structure and context files (see Section 20: "Phase 0 tasks").
>
> **This file is temporary.** Every rule, decision, and piece of context in it must be distributed into the permanent files listed in Section 22. Once I have approved a coverage check proving nothing was lost, **this file is deleted** in its own commit. From then on, `CLAUDE.md` and `docs/` are the only sources of truth, and nothing may reference KICKOFF.md. (It remains visible in Git history, which is intended.)

---

## 0. How to work with me (the human)

- I am a confident developer. Explain decisions briefly, do not over-explain basics.
- **Plan before coding.** For any non-trivial task, first show a short plan (files to create/change, approach, tests), then wait for my "go".
- **Ask before** adding a new dependency, changing the data model, changing an architectural decision, or deviating from this brief.
- **Small, focused changes.** One feature or fix per task. Commit after each working step.
- **Tests come with the code**, not later. Domain logic (parser, weight math, validators, sync) must have unit tests in the same task.
- **Never touch secrets.** Do not read, print, or commit `.env` files. Use `.env.example` with placeholder names only.
- **Be honest about uncertainty.** If you are unsure about an API, a library version, or behaviour, say so and check the docs instead of guessing.
- After each completed task, append a short entry to `docs/learning/ai-log.md` (format in Section 15). I will add my own validation notes.

---

## 1. Hackathon context (why the rules below matter)

This is an entry for an internal company hackathon: **"Build With AI Hackathon 2026"**.

- **Challenge:** build ONE working product/MVP in one month, using AI as a development partner. The product does not have to be an AI product; what is judged is how well AI is used across the development lifecycle.
- **Individual entry.** Substantial implementation must be mine (with AI assistance), not other people's.
- **Deadline:** 30 October 2026, end of day. **No changes after submission.**
- **Our internal feature freeze:** 25 October 2026.

### Judging weights
| Weight | Category | What judges look for |
|---|---|---|
| 35% | AI development practices | AI across the lifecycle, context engineering, AI-assisted development and QA, agents/skills/instructions, human validation, learning from AI failures |
| 30% | Engineering and code quality | Architecture, maintainability, testing, security, reliability, deployment, documentation, technical trade-offs |
| 25% | Product quality | Core functionality, UX, completeness of chosen scope, polish, usefulness |
| 10% | Idea / business potential | Smaller weight on purpose |

### Hard rules from the organisers
- Never hardcode secrets. No passwords, API keys, or tokens anywhere in the repo or its **Git history** (the full Git history is submitted as a ZIP).
- Use appropriate environment/configuration handling.
- Implement authentication and authorisation where applicable.
- Validate inputs. Protect data and APIs. Handle user data responsibly.
- Consider dependency risks and AI-related risks.
- AI-assisted QA is **required** (test generation, edge cases, negative testing, debugging, code review). Full E2E automation is **not** required, but we must explain how AI contributed to QA and how its output was validated.
- No customer or client confidential information, data, code, or IP. Use only invented sample data.
- Respect third-party licences and terms.
- Disclose any significant pre-existing work (there is none at the time of writing).

### What the submission must contain
- Product description, problem statement, working demo link.
- ZIP with the complete project and full Git history.
- Technical docs: architecture, tech stack, technical decisions, limitations, dependencies.
- AI development docs: how AI was used, workflow, context engineering, skills, agents, instructions, guardrails.
- QA docs: AI-assisted testing and QA approach.
- Demo video, maximum 5 minutes.

**Implication for you:** documentation, decision records, tests, and the AI log are first-class deliverables, not afterthoughts.

---

## 2. The product

### Working name
**Next Rep**. A voice-first gym workout logger, delivered as an installable web app (PWA).

### Problem statement
People who lift weights need to record what they lifted (exercise, weight, reps) so they can progress over time. Today they use notes apps, paper diaries, or tap-heavy apps. Logging between sets is awkward: hands are sweaty or chalky, the phone is locked, and typing breaks focus. Gyms are often in basements with poor signal, so online-only apps fail at the worst moment. Weight is also ambiguous: is "45 kg" the total on the bar or the weight per side, and what does the bar weigh at this gym?

### Target user
Regular gym-goers who lift with barbells, dumbbells, and machines and want a fast, reliable log of their training and a clear view of their progress.

### Core value (one sentence)
**Say "bench 60 kilo 8 reps" between sets and it is logged correctly, even with bad signal, with the bar weight and per-side maths handled for you.**

### Primary user journey (the demo story)
1. User signs in and sets up their gym once (e.g. "Home gym, 15 kg bar").
2. Starts a workout.
3. After a set, holds the mic button and says "bench press sixty kilo eight reps".
4. App shows: **Bench press · 60 kg (15 kg bar + 22.5 kg each side) · 8 reps** and the user taps confirm (or it auto-confirms after a short delay, setting TBD).
5. Signal drops. User logs more sets by voice or tap; they appear instantly with a "2 sets waiting to sync" badge.
6. Signal returns; sets sync automatically.
7. After the workout, the user sees history, a progress chart per exercise, and a "new personal record" highlight.
8. Next session, the app suggests "Today: bench 62.5 kg × 8" with a short reason.

---

## 3. Scope (MoSCoW)

### Must have
- Email sign-in (Supabase Auth) and per-user data isolation (Row Level Security).
- Gym profiles with bar settings; per-exercise equipment type and bar.
- Exercise library (seeded) with aliases, plus user-created custom exercises.
- Workout session: start, log sets, finish.
- **Tap logging** (always available, works offline).
- **Voice logging** using the browser Web Speech API, with our own deterministic parser and validators.
- Weight convention handling: total vs per side, bar weights, plausibility checks, confirmation with breakdown.
- History list, per-exercise progress chart, personal records.
- Deployed on Vercel, installable as a PWA.
- Unit tests for all domain logic; a few Playwright smoke tests for the core journey.
- Documentation and AI log as described in this brief.

### Should have
- Offline-tolerant set logging: local-first save with a sync queue (see Section 7).
- Gemini fallback (via serverless function) for phrases the parser cannot understand confidently.
- "What should I lift today?" suggestion based on simple progressive-overload rules.
- Rest timer started by voice ("rest 90 seconds") or tap.

### Could have (only if ahead of schedule)
- Weekly AI summary of training (Gemini, cached once per week).
- kg/lb display toggle (storage is always kg).
- Plate loading helper ("load: 20 + 2.5 each side").

### Won't have (this hackathon)
- **Laya intent model** (deferred; may be added after 19 Oct if everything else is done; see ADR-004).
- Offline voice recognition (e.g. in-browser Whisper).
- Social features, sharing, coaching programmes.
- Native mobile apps.
- Photo/OCR import of paper logs.
- Any medical, injury, or nutrition advice.

---

## 4. Constraints

- **Budget: ₹0 for services.** Only free tiers. The one exception is Claude (my Team subscription), used for development only.
  - Vercel: free (Hobby) tier for hosting and serverless functions.
  - Supabase: free tier for Auth and Postgres. Note: free projects can pause after inactivity.
  - Google Gemini API: **free tier only. Never link a billing account.** Low per-minute limits; treat it as a scarce fallback.
- **Claude is not used inside the app** (that would need paid API billing). In-app AI = Gemini free tier only.
- **Browser support:** Chrome (Android, desktop) and Safari (iOS) are primary. Firefox lacks the Web Speech API, so voice is hidden there and tap logging is used.
- **Timeline:** see Section 19.

---

## 5. Tech stack

| Area | Choice | Notes |
|---|---|---|
| Language | TypeScript (strict) | No `any` without a comment justifying it |
| Frontend | React + Vite | SPA, mobile-first |
| Styling | Tailwind CSS | Tokens will come from the Claude Design design system later |
| Routing | React Router | |
| PWA | `vite-plugin-pwa` (Workbox) | App shell cached for offline use |
| Local data | IndexedDB via Dexie.js | Local-first set storage + sync queue |
| Validation | Zod | Shared schemas for parser output, API payloads, DB rows |
| Backend data/auth | Supabase (Postgres, Auth, RLS) | `@supabase/supabase-js` |
| Serverless | Vercel functions in `/api` | Holds the Gemini key; verifies the user's Supabase JWT |
| In-app LLM | Gemini API (free tier) | Official Google GenAI JS SDK; model name from env var, never hardcoded |
| Voice | Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) | Language `en-IN` by default |
| Charts | Recharts | |
| Unit tests | Vitest + Testing Library | |
| E2E smoke | Playwright | A handful of critical flows only |
| Lint/format | ESLint + Prettier | Run in CI and pre-commit |
| Secret scanning | Gitleaks | Pre-commit hook + CI |
| CI | GitHub Actions | Lint, type-check, unit tests, gitleaks on every push |

**Before installing anything**, check the current stable versions and official setup docs; do not rely on memory for version numbers or config syntax. List the dependencies you plan to install and wait for my approval.

---

## 6. Architecture

### Components
```
Phone: installable web app (PWA)
├── UI screens ............ logging, history, charts, PRs, settings
├── Voice input ........... browser Web Speech API (online only)
├── Parser + validators ... pure TypeScript domain logic (works offline)
└── Local store ........... IndexedDB (Dexie) + sync queue

Vercel
├── Static hosting ........ the PWA
└── /api/parse ............ serverless function, holds GEMINI_API_KEY

Supabase (free)
├── Auth .................. email sign-in
└── Postgres + RLS ........ each user can only access their own rows

Google Gemini API (free tier) ... called ONLY by /api/parse, ONLY as a fallback

Laya (later, optional) .......... intent model, not part of the MVP
```

### Data flow: logging a set by voice
1. User holds the mic button; Web Speech API returns a transcript (plus alternatives if available).
2. **Parser** (local, deterministic) extracts intent, exercise, weight, unit, reps, and weight mode, and returns a confidence score.
3. **Validators** apply bar logic and plausibility checks (Section 8).
4. If confidence is high and validators pass: show the confirmation card.
5. If confidence is low **and** the device is online: call `/api/parse` (Gemini). The response must match a Zod schema and is run through the **same validators**. Gemini never writes data directly.
6. If still unclear: show an ambiguity prompt with big tap buttons (e.g. "45 kg total" / "45 kg per side = 105 kg").
7. On confirm: save to IndexedDB immediately (UI updates instantly), enqueue for sync.
8. Sync worker pushes to Supabase when online.

### Principle: "AI listens, code verifies"
Speech recognition and Gemini are treated as **untrusted inputs**. All numbers that reach storage must pass deterministic validation and be visible to the user before saving.

### Folder structure (target)
```
/
├── CLAUDE.md
├── README.md
├── .env.example
├── .gitignore
├── .claude/
│   ├── settings.json
│   ├── agents/
│   │   ├── code-reviewer.md
│   │   ├── security-auditor.md
│   │   ├── qa-tester.md
│   │   ├── parser-specialist.md
│   │   └── doc-writer.md
│   └── skills/
│       ├── parser-test-cases/SKILL.md
│       └── new-feature/SKILL.md
├── api/
│   └── parse.ts                 # Vercel serverless function (Gemini fallback)
├── src/
│   ├── app/                     # routing, providers, layout
│   ├── features/
│   │   ├── auth/
│   │   ├── gyms/                # gym profiles, bars
│   │   ├── exercises/
│   │   ├── workout/             # active session, logging UI
│   │   ├── voice/               # Web Speech wrapper, mic button
│   │   ├── history/
│   │   └── progress/            # charts, PRs, suggestions
│   ├── domain/                  # PURE logic, no React, no I/O
│   │   ├── parser/
│   │   ├── weight/              # bar + per-side maths, units
│   │   ├── validation/          # plausibility rules
│   │   ├── progression/         # "what to lift today"
│   │   └── exercises.seed.json
│   ├── data/
│   │   ├── local/               # Dexie DB, repositories
│   │   ├── remote/              # Supabase client, repositories
│   │   └── sync/                # queue + sync worker
│   ├── components/              # shared UI components
│   └── lib/                     # small utilities
├── supabase/
│   ├── migrations/              # SQL schema + RLS policies
│   └── seed.sql
├── tests/
│   ├── e2e/                     # Playwright
│   └── fixtures/                # voice phrase test tables etc.
└── docs/                        # see Section 14
```

**Rule:** `src/domain/` must stay pure (no React, no network, no storage). This keeps it fully unit-testable and is where most AI-generated tests will focus.

---

## 7. Offline-tolerant design ("the middle option")

Decided approach (see ADR-001): **online by default, but set logging works offline.**

- Every set gets a **client-generated UUID** (`crypto.randomUUID()`) at creation.
- Sets are saved to IndexedDB first, with `sync_status: 'pending' | 'synced' | 'failed'`.
- The sync worker runs on app start, on the `online` event, after each new set, and on a short interval while pending items exist.
- Upload uses an **idempotent upsert** keyed on the set `id` (duplicates from retries are ignored).
- **Offline, only creating sets is allowed.** Editing or deleting existing sets requires a connection. This avoids conflict resolution entirely.
- Deletes are soft deletes (`deleted_at`) performed online.
- Workouts started offline also get client UUIDs and sync the same way (workout row before its sets).
- UI shows a small sync badge: "3 sets waiting to sync" / "All synced" / "Sync failed, tap to retry".
- Voice and Gemini features show "Needs internet" when offline; tap logging remains fully usable.
- Request persistent storage (`navigator.storage.persist()`) where supported, and sync as soon as possible because browsers (especially iOS Safari) may evict local data.

---

## 8. Domain rules

### 8.1 Weight convention (see ADR-002)
- **The logged weight is always the TOTAL weight lifted, including the bar.** This matches the convention used by established lifting apps.
- All weights are **stored in kg** (numeric, up to 2 decimals). Display can convert to lb later (1 lb = 0.45359237 kg).
- Per-side input is converted on entry: `total = bar_kg + 2 × per_side_kg`.
- Store alongside the total: `bar_kg` (nullable), `per_side_kg` (nullable), and `input_mode` so the breakdown can be shown later.
- Charts, PRs, and suggestions use `total_kg` only.

### 8.2 Equipment types
| Type | What the number means |
|---|---|
| `barbell` / `ez_bar` / `smith` | Total including bar; bar weight comes from the gym profile or exercise override |
| `dumbbell` | Weight **per dumbbell** (label the field clearly) |
| `machine` / `cable` | Stack or pin weight as shown on the machine |
| `bodyweight` | **Added** weight only (0 if none) |

### 8.3 Gym profiles and bars
- A user can have multiple gyms (e.g. "Home", "Office gym").
- Each gym has a default barbell weight (common: 20 kg, 15 kg) and optional extra bars (EZ bar, Smith machine, custom values). Any custom bar weight must be allowed.
- A workout is linked to one gym; the bar used for each barbell exercise defaults from the gym and can be overridden per exercise.

### 8.4 Plausibility checks (validators)
Run on every candidate set before the confirmation card:
- `total_kg < bar_kg` for a bar exercise: impossible as a total. Ask "total or per side?".
- Large jump vs. last session of the same exercise (e.g. more than ±40% or a plausible per-side reading exists): ask with both options.
- Known speech confusables: 13/30, 14/40, 15/50, 16/60, 17/70, 18/80, 19/90. If the alternative matches recent history much better, ask "Did you mean 60?".
- Ranges: reps 1 to 100; weight 0 to 500 kg; per-side 0 to 250 kg. Outside range: reject with a clear message.
- Weight should usually be achievable with standard plates (multiples of 1.25 kg per side). If not, warn softly, do not block.
All thresholds live in one config file so they can be tuned and tested.

### 8.5 Progression rule ("what should I lift today?")
Simple, conservative, explainable rules (see ADR-005 to be written):
- If the user hit all target reps for all working sets last time: suggest **+2.5 kg** (upper body) or **+5 kg** (lower body), rounded to achievable plate increments.
- If they missed reps: suggest the same weight.
- If they missed reps in two consecutive sessions: suggest about 10% less.
- Always show the reason ("You hit 3 × 8 at 60 kg last time").
- Always labelled as a **suggestion**, never as coaching or medical advice. User decides.

---

## 9. Voice parser specification

### 9.1 Intents (small, fixed set)
| Intent | Example phrases |
|---|---|
| `log_set` | "bench press 60 kilo 8 reps", "squat 100 for 5", "deadlift 120 kg 3" |
| `repeat_last` | "same again", "same weight 8 reps", "one more set" |
| `undo_last` | "undo", "delete that", "galat hai" |
| `edit_last` | "change that to 10 reps", "make it 62.5" |
| `rest_timer` | "rest 90 seconds", "rest two minutes" |
| `unknown` | anything else |

### 9.2 Things the parser must handle
- Number words and digits: "sixty", "62.5", "sixty two point five", "sixty two and a half".
- Units: kg, kilo, kilos, kgs, lb, lbs, pounds (convert to kg). If no unit, use the user's default unit.
- Rep markers: "reps", "rep", "times", "for 8", "x 8", "into 8", "8 baar".
- Per-side markers: "each side", "per side", "a side", "both sides 20", "har side".
- Common Hinglish: "kilo ke 8", "60 kilo 8 reps", Hindi numbers 1 to 20 (ek, do, teen, chaar, paanch, chhe, saat, aath, nau, das, gyaarah, baarah, terah, chaudah, pandrah, solah, satrah, athaarah, unnees, bees).
- Exercise names via an alias table with fuzzy matching (e.g. "bench", "flat bench", "chest press" map to their canonical exercises). Use a normalised string distance and a minimum score.
- If no exercise is spoken, default to the **current exercise** in the active workout.

### 9.3 Parser output (Zod schema, conceptual)
```ts
type ParseResult = {
  intent: 'log_set' | 'repeat_last' | 'undo_last' | 'edit_last' | 'rest_timer' | 'unknown';
  exerciseId?: string;        // matched canonical exercise
  exerciseMatchScore?: number;
  weight?: { value: number; unit: 'kg' | 'lb'; mode: 'total' | 'per_side' | 'unspecified' };
  reps?: number;
  restSeconds?: number;
  confidence: number;         // 0..1, computed from match scores + completeness
  issues: string[];           // machine-readable reasons, e.g. 'NO_REPS', 'AMBIGUOUS_WEIGHT_MODE'
  rawTranscript: string;
  source: 'parser' | 'gemini';
};
```
- Confidence threshold for skipping the Gemini fallback lives in config (start at 0.8, tune with tests).
- The parser must be a **pure function** with table-driven tests (`tests/fixtures/voice-phrases.json`), aiming for 150+ phrases including Hinglish, noisy, and adversarial cases.

---

## 10. Gemini fallback (`/api/parse`)

- **Only called when** the local parser's confidence is below threshold AND the device is online.
- **Request:** `{ transcript: string, context: { currentExercise?: string, lastSet?: {...}, unit: 'kg'|'lb' } }`. Send **no personal data** (no email, name, or user id).
- **Auth:** the function requires the user's Supabase access token (`Authorization: Bearer ...`) and verifies it, so the endpoint cannot be abused anonymously.
- **Prompt:** stored in `docs/ai/gemini-prompts.md` and mirrored in code. It must ask for **JSON only**, matching the `ParseResult` shape. Include a few examples.
- **Response handling:** strip code fences, parse JSON, validate with Zod. Invalid output = treat as `unknown`.
- **Limits:** timeout ~8 s; on HTTP 429 or any error return `{ status: 'unavailable' }` and the UI falls back to manual confirmation. Never block logging.
- **Simple per-user rate limit** in the function (e.g. a few calls per minute) to protect the free quota.
- **Env vars:** `GEMINI_API_KEY`, `GEMINI_MODEL` (server-only, never prefixed with `VITE_`).
- Note in docs: free-tier prompts may be used by Google to improve its products, which is another reason to send only the transcript.

---

## 11. Data model (Supabase / Postgres)

All tables have `user_id uuid references auth.users not null` (except the shared exercise catalogue) and **RLS enabled**. Timestamps are `timestamptz`.

| Table | Key columns |
|---|---|
| `profiles` | `id` (= auth user id), `display_name`, `default_unit` ('kg'/'lb'), `created_at` |
| `gyms` | `id`, `user_id`, `name`, `default_bar_kg`, `is_default`, `created_at` |
| `gym_bars` | `id`, `user_id`, `gym_id`, `name` (e.g. "EZ bar"), `weight_kg` |
| `exercises` | `id`, `user_id` (NULL = global seeded exercise), `name`, `equipment_type`, `body_part` ('upper'/'lower'/'core'), `aliases text[]` |
| `workouts` | `id` (client UUID), `user_id`, `gym_id`, `started_at`, `ended_at`, `notes`, `deleted_at` |
| `sets` | `id` (client UUID), `user_id`, `workout_id`, `exercise_id`, `total_kg`, `bar_kg`, `per_side_kg`, `input_mode` ('total'/'per_side'/'tap'), `reps`, `source` ('voice'/'tap'/'gemini'), `raw_transcript`, `logged_at` (device time), `created_at` (server time, default now()), `deleted_at` |

### RLS policies
- `exercises`: everyone signed in can `select` rows where `user_id is null` (global) or `user_id = auth.uid()`; insert/update/delete only own rows.
- All other tables: `select`, `insert`, `update`, `delete` only where `user_id = auth.uid()`; `insert` must also check `user_id = auth.uid()` (WITH CHECK).
- Write an automated test (SQL or integration) proving user A cannot read or write user B's rows. This is a key security demo point.

### Constraints
- `reps between 1 and 100`, `total_kg between 0 and 500`, sensible length limits on text columns.
- `sets.id` and `workouts.id` are primary keys used for idempotent upserts.
- Indexes on `(user_id, exercise_id, logged_at)` for history and charts.

Schema changes go in `supabase/migrations/` as numbered SQL files, never edited by hand in the dashboard only.

---

## 12. UI and design

- **Designs come from Claude Design** via handoff bundles, one screen or feature at a time. Chosen style: **clean and minimal (Apple-like)**.
- **Design timing (so no screen is built twice):**
  - **By 10 Oct:** I create the Next Rep design system (colours, typography, spacing, core components) and logo in Claude Design. From Phase 1 onward, all UI uses these design tokens, even before full screen designs exist.
  - **11 to 15 Oct:** I design the key screens, in priority order: active workout (idle, listening, parsing, offline), set confirmation with weight breakdown, "total or per side?" prompt, home with suggestion, history and progress chart, sign in and gym setup.
  - **16 to 20 Oct:** each screen's handoff is applied **at the moment its feature is built**, not afterwards.
  - **23 to 24 Oct:** polish and consistency only, never a redesign.
- If a feature is built before its design arrives, build it functional and plain with the design tokens and the component names below, so the later handoff maps cleanly.
- After the first components exist, we run `/design-sync` to keep Claude Design and the codebase in sync.
- **Mobile-first gym UX:** large tap targets (at least 48px), readable at arm's length, one-handed use, high contrast, dark mode by default, minimal typing.

### Screens
| Screen | Purpose | States to handle |
|---|---|---|
| Sign in | Email sign-in | loading, error, check-your-email |
| Gym setup | Create gym, set bar weights | empty, editing |
| Home | Start workout, last workout summary, suggestion | empty (first use), offline |
| Active workout | Current exercise, mic button, tap entry, logged sets, rest timer | listening, parsing, confirm, ambiguity prompt, offline, sync pending |
| Exercise picker | Search + recent exercises, add custom | empty search, no results |
| History | Past workouts | empty, loading, offline (cached) |
| Exercise progress | Chart of total_kg over time, PRs | single data point, no data |
| Settings | Units, default gym, sign out | |

### Shared component names (keep these names in code and in Claude Design)
`VoiceButton`, `TranscriptBubble`, `SetConfirmCard`, `WeightBreakdown`, `AmbiguityPrompt`, `SetRow`, `SyncBadge`, `RestTimer`, `ExercisePicker`, `ProgressChart`, `PRBadge`, `SuggestionCard`, `OfflineBanner`.

### Accessibility
Semantic HTML, labelled buttons (especially icon-only ones), visible focus states, colour is never the only signal, respects reduced-motion.

---

## 13. Security checklist

- [ ] `.env` and `.env.*` (except `.env.example`) in `.gitignore` **before the first commit**.
- [ ] Gitleaks runs as a pre-commit hook and in CI.
- [ ] `.claude/settings.json` denies reading `.env*` files.
- [ ] Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are exposed to the client (the anon key is designed to be public; RLS is what protects data). The service role key is **never** used in the client and is not needed at all for MVP.
- [ ] RLS enabled on every table, with tests proving isolation.
- [ ] `/api/parse` verifies the Supabase JWT, validates input with Zod, limits transcript length, rate-limits per user, and never logs full transcripts with user identifiers.
- [ ] All user input validated client-side AND enforced by DB constraints.
- [ ] No `dangerouslySetInnerHTML`; React escaping only.
- [ ] Dependencies kept minimal; run `npm audit` before submission and document known issues.
- [ ] Documented AI-related risks: wrong transcription, hallucinated Gemini output, prompt injection via transcript (mitigated by JSON schema + validators + user confirmation), free-tier data usage.

---

## 14. Context files to create (context engineering)

These files are how AI gets reusable context. They are also judged. Keep them short, specific, and up to date.

```
CLAUDE.md                          # Entry point. Short. Rules + links, not duplication.
README.md                          # Product, setup, stack, limitations, demo link
.env.example
.claude/settings.json              # permissions, deny .env reads
.claude/agents/code-reviewer.md    # reviews diffs against standards (read-only)
.claude/agents/security-auditor.md # RLS, secrets, validation, prompt injection (read-only)
.claude/agents/qa-tester.md        # edge cases, negative tests, failure scenarios
.claude/agents/parser-specialist.md # owns the voice parser + phrase fixtures
.claude/agents/doc-writer.md       # keeps docs and ADRs in sync (lighter model)
docs/ai/lifecycle-map.md           # phase -> AI tool -> what it produced (judging evidence)
docs/security/threat-model.md      # AI-assisted threat model of voice -> Gemini -> DB
.claude/skills/parser-test-cases/SKILL.md   # generates/extends voice phrase fixtures
.claude/skills/new-feature/SKILL.md         # plan -> tests -> code -> docs -> ai-log
docs/product/problem-statement.md
docs/product/requirements.md       # MoSCoW scope from Section 3
docs/product/user-journeys.md
docs/architecture/overview.md      # components + data flow from Section 6
docs/architecture/data-model.md    # Section 11
docs/architecture/api-contracts.md # /api/parse request/response, ParseResult schema
docs/architecture/decisions/       # ADRs (see below)
docs/standards/coding-standards.md # Section 15
docs/standards/testing-strategy.md
docs/domain/weight-rules.md        # Section 8
docs/domain/voice-grammar.md       # Section 9
docs/domain/glossary.md
docs/design/design-system.md       # filled once Claude Design work starts
docs/design/screens.md             # Section 12
docs/ai/gemini-prompts.md
docs/ai/guardrails.md              # what AI (Claude Code and Gemini) may and may not do
docs/delivery/deployment.md        # Vercel + Supabase setup steps, env vars
docs/qa/test-plan.md
docs/qa/ai-qa-report.md            # how AI helped QA + how output was validated
docs/learning/ai-log.md            # running log, see format below
docs/learning/lessons.md           # distilled lessons; update CLAUDE.md from these
```

### Initial ADRs (Architecture Decision Records)
Use a short format: Context, Decision, Alternatives considered, Consequences.
- `001-online-first-offline-set-logging.md`
- `002-total-weight-convention.md`
- `003-gemini-as-fallback-only.md`
- `004-laya-deferred.md`
- `005-progression-rules.md`
- `006-free-tier-only-stack.md`

### CLAUDE.md guidance
Keep it under about 100 lines. It should contain: one-paragraph product summary, the commands (dev, test, lint, typecheck, e2e), the non-negotiable rules (Sections 0 and 13), the folder map, and links to the docs above. Do **not** paste whole docs into it.

---

## 15. Coding standards and workflow

- TypeScript strict mode; no implicit `any`; prefer `type` aliases and discriminated unions for domain models.
- Pure functions in `src/domain/`; side effects only in `data/` and `features/`.
- Small files and functions; name things after the domain (set, rep, bar, per side), not after implementation details.
- Handle errors explicitly; user-facing messages are friendly and actionable.
- No dead code, no commented-out code, no TODOs without an issue reference.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`). Small, frequent, meaningful. The Git history is submitted, so it should tell the story of the build.
- **Branching:** work on short-lived feature branches, merge to `main` when tests pass.
- **Definition of done for any task:** code + tests passing + types/lint clean + docs updated if behaviour changed + ai-log entry.

### Testing strategy (summary)
- **Unit (Vitest):** parser (table-driven fixtures), weight maths, validators, progression rules, sync queue logic. Highest priority.
- **Component tests:** `SetConfirmCard`, `AmbiguityPrompt`, `SyncBadge`.
- **Integration:** RLS isolation test; `/api/parse` with mocked Gemini (valid JSON, invalid JSON, 429, timeout).
- **E2E smoke (Playwright):** sign in (test account), start workout, tap-log a set, offline log then sync (using Playwright's offline mode), view history.
- **AI-assisted QA:** use the `qa-tester` agent and `parser-test-cases` skill to generate edge cases and negative tests. Every AI-generated test is reviewed by me before merging; record what AI got wrong in the ai-log.

### ai-log.md entry format
```md
## 2026-10-08: <task name>
- Tool: Claude Code / Claude chat / Claude Design / Gemini
- Asked: <one line>
- AI produced: <one line>
- Problems found: <what was wrong or missing, if anything>
- How validated: <tests, manual check, review>  (human fills this)
- Lesson: <optional; promote to lessons.md if reusable>
```

---

## 16. Tooling setup (plugins, MCP servers, local tools)

Keep this list lean: every plugin and MCP server adds to context. Claude Code cannot run `/plugin` commands for me, so in Phase 0 **give me the exact commands to run** and verify afterwards.

### Claude Code plugins (official marketplace `claude-plugins-official`)
Must have:
- `security-guidance`: security checks while coding and on finished diffs.
- `feature-dev`: structured clarify, explore, architect, implement, review flow.
- `code-review`: second pair of eyes for a solo developer.
- `frontend-design`: UI guidance (treat as guidance, the design system wins).
- `typescript-lsp`: real TypeScript code intelligence.

Nice to have:
- `skill-creator`: to build our custom skills.
- `pr-review-toolkit`: specialised reviewers (tests, errors, types, simplification).
- `claude-md-management` and `claude-code-setup`: keep CLAUDE.md healthy; get automation suggestions once the code exists.

Install pattern: `/plugin install <name>@claude-plugins-official`. Check the live marketplace (`/plugin`) for current names before installing.

### MCP servers / integrations
- **Supabase**: migrations, schema, RLS checks. Scope to the Next Rep project only; prefer read-only mode where available.
- **Vercel**: deployments, builds, logs.
- **GitHub**: issues, PRs, repo search.
- **Playwright MCP**: lets Claude drive a real browser for exploratory and offline testing (AI-assisted QA evidence).
- **Context7** (optional): up-to-date library docs to avoid outdated API usage.
Check each tool's official page for the current install command.

### Hooks (in `.claude/settings.json`)
- After file edits in `src/`: run lint + typecheck on changed files.
- Before ending a turn (or on demand): run the relevant unit tests.
- Deny reading `.env*` files.
Propose the exact hook config in Phase 0 and wait for my approval.

### Local tools (I install; you verify versions in Phase 0)
Node.js LTS, Git, GitHub account, VS Code (or editor) with the Claude Code extension, Supabase CLI, Vercel CLI, Gitleaks, Playwright browsers (`npx playwright install`), OBS Studio (demo video).

### Accounts (all free)
Supabase, Vercel, GitHub, Google AI Studio (Gemini key, **no billing**).

### Mobile testing gotcha
Microphone and speech recognition only work on **HTTPS or localhost**. Opening the dev server on a phone via `http://192.168.x.x` will not work for voice. Test on phones using Vercel preview deployments (HTTPS) or a free tunnel such as Cloudflare Tunnel.

### Claude Design workflow
- Screens are designed in Claude Design and handed off with **Export > Hand off to Claude Code**, one screen or feature at a time.
- Keep component names identical to Section 12.
- Once real components exist, run `/design-sync` to keep the codebase and Claude Design aligned (run `/update` first if the command is missing).
- Record each design iteration in the AI log.

---

## 17. Subagents

Subagents run in their own context and can be restricted to specific tools. Create them in `.claude/agents/` (project scope, committed to the repo). Write precise `description` fields so delegation is reliable.

| Agent | Job | Tools | Model |
|---|---|---|---|
| `code-reviewer` | Reviews diffs against coding standards and Section 13 | Read, Grep, Glob (read-only) | inherit |
| `security-auditor` | RLS, secrets, input validation, `/api/parse` auth, prompt injection | Read, Grep, Glob (read-only) | inherit |
| `qa-tester` | Edge cases, negative tests, failure scenarios; writes tests in `tests/` or next to domain code; never changes production code | Read, Write, Edit, Bash, Grep, Glob | inherit |
| `parser-specialist` | Owns `src/domain/parser` and `tests/fixtures/voice-phrases.json` | Read, Write, Edit, Bash, Grep, Glob | inherit |
| `doc-writer` | Updates docs, ADRs, README after features | Read, Write, Edit, Grep, Glob | haiku (saves usage) |

Rules for all agents:
- Read the relevant `docs/` files before acting.
- Reviewers **report**, they do not fix. I decide which findings are valid.
- End with a short structured report (findings, files touched, tests added, open questions).

### Example: `.claude/agents/qa-tester.md`
```md
---
name: qa-tester
description: Use after any feature in src/domain or src/data/sync is built. Generates edge cases, negative tests and failure scenarios, then writes them as Vitest tests.
tools: Read, Write, Edit, Bash, Grep, Glob
---
You are a sceptical QA engineer for Next Rep, a voice-first gym logger.
Before writing tests, read docs/domain/weight-rules.md and docs/domain/voice-grammar.md.
For the code under test:
1. List edge cases, negative cases and failure scenarios (offline, rate limits, bad input, Hinglish, misheard numbers).
2. Write table-driven Vitest tests for the most valuable ones.
3. Run them and report: tests added, tests failing, suspected bugs.
Never change production code. Report bugs instead of fixing them.
```

### Standard feature flow
1. Main session builds the feature using the `new-feature` skill (plan, tests, code).
2. `code-reviewer` and `security-auditor` review the change.
3. `qa-tester` adds edge-case tests and reports suspected bugs.
4. **I** validate findings, then fixes are made.
5. `doc-writer` updates docs.
6. AI log entry, e.g. "qa-tester proposed 24 tests; kept 19, rejected 5 as duplicates".

---

## 18. Judging evidence checklist (how AI is used, and how we prove it)

Judges can only score what they can see. Every item needs **evidence in the repo**.

### AI development practices (35%)
| Criterion | How we use AI | Evidence |
|---|---|---|
| AI across the lifecycle | Chat (requirements), Claude Design (UI, logo), Claude Code (build), agents + Playwright MCP (test), review plugins, AI-drafted docs, Vercel integration (deploy) | `docs/ai/lifecycle-map.md` |
| Context engineering | CLAUDE.md, domain docs, ADRs, design system; one with/without-context comparison experiment | Context files + their Git history |
| AI-assisted development and QA | Features built with tests; AI-generated phrase fixtures and edge cases | `docs/qa/ai-qa-report.md` with numbers (generated / kept / rejected) |
| Agents / skills / instructions | Custom skills, five subagents, hooks, guardrails | `.claude/` folder + examples in the log |
| Human validation | I review every diff, test on real phones, check tests fail before fixes | "How validated" field in every AI log entry |
| Learning from AI failures | Each AI mistake becomes a rule in CLAUDE.md or a skill | `docs/learning/lessons.md`: failure > rule added > commit |

### Engineering and code quality (30%)
| Criterion | How we use AI | Evidence |
|---|---|---|
| Architecture | AI proposes alternatives and critiques the chosen design | ADRs with "alternatives considered" |
| Maintainability | Pure domain layer; review/simplification agents after each feature | Small modules, clean commits |
| Testing | I specify, AI implements; AI finds untested branches | Coverage report, table-driven tests |
| Security | security-guidance, security-auditor, AI threat model, RLS isolation tests, prompt-injection tests | `docs/security/threat-model.md` + passing tests |
| Reliability | AI lists failure scenarios; each becomes a test | Playwright offline tests, failure table |
| Deployment | AI writes CI and deployment guide | Green CI, live link, preview deploys |
| Documentation | AI drafts from code and ADRs; I edit; `new-feature` skill includes a docs step | Up-to-date docs |
| Technical trade-offs | AI plays devil's advocate per decision | ADRs + README trade-offs section |

### Product quality (25%)
| Criterion | How we use AI | Evidence |
|---|---|---|
| Core functionality | AI turns the primary journey into acceptance criteria; Playwright verifies | Flawless primary journey in the demo |
| UX | Claude Design screens; AI heuristic + accessibility review of screenshots | Before/after screenshots |
| Completeness of scope | Weekly AI check of `requirements.md` vs built | All must-haves done; cuts documented |
| Polish | AI hunts empty/loading/error states and writes microcopy | Consistent, friendly UI |
| Usefulness | In-app AI (voice, fallback, suggestions); 2 to 3 colleagues test it; AI summarises feedback | "User feedback > changes" section |

**Daily habit:** five minutes on `docs/learning/ai-log.md`. Most entrants will use AI; few will show it.

---

## 19. Timeline

| Dates | Phase | Goals |
|---|---|---|
| 7 to 8 Oct | Phase 0: Foundation | Repo, context files, scaffold, CI, Supabase schema, deploy "hello world"; distribute and retire KICKOFF.md. *Me, in parallel: start design system + logo in Claude Design* |
| 9 to 10 Oct | Phase 1: Core logging | Auth, RLS, gyms/bars, exercise library, tap logging, weight breakdown, using design tokens. *Me: finish design system + logo* |
| 11 to 15 Oct | Phase 2: Insight | History, progress charts, PRs; full unit tests for weight maths. *Me: design key screens in Claude Design* |
| 16 to 20 Oct | Phase 3: Big build | Day 1 to 2 voice + parser + validators; Day 3 offline queue + sync; Day 4 Gemini fallback; Day 5 progression rules + AI-assisted test pass. Apply each screen handoff when its feature is built |
| 21 to 22 Oct | Phase 4: Optional | Laya spike ONLY if everything above works (timeboxed); otherwise bug fixing |
| 23 to 24 Oct | Phase 5: Harden | UX polish and consistency (no redesigns), security review, edge cases, colleague testing |
| **25 Oct** | **Feature freeze** | No new features after this |
| 26 to 29 Oct | Phase 6: Ship | Docs, AI write-up, QA report, demo video + backup take |
| 30 Oct | Submit | Final checks; submit by afternoon |

Milestones are guidance. If we fall behind, cut from "Could" first, then "Should", never compromise tests or security.

---

## 20. Phase 0 tasks (THIS SESSION)

Do these in order. Show me a plan first, then proceed step by step, pausing where marked.

1. **Confirm understanding.** Summarise the product, scope, and constraints in 5 to 8 bullets and list any questions or concerns about this brief. **Pause for my answers.**
2. **Tooling check:** verify local tools from Section 16 (print versions), then give me the exact `/plugin install` and MCP commands to run. **Pause until I confirm they are installed.**
3. **Git hygiene first:** initialise the repo, create `.gitignore` (Node, Vite, env files, OS files, Playwright artifacts), `.env.example` with placeholder names only. Make the first commit, **including KICKOFF.md**, so its later retirement is visible in Git history.
4. **Propose dependencies** (with current stable versions checked from official sources) for the stack in Section 5. **Pause for approval.**
5. Scaffold the Vite + React + TypeScript app, Tailwind, ESLint, Prettier, Vitest, Playwright, PWA plugin. Add npm scripts: `dev`, `build`, `preview`, `test`, `test:e2e`, `lint`, `typecheck`.
6. Set up gitleaks pre-commit hook, a GitHub Actions workflow (lint, typecheck, unit tests, gitleaks), and propose the hooks from Section 16 for `.claude/settings.json`.
7. Create the folder structure from Section 6 with placeholder `index.ts` files where useful.
8. Create all context files from Section 14, filled with real content from this brief (not empty stubs), including the five subagents from Section 17 and the two custom skills. Use the distribution map in Section 22 so every section of this file lands in its permanent home.
9. Write `supabase/migrations/0001_init.sql` with tables, constraints, indexes, and RLS policies from Section 11, plus `supabase/seed.sql` with about 40 to 60 common exercises (our own list, with aliases including common Hinglish/short forms). **Pause for review before I apply it.**
10. Create the domain module skeletons with types and Zod schemas (`ParseResult`, set, workout) and one example passing test.
11. Write `docs/delivery/deployment.md` with the exact manual steps **I** must do (create Supabase project, run migration, create Vercel project, set env vars, create Gemini API key without billing).
12. First `ai-log.md` entry for this session.
13. **Coverage check (Section 22):** produce the coverage table proving every section and every rule of this file exists in a permanent file. **Pause for my approval.**
14. **Retire this file:** `git rm KICKOFF.md`, commit as `chore: retire KICKOFF.md after distributing content to docs/`, and confirm that no file references KICKOFF.md.
15. Final summary: what was created, what I must do manually, and the suggested first task for Phase 1. Commit.

---

## 21. Open questions (answer or flag as we go)

- Auto-confirm voice sets after a short delay, or always require a tap? (Default: require a tap for MVP.)
- Default unit: kg (assumed).
- Which exact Gemini model to use on the free tier (set via `GEMINI_MODEL`; choose a fast, cheap model available on the free tier at build time).
- Whether to include `raw_transcript` in synced data or keep it local only (default: keep it, user's own data, useful for debugging and QA; revisit for privacy).

---

## 22. Content distribution map and retirement of this file

Every section below must end up in its permanent home. New files not yet listed in Section 14 are marked (new).

| KICKOFF section | Permanent home |
|---|---|
| 0. How to work with me | `CLAUDE.md` (short rules) + `docs/standards/working-agreement.md` (new, full version) |
| 1. Hackathon context, judging, rules, submission | `docs/hackathon/rules-and-judging.md` (new) |
| 2. Product, problem, primary journey | `docs/product/problem-statement.md`, `docs/product/user-journeys.md`, `README.md` (summary) |
| 3. Scope (MoSCoW) | `docs/product/requirements.md` |
| 4. Constraints | `docs/product/requirements.md` (Constraints section) + `ADR-006` |
| 5. Tech stack | `docs/architecture/tech-stack.md` (new) + `README.md` (summary) |
| 6. Architecture, data flow, folder structure | `docs/architecture/overview.md` |
| 7. Offline-tolerant design | `docs/architecture/offline-sync.md` (new) + `ADR-001` |
| 8. Domain rules (weights, equipment, bars, plausibility, progression) | `docs/domain/weight-rules.md` + `ADR-002`, `ADR-005` |
| 9. Voice parser spec | `docs/domain/voice-grammar.md` |
| 10. Gemini fallback | `docs/architecture/api-contracts.md`, `docs/ai/gemini-prompts.md`, `ADR-003` |
| 11. Data model + RLS | `docs/architecture/data-model.md` + `supabase/migrations/` |
| 12. UI, design timing, screens, components | `docs/design/screens.md`, `docs/design/design-system.md`, `docs/design/design-workflow.md` (new) |
| 13. Security checklist | `docs/security/security-checklist.md` (new) + `docs/security/threat-model.md` |
| 14. Context files | The files themselves + `docs/ai/context-map.md` (new: what each context file is for) |
| 15. Coding standards, testing, AI log format | `docs/standards/coding-standards.md`, `docs/standards/testing-strategy.md`, template at the top of `docs/learning/ai-log.md` |
| 16. Tooling, plugins, MCP, hooks, mobile HTTPS gotcha | `docs/delivery/tooling-setup.md` (new) + `.claude/settings.json` |
| 17. Subagents and feature flow | `.claude/agents/*.md` + `docs/ai/agents.md` (new) |
| 18. Judging evidence checklist | `docs/hackathon/evidence-checklist.md` (new) |
| 19. Timeline | `docs/plans/roadmap.md` (new) |
| 20. Phase 0 tasks | `docs/plans/phase-0.md` (new: approved plan + what was actually done) |
| 21. Open questions | `docs/product/open-questions.md` (new) |
| Laya deferral | `ADR-004` + `docs/plans/roadmap.md` |
| Prompt structure used for Claude Code | `docs/ai/prompt-template.md` (new) |

### Coverage check (before deletion)
1. Produce a table with one row per KICKOFF section **and** per individual rule or decision inside it (e.g. "total weight includes bar", "only create sets offline", "never link Gemini billing"), with the exact file path and heading where it now lives.
2. Flag anything that has no home, was shortened in a way that loses meaning, or conflicts between two files.
3. Make sure `CLAUDE.md` links to every permanent doc it needs and contains **no reference to KICKOFF.md**.
4. Show me the table. **Do not delete anything until I approve.**

### Deletion
- Delete only after my approval, using `git rm KICKOFF.md` in its own commit: `chore: retire KICKOFF.md after distributing content to docs/`.
- After deletion, search the repo for "KICKOFF" and remove or update any remaining references.
- Add an entry to `docs/learning/ai-log.md` noting the distribution, the coverage check result, and anything I corrected.

---

*End of brief. Start with Phase 0, step 1.*
