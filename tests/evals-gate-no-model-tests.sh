#!/usr/bin/env bash
# Acceptance test for Slice 2 (gate purity):
# Nothing under `evals/gate/` invokes `claude`. The gate tier must remain
# fast, deterministic, and free of model calls per the design risk note
# "Judge non-determinism leaks into gate."
#
# Run from the repository root: bash tests/evals-gate-no-model-tests.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILURES=0

pass() {
  echo "PASS  $1"
}

fail() {
  echo "FAIL  $1"
  FAILURES=$((FAILURES + 1))
}

GATE_DIR="$REPO_ROOT/evals/gate"

# ---------------------------------------------------------------------------
# T0: precondition — gate directory exists.
# ---------------------------------------------------------------------------
if [ -d "$GATE_DIR" ]; then
  pass "T0: evals/gate/ directory exists"
else
  fail "T0: evals/gate/ directory exists (not found at $GATE_DIR)"
fi

# ---------------------------------------------------------------------------
# T1: no file under evals/gate/ invokes the `claude` CLI.
#     Word-boundary match avoids matching directory/file names that happen
#     to contain "claude" (none in scope, but defensive).
# ---------------------------------------------------------------------------
if [ -d "$GATE_DIR" ]; then
  # If grep matches anything, that's a fail.
  if grep -rE '\bclaude\b' "$GATE_DIR" >/tmp/.evals-gate-claude-hits.$$ 2>/dev/null; then
    fail "T1: no \`claude\` invocations under evals/gate/ (found: $(head -3 /tmp/.evals-gate-claude-hits.$$ | tr '\n' '|'))"
  else
    pass "T1: no \`claude\` invocations under evals/gate/"
  fi
  rm -f "/tmp/.evals-gate-claude-hits.$$"
else
  fail "T1: no \`claude\` invocations under evals/gate/ (directory missing)"
fi

# ===========================================================================
# Summary
# ===========================================================================
echo ""
if [ "$FAILURES" -eq 0 ]; then
  echo "All tests passed."
  exit 0
else
  echo "$FAILURES test(s) failed."
  exit 1
fi
