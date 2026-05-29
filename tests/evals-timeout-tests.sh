#!/usr/bin/env bash
# Acceptance test for Slice 5 (per-case timeouts):
# When the agent subprocess runs past EVALS_TIMEOUT, the result records
# `exit_reason: 'timeout'` and case status `errored` (distinct from `failed`).
# Drives the timeout via a mock-agent script that sleeps past the limit.
#
# Run from the repository root: bash tests/evals-timeout-tests.sh

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
# Workspace: one fixture, sleeping mock agent, valid rubric and ground-truth.
# ---------------------------------------------------------------------------
WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

FIXTURES="$WORKDIR/fixtures"
mkdir -p "$FIXTURES/code-reviewer/case-slow"
cat >"$FIXTURES/code-reviewer/case-slow/input.md" <<'EOF'
---
agent: code-reviewer
tier: periodic
deps:
  - agents/code-reviewer.md
---

slow case
EOF
cat >"$FIXTURES/code-reviewer/case-slow/ground-truth.json" <<'EOF'
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

# Mock agent that sleeps for 5 seconds before producing output.
MOCK_AGENT="$WORKDIR/slow-agent.sh"
cat >"$MOCK_AGENT" <<'EOF'
#!/usr/bin/env bash
sleep 5
echo "Detected null deref."
EOF
chmod +x "$MOCK_AGENT"

# Mock judge (valid, but should not be reached on timeout).
MOCK_JUDGE="$WORKDIR/mock-judge.json"
cat >"$MOCK_JUDGE" <<'EOF'
{ "verdict": "pass", "criteria": [{ "name": "bug_detection", "kind": "deterministic", "score": 1, "evidence": "ok" }] }
EOF

RESULTS_ROOT="$WORKDIR/results"
mkdir -p "$RESULTS_ROOT"

# ---------------------------------------------------------------------------
# Run with EVALS_TIMEOUT=1 (seconds). The runner must kill the agent
# subprocess, record `exit_reason: 'timeout'`, status `errored`.
# ---------------------------------------------------------------------------
OUT_LOG=$(mktemp)
set +e
env -u ANTHROPIC_API_KEY \
  EVALS_FIXTURE_ROOT="$FIXTURES" \
  EVALS_RUBRIC_ROOT="$WORKDIR/rubrics" \
  EVALS_RESULTS_ROOT="$RESULTS_ROOT" \
  EVALS_MOCK_AGENT="$MOCK_AGENT" \
  EVALS_MOCK_JUDGE="$MOCK_JUDGE" \
  EVALS_TIMEOUT=1 \
  PERIODIC=1 \
  bash "$ENTRY" code-reviewer >"$OUT_LOG" 2>&1
RUN_EXIT=$?
set -e

RESULT_FILE=$(find "$RESULTS_ROOT" -name '*case-slow*.json' -not -name '_partial-*' 2>/dev/null | head -1)

# ---------------------------------------------------------------------------
# T1: a result JSON for case-slow was still written (graceful timeout, not
#     a crash that loses the per-case record).
# ---------------------------------------------------------------------------
if [ -n "$RESULT_FILE" ] && [ -f "$RESULT_FILE" ]; then
  pass "T1: timeout still produces a result JSON for the case"
else
  fail "T1: timeout still produces a result JSON for the case (no case-slow result; log: $(head -8 "$OUT_LOG" | tr '\n' '|'))"
fi

# ---------------------------------------------------------------------------
# T2: result.exit_reason === 'timeout'
# ---------------------------------------------------------------------------
if [ -n "$RESULT_FILE" ] && [ -f "$RESULT_FILE" ]; then
  EXIT_REASON=$(node -e "
    const r = JSON.parse(require('fs').readFileSync('$RESULT_FILE','utf8'));
    console.log(r.exit_reason);
  " 2>/dev/null || echo "node-error")
  if [ "$EXIT_REASON" = "timeout" ]; then
    pass "T2: result records exit_reason === 'timeout'"
  else
    fail "T2: result records exit_reason === 'timeout' (got: $EXIT_REASON)"
  fi
else
  fail "T2: result records exit_reason === 'timeout' (no result file)"
fi

# ---------------------------------------------------------------------------
# T3: result.status === 'errored' (distinct from 'failed').
# ---------------------------------------------------------------------------
if [ -n "$RESULT_FILE" ] && [ -f "$RESULT_FILE" ]; then
  STATUS=$(node -e "
    const r = JSON.parse(require('fs').readFileSync('$RESULT_FILE','utf8'));
    console.log(r.status);
  " 2>/dev/null || echo "node-error")
  if [ "$STATUS" = "errored" ]; then
    pass "T3: result records status === 'errored' (distinct from 'failed')"
  else
    fail "T3: result records status === 'errored' (got: $STATUS)"
  fi
else
  fail "T3: result records status === 'errored' (no result file)"
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
