# Coding standards

- TypeScript strict mode; no implicit `any`. `any` is lint-banned; if truly unavoidable, add a comment justifying it. Prefer `type` aliases and discriminated unions for domain models.
- Pure functions in `src/domain/`; side effects only in `src/data/` and `src/features/`. `src/domain/` has no React, no network, no storage.
- Small files and functions. Name things after the domain (set, rep, bar, per side), not after implementation details.
- Handle errors explicitly. User-facing messages are friendly and actionable.
- No dead code, no commented-out code, no TODOs without an issue reference.
- No `dangerouslySetInnerHTML`; React escaping only.
- Validate all input with Zod at boundaries (parser output, API payloads, DB rows). Client validation is mirrored by DB constraints.
- Dependencies are pinned to exact versions (`.npmrc` has `save-exact=true`) and the lockfile is committed. Adding one needs approval: check current stable versions and peer ranges from the registry or official docs (never from memory), list the planned dependencies, and wait for the developer's go.
- Weights are stored in kg only; convert units at the edge.
- Formatting by Prettier (`npm run format`), linting by ESLint (`npm run lint`). Both run in CI.

## Commits

Conventional Commits: `feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`. Small, frequent, meaningful.

## Accessibility

Semantic HTML, labelled buttons (especially icon-only ones), visible focus states, colour is never the only signal, respects reduced motion. Tap targets at least 48px.
