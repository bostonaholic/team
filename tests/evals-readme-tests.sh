#!/usr/bin/env bash
# Acceptance test for Slice 1 (README):
# `evals/README.md` mentions `PERIODIC=1`, names `ANTHROPIC_API_KEY` as a
# requirement, and includes the rerun-on-base blame command literal so
# contributors can verify "pre-existing" before blaming a branch.
#
# Run from the repository root: bash tests/evals-readme-tests.sh

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

README="$REPO_ROOT/evals/README.md"

# ---------------------------------------------------------------------------
# T0: precondition — evals/README.md exists.
# ---------------------------------------------------------------------------
if [ -f "$README" ]; then
  pass "T0: evals/README.md exists"
else
  fail "T0: evals/README.md exists (not found at $README)"
fi

# ---------------------------------------------------------------------------
# T1: README mentions PERIODIC=1 (cost-warning opt-in flag).
# ---------------------------------------------------------------------------
if [ -f "$README" ] && grep -q "PERIODIC=1" "$README"; then
  pass "T1: README mentions PERIODIC=1"
else
  fail "T1: README mentions PERIODIC=1"
fi

# ---------------------------------------------------------------------------
# T2: README names ANTHROPIC_API_KEY as a requirement.
# ---------------------------------------------------------------------------
if [ -f "$README" ] && grep -q "ANTHROPIC_API_KEY" "$README"; then
  pass "T2: README names ANTHROPIC_API_KEY"
else
  fail "T2: README names ANTHROPIC_API_KEY"
fi

# ---------------------------------------------------------------------------
# T3: README contains the rerun-on-base blame command. Per the design's
#     blame protocol, a contributor must rerun on origin/main before blaming
#     "pre-existing." The literal must include `git checkout` against a base
#     branch (origin/main or origin/master) followed by an evals run command.
# ---------------------------------------------------------------------------
T3_PASS=true
if [ -f "$README" ]; then
  grep -qE "git checkout (origin/main|origin/master|main|master)" "$README" || T3_PASS=false
  grep -qE "evals/e2e/run\.(sh|mjs)" "$README" || T3_PASS=false
else
  T3_PASS=false
fi

if [ "$T3_PASS" = "true" ]; then
  pass "T3: README contains the rerun-on-base blame command"
else
  fail "T3: README contains the rerun-on-base blame command (needs 'git checkout origin/main' + 'evals/e2e/run.sh')"
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
