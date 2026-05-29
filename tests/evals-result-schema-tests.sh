#!/usr/bin/env bash
# Acceptance test for Slice 1 (result schema):
# Pinned SCHEMA_VERSION = 1; required keys (`case`, `agent`, `tier`, `verdict`,
# `criteria[]`, `exit_reason`, `timestamp`, `run_id`) present on the written
# result JSON. Drives the walking-skeleton entry script via mock seams so this
# test stays offline.
#
# Run from the repository root: bash tests/evals-result-schema-tests.sh

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
# T0: precondition — result-store module exists.
# ---------------------------------------------------------------------------
if [ -f "$RESULT_STORE" ]; then
  pass "T0: evals/lib/result-store.mjs exists"
else
  fail "T0: evals/lib/result-store.mjs exists (not found at $RESULT_STORE)"
fi

# ---------------------------------------------------------------------------
# T1: SCHEMA_VERSION = 1 is pinned in the result-store module (constant in
#     source, not runtime-only).
# ---------------------------------------------------------------------------
if [ -f "$RESULT_STORE" ] && grep -qE "SCHEMA_VERSION[[:space:]]*=[[:space:]]*1" "$RESULT_STORE"; then
  pass "T1: SCHEMA_VERSION = 1 pinned in evals/lib/result-store.mjs"
else
  fail "T1: SCHEMA_VERSION = 1 pinned in evals/lib/result-store.mjs"
fi

# ---------------------------------------------------------------------------
# Workspace + mock outputs (identical seams to walking-skeleton test).
# ---------------------------------------------------------------------------
WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

MOCK_AGENT_OUT="$WORKDIR/mock-agent.txt"
printf 'Detected null deref at line 42.\n' >"$MOCK_AGENT_OUT"

MOCK_JUDGE_OUT="$WORKDIR/mock-judge.json"
cat >"$MOCK_JUDGE_OUT" <<'EOF'
{
  "verdict": "pass",
  "criteria": [
    { "name": "reasoning_quality", "kind": "llm", "score": 4, "evidence": "ok" }
  ]
}
EOF

RESULTS_DIR="$WORKDIR/results"
mkdir -p "$RESULTS_DIR"

set +e
env -u ANTHROPIC_API_KEY \
  EVALS_MOCK_AGENT="$MOCK_AGENT_OUT" \
  EVALS_MOCK_JUDGE="$MOCK_JUDGE_OUT" \
  EVALS_RESULTS_ROOT="$RESULTS_DIR" \
  PERIODIC=1 \
  bash "$ENTRY" code-reviewer >/dev/null 2>"$WORKDIR/stderr.log"
set -e

RESULT_FILE=$(find "$RESULTS_DIR" -name '*.json' -not -name '_partial-*.json' 2>/dev/null | head -1)

# ---------------------------------------------------------------------------
# T2: a result JSON was written (precondition for the schema checks below).
# ---------------------------------------------------------------------------
if [ -n "$RESULT_FILE" ] && [ -f "$RESULT_FILE" ]; then
  pass "T2: result JSON was written"
else
  fail "T2: result JSON was written (no *.json under $RESULTS_DIR)"
fi

# ---------------------------------------------------------------------------
# T3..T10: each required top-level key is present on the parsed result.
#     Per structure.md slice 1: case, agent, tier, verdict, criteria[],
#     exit_reason, timestamp, run_id. We also assert schema_version === 1
#     to verify the pin is honored at write time.
# ---------------------------------------------------------------------------
assert_key() {
  local key="$1"
  local kind="$2" # string | array | any | number
  local tag="$3"
  if [ -z "$RESULT_FILE" ] || [ ! -f "$RESULT_FILE" ]; then
    fail "$tag (no result file)"
    return
  fi
  local out
  out=$(node -e "
    const r = JSON.parse(require('fs').readFileSync('$RESULT_FILE','utf8'));
    const v = r['$key'];
    if (v === undefined) { console.log('missing'); process.exit(0); }
    if ('$kind' === 'array' && !Array.isArray(v)) { console.log('not-array'); process.exit(0); }
    if ('$kind' === 'string' && typeof v !== 'string') { console.log('not-string'); process.exit(0); }
    if ('$kind' === 'number' && typeof v !== 'number') { console.log('not-number'); process.exit(0); }
    console.log('ok');
  " 2>/dev/null || echo "node-error")
  if [ "$out" = "ok" ]; then
    pass "$tag"
  else
    fail "$tag (check: $out)"
  fi
}

assert_key "case"        "string" "T3: required key \`case\` present (string)"
assert_key "agent"       "string" "T4: required key \`agent\` present (string)"
assert_key "tier"        "string" "T5: required key \`tier\` present (string)"
assert_key "verdict"     "string" "T6: required key \`verdict\` present (string)"
assert_key "criteria"    "array"  "T7: required key \`criteria\` present (array)"
assert_key "exit_reason" "string" "T8: required key \`exit_reason\` present (string)"
assert_key "timestamp"   "string" "T9: required key \`timestamp\` present (string)"
assert_key "run_id"      "string" "T10: required key \`run_id\` present (string)"

# ---------------------------------------------------------------------------
# T11: schema_version === 1 in the written result (the pin is honored at
#      write time, not just declared in source).
# ---------------------------------------------------------------------------
if [ -n "$RESULT_FILE" ] && [ -f "$RESULT_FILE" ]; then
  SV=$(node -e "
    const r = JSON.parse(require('fs').readFileSync('$RESULT_FILE','utf8'));
    console.log(r.schema_version);
  " 2>/dev/null || echo "node-error")
  if [ "$SV" = "1" ]; then
    pass "T11: schema_version === 1 in written result"
  else
    fail "T11: schema_version === 1 in written result (got: $SV)"
  fi
else
  fail "T11: schema_version === 1 in written result (no result file)"
fi

# ---------------------------------------------------------------------------
# T12: oversize rubric (>50 KB) is rejected at runtime by the judge. We
#      drive runJudge directly with an oversize rubric file and expect
#      a fail-fast error naming the cap.
# ---------------------------------------------------------------------------
OVERSIZE_DIR="$WORKDIR/oversize"
mkdir -p "$OVERSIZE_DIR"

OVERSIZE_RUBRIC="$OVERSIZE_DIR/rubric.md"
{
  echo "---"
  echo "agent: code-reviewer"
  echo "---"
  echo ""
  echo "# Oversize rubric"
  echo ""
  echo "1. Reasoning quality (kind: llm)"
  # Pad past the 50 KB cap.
  head -c 52224 /dev/zero | tr '\0' 'x'
  echo ""
} >"$OVERSIZE_RUBRIC"

OVERSIZE_GT="$OVERSIZE_DIR/ground-truth.json"
cat >"$OVERSIZE_GT" <<'EOF'
{
  "bugs": [{"id":"b1","category":"x","severity":"high","description":"x","detection_hint":"x"}],
  "minimum_detection": 1.0,
  "max_false_positives": 1
}
EOF

DRIVER12="$OVERSIZE_DIR/drive.mjs"
cat >"$DRIVER12" <<EOF
import { runJudge } from "$REPO_ROOT/evals/lib/judge.mjs";
try {
  await runJudge({
    rubricPath: "$OVERSIZE_RUBRIC",
    agentOutput: "",
    groundTruthPath: "$OVERSIZE_GT"
  });
  console.error("expected throw");
  process.exit(99);
} catch (err) {
  process.stderr.write(err.message + "\n");
  process.exit(2);
}
EOF

set +e
node "$DRIVER12" >/dev/null 2>"$OVERSIZE_DIR/err"
T12_CODE=$?
set -e

if [ "$T12_CODE" -eq 2 ] && grep -qE "too large|50|cap" "$OVERSIZE_DIR/err"; then
  pass "T12: oversize rubric (>50 KB) is rejected at runtime by judge"
else
  fail "T12: oversize rubric rejection (exit=$T12_CODE; err: $(head -2 "$OVERSIZE_DIR/err" 2>/dev/null | tr '\n' '|' | head -c 240))"
fi

# ---------------------------------------------------------------------------
# T13: oversize ground-truth (>50 KB) is rejected at runtime by the judge.
# ---------------------------------------------------------------------------
OVERSIZE_GT_BIG="$OVERSIZE_DIR/ground-truth-big.json"
# Make the file > 50 KB by padding the description field.
node -e "
const fs = require('fs');
const pad = 'x'.repeat(60000);
const gt = {
  bugs: [{id:'b1',category:'x',severity:'high',description:pad,detection_hint:'x'}],
  minimum_detection: 1.0,
  max_false_positives: 1
};
fs.writeFileSync('$OVERSIZE_GT_BIG', JSON.stringify(gt));
"

SMALL_RUBRIC="$OVERSIZE_DIR/small-rubric.md"
cat >"$SMALL_RUBRIC" <<'EOF'
---
agent: code-reviewer
---

# Small rubric

1. Reasoning quality (kind: llm)
EOF

DRIVER13="$OVERSIZE_DIR/drive13.mjs"
cat >"$DRIVER13" <<EOF
import { runJudge } from "$REPO_ROOT/evals/lib/judge.mjs";
try {
  await runJudge({
    rubricPath: "$SMALL_RUBRIC",
    agentOutput: "",
    groundTruthPath: "$OVERSIZE_GT_BIG"
  });
  console.error("expected throw");
  process.exit(99);
} catch (err) {
  process.stderr.write(err.message + "\n");
  process.exit(2);
}
EOF

set +e
node "$DRIVER13" >/dev/null 2>"$OVERSIZE_DIR/err13"
T13_CODE=$?
set -e

if [ "$T13_CODE" -eq 2 ] && grep -qE "too large|50|cap" "$OVERSIZE_DIR/err13"; then
  pass "T13: oversize ground-truth (>50 KB) is rejected at runtime by judge"
else
  fail "T13: oversize ground-truth rejection (exit=$T13_CODE; err: $(head -2 "$OVERSIZE_DIR/err13" 2>/dev/null | tr '\n' '|' | head -c 240))"
fi

# ---------------------------------------------------------------------------
# T14: parseRubric joins wrapped continuation lines into a single
#      description (M7). A criterion whose description wraps onto an
#      indented next line must still parse with the trailing text included.
# ---------------------------------------------------------------------------
WRAP_DIR="$WORKDIR/wrap"
mkdir -p "$WRAP_DIR"
WRAP_RUBRIC="$WRAP_DIR/rubric.md"
cat >"$WRAP_RUBRIC" <<'EOF'
---
agent: code-reviewer
---

# Rubric

1. Reasoning quality (kind: llm) — should identify the planted bug
   with concrete evidence and a line reference.
2. Coverage (kind: deterministic)
EOF

DRIVER14="$WRAP_DIR/drive.mjs"
cat >"$DRIVER14" <<EOF
import { parseRubric } from "$REPO_ROOT/evals/lib/judge.mjs";
import { readFileSync } from "node:fs";
const r = parseRubric(readFileSync("$WRAP_RUBRIC", "utf8"));
console.log(JSON.stringify(r.criteria.map(c => ({ name: c.name, description: c.description }))));
EOF

set +e
WRAP_OUT=$(node "$DRIVER14" 2>"$WRAP_DIR/err")
WRAP_CODE=$?
set -e

if [ "$WRAP_CODE" -eq 0 ] \
  && echo "$WRAP_OUT" | grep -q "concrete evidence" \
  && echo "$WRAP_OUT" | grep -q "line reference"; then
  pass "T14: parseRubric joins wrapped continuation lines into description"
else
  fail "T14: parseRubric continuation joining (exit=$WRAP_CODE; out: $(echo "$WRAP_OUT" | head -c 360))"
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
