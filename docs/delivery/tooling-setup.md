# Tooling setup

Keep this list lean: every plugin and MCP server adds to context.

## Local tools

| Tool                                                       | Status / version                                                                                                                |
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
| OBS Studio                                                 | Records the main demo video on the real app (decided 2026-10-28); the short promo clip is made with `brag`                      |

Downloads are verified against the published SHA-256 checksums before installing.

## Claude Code plugins (`claude-plugins-official`)

This is the one plugin list for the project ([agents](../ai/agents.md) links here). Enabled in the project's `.claude/settings.json` (14 in the current file): `security-guidance`, `feature-dev`, `code-review`, `frontend-design`, `typescript-lsp`, `skill-creator`, `pr-review-toolkit`, `claude-md-management`, `claude-code-setup`, `vercel`, `github`, `context7`, `brag` and `ponytail`. `brag` and `ponytail` are enabled in the working tree and not yet committed. `playwright` and `supabase` were also installed during the setup but are not in the project settings, so they depend on the developer's own Claude Code install.

Owner of every plugin and of the AI config: Kunal Rawat. All come from the official marketplace and are not version-pinned (the marketplace has no pin), so check a plugin's change notes before updating it.

| Plugin                                                       | Purpose                                                                                                   |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `security-guidance`                                          | Security hints while editing                                                                              |
| `feature-dev`, `code-review`, `pr-review-toolkit`            | Feature flow and review agents (see [agents](../ai/agents.md))                                            |
| `frontend-design`                                            | UI design guidance                                                                                        |
| `typescript-lsp`                                             | Type information for the editor tools                                                                     |
| `skill-creator`, `claude-md-management`, `claude-code-setup` | Maintain skills, `CLAUDE.md` and the Claude Code setup                                                    |
| `vercel`, `github`, `context7`                               | Deploys and logs, repo and PR access, current library docs                                                |
| `brag`                                                       | Enabled in the working tree only. Its output folder `brag-output/` is git-ignored (`.gitignore`)          |
| `ponytail`                                                   | Over-engineering review skill (see the [AI log](../learning/ai-log.md)). Enabled in the working tree only |

Review this list when a new phase starts and drop any plugin that was not used since the last review.

Install pattern: `/plugin install <name>@claude-plugins-official`. Plugin commands can only be run by the developer, not by Claude Code.

## MCP servers / integrations

- **Supabase**: migrations, schema, RLS checks. Scope to the Next Rep project only; prefer read-only mode.
- **Vercel**: deployments, builds, logs (plugin; needs authentication).
- **GitHub**: issues, PRs, repo search (plugin; needs a valid token or auth).
- **Playwright MCP**: drive a real browser for exploratory and offline testing (AI-assisted QA evidence).
- **Context7**: up-to-date library docs to avoid outdated API usage (plugin; needs authentication).

## Hooks (`.claude/settings.json`)

- After `Edit`/`Write` on TypeScript under `src/`, `api/` or `tests/`: run eslint on the file and the project typecheck (`.claude/hooks/check-changed.sh`). Failures are fed back to Claude.
- Deny reading the common local `.env` files (`.env`, `.env.local`, `.env.*.local`, `.env.development`, `.env.production`, `.env.test`), and `cat`/`source` of them through Bash.
- Deny force-push (any flag position, `+branch`), `--no-verify` on commit, `rm -rf` in its spellings and `curl`/`wget` piped into a shell. Deny editing `.claude/settings.json`, `.claude/settings.local.json`, `.githooks/**`, `.github/workflows/**` and `.env*`: the developer changes those by hand. Editing `.claude/hooks/` is not in the project's permission denies.
- Sandbox on, with network limited to `registry.npmjs.org`, `github.com`, `api.github.com`, `vercel.com`, `api.vercel.com` and `*.vercel.app`.
- Deny rules match command text, so they stop the usual spellings, not every possible one: the real backstops are gitleaks (pre-commit and CI) and branch protection on `main`.
- Git pre-commit: gitleaks (`.githooks/pre-commit`, activated by `npm install` through the `prepare` script).

## Accounts (all free)

Supabase, Vercel, GitHub (repository `Kunalrawat232/Next-Rep`), Google AI Studio (Gemini key, **no billing**).

## Mobile testing gotcha

Microphone and speech recognition only work on **HTTPS or localhost**. Opening the dev server on a phone via `http://192.168.x.x` will not work for voice. Test on phones using the live address https://nextrep-gym.vercel.app (HTTPS) or a free tunnel such as Cloudflare Tunnel.

## Claude Design workflow

See [design workflow](../design/design-workflow.md).
