#!/usr/bin/env bash
# evals/e2e/gc.sh — keep last 10 run directories under EVALS_RESULTS_ROOT.
#
# Thin shim around evals/lib/gc-runner.mjs. Values flow through env vars
# (never interpolated into JS source) so shell-metachar-laced inputs
# cannot inject code.
#
# Environment:
#   EVALS_RESULTS_ROOT  override the results root (defaults to
#                       evals/results under the repo)
#   EVALS_GC_KEEP       override the keep count (default 10; must be int)
#
# Exit 0 on success.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GC_RUNNER="$REPO_ROOT/evals/lib/gc-runner.mjs"
RESULTS_ROOT="${EVALS_RESULTS_ROOT:-$REPO_ROOT/evals/results}"
KEEP="${EVALS_GC_KEEP:-10}"

if [ ! -f "$GC_RUNNER" ]; then
  echo "evals: gc-runner module missing at $GC_RUNNER" >&2
  exit 1
fi

EVALS_RESULTS_ROOT="$RESULTS_ROOT" \
  EVALS_GC_KEEP="$KEEP" \
  exec node "$GC_RUNNER"
