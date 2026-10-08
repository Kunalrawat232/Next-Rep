# Lessons

Distilled from the [AI log](ai-log.md). Format: failure → rule added → commit. Reusable lessons are promoted into `CLAUDE.md` or a skill.

| Date       | Failure                                                                                                                                  | Rule added                                                                                                | Commit    |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------- |
| 2026-10-08 | The newest TypeScript (7.0.2) conflicts with `typescript-eslint`'s peer range (`<6.1.0`); relying on "latest" would have broken installs | Check peer dependencies from the registry before proposing versions; pin exactly (`save-exact`)           | `af4863b` |
| 2026-10-08 | `npm audit` flagged 11 issues from dev-only `@vercel/node`; the suggested automatic fix was a nonsensical downgrade                      | Inspect where audit findings come from; prefer removing an unneeded dependency over accepting a bogus fix | `af4863b` |
| 2026-10-08 | Plugin install commands pasted into chat do nothing: slash commands only run when the developer types them                               | Give the developer exact commands and wait for confirmation instead of assuming they ran                  | (process) |
