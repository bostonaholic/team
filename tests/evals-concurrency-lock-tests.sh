#!/usr/bin/env bash
# Acceptance test for Slice 5 (concurrency lock):
# Two runners against the same <run-id> directory fail fast via an atomic
# `lock` file. The second exits non-zero with "run in progress" on stderr.
#
# Strategy: pre-create the lock file (simulating a runner already in flight)
# and invoke the entry script against that run-id. The contract is observable
# without backgrounding a real process.
#
# Run from the repository root: bash tests/evals-concurrency-lock-tests.sh

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

# ---------------------------------------------------------------------------
# T0: entry script exists (precondition).
# ---------------------------------------------------------------------------
if [ -f "$ENTRY" ]; then
  pass "T0: evals/e2e/run.sh exists"
else
  fail "T0: evals/e2e/run.sh exists"
fi

# ---------------------------------------------------------------------------
# Workspace
# ---------------------------------------------------------------------------
WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

FIXTURES="$WORKDIR/fixtures"
mkdir -p "$FIXTURES/code-reviewer/case-a"
cat >"$FIXTURES/code-reviewer/case-a/input.md" <<'EOF'
---
agent: code-reviewer
tier: periodic
deps:
  - agents/code-reviewer.md
---

case a
EOF
cat >"$FIXTURES/code-reviewer/case-a/ground-truth.json" <<'EOF'
{
  "bugs": [{"id":"b1","category":"null","severity":"high",
            "description":"null deref","detection_hint":"null deref"}],
  "minimum_detection": 1.0,
  "max_false_positives": 1
}
EOF

mkdir -p "$WORKDIR/rubrics"
cat >"$WORKDIR/rubrics/code-reviewer.md" <<'EOF'
---
agent: code-reviewer
---

# Rubric

1. Planted-bug detection (kind: deterministic)
EOF

RESULTS_ROOT="$WORKDIR/results"
RUN_ID="locked-run"
RUN_DIR="$RESULTS_ROOT/$RUN_ID"
mkdir -p "$RUN_DIR"
# Pre-existing lock — simulates a runner already in flight.
echo "$$" >"$RUN_DIR/lock"

MOCK_AGENT_OUT="$WORKDIR/mock-agent.txt"
echo "Detected null deref." >"$MOCK_AGENT_OUT"
MOCK_JUDGE="$WORKDIR/mock-judge.json"
echo '{"verdict":"pass","criteria":[{"name":"bug_detection","kind":"deterministic","score":1,"evidence":"ok"}]}' >"$MOCK_JUDGE"

# ---------------------------------------------------------------------------
# T1: invoking the runner against the locked <run-id> exits non-zero and
#     names "run in progress" (or equivalent) on stderr.
# ---------------------------------------------------------------------------
OUT_LOG=$(mktemp); ERR_LOG=$(mktemp)
set +e
env -u ANTHROPIC_API_KEY \
  EVALS_FIXTURE_ROOT="$FIXTURES" \
  EVALS_RUBRIC_ROOT="$WORKDIR/rubrics" \
  EVALS_RESULTS_ROOT="$RESULTS_ROOT" \
  EVALS_MOCK_AGENT="$MOCK_AGENT_OUT" \
  EVALS_MOCK_JUDGE="$MOCK_JUDGE" \
  EVALS_RUN_ID="$RUN_ID" \
  PERIODIC=1 \
  bash "$ENTRY" code-reviewer >"$OUT_LOG" 2>"$ERR_LOG"
LOCK_EXIT=$?
set -e

# T1: locked run-id causes the runner to exit non-zero AND it's NOT a
# "command not found" (127) — that would just mean the script is missing.
if [ "$LOCK_EXIT" -ne 0 ] && [ "$LOCK_EXIT" -ne 127 ]; then
  pass "T1: locked run-id causes the runner to exit non-zero (got $LOCK_EXIT)"
else
  fail "T1: locked run-id causes the runner to exit non-zero with a real signal (got $LOCK_EXIT)"
fi

if grep -qiE "run in progress|lock|already running" "$ERR_LOG" "$OUT_LOG"; then
  pass "T2: error message names 'run in progress' (or equivalent lock signal)"
else
  fail "T2: error message names 'run in progress' (stdout: $(tr '\n' '|' <"$OUT_LOG" | head -c 200); stderr: $(tr '\n' '|' <"$ERR_LOG" | head -c 200))"
fi

# ---------------------------------------------------------------------------
# T3: when the lock is released (file removed), a subsequent invocation
#     does NOT exit with "run in progress" (sanity check on the contract).
# ---------------------------------------------------------------------------
rm -f "$RUN_DIR/lock"
OUT_LOG2=$(mktemp); ERR_LOG2=$(mktemp)
set +e
env -u ANTHROPIC_API_KEY \
  EVALS_FIXTURE_ROOT="$FIXTURES" \
  EVALS_RUBRIC_ROOT="$WORKDIR/rubrics" \
  EVALS_RESULTS_ROOT="$RESULTS_ROOT" \
  EVALS_MOCK_AGENT="$MOCK_AGENT_OUT" \
  EVALS_MOCK_JUDGE="$MOCK_JUDGE" \
  EVALS_RUN_ID="$RUN_ID" \
  PERIODIC=1 \
  bash "$ENTRY" code-reviewer >"$OUT_LOG2" 2>"$ERR_LOG2"
RELEASED_EXIT=$?
set -e

if [ ! -f "$ENTRY" ]; then
  fail "T3: with lock removed, runner does not report 'run in progress' (entry script missing)"
elif ! grep -qiE "run in progress|already running" "$ERR_LOG2" "$OUT_LOG2"; then
  pass "T3: with lock removed, runner does not report 'run in progress'"
else
  fail "T3: with lock removed, runner should not report 'run in progress' (exit=$RELEASED_EXIT)"
fi

rm -f "$OUT_LOG" "$ERR_LOG" "$OUT_LOG2" "$ERR_LOG2"

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
