#!/usr/bin/env bash
# evals/e2e/compare.sh — compare two run directories.
#
# Thin shim around evals/lib/compare.mjs. Prints the comparison report
# with regressions first; exits non-zero when regressions exist so the
# caller can fail loud.
#
# Usage:
#   bash evals/e2e/compare.sh <run-a-dir> <run-b-dir>

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPARE_MJS="$REPO_ROOT/evals/lib/compare.mjs"

if [ ! -f "$COMPARE_MJS" ]; then
  echo "evals: compare module missing at $COMPARE_MJS" >&2
  exit 1
fi

exec node "$COMPARE_MJS" "$@"
