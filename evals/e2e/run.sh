#!/usr/bin/env bash
# evals/e2e/run.sh — E2E + judge tier entry point.
#
# Thin shim around evals/lib/runner.mjs. All orchestration logic lives
# in the Node module so it stays testable. This script's only jobs:
#   1. Locate REPO_ROOT.
#   2. Pass argv through to the Node runner.
#   3. Mirror the runner's exit code.
#
# Documented exit codes:
#   0  all rubric criteria passed (or no matching evals)
#   2  at least one rubric criterion failed
#   3  missing ANTHROPIC_API_KEY or PERIODIC opt-in (real path only)
#   4  another runner holds the lock for this run-id
#
# Run from the repository root: bash evals/e2e/run.sh <agent-name>

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNNER="$REPO_ROOT/evals/lib/runner.mjs"

if [ ! -f "$RUNNER" ]; then
  echo "evals: runner module missing at $RUNNER" >&2
  exit 1
fi

exec node "$RUNNER" "$@"
