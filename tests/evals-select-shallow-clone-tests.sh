#!/usr/bin/env bash
# Acceptance test for Slice 3 (shallow-clone / detached-HEAD fallback):
# When `git diff` fails (shallow clone or detached HEAD), the selector falls
# back to "run all" with a warning on stderr — never silently selecting
# nothing. Drives the failure via EVALS_FAKE_GIT_DIFF_FAIL=1.
#
# Run from the repository root: bash tests/evals-select-shallow-clone-tests.sh

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

SELECT="$REPO_ROOT/evals/lib/select.mjs"

# ---------------------------------------------------------------------------
# T0: selector module exists.
# ---------------------------------------------------------------------------
if [ -f "$SELECT" ]; then
  pass "T0: evals/lib/select.mjs exists"
else
  fail "T0: evals/lib/select.mjs exists (not found at $SELECT)"
fi

# ---------------------------------------------------------------------------
# Tempdir with two fixtures.
# ---------------------------------------------------------------------------
WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

mkdir -p "$WORKDIR/fixtures/code-reviewer/case-a"
cat >"$WORKDIR/fixtures/code-reviewer/case-a/input.md" <<'EOF'
---
agent: code-reviewer
tier: periodic
deps:
  - agents/code-reviewer.md
---

a
EOF

mkdir -p "$WORKDIR/fixtures/code-reviewer/case-b"
cat >"$WORKDIR/fixtures/code-reviewer/case-b/input.md" <<'EOF'
---
agent: code-reviewer
tier: periodic
deps:
  - agents/planner.md
---

b
EOF

# ---------------------------------------------------------------------------
# T1: with EVALS_FAKE_GIT_DIFF_FAIL=1 (simulated shallow clone / detached
#     HEAD), the selector falls back to selecting every case AND emits a
#     warning on stderr (mentioning shallow/detached/fallback).
# ---------------------------------------------------------------------------
STDOUT=$(mktemp); STDERR=$(mktemp)
set +e
env EVALS_FIXTURE_ROOT="$WORKDIR/fixtures" \
  EVALS_FAKE_GIT_DIFF_FAIL=1 \
  node "$SELECT" --print-selected >"$STDOUT" 2>"$STDERR"
SELECT_EXIT=$?
set -e

if [ "$SELECT_EXIT" -eq 0 ] \
  && grep -q "case-a" "$STDOUT" \
  && grep -q "case-b" "$STDOUT"; then
  pass "T1: git-diff failure falls back to selecting all cases (exit 0)"
else
  fail "T1: git-diff failure falls back to selecting all cases (exit=$SELECT_EXIT, stdout: $(tr '\n' '|' <"$STDOUT" | head -c 240))"
fi

if grep -qiE "shallow|detached|fallback|fall back|falling back" "$STDERR"; then
  pass "T2: warning on stderr names the fallback reason"
else
  fail "T2: warning on stderr names the fallback reason (stderr: $(tr '\n' '|' <"$STDERR" | head -c 240))"
fi

rm -f "$STDOUT" "$STDERR"

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
