#!/usr/bin/env bash
# Acceptance test for Slice 5 (gc subcommand):
# `bash evals/e2e/gc.sh` with 12 fake run directories keeps the 10 most
# recent and removes the two oldest.
#
# Run from the repository root: bash tests/evals-gc-tests.sh

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

GC="$REPO_ROOT/evals/e2e/gc.sh"

# ---------------------------------------------------------------------------
# T0: gc entry script exists.
# ---------------------------------------------------------------------------
if [ -f "$GC" ]; then
  pass "T0: evals/e2e/gc.sh exists"
else
  fail "T0: evals/e2e/gc.sh exists"
fi

# ---------------------------------------------------------------------------
# Workspace: 12 fake run directories with staggered mtimes via touch -t.
# Names sorted lexically descend with the timestamp suffix; mtimes give the
# real ordering used by gc.
# ---------------------------------------------------------------------------
WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

RESULTS_ROOT="$WORKDIR/results"
mkdir -p "$RESULTS_ROOT"

# Create 12 dirs; oldest first via touch -t YYYYMMDDhhmm.SS
for i in $(seq 1 12); do
  d="$RESULTS_ROOT/run-$(printf '%02d' "$i")"
  mkdir -p "$d"
  echo "{}" >"$d/case.json"
  # mtime: 2026-04-01 00:00 + i hours
  HOUR=$(printf '%02d' $((i - 1)))
  touch -t "202604010${HOUR:0:1}${HOUR:1:1}00" "$d" 2>/dev/null || \
    touch -t "20260401${HOUR}00" "$d"
done

# ---------------------------------------------------------------------------
# T1: gc keeps 10, removes 2 (the oldest, which are run-01 and run-02).
# ---------------------------------------------------------------------------
OUT_LOG=$(mktemp)
set +e
env EVALS_RESULTS_ROOT="$RESULTS_ROOT" \
  bash "$GC" >"$OUT_LOG" 2>&1
GC_EXIT=$?
set -e

if [ "$GC_EXIT" -ne 0 ]; then
  fail "T1: gc exits 0 (got $GC_EXIT, log: $(head -5 "$OUT_LOG" | tr '\n' '|'))"
else
  REMAINING=$(find "$RESULTS_ROOT" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
  if [ "$REMAINING" -eq 10 ]; then
    pass "T1: gc keeps exactly 10 of 12 directories"
  else
    fail "T1: gc keeps exactly 10 of 12 (kept $REMAINING)"
  fi
fi

# ---------------------------------------------------------------------------
# T2: the two OLDEST directories (run-01, run-02) are the ones removed.
# ---------------------------------------------------------------------------
T2_PASS=true
[ -d "$RESULTS_ROOT/run-01" ] && T2_PASS=false
[ -d "$RESULTS_ROOT/run-02" ] && T2_PASS=false

if [ "$T2_PASS" = "true" ]; then
  pass "T2: run-01 and run-02 (oldest) are gone"
else
  fail "T2: run-01 and run-02 (oldest) should be removed (run-01 exists: $([ -d "$RESULTS_ROOT/run-01" ] && echo yes || echo no); run-02 exists: $([ -d "$RESULTS_ROOT/run-02" ] && echo yes || echo no))"
fi

# ---------------------------------------------------------------------------
# T3: the 10 MOST RECENT directories (run-03..run-12) all remain.
# ---------------------------------------------------------------------------
# Require gc to have actually run (exit 0) before crediting T3 — otherwise
# all 12 dirs are trivially present and this assertion passes vacuously.
T3_PASS=true
if [ "$GC_EXIT" -ne 0 ]; then
  T3_PASS=false
fi
for i in $(seq 3 12); do
  d="$RESULTS_ROOT/run-$(printf '%02d' "$i")"
  if [ ! -d "$d" ]; then
    T3_PASS=false
  fi
done

if [ "$T3_PASS" = "true" ]; then
  pass "T3: run-03 through run-12 (10 most recent) all remain"
else
  fail "T3: run-03 through run-12 should remain (gc must run first; gc exit=$GC_EXIT)"
fi

rm -f "$OUT_LOG"

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
