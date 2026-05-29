#!/usr/bin/env bash
# Acceptance test for Slice 4 (named-criterion comparison):
# Given two fabricated result directories with: one criterion regressed,
# one improved, one new, one removed — `bash evals/e2e/compare.sh A B`
# names each by criterion + verdict change, and lists regressions FIRST.
#
# No model calls; this test fabricates JSON on disk and asserts the
# comparator's textual output.
#
# Run from the repository root: bash tests/evals-compare-tests.sh

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

COMPARE="$REPO_ROOT/evals/e2e/compare.sh"

# ---------------------------------------------------------------------------
# T0: compare entry script exists.
# ---------------------------------------------------------------------------
if [ -f "$COMPARE" ]; then
  pass "T0: evals/e2e/compare.sh exists"
else
  fail "T0: evals/e2e/compare.sh exists (not found at $COMPARE)"
fi

# ---------------------------------------------------------------------------
# Fabricate run-A (baseline) and run-B (new). Both share `case-x`. Criteria:
#   - bug_detection: 4 (A) -> 2 (B)        REGRESSED
#   - reasoning:     3 (A) -> 5 (B)        IMPROVED
#   - false_positive_rate: removed in B    REMOVED
#   - evidence_quality: new in B           ADDED
# ---------------------------------------------------------------------------
WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

RUN_A="$WORKDIR/run-a"
RUN_B="$WORKDIR/run-b"
mkdir -p "$RUN_A" "$RUN_B"

cat >"$RUN_A/case-x.json" <<'EOF'
{
  "schema_version": 1,
  "run_id": "a",
  "case": "case-x",
  "agent": "code-reviewer",
  "tier": "periodic",
  "verdict": "pass",
  "exit_reason": "ok",
  "timestamp": "2026-05-01T00:00:00Z",
  "criteria": [
    { "name": "bug_detection",        "kind": "deterministic", "score": 4, "evidence": "" },
    { "name": "reasoning",            "kind": "llm",           "score": 3, "evidence": "" },
    { "name": "false_positive_rate",  "kind": "deterministic", "score": 5, "evidence": "" }
  ]
}
EOF

cat >"$RUN_B/case-x.json" <<'EOF'
{
  "schema_version": 1,
  "run_id": "b",
  "case": "case-x",
  "agent": "code-reviewer",
  "tier": "periodic",
  "verdict": "fail",
  "exit_reason": "ok",
  "timestamp": "2026-05-28T00:00:00Z",
  "criteria": [
    { "name": "bug_detection",     "kind": "deterministic", "score": 2, "evidence": "" },
    { "name": "reasoning",         "kind": "llm",           "score": 5, "evidence": "" },
    { "name": "evidence_quality",  "kind": "llm",           "score": 4, "evidence": "" }
  ]
}
EOF

# ---------------------------------------------------------------------------
# Run compare A B. Some implementations exit non-zero when regressions
# exist; that's accepted. The contract is in the OUTPUT.
# ---------------------------------------------------------------------------
OUT_LOG=$(mktemp)
set +e
bash "$COMPARE" "$RUN_A" "$RUN_B" >"$OUT_LOG" 2>&1
set -e

# ---------------------------------------------------------------------------
# T1: bug_detection regression is named.
# ---------------------------------------------------------------------------
if grep -q "bug_detection" "$OUT_LOG"; then
  pass "T1: \`bug_detection\` regression is named in output"
else
  fail "T1: \`bug_detection\` regression is named in output (got: $(head -10 "$OUT_LOG" | tr '\n' '|'))"
fi

# ---------------------------------------------------------------------------
# T2: reasoning improvement is named.
# ---------------------------------------------------------------------------
if grep -q "reasoning" "$OUT_LOG"; then
  pass "T2: \`reasoning\` improvement is named in output"
else
  fail "T2: \`reasoning\` improvement is named in output"
fi

# ---------------------------------------------------------------------------
# T3: removed criterion `false_positive_rate` is reported.
# ---------------------------------------------------------------------------
if grep -q "false_positive_rate" "$OUT_LOG"; then
  pass "T3: removed criterion \`false_positive_rate\` is reported"
else
  fail "T3: removed criterion \`false_positive_rate\` is reported"
fi

# ---------------------------------------------------------------------------
# T4: added criterion `evidence_quality` is reported.
# ---------------------------------------------------------------------------
if grep -q "evidence_quality" "$OUT_LOG"; then
  pass "T4: added criterion \`evidence_quality\` is reported"
else
  fail "T4: added criterion \`evidence_quality\` is reported"
fi

# ---------------------------------------------------------------------------
# T5: regressions appear FIRST — bug_detection's line precedes reasoning's.
# ---------------------------------------------------------------------------
REG_LINE=$(grep -n "bug_detection" "$OUT_LOG" | head -1 | cut -d: -f1 || echo 99999)
IMP_LINE=$(grep -n "reasoning"     "$OUT_LOG" | head -1 | cut -d: -f1 || echo 0)
if [ -n "$REG_LINE" ] && [ -n "$IMP_LINE" ] && [ "$REG_LINE" -lt "$IMP_LINE" ]; then
  pass "T5: regressions appear before improvements in output (bug_detection@$REG_LINE < reasoning@$IMP_LINE)"
else
  fail "T5: regressions appear before improvements (bug_detection@$REG_LINE, reasoning@$IMP_LINE)"
fi

# ---------------------------------------------------------------------------
# T6: verdict change (pass -> fail) is surfaced.
# ---------------------------------------------------------------------------
if grep -qE "pass.*fail|verdict|→|->" "$OUT_LOG"; then
  pass "T6: verdict change is surfaced in output"
else
  fail "T6: verdict change is surfaced in output (got: $(head -10 "$OUT_LOG" | tr '\n' '|'))"
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
