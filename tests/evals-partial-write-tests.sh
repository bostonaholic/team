#!/usr/bin/env bash
# Acceptance test for Slice 5 (partial-write resume):
# A killed run leaves a parseable `_partial-e2e.json` checkpoint on disk
# (atomic .tmp + rename), and `--resume <run-id>` picks up where it left
# off without re-invoking cases already recorded as completed.
#
# Strategy: fabricate a `_partial-e2e.json` listing one completed case,
# point a tempdir fixture root at two cases (one already completed,
# one new), and wire EVALS_MOCK_AGENT to a script that exits 1 if invoked
# for the completed case — the test fails loudly if the resumer redoes work.
#
# Run from the repository root: bash tests/evals-partial-write-tests.sh

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
RESULT_STORE="$REPO_ROOT/evals/lib/result-store.mjs"

# ---------------------------------------------------------------------------
# T0: entry script and result-store module exist.
# ---------------------------------------------------------------------------
if [ -f "$ENTRY" ]; then
  pass "T0a: evals/e2e/run.sh exists"
else
  fail "T0a: evals/e2e/run.sh exists"
fi
if [ -f "$RESULT_STORE" ]; then
  pass "T0b: evals/lib/result-store.mjs exists"
else
  fail "T0b: evals/lib/result-store.mjs exists"
fi

# ---------------------------------------------------------------------------
# Workspace: two fixtures, a results root, a pre-fabricated partial.
# ---------------------------------------------------------------------------
WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

FIXTURES="$WORKDIR/fixtures"
mkdir -p "$FIXTURES/code-reviewer/case-done"
cat >"$FIXTURES/code-reviewer/case-done/input.md" <<'EOF'
---
agent: code-reviewer
tier: periodic
deps:
  - agents/code-reviewer.md
---

case done
EOF
cat >"$FIXTURES/code-reviewer/case-done/ground-truth.json" <<'EOF'
{
  "bugs": [{"id":"b1","category":"null","severity":"high",
            "description":"null deref","detection_hint":"null deref"}],
  "minimum_detection": 1.0,
  "max_false_positives": 1
}
EOF

mkdir -p "$FIXTURES/code-reviewer/case-new"
cat >"$FIXTURES/code-reviewer/case-new/input.md" <<'EOF'
---
agent: code-reviewer
tier: periodic
deps:
  - agents/code-reviewer.md
---

case new
EOF
cat >"$FIXTURES/code-reviewer/case-new/ground-truth.json" <<'EOF'
{
  "bugs": [{"id":"b1","category":"null","severity":"high",
            "description":"null deref","detection_hint":"null deref"}],
  "minimum_detection": 1.0,
  "max_false_positives": 1
}
EOF

# Minimal rubric
mkdir -p "$WORKDIR/rubrics"
cat >"$WORKDIR/rubrics/code-reviewer.md" <<'EOF'
---
agent: code-reviewer
---

# Rubric

1. Planted-bug detection (kind: deterministic)
EOF

RESULTS_ROOT="$WORKDIR/results"
RUN_ID="resume-run"
RUN_DIR="$RESULTS_ROOT/$RUN_ID"
mkdir -p "$RUN_DIR"

cat >"$RUN_DIR/_partial-e2e.json" <<EOF
{
  "schema_version": 1,
  "run_id": "$RUN_ID",
  "completed_cases": ["case-done"]
}
EOF

# ---------------------------------------------------------------------------
# Mock agent: aware-of-case. If invoked for case-done, exits 1 with a
# diagnostic — that's a regression. For case-new, prints valid output.
# The test seam passes the case name via EVALS_MOCK_AGENT_CASE_NAME
# OR via the mock script reading a $1 arg; we accept either signal.
# Simplest: write a tiny aware mock that the runner is expected to point
# at via EVALS_MOCK_AGENT. We use a script that examines $EVALS_CASE_NAME.
# ---------------------------------------------------------------------------
MOCK_AGENT="$WORKDIR/mock-agent.sh"
cat >"$MOCK_AGENT" <<'EOF'
#!/usr/bin/env bash
# Receives the case name via EVALS_CASE_NAME env (set by the runner per case).
# This is a stricter contract than the walking-skeleton mock; the runner is
# expected to expose the case name so a sleep/exit-by-case mock works.
if [ "${EVALS_CASE_NAME:-}" = "case-done" ]; then
  echo "ERROR: case-done was re-invoked but should have been skipped" >&2
  exit 1
fi
echo "Detected null deref in case-new."
exit 0
EOF
chmod +x "$MOCK_AGENT"

MOCK_JUDGE="$WORKDIR/mock-judge.json"
cat >"$MOCK_JUDGE" <<'EOF'
{
  "verdict": "pass",
  "criteria": [
    { "name": "bug_detection", "kind": "deterministic", "score": 1, "evidence": "ok" }
  ]
}
EOF

# ---------------------------------------------------------------------------
# T1: --resume <run-id> on a partial run does not re-invoke completed cases.
#     If the mock exits 1 for case-done, the runner observed it -> regression.
# ---------------------------------------------------------------------------
OUT_LOG=$(mktemp)
set +e
env -u ANTHROPIC_API_KEY \
  EVALS_FIXTURE_ROOT="$FIXTURES" \
  EVALS_RUBRIC_ROOT="$WORKDIR/rubrics" \
  EVALS_RESULTS_ROOT="$RESULTS_ROOT" \
  EVALS_MOCK_AGENT="$MOCK_AGENT" \
  EVALS_MOCK_JUDGE="$MOCK_JUDGE" \
  PERIODIC=1 \
  bash "$ENTRY" code-reviewer --resume "$RUN_ID" >"$OUT_LOG" 2>&1
RESUME_EXIT=$?
set -e

if grep -q "case-done was re-invoked" "$OUT_LOG"; then
  fail "T1: --resume skips already-completed cases (case-done was re-invoked)"
elif [ "$RESUME_EXIT" -ne 0 ] && [ "$RESUME_EXIT" -ne 2 ]; then
  fail "T1: --resume exits 0 or 2 (got $RESUME_EXIT, log: $(head -10 "$OUT_LOG" | tr '\n' '|'))"
else
  pass "T1: --resume skips already-completed cases"
fi

# ---------------------------------------------------------------------------
# T2: a fresh result file for case-new exists after the resume run.
# ---------------------------------------------------------------------------
NEW_RESULT=$(find "$RUN_DIR" -name '*case-new*.json' -not -name '_partial-*' 2>/dev/null | head -1)
if [ -n "$NEW_RESULT" ] && [ -f "$NEW_RESULT" ]; then
  pass "T2: resume produced a result for the new case"
else
  fail "T2: resume produced a result for the new case (no case-new result under $RUN_DIR)"
fi

# ---------------------------------------------------------------------------
# T3: the partial JSON parses as valid JSON (atomic .tmp + rename contract:
#     readers never see a half-written file). We assert this independently
#     by writing a partial via the result-store API and re-reading it.
# ---------------------------------------------------------------------------
PARTIAL_TEST_DIR="$WORKDIR/partial-test"
mkdir -p "$PARTIAL_TEST_DIR"
WRITE_PARTIAL_SCRIPT="$WORKDIR/write-partial.mjs"
cat >"$WRITE_PARTIAL_SCRIPT" <<EOF
import { writePartial } from "$RESULT_STORE";
await writePartial("$PARTIAL_TEST_DIR", {
  run_id: "test",
  schema_version: 1,
  completed_cases: ["a", "b"]
});
EOF
set +e
node "$WRITE_PARTIAL_SCRIPT" 2>/tmp/.evals-partial-write.$$.err
WP_EXIT=$?
set -e

if [ "$WP_EXIT" -eq 0 ] \
  && [ -f "$PARTIAL_TEST_DIR/_partial-e2e.json" ] \
  && node -e "JSON.parse(require('fs').readFileSync('$PARTIAL_TEST_DIR/_partial-e2e.json','utf8'))" >/dev/null 2>&1; then
  pass "T3: writePartial produces a parseable _partial-e2e.json (atomic write)"
else
  fail "T3: writePartial produces a parseable _partial-e2e.json (exit=$WP_EXIT, err: $(head -3 /tmp/.evals-partial-write.$$.err 2>/dev/null | tr '\n' '|'))"
fi
rm -f "/tmp/.evals-partial-write.$$.err"

# ---------------------------------------------------------------------------
# T4: a stray .tmp file from a torn write does not leak. After writePartial,
#     no _partial-e2e.json.tmp should be left behind.
# ---------------------------------------------------------------------------
if [ ! -f "$RESULT_STORE" ]; then
  fail "T4: no stray .tmp file after writePartial (result-store module missing)"
elif [ -f "$PARTIAL_TEST_DIR/_partial-e2e.json.tmp" ]; then
  fail "T4: stray .tmp file from torn write is cleaned up"
else
  pass "T4: no stray .tmp file after writePartial"
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
