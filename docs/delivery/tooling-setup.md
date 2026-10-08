# Tooling setup

Keep this list lean: every plugin and MCP server adds to context.

## Local tools

| Tool                                                       | Status / version (2026-10-08)                                                                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Node.js LTS + npm                                          | v22.23.2 / npm 10.9.8 (project requires 22.12+)                                                                                 |
| Git                                                        | 2.34.1                                                                                                                          |
| Supabase CLI                                               | 2.120.0, installed from the official release tarball (checksum verified) into `~/.local/bin`; npm global install is unsupported |
| Vercel CLI                                                 | 63.0.0 via `npm i -g vercel`                                                                                                    |
| Gitleaks                                                   | 8.30.1, official release tarball (checksum verified) into `~/.local/bin`                                                        |
| Playwright browsers                                        | `npx playwright install chromium`                                                                                               |
| GitHub CLI (`gh`)                                          | 2.4.0 is very old; upgrade from the official GitHub CLI apt repo if PR features are needed                                      |
| `typescript-language-server`                               | `npm i -g typescript typescript-language-server` (for the `typescript-lsp` plugin)                                              |
| VS Code (or another editor) with the Claude Code extension | VS Code 1.138 installed                                                                                                         |
| OBS Studio                                                 | For the demo video                                                                                                              |

Downloads are verified against the published SHA-256 checksums before installing.

## Claude Code plugins (`claude-plugins-official`)

Installed: `security-guidance`, `feature-dev`, `code-review`, `frontend-design`, `typescript-lsp`, `skill-creator`, `pr-review-toolkit`, `claude-md-management`, `claude-code-setup`, `playwright`, `supabase`, `vercel`, `github`, `context7`.

Install pattern: `/plugin install <name>@claude-plugins-official`. Plugin commands can only be run by the developer, not by Claude Code.

## MCP servers / integrations

- **Supabase**: migrations, schema, RLS checks. Scope to the Next Rep project only; prefer read-only mode.
- **Vercel**: deployments, builds, logs (plugin; needs authentication).
- **GitHub**: issues, PRs, repo search (plugin; needs a valid token or auth).
- **Playwright MCP**: drive a real browser for exploratory and offline testing (AI-assisted QA evidence).
- **Context7**: up-to-date library docs to avoid outdated API usage (plugin; needs authentication).

## Hooks (`.claude/settings.json`)

- After `Edit`/`Write` on TypeScript under `src/`, `api/` or `tests/`: run eslint on the file and the project typecheck (`.claude/hooks/check-changed.sh`). Failures are fed back to Claude.
- When a turn ends: run the unit tests and show failures (`.claude/hooks/run-tests.sh`), without blocking.
- Deny reading local `.env*` files.
- Git pre-commit: gitleaks (`.githooks/pre-commit`, activated by `npm install` through the `prepare` script).

## Accounts (all free)

Supabase, Vercel, GitHub (repository `Kunalrawat232/Next-Rep`), Google AI Studio (Gemini key, **no billing**).

## Mobile testing gotcha

Microphone and speech recognition only work on **HTTPS or localhost**. Opening the dev server on a phone via `http://192.168.x.x` will not work for voice. Test on phones using Vercel preview deployments (HTTPS) or a free tunnel such as Cloudflare Tunnel.

## Claude Design workflow

See [design workflow](../design/design-workflow.md).
