#!/usr/bin/env bash
# Acceptance test for Slice 2 (gate wall-clock budget):
# `bash evals/gate/run.sh` runs in under 5 seconds against the real
# evals/fixtures directory. The gate must stay cheap enough to run on every
# pre-push or every save.
#
# Run from the repository root: bash tests/evals-gate-walltime-tests.sh

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

GATE="$REPO_ROOT/evals/gate/run.sh"
FIXTURES="$REPO_ROOT/evals/fixtures"

# ---------------------------------------------------------------------------
# T1: gate entry script exists.
# ---------------------------------------------------------------------------
if [ -f "$GATE" ]; then
  pass "T1: evals/gate/run.sh exists"
else
  fail "T1: evals/gate/run.sh exists (not found at $GATE)"
fi

# ---------------------------------------------------------------------------
# T2: fixtures directory exists (gate must have something to check).
# ---------------------------------------------------------------------------
if [ -d "$FIXTURES" ]; then
  pass "T2: evals/fixtures/ directory exists"
else
  fail "T2: evals/fixtures/ directory exists (not found at $FIXTURES)"
fi

# ---------------------------------------------------------------------------
# T3: gate completes in < 5 seconds on the real fixture directory and exits
#     0 (no key needed; gate runs free).
# ---------------------------------------------------------------------------
if [ -f "$GATE" ] && [ -d "$FIXTURES" ]; then
  START=$(date +%s)
  set +e
  env -u ANTHROPIC_API_KEY bash "$GATE" >/tmp/.evals-gate-walltime.$$.log 2>&1
  EXIT_CODE=$?
  set -e
  END=$(date +%s)
  ELAPSED=$((END - START))

  if [ "$EXIT_CODE" -ne 0 ]; then
    fail "T3: gate exits 0 on real fixtures (got $EXIT_CODE, output: $(head -3 "/tmp/.evals-gate-walltime.$$.log" | tr '\n' '|'))"
  elif [ "$ELAPSED" -ge 5 ]; then
    fail "T3: gate runs in <5s on real fixtures (took ${ELAPSED}s)"
  else
    pass "T3: gate runs in <5s on real fixtures (took ${ELAPSED}s)"
  fi
  rm -f "/tmp/.evals-gate-walltime.$$.log"
else
  fail "T3: gate runs in <5s on real fixtures (gate or fixtures missing)"
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
