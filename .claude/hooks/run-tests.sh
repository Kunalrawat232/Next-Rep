#!/usr/bin/env bash
# Stop: run the unit tests and show failures to the user. Never blocks the turn from ending.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" || exit 0
[ -f package.json ] || exit 0

if out=$(npm test --silent 2>&1); then
  exit 0
fi
tail=$(printf '%s' "$out" | tail -n 25)
jq -n --arg msg "Unit tests failing:
$tail" '{systemMessage: $msg}'
exit 0
