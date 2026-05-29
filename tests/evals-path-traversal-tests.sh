#!/usr/bin/env bash
# Acceptance test for review-round-1 fix (M1 + M2):
#   M1: runId is validated; `..` and `/`-containing values are refused.
#   M2: EVALS_RESULTS_ROOT / EVALS_FIXTURE_ROOT / EVALS_RUBRIC_ROOT must
#       resolve under the repo root or under the system tempdir; anything
#       else fails fast.
#
# Run from the repository root: bash tests/evals-path-traversal-tests.sh

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

ENTRY="$REPO_ROOT/evals/e2e/run.sh"
SELECT="$REPO_ROOT/evals/lib/select.mjs"
GC="$REPO_ROOT/evals/e2e/gc.sh"

# ---------------------------------------------------------------------------
# T0a/T0b/T0c: preconditions — the entry points whose path-confinement
# guards we assert exist.
# ---------------------------------------------------------------------------
if [ -f "$ENTRY" ]; then
  pass "T0a: evals/e2e/run.sh exists"
else
  fail "T0a: evals/e2e/run.sh exists (not found at $ENTRY)"
fi
if [ -f "$SELECT" ]; then
  pass "T0b: evals/lib/select.mjs exists"
else
  fail "T0b: evals/lib/select.mjs exists (not found at $SELECT)"
fi
if [ -f "$GC" ]; then
  pass "T0c: evals/e2e/gc.sh exists"
else
  fail "T0c: evals/e2e/gc.sh exists (not found at $GC)"
fi

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

MOCK_AGENT="$WORKDIR/mock-agent.txt"
echo "ok" >"$MOCK_AGENT"
MOCK_JUDGE="$WORKDIR/mock-judge.json"
printf '{"verdict":"pass","criteria":[]}\n' >"$MOCK_JUDGE"
RESULTS_DIR="$WORKDIR/results"
mkdir -p "$RESULTS_DIR"

# ---------------------------------------------------------------------------
# T1: --resume with `..` is refused.
# ---------------------------------------------------------------------------
set +e
env -u ANTHROPIC_API_KEY \
  EVALS_MOCK_AGENT="$MOCK_AGENT" \
  EVALS_MOCK_JUDGE="$MOCK_JUDGE" \
  EVALS_RESULTS_ROOT="$RESULTS_DIR" \
  PERIODIC=1 \
  bash "$ENTRY" code-reviewer --resume "../escape" \
  >"$WORKDIR/t1.out" 2>"$WORKDIR/t1.err"
T1_CODE=$?
set -e

if [ "$T1_CODE" -ne 0 ] && grep -qE "runId|safe directory|outside" "$WORKDIR/t1.err"; then
  pass "T1: --resume with '..' is rejected with a clear error"
else
  fail "T1: --resume with '..' is rejected (exit=$T1_CODE; err: $(tr '\n' '|' <"$WORKDIR/t1.err" | head -c 240))"
fi

# ---------------------------------------------------------------------------
# T2: --resume with a `/`-containing value is refused.
# ---------------------------------------------------------------------------
set +e
env -u ANTHROPIC_API_KEY \
  EVALS_MOCK_AGENT="$MOCK_AGENT" \
  EVALS_MOCK_JUDGE="$MOCK_JUDGE" \
  EVALS_RESULTS_ROOT="$RESULTS_DIR" \
  PERIODIC=1 \
  bash "$ENTRY" code-reviewer --resume "a/b" \
  >"$WORKDIR/t2.out" 2>"$WORKDIR/t2.err"
T2_CODE=$?
set -e

if [ "$T2_CODE" -ne 0 ] && grep -qE "runId|safe directory|outside" "$WORKDIR/t2.err"; then
  pass "T2: --resume with '/' is rejected with a clear error"
else
  fail "T2: --resume with '/' is rejected (exit=$T2_CODE; err: $(tr '\n' '|' <"$WORKDIR/t2.err" | head -c 240))"
fi

# ---------------------------------------------------------------------------
# T3: EVALS_RUN_ID containing `..` is refused.
# ---------------------------------------------------------------------------
set +e
env -u ANTHROPIC_API_KEY \
  EVALS_MOCK_AGENT="$MOCK_AGENT" \
  EVALS_MOCK_JUDGE="$MOCK_JUDGE" \
  EVALS_RESULTS_ROOT="$RESULTS_DIR" \
  EVALS_RUN_ID="../escape" \
  PERIODIC=1 \
  bash "$ENTRY" code-reviewer \
  >"$WORKDIR/t3.out" 2>"$WORKDIR/t3.err"
T3_CODE=$?
set -e

if [ "$T3_CODE" -ne 0 ] && grep -qE "runId|safe directory|outside" "$WORKDIR/t3.err"; then
  pass "T3: EVALS_RUN_ID with '..' is rejected with a clear error"
else
  fail "T3: EVALS_RUN_ID with '..' is rejected (exit=$T3_CODE; err: $(tr '\n' '|' <"$WORKDIR/t3.err" | head -c 240))"
fi

# ---------------------------------------------------------------------------
# T4: EVALS_RESULTS_ROOT pointing outside repo+tempdir is rejected.
#     Use /etc as an attacker-controlled location that is neither.
# ---------------------------------------------------------------------------
set +e
env -u ANTHROPIC_API_KEY \
  EVALS_MOCK_AGENT="$MOCK_AGENT" \
  EVALS_MOCK_JUDGE="$MOCK_JUDGE" \
  EVALS_RESULTS_ROOT="/etc/evil-results" \
  PERIODIC=1 \
  bash "$ENTRY" code-reviewer \
  >"$WORKDIR/t4.out" 2>"$WORKDIR/t4.err"
T4_CODE=$?
set -e

if [ "$T4_CODE" -ne 0 ] && grep -qE "EVALS_RESULTS_ROOT|refused|not under" "$WORKDIR/t4.err"; then
  pass "T4: EVALS_RESULTS_ROOT outside repo+tempdir is rejected"
else
  fail "T4: EVALS_RESULTS_ROOT outside safe area is rejected (exit=$T4_CODE; err: $(tr '\n' '|' <"$WORKDIR/t4.err" | head -c 240))"
fi

# ---------------------------------------------------------------------------
# T5: EVALS_FIXTURE_ROOT pointing outside repo+tempdir is rejected.
# ---------------------------------------------------------------------------
set +e
env -u ANTHROPIC_API_KEY \
  EVALS_MOCK_AGENT="$MOCK_AGENT" \
  EVALS_MOCK_JUDGE="$MOCK_JUDGE" \
  EVALS_FIXTURE_ROOT="/etc/evil-fixtures" \
  EVALS_RESULTS_ROOT="$RESULTS_DIR" \
  PERIODIC=1 \
  bash "$ENTRY" code-reviewer \
  >"$WORKDIR/t5.out" 2>"$WORKDIR/t5.err"
T5_CODE=$?
set -e

if [ "$T5_CODE" -ne 0 ] && grep -qE "EVALS_FIXTURE_ROOT|refused|not under" "$WORKDIR/t5.err"; then
  pass "T5: EVALS_FIXTURE_ROOT outside repo+tempdir is rejected"
else
  fail "T5: EVALS_FIXTURE_ROOT outside safe area is rejected (exit=$T5_CODE; err: $(tr '\n' '|' <"$WORKDIR/t5.err" | head -c 240))"
fi

# ---------------------------------------------------------------------------
# T6: EVALS_RUBRIC_ROOT pointing outside repo+tempdir is rejected.
#     We have to make selection succeed first; supply EVALS_FAKE_CHANGED_FILES
#     so the runner enumerates the agent we know exists.
# ---------------------------------------------------------------------------
set +e
env -u ANTHROPIC_API_KEY \
  EVALS_MOCK_AGENT="$MOCK_AGENT" \
  EVALS_MOCK_JUDGE="$MOCK_JUDGE" \
  EVALS_RUBRIC_ROOT="/etc/evil-rubrics" \
  EVALS_RESULTS_ROOT="$RESULTS_DIR" \
  PERIODIC=1 \
  bash "$ENTRY" code-reviewer \
  >"$WORKDIR/t6.out" 2>"$WORKDIR/t6.err"
T6_CODE=$?
set -e

if [ "$T6_CODE" -ne 0 ] && grep -qE "EVALS_RUBRIC_ROOT|refused|not under" "$WORKDIR/t6.err"; then
  pass "T6: EVALS_RUBRIC_ROOT outside repo+tempdir is rejected"
else
  fail "T6: EVALS_RUBRIC_ROOT outside safe area is rejected (exit=$T6_CODE; err: $(tr '\n' '|' <"$WORKDIR/t6.err" | head -c 240))"
fi

# ---------------------------------------------------------------------------
# T7: selector CLI with EVALS_FIXTURE_ROOT outside safe area is rejected.
# ---------------------------------------------------------------------------
set +e
env EVALS_FIXTURE_ROOT="/etc/evil-fixtures" \
  node "$SELECT" --print-selected \
  >"$WORKDIR/t7.out" 2>"$WORKDIR/t7.err"
T7_CODE=$?
set -e

if [ "$T7_CODE" -ne 0 ] && grep -qE "EVALS_FIXTURE_ROOT|refused|not under" "$WORKDIR/t7.err"; then
  pass "T7: selector rejects EVALS_FIXTURE_ROOT outside safe area"
else
  fail "T7: selector rejects EVALS_FIXTURE_ROOT outside safe area (exit=$T7_CODE; err: $(tr '\n' '|' <"$WORKDIR/t7.err" | head -c 240))"
fi

# ---------------------------------------------------------------------------
# T8: a tempdir-resident EVALS_RESULTS_ROOT IS accepted (the override has
#     to keep working for the acceptance harness). This is the "tests can
#     override repoRoot" allowance noted in M2.
# ---------------------------------------------------------------------------
set +e
env -u ANTHROPIC_API_KEY \
  EVALS_MOCK_AGENT="$MOCK_AGENT" \
  EVALS_MOCK_JUDGE="$MOCK_JUDGE" \
  EVALS_RESULTS_ROOT="$RESULTS_DIR" \
  PERIODIC=1 \
  bash "$ENTRY" code-reviewer \
  >"$WORKDIR/t8.out" 2>"$WORKDIR/t8.err"
T8_CODE=$?
set -e

if [ "$T8_CODE" -eq 0 ] || [ "$T8_CODE" -eq 2 ]; then
  pass "T8: tempdir EVALS_RESULTS_ROOT is accepted (override survives)"
else
  fail "T8: tempdir EVALS_RESULTS_ROOT should pass safe-area check (exit=$T8_CODE; err: $(tr '\n' '|' <"$WORKDIR/t8.err" | head -c 240))"
fi

# ---------------------------------------------------------------------------
# T9: B1+B2 injection regression — pathological EVALS_RESULTS_ROOT no longer
#     executes shell-injected JS. We check that a poisoned value does not
#     create /tmp/.pwn-from-evals (the canary the prior exec would have
#     written had the injection worked).
# ---------------------------------------------------------------------------
PWN_FILE="/tmp/.pwn-from-evals-$$"
\rm -f "$PWN_FILE" 2>/dev/null || true

set +e
env EVALS_RESULTS_ROOT="x'; require('fs').writeFileSync('$PWN_FILE', 'pwn'); '" \
  bash "$REPO_ROOT/evals/e2e/gc.sh" \
  >"$WORKDIR/t9.out" 2>"$WORKDIR/t9.err"
T9_CODE=$?
set -e

if [ ! -f "$PWN_FILE" ]; then
  pass "T9: poisoned EVALS_RESULTS_ROOT does not execute injected JS (no canary file)"
else
  fail "T9: poisoned EVALS_RESULTS_ROOT created canary at $PWN_FILE — injection succeeded"
  \rm -f "$PWN_FILE" 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# T10: B1 injection regression — poisoned EVALS_GC_KEEP no longer executes
#     JS. KEEP must be a non-negative integer; pathological values are
#     rejected by the runner.
# ---------------------------------------------------------------------------
PWN_FILE2="/tmp/.pwn-from-evals-keep-$$"
\rm -f "$PWN_FILE2" 2>/dev/null || true

KEEP_RESULTS="$WORKDIR/keep-results"
mkdir -p "$KEEP_RESULTS"

set +e
env EVALS_RESULTS_ROOT="$KEEP_RESULTS" \
  EVALS_GC_KEEP="10; require('fs').writeFileSync('$PWN_FILE2', 'pwn');" \
  bash "$REPO_ROOT/evals/e2e/gc.sh" \
  >"$WORKDIR/t10.out" 2>"$WORKDIR/t10.err"
T10_CODE=$?
set -e

if [ ! -f "$PWN_FILE2" ] && [ "$T10_CODE" -ne 0 ]; then
  pass "T10: poisoned EVALS_GC_KEEP is rejected with non-zero exit and no canary"
else
  fail "T10: poisoned EVALS_GC_KEEP — canary? $([ -f "$PWN_FILE2" ] && echo yes || echo no); exit=$T10_CODE"
  \rm -f "$PWN_FILE2" 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# T11: gc.sh with EVALS_RESULTS_ROOT outside repo+tempdir is rejected.
#     Round-2 fix: gc-runner.mjs now calls assertRootWithinSafeArea so the
#     path-confinement invariant holds across both run.sh and gc.sh entry
#     points. Without this fix, `EVALS_RESULTS_ROOT=/etc bash evals/e2e/gc.sh`
#     would rmSync subdirectories of /etc.
# ---------------------------------------------------------------------------
set +e
env EVALS_RESULTS_ROOT="/etc/evil-gc-target" \
  bash "$REPO_ROOT/evals/e2e/gc.sh" \
  >"$WORKDIR/t11.out" 2>"$WORKDIR/t11.err"
T11_CODE=$?
set -e

if [ "$T11_CODE" -ne 0 ] && grep -qE "EVALS_RESULTS_ROOT|refused|not under" "$WORKDIR/t11.err"; then
  pass "T11: gc.sh rejects EVALS_RESULTS_ROOT outside safe area"
else
  fail "T11: gc.sh rejects EVALS_RESULTS_ROOT outside safe area (exit=$T11_CODE; err: $(tr '\n' '|' <"$WORKDIR/t11.err" | head -c 240))"
fi

# ---------------------------------------------------------------------------
# T12: gc.sh with EVALS_RESULTS_ROOT containing `..` traversal that escapes
#     to /etc is rejected. Defense-in-depth against a path that looks
#     repo-relative but resolves outside the safe area.
# ---------------------------------------------------------------------------
set +e
env EVALS_RESULTS_ROOT="$REPO_ROOT/../../../../../../etc/evil-traversal" \
  bash "$REPO_ROOT/evals/e2e/gc.sh" \
  >"$WORKDIR/t12.out" 2>"$WORKDIR/t12.err"
T12_CODE=$?
set -e

if [ "$T12_CODE" -ne 0 ] && grep -qE "EVALS_RESULTS_ROOT|refused|not under" "$WORKDIR/t12.err"; then
  pass "T12: gc.sh rejects EVALS_RESULTS_ROOT that traverses out via '..'"
else
  fail "T12: gc.sh rejects EVALS_RESULTS_ROOT '..' traversal (exit=$T12_CODE; err: $(tr '\n' '|' <"$WORKDIR/t12.err" | head -c 240))"
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
