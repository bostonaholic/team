#!/usr/bin/env bash
# Acceptance test for review-round-1 fix (B3 + B4):
#   B3: there is exactly ONE `spawn("claude"` invocation in `evals/lib/` —
#       judge.mjs no longer duplicates run-agent.mjs's CLI knowledge.
#   B4: `minimum_detection` from ground-truth.json drives the deterministic
#       pass threshold. A fixture with minimum_detection=0.5 passes at
#       50% detection; the prior hardcoded 1.0 would have failed it.
#
# Run from the repository root: bash tests/evals-cli-consolidation-tests.sh

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

LIB_DIR="$REPO_ROOT/evals/lib"

# ---------------------------------------------------------------------------
# T1: exactly ONE `spawn("claude"` (or `spawn('claude'`) invocation across
#     evals/lib/. The single point of CLI drift must stay single.
# ---------------------------------------------------------------------------
COUNT=$(grep -RE "spawn\(\s*[\"']claude[\"']" "$LIB_DIR" 2>/dev/null | wc -l | tr -d ' ')
if [ "$COUNT" = "1" ]; then
  pass "T1: exactly one spawn(\"claude\" invocation in evals/lib/"
else
  fail "T1: expected exactly one spawn(\"claude\" in evals/lib/, found $COUNT"
  grep -RnE "spawn\(\s*[\"']claude[\"']" "$LIB_DIR" 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# T2: that single invocation lives in run-agent.mjs (the documented home
#     of CLI knowledge).
# ---------------------------------------------------------------------------
HOMES=$(grep -lE "spawn\(\s*[\"']claude[\"']" "$LIB_DIR"/*.mjs 2>/dev/null || true)
if [ "$HOMES" = "$LIB_DIR/run-agent.mjs" ]; then
  pass "T2: the spawn(\"claude\" lives in run-agent.mjs"
else
  fail "T2: spawn(\"claude\" must live in run-agent.mjs (found in: $HOMES)"
fi

# ---------------------------------------------------------------------------
# T3: judge.mjs imports spawnClaude from run-agent.mjs (not constructing
#     its own spawn call). Defense-in-depth check for B3.
# ---------------------------------------------------------------------------
if grep -qE "import.*spawnClaude.*run-agent" "$LIB_DIR/judge.mjs"; then
  pass "T3: judge.mjs imports spawnClaude from run-agent.mjs"
else
  fail "T3: judge.mjs must import spawnClaude from run-agent.mjs"
fi

# ---------------------------------------------------------------------------
# T4: minimum_detection=0.5 in ground-truth permits a pass at 50% detection.
#     Build a 2-bug ground-truth where only ONE bug appears in agent output;
#     the deterministic score is 0.5. With minimum_detection=0.5 the
#     verdict must be 'pass'; the prior hardcoded 1.0 would have been 'fail'.
# ---------------------------------------------------------------------------
WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

RUBRIC="$WORKDIR/rubric.md"
cat >"$RUBRIC" <<'EOF'
---
agent: code-reviewer
---

# Rubric

1. Planted-bug detection (kind: deterministic)
EOF

GT="$WORKDIR/ground-truth.json"
cat >"$GT" <<'EOF'
{
  "bugs": [
    { "id": "b1", "category": "x", "severity": "high", "description": "x", "detection_hint": "null deref" },
    { "id": "b2", "category": "x", "severity": "high", "description": "x", "detection_hint": "off by one" }
  ],
  "minimum_detection": 0.5,
  "max_false_positives": 1
}
EOF

DRIVER="$WORKDIR/drive.mjs"
cat >"$DRIVER" <<EOF
import { runJudge } from "$REPO_ROOT/evals/lib/judge.mjs";
const out = "Found a null deref on line 42.";
const r = await runJudge({
  rubricPath: "$RUBRIC",
  agentOutput: out,
  groundTruthPath: "$GT"
});
console.log(JSON.stringify({verdict: r.verdict, score: r.criteria[0]?.score}));
EOF

set +e
RES=$(node "$DRIVER" 2>"$WORKDIR/err")
RES_CODE=$?
set -e

if [ "$RES_CODE" -eq 0 ] && echo "$RES" | grep -q '"verdict":"pass"'; then
  pass "T4: minimum_detection=0.5 in ground-truth honored (50% detection -> pass)"
else
  fail "T4: minimum_detection=0.5 honoring (exit=$RES_CODE; result: $RES; err: $(head -3 "$WORKDIR/err" | tr '\n' '|'))"
fi

# ---------------------------------------------------------------------------
# T5: minimum_detection=1.0 (default) still requires 100% detection. Same
#     2-bug ground-truth, this time threshold=1.0 -> verdict must be 'fail'.
# ---------------------------------------------------------------------------
GT_STRICT="$WORKDIR/ground-truth-strict.json"
cat >"$GT_STRICT" <<'EOF'
{
  "bugs": [
    { "id": "b1", "category": "x", "severity": "high", "description": "x", "detection_hint": "null deref" },
    { "id": "b2", "category": "x", "severity": "high", "description": "x", "detection_hint": "off by one" }
  ],
  "minimum_detection": 1.0,
  "max_false_positives": 1
}
EOF

DRIVER5="$WORKDIR/drive5.mjs"
cat >"$DRIVER5" <<EOF
import { runJudge } from "$REPO_ROOT/evals/lib/judge.mjs";
const out = "Found a null deref on line 42.";
const r = await runJudge({
  rubricPath: "$RUBRIC",
  agentOutput: out,
  groundTruthPath: "$GT_STRICT"
});
console.log(JSON.stringify({verdict: r.verdict, score: r.criteria[0]?.score}));
EOF

set +e
RES5=$(node "$DRIVER5" 2>"$WORKDIR/err5")
RES5_CODE=$?
set -e

if [ "$RES5_CODE" -eq 0 ] && echo "$RES5" | grep -q '"verdict":"fail"'; then
  pass "T5: minimum_detection=1.0 still requires 100% detection (50% -> fail)"
else
  fail "T5: minimum_detection=1.0 strictness (exit=$RES5_CODE; result: $RES5)"
fi

# ---------------------------------------------------------------------------
# T6: non-numeric minimum_detection at runtime is rejected by the judge.
# ---------------------------------------------------------------------------
GT_BAD="$WORKDIR/ground-truth-bad.json"
cat >"$GT_BAD" <<'EOF'
{
  "bugs": [{"id":"b1","category":"x","severity":"high","description":"x","detection_hint":"x"}],
  "minimum_detection": "not a number"
}
EOF

DRIVER6="$WORKDIR/drive6.mjs"
cat >"$DRIVER6" <<EOF
import { runJudge } from "$REPO_ROOT/evals/lib/judge.mjs";
try {
  await runJudge({
    rubricPath: "$RUBRIC",
    agentOutput: "",
    groundTruthPath: "$GT_BAD"
  });
  console.error("expected throw");
  process.exit(99);
} catch (err) {
  process.stderr.write(err.message + "\n");
  process.exit(2);
}
EOF

set +e
node "$DRIVER6" >/dev/null 2>"$WORKDIR/err6"
RES6_CODE=$?
set -e

if [ "$RES6_CODE" -eq 2 ] && grep -qE "minimum_detection" "$WORKDIR/err6"; then
  pass "T6: non-numeric minimum_detection rejected at runtime"
else
  fail "T6: non-numeric minimum_detection rejection (exit=$RES6_CODE; err: $(head -2 "$WORKDIR/err6" | tr '\n' '|'))"
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
