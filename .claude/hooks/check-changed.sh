#!/usr/bin/env bash
# PostToolUse (Edit|Write): lint the edited file and type-check the project.
# Exit 2 feeds the failure output back to Claude; the edit itself is never blocked.
set -uo pipefail

file=$(jq -r '.tool_response.filePath // .tool_input.file_path // empty')
[ -n "$file" ] || exit 0

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
rel="${file#"$root"/}"
case "$rel" in
  src/*.ts | src/*.tsx | src/**/*.ts | src/**/*.tsx | api/*.ts | tests/*.ts | tests/**/*.ts) ;;
  *) exit 0 ;;
esac

cd "$root" || exit 0
out=$(npx eslint "$rel" 2>&1) || { printf 'eslint failed for %s:\n%s\n' "$rel" "$out" >&2; exit 2; }
out=$(npm run --silent typecheck 2>&1) || { printf 'typecheck failed after editing %s:\n%s\n' "$rel" "$out" >&2; exit 2; }
