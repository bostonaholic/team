#!/usr/bin/env bash
# Acceptance test for Slice 1 (walking skeleton):
# `bash evals/e2e/run.sh code-reviewer` against the seeded fixture writes a
# schema-valid result JSON naming >= 1 rubric criterion with a numeric score,
# runs deterministically via EVALS_MOCK_AGENT + EVALS_MOCK_JUDGE, and exits
# with a documented code (0 = all rubric criteria pass).
#
# Runs without ANTHROPIC_API_KEY (mock seams short-circuit the model calls).
#
# Run from the repository root: bash tests/evals-walking-skeleton-tests.sh

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
# Workspace + mock outputs for a fully deterministic, offline run.
# Mock agent output mentions the detection hint ("null deref") that the
# seeded ground-truth uses, so the deterministic rubric criterion records a
# positive score. Mock judge returns a verdict with one named LLM criterion.
# ---------------------------------------------------------------------------
WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

MOCK_AGENT_OUT="$WORKDIR/mock-agent.txt"
cat >"$MOCK_AGENT_OUT" <<'EOF'
Found a null deref on line 42: the variable `user` may be null when
.email is accessed. Recommend a null check before dereferencing.
EOF

MOCK_JUDGE_OUT="$WORKDIR/mock-judge.json"
cat >"$MOCK_JUDGE_OUT" <<'EOF'
{
  "verdict": "pass",
  "criteria": [
    {
      "name": "reasoning_quality",
      "kind": "llm",
      "score": 4,
      "evidence": "Identifies the planted bug with a concrete line reference."
    }
  ]
}
EOF

RESULTS_DIR="$WORKDIR/results"
mkdir -p "$RESULTS_DIR"

# ---------------------------------------------------------------------------
# T1: entry script exists and is executable
# ---------------------------------------------------------------------------
if [ -f "$ENTRY" ]; then
  pass "T1: evals/e2e/run.sh exists"
else
  fail "T1: evals/e2e/run.sh exists (not found at $ENTRY)"
fi

# ---------------------------------------------------------------------------
# T2: run completes deterministically without ANTHROPIC_API_KEY using mock
#     seams. Documented exit codes per structure.md slice 1: 0 = pass,
#     non-zero = rubric failure. Either is accepted here; what we forbid is
#     a crash before producing a result JSON.
# ---------------------------------------------------------------------------
set +e
env -u ANTHROPIC_API_KEY \
  EVALS_MOCK_AGENT="$MOCK_AGENT_OUT" \
  EVALS_MOCK_JUDGE="$MOCK_JUDGE_OUT" \
  EVALS_RESULTS_ROOT="$RESULTS_DIR" \
  PERIODIC=1 \
  bash "$ENTRY" code-reviewer >"$WORKDIR/stdout.log" 2>"$WORKDIR/stderr.log"
ENTRY_EXIT=$?
set -e

if [ "$ENTRY_EXIT" -eq 0 ] || [ "$ENTRY_EXIT" -eq 2 ]; then
  pass "T2: entry script exits 0 or documented non-zero (rubric-failure) code (got $ENTRY_EXIT)"
else
  fail "T2: entry script exits 0 or documented non-zero (got $ENTRY_EXIT, stderr: $(cat "$WORKDIR/stderr.log" 2>/dev/null | head -5 | tr '\n' '|'))"
fi

# ---------------------------------------------------------------------------
# T3: a result JSON for the planted-null-deref case was written under
#     EVALS_RESULTS_ROOT and parses as valid JSON.
# ---------------------------------------------------------------------------
RESULT_FILE=$(find "$RESULTS_DIR" -name '*.json' -not -name '_partial-*.json' 2>/dev/null | head -1)
if [ -n "$RESULT_FILE" ] && [ -f "$RESULT_FILE" ]; then
  if node -e "JSON.parse(require('fs').readFileSync('$RESULT_FILE','utf8'))" >/dev/null 2>&1; then
    pass "T3: a result JSON was written and parses"
  else
    fail "T3: result JSON written but does not parse ($RESULT_FILE)"
  fi
else
  fail "T3: a result JSON was written (no *.json found under $RESULTS_DIR)"
fi

# ---------------------------------------------------------------------------
# T4: result JSON names at least one rubric criterion BY NAME with a numeric
#     score. Specific assertion: `criteria[]` is a non-empty array whose
#     first entry has a string `name` and a numeric `score`.
# ---------------------------------------------------------------------------
if [ -n "$RESULT_FILE" ] && [ -f "$RESULT_FILE" ]; then
  CHECK=$(node -e "
    const r = JSON.parse(require('fs').readFileSync('$RESULT_FILE','utf8'));
    if (!Array.isArray(r.criteria) || r.criteria.length === 0) { console.log('no-criteria'); process.exit(0); }
    const c = r.criteria[0];
    if (typeof c.name !== 'string' || c.name.length === 0) { console.log('no-name'); process.exit(0); }
    if (typeof c.score !== 'number') { console.log('no-score'); process.exit(0); }
    console.log('ok');
  " 2>/dev/null || echo "node-error")
  if [ "$CHECK" = "ok" ]; then
    pass "T4: result JSON names >= 1 criterion with a numeric score"
  else
    fail "T4: result JSON names >= 1 criterion with a numeric score (check: $CHECK)"
  fi
else
  fail "T4: result JSON names >= 1 criterion with a numeric score (no result file)"
fi

# ---------------------------------------------------------------------------
# T5: no ANTHROPIC_API_KEY was needed. The entry script must exist AND must
#     not abort with a missing-key message when mocks are active. The
#     "entry must exist" check prevents vacuous pass when the script is
#     missing (stderr is "No such file" — no key error, trivially).
# ---------------------------------------------------------------------------
if [ ! -f "$ENTRY" ]; then
  fail "T5: mock seams suppress the missing-ANTHROPIC_API_KEY abort path (entry script missing)"
elif grep -qiE "ANTHROPIC_API_KEY.*(required|missing)" "$WORKDIR/stderr.log" 2>/dev/null; then
  fail "T5: missing-key error must be suppressed when EVALS_MOCK_AGENT is set"
else
  pass "T5: mock seams suppress the missing-ANTHROPIC_API_KEY abort path"
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
