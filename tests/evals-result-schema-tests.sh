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
