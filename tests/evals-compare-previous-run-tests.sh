#!/usr/bin/env bash
# Acceptance test for Slice 4 (findPreviousRun):
# `findPreviousRun` prefers same-branch results; falls back to any branch;
# exits gracefully (no crash) when no prior run exists.
#
# Drives `evals/lib/compare.mjs --find-previous --branch=<name>` against a
# fabricated results root with several run files using the slice-1
# convention `<version>-<branch>-<tier>-<timestamp>.json`.
#
# Run from the repository root: bash tests/evals-compare-previous-run-tests.sh

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

COMPARE_MJS="$REPO_ROOT/evals/lib/compare.mjs"

# ---------------------------------------------------------------------------
# T0: compare module exists.
# ---------------------------------------------------------------------------
if [ -f "$COMPARE_MJS" ]; then
  pass "T0: evals/lib/compare.mjs exists"
else
  fail "T0: evals/lib/compare.mjs exists (not found at $COMPARE_MJS)"
fi

# ---------------------------------------------------------------------------
# Fabricate results root with run files for two branches.
# Convention: <version>-<branch>-<tier>-<timestamp>.json
# ---------------------------------------------------------------------------
WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT
RESULTS_ROOT="$WORKDIR/results"
mkdir -p "$RESULTS_ROOT"

# Same-branch (feature-x), newer (2026-05-28).
mkdir -p "$RESULTS_ROOT/1-feature-x-periodic-2026-05-28T10-00-00Z"
echo '{"schema_version":1,"branch":"feature-x"}' >"$RESULTS_ROOT/1-feature-x-periodic-2026-05-28T10-00-00Z/case-x.json"

# Same-branch (feature-x), older (2026-05-01).
mkdir -p "$RESULTS_ROOT/1-feature-x-periodic-2026-05-01T10-00-00Z"
echo '{"schema_version":1,"branch":"feature-x"}' >"$RESULTS_ROOT/1-feature-x-periodic-2026-05-01T10-00-00Z/case-x.json"

# Cross-branch (main), even newer than the same-branch newest.
mkdir -p "$RESULTS_ROOT/1-main-periodic-2026-05-29T10-00-00Z"
echo '{"schema_version":1,"branch":"main"}' >"$RESULTS_ROOT/1-main-periodic-2026-05-29T10-00-00Z/case-x.json"

# ---------------------------------------------------------------------------
# T1: same-branch preference — when querying branch=feature-x, the chosen
#     previous run is the newer feature-x dir, NOT the main dir (even though
#     main is more recent).
# ---------------------------------------------------------------------------
STDOUT=$(mktemp); STDERR=$(mktemp)
set +e
env EVALS_RESULTS_ROOT="$RESULTS_ROOT" \
  node "$COMPARE_MJS" --find-previous --branch=feature-x >"$STDOUT" 2>"$STDERR"
EXIT_FX=$?
set -e

if [ "$EXIT_FX" -eq 0 ] \
  && grep -q "1-feature-x-periodic-2026-05-28T10-00-00Z" "$STDOUT" \
  && ! grep -q "1-main-periodic" "$STDOUT"; then
  pass "T1: findPreviousRun prefers same-branch (feature-x) over newer cross-branch"
else
  fail "T1: findPreviousRun prefers same-branch (exit=$EXIT_FX, stdout: $(tr '\n' '|' <"$STDOUT" | head -c 240))"
fi

# ---------------------------------------------------------------------------
# T2: cross-branch fallback — when querying branch=unknown-branch, falls
#     back to the most recent run on any branch (main, in our fixture).
# ---------------------------------------------------------------------------
STDOUT2=$(mktemp); STDERR2=$(mktemp)
set +e
env EVALS_RESULTS_ROOT="$RESULTS_ROOT" \
  node "$COMPARE_MJS" --find-previous --branch=unknown-branch >"$STDOUT2" 2>"$STDERR2"
EXIT_UB=$?
set -e

if [ "$EXIT_UB" -eq 0 ] && grep -q "1-main-periodic-2026-05-29T10-00-00Z" "$STDOUT2"; then
  pass "T2: cross-branch fallback returns newest run on any branch"
else
  fail "T2: cross-branch fallback (exit=$EXIT_UB, stdout: $(tr '\n' '|' <"$STDOUT2" | head -c 240))"
fi

# ---------------------------------------------------------------------------
# T3: graceful exit when no prior run exists — empty results root produces
#     a 0-exit, no-crash signal (e.g. empty stdout or "no prior run" line).
# ---------------------------------------------------------------------------
EMPTY_ROOT="$WORKDIR/empty-results"
mkdir -p "$EMPTY_ROOT"
STDOUT3=$(mktemp); STDERR3=$(mktemp)
set +e
env EVALS_RESULTS_ROOT="$EMPTY_ROOT" \
  node "$COMPARE_MJS" --find-previous --branch=feature-x >"$STDOUT3" 2>"$STDERR3"
EXIT_EMPTY=$?
set -e

if [ "$EXIT_EMPTY" -eq 0 ]; then
  pass "T3: findPreviousRun exits 0 when no prior run exists"
else
  fail "T3: findPreviousRun exits 0 when no prior run exists (exit=$EXIT_EMPTY, stderr: $(tr '\n' '|' <"$STDERR3" | head -c 240))"
fi

rm -f "$STDOUT" "$STDERR" "$STDOUT2" "$STDERR2" "$STDOUT3" "$STDERR3"

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
