#!/usr/bin/env bash
# evals/e2e/gc.sh — keep last 10 run directories under EVALS_RESULTS_ROOT.
#
# Thin shim around evals/lib/result-store.mjs's gc({...}).
#
# Environment:
#   EVALS_RESULTS_ROOT  override the results root (defaults to
#                       evals/results under the repo)
#   EVALS_GC_KEEP       override the keep count (default 10)
#
# Exit 0 on success.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RESULT_STORE="$REPO_ROOT/evals/lib/result-store.mjs"
RESULTS_ROOT="${EVALS_RESULTS_ROOT:-$REPO_ROOT/evals/results}"
KEEP="${EVALS_GC_KEEP:-10}"

if [ ! -f "$RESULT_STORE" ]; then
  echo "evals: result-store module missing at $RESULT_STORE" >&2
  exit 1
fi

exec node -e "
  import('$RESULT_STORE').then((m) => {
    const removed = m.gc({ resultsRoot: '$RESULTS_ROOT', keep: ${KEEP} });
    for (const path of removed) {
      console.log('removed: ' + path);
    }
  }).catch((err) => {
    console.error(err && err.stack || err);
    process.exit(1);
  });
"
