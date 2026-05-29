#!/usr/bin/env bash
# Acceptance test for Slice 2 (gate tier):
# `bash evals/gate/run.sh` fails loud and names the offending field when a
# fixture, rubric, or ground-truth file is malformed. Drives the gate against
# a tempdir of seven malformed cases via EVALS_FIXTURE_ROOT override.
#
# Each case is asserted independently so the failure message points at the
# specific malformed property.
#
# Run from the repository root: bash tests/evals-gate-tests.sh

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

GATE="$REPO_ROOT/evals/gate/run.sh"

# ---------------------------------------------------------------------------
# T0: gate entry script exists.
# ---------------------------------------------------------------------------
if [ -f "$GATE" ]; then
  pass "T0: evals/gate/run.sh exists"
else
  fail "T0: evals/gate/run.sh exists (not found at $GATE)"
fi

# ---------------------------------------------------------------------------
# Helper: build a tempdir with one named-field defect and assert the gate
# exits non-zero with the named field appearing in stdout or stderr.
# Each case is its own tempdir so they remain independent.
# ---------------------------------------------------------------------------
run_gate_against() {
  local fixture_root="$1"
  local tag="$2"
  local needle="$3" # regex-ish substring expected to appear in the failure output

  if [ ! -f "$GATE" ]; then
    fail "$tag (gate script missing)"
    return
  fi

  local out_log
  out_log=$(mktemp)
  set +e
  env -u ANTHROPIC_API_KEY \
    EVALS_FIXTURE_ROOT="$fixture_root" \
    bash "$GATE" >"$out_log" 2>&1
  local code=$?
  set -e

  if [ "$code" -ne 0 ] && [ "$code" -ne 127 ] && grep -qE "$needle" "$out_log"; then
    pass "$tag"
  else
    fail "$tag (exit=$code, needle=$needle, output: $(tr '\n' '|' <"$out_log" | head -c 240))"
  fi
  rm -f "$out_log"
}

# Minimal valid rubric used to make non-rubric defect cases pass everything
# except the asserted defect. One numbered criterion is the gate's minimum.
make_valid_rubric() {
  local dir="$1"
  mkdir -p "$dir/rubrics"
  cat >"$dir/rubrics/code-reviewer.md" <<'EOF'
---
agent: code-reviewer
---

# Code reviewer rubric

1. Planted-bug detection (kind: deterministic)
2. Reasoning quality (kind: llm)
EOF
}

# Minimal valid ground-truth used to isolate non-ground-truth defects.
make_valid_ground_truth() {
  local dir="$1"
  cat >"$dir/ground-truth.json" <<'EOF'
{
  "bugs": [
    { "id": "b1", "category": "null", "severity": "high",
      "description": "null deref", "detection_hint": "null deref" }
  ],
  "minimum_detection": 1.0,
  "max_false_positives": 1
}
EOF
}

# Minimal valid input.md (frontmatter + body) used to isolate non-input defects.
make_valid_input() {
  local dir="$1"
  cat >"$dir/input.md" <<'EOF'
---
agent: code-reviewer
tier: periodic
deps:
  - agents/code-reviewer.md
---

# Synthetic implementer artifact

Has a null deref bug on line 42.
EOF
}

# ---------------------------------------------------------------------------
# T1: missing `agent:` in frontmatter is named.
# ---------------------------------------------------------------------------
ROOT_T1=$(mktemp -d)
mkdir -p "$ROOT_T1/fixtures/code-reviewer/case-a"
cat >"$ROOT_T1/fixtures/code-reviewer/case-a/input.md" <<'EOF'
---
tier: periodic
deps:
  - agents/code-reviewer.md
---

body
EOF
make_valid_ground_truth "$ROOT_T1/fixtures/code-reviewer/case-a"
make_valid_rubric "$ROOT_T1"
run_gate_against "$ROOT_T1" "T1: missing \`agent:\` is named in failure output" "agent"
rm -rf "$ROOT_T1"

# ---------------------------------------------------------------------------
# T2: missing `tier:` in frontmatter is named.
# ---------------------------------------------------------------------------
ROOT_T2=$(mktemp -d)
mkdir -p "$ROOT_T2/fixtures/code-reviewer/case-a"
cat >"$ROOT_T2/fixtures/code-reviewer/case-a/input.md" <<'EOF'
---
agent: code-reviewer
deps:
  - agents/code-reviewer.md
---

body
EOF
make_valid_ground_truth "$ROOT_T2/fixtures/code-reviewer/case-a"
make_valid_rubric "$ROOT_T2"
run_gate_against "$ROOT_T2" "T2: missing \`tier:\` is named in failure output" "tier"
rm -rf "$ROOT_T2"

# ---------------------------------------------------------------------------
# T3: malformed `deps:` (scalar instead of list) is named.
# ---------------------------------------------------------------------------
ROOT_T3=$(mktemp -d)
mkdir -p "$ROOT_T3/fixtures/code-reviewer/case-a"
cat >"$ROOT_T3/fixtures/code-reviewer/case-a/input.md" <<'EOF'
---
agent: code-reviewer
tier: periodic
deps: not-a-list
---

body
EOF
make_valid_ground_truth "$ROOT_T3/fixtures/code-reviewer/case-a"
make_valid_rubric "$ROOT_T3"
run_gate_against "$ROOT_T3" "T3: malformed \`deps:\` is named in failure output" "deps"
rm -rf "$ROOT_T3"

# ---------------------------------------------------------------------------
# T4: empty case directory is reported (no fixture file at all).
# ---------------------------------------------------------------------------
ROOT_T4=$(mktemp -d)
mkdir -p "$ROOT_T4/fixtures/code-reviewer/case-empty"
make_valid_rubric "$ROOT_T4"
run_gate_against "$ROOT_T4" "T4: empty case directory is reported" "case-empty|empty"
rm -rf "$ROOT_T4"

# ---------------------------------------------------------------------------
# T5: zero rubric criteria is reported.
# ---------------------------------------------------------------------------
ROOT_T5=$(mktemp -d)
mkdir -p "$ROOT_T5/fixtures/code-reviewer/case-a"
make_valid_input "$ROOT_T5/fixtures/code-reviewer/case-a"
make_valid_ground_truth "$ROOT_T5/fixtures/code-reviewer/case-a"
mkdir -p "$ROOT_T5/rubrics"
cat >"$ROOT_T5/rubrics/code-reviewer.md" <<'EOF'
---
agent: code-reviewer
---

# Code reviewer rubric

(no numbered criteria here)
EOF
run_gate_against "$ROOT_T5" "T5: zero rubric criteria is reported" "criteria|rubric"
rm -rf "$ROOT_T5"

# ---------------------------------------------------------------------------
# T6: ground-truth missing `bugs[]` or `minimum_detection` is named.
# ---------------------------------------------------------------------------
ROOT_T6=$(mktemp -d)
mkdir -p "$ROOT_T6/fixtures/code-reviewer/case-a"
make_valid_input "$ROOT_T6/fixtures/code-reviewer/case-a"
cat >"$ROOT_T6/fixtures/code-reviewer/case-a/ground-truth.json" <<'EOF'
{
  "max_false_positives": 1
}
EOF
make_valid_rubric "$ROOT_T6"
run_gate_against "$ROOT_T6" "T6: missing \`bugs[]\`/\`minimum_detection\` is named" "bugs|minimum_detection"
rm -rf "$ROOT_T6"

# ---------------------------------------------------------------------------
# T7: fixture file > 50 KB is rejected (size limit per design's resource limits).
# ---------------------------------------------------------------------------
ROOT_T7=$(mktemp -d)
mkdir -p "$ROOT_T7/fixtures/code-reviewer/case-big"
# 51 KB of body content: frontmatter + 51200-ish bytes of 'x's
{
  cat <<'EOF'
---
agent: code-reviewer
tier: periodic
deps:
  - agents/code-reviewer.md
---

EOF
  # 51 * 1024 = 52224 bytes of 'x'
  head -c 52224 /dev/zero | tr '\0' 'x'
  echo
} >"$ROOT_T7/fixtures/code-reviewer/case-big/input.md"
make_valid_ground_truth "$ROOT_T7/fixtures/code-reviewer/case-big"
make_valid_rubric "$ROOT_T7"
run_gate_against "$ROOT_T7" "T7: oversize fixture (>50 KB) is rejected by name" "50|size|too large|oversize"
rm -rf "$ROOT_T7"

# ---------------------------------------------------------------------------
# T8: gate emits `PASS  <desc>` lines on a fully-clean fixture tree. The
#     gate had previously been silent on success — a UX hazard for the
#     most-run command.
# ---------------------------------------------------------------------------
ROOT_T8=$(mktemp -d)
mkdir -p "$ROOT_T8/fixtures/code-reviewer/case-a"
make_valid_input "$ROOT_T8/fixtures/code-reviewer/case-a"
make_valid_ground_truth "$ROOT_T8/fixtures/code-reviewer/case-a"
make_valid_rubric "$ROOT_T8"

OUT_LOG_T8=$(mktemp)
set +e
env -u ANTHROPIC_API_KEY \
  EVALS_FIXTURE_ROOT="$ROOT_T8" \
  bash "$GATE" >"$OUT_LOG_T8" 2>&1
T8_CODE=$?
set -e

PASS_COUNT=$(grep -c '^PASS  ' "$OUT_LOG_T8" 2>/dev/null || echo 0)
if [ "$T8_CODE" -eq 0 ] && [ "${PASS_COUNT:-0}" -ge 4 ]; then
  pass "T8: gate emits PASS lines for each structural check ($PASS_COUNT PASS lines)"
else
  fail "T8: gate must emit PASS lines on success (exit=$T8_CODE; PASS count=$PASS_COUNT; output: $(tr '\n' '|' <"$OUT_LOG_T8" | head -c 360))"
fi
rm -f "$OUT_LOG_T8"
rm -rf "$ROOT_T8"

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
