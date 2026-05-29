#!/usr/bin/env bash
# evals/gate/run.sh — gate tier: structural assertions only.
#
# No model calls. Runs fast (<5s on the real fixture tree). Fails loud
# when a fixture, rubric, or ground-truth file is malformed.
#
# Environment:
#   EVALS_FIXTURE_ROOT  override the fixtures + rubrics root (tests).
#                       When set, the directory layout is:
#                         <root>/fixtures/<agent>/<case>/{input.md,ground-truth.json}
#                         <root>/rubrics/<agent>.md
#
# Exit codes:
#   0  every fixture, rubric, and ground-truth passes structural checks
#   1  one or more checks failed (messages name the offending field+file)
#
# Run from the repository root: bash evals/gate/run.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FAILURES=0

pass() {
  echo "PASS  $1"
}

fail() {
  echo "FAIL  $1"
  FAILURES=$((FAILURES + 1))
}

# Root resolution: EVALS_FIXTURE_ROOT (tests) overrides the in-repo path.
if [ -n "${EVALS_FIXTURE_ROOT:-}" ]; then
  ROOT="$EVALS_FIXTURE_ROOT"
else
  ROOT="$REPO_ROOT/evals"
fi

FIXTURES_DIR="$ROOT/fixtures"
RUBRICS_DIR="$ROOT/rubrics"

if [ ! -d "$FIXTURES_DIR" ]; then
  fail "fixtures directory missing at $FIXTURES_DIR"
fi

# ---------------------------------------------------------------------------
# Frontmatter isolation (copy of the awk snippet from
# tests/product-thinking-methodology-tests.sh — shared convention, not
# shared code, per repo's no-sourced-helpers pattern).
# ---------------------------------------------------------------------------
extract_frontmatter() {
  awk 'NR==1 && $0=="---"{f=1;next} f && $0=="---"{exit} f{print}' "$1"
}

# Check whether a key appears in the YAML frontmatter at top-level.
frontmatter_has_key() {
  local file="$1"
  local key="$2"
  extract_frontmatter "$file" | grep -qE "^${key}:( |$)"
}

# Return the trimmed value of a scalar key, or empty if not scalar.
frontmatter_value() {
  local file="$1"
  local key="$2"
  extract_frontmatter "$file" \
    | awk -v k="$key" '
        $0 ~ "^"k":" {
          sub("^"k":[[:space:]]*", "");
          print;
          exit
        }
      '
}

# Determine whether `deps:` is a YAML list of strings (deps: followed by
# `  - <value>` lines). Returns 0 (true) if list-shaped, 1 otherwise.
deps_is_list() {
  local file="$1"
  extract_frontmatter "$file" | awk '
    /^deps:[[:space:]]*$/ { in_deps = 1; next }
    in_deps && /^[[:space:]]+-[[:space:]]+/ { found = 1; next }
    in_deps && /^[A-Za-z0-9_-]+:/ { in_deps = 0 }
    END { exit (found ? 0 : 1) }
  '
}

# Whether the file has a `deps:` key at all.
frontmatter_has_deps() {
  local file="$1"
  extract_frontmatter "$file" | grep -qE "^deps:"
}

# ---------------------------------------------------------------------------
# Walk every agent directory under fixtures/.
# ---------------------------------------------------------------------------
AGENT_COUNT=0
if [ -d "$FIXTURES_DIR" ]; then
  for AGENT_DIR in "$FIXTURES_DIR"/*/; do
    [ -d "$AGENT_DIR" ] || continue
    AGENT_COUNT=$((AGENT_COUNT + 1))
    AGENT_NAME="$(basename "$AGENT_DIR")"

    # ---------------- Rubric checks (one per agent) ----------------
    RUBRIC_FILE="$RUBRICS_DIR/${AGENT_NAME}.md"
    if [ ! -f "$RUBRIC_FILE" ]; then
      fail "missing rubric for agent: $AGENT_NAME (expected $RUBRIC_FILE)"
    else
      # Body of the rubric (excluding frontmatter) must contain >= 1
      # numbered criterion line: lines starting with `<digit>.`.
      RUBRIC_BODY=$(awk 'NR==1 && $0=="---"{f=1;next} f && $0=="---"{f=2;next} f==2{print}' "$RUBRIC_FILE")
      CRIT_COUNT=$(echo "$RUBRIC_BODY" | grep -cE '^[[:space:]]*[0-9]+\.' || true)
      if [ "${CRIT_COUNT:-0}" -lt 1 ]; then
        fail "rubric for $AGENT_NAME has zero numbered criteria (file: $RUBRIC_FILE)"
      fi
    fi

    # ---------------- Per-case checks ----------------
    for CASE_DIR in "$AGENT_DIR"*/; do
      [ -d "$CASE_DIR" ] || continue
      CASE_NAME="$(basename "$CASE_DIR")"
      INPUT_FILE="$CASE_DIR/input.md"
      GROUND_TRUTH_FILE="$CASE_DIR/ground-truth.json"

      # Empty case directory: no fixture file at all.
      if [ ! -f "$INPUT_FILE" ]; then
        fail "empty case directory: $CASE_NAME (missing input.md at $INPUT_FILE)"
        continue
      fi

      # Frontmatter must declare agent, tier, and deps.
      if ! frontmatter_has_key "$INPUT_FILE" "agent"; then
        fail "missing field: agent in $INPUT_FILE"
      fi
      if ! frontmatter_has_key "$INPUT_FILE" "tier"; then
        fail "missing field: tier in $INPUT_FILE"
      fi
      if ! frontmatter_has_deps "$INPUT_FILE"; then
        fail "missing field: deps in $INPUT_FILE"
      elif ! deps_is_list "$INPUT_FILE"; then
        fail "malformed field: deps must be a YAML list of strings in $INPUT_FILE"
      fi

      # 50 KB ceiling on the fixture body to bound judge prompts.
      SIZE=$(wc -c <"$INPUT_FILE" | tr -d ' ')
      if [ "$SIZE" -gt 51200 ]; then
        fail "oversize fixture: $INPUT_FILE is $SIZE bytes (>50 KB cap)"
      fi

      # Ground-truth schema (only when present — design pattern #5
      # requires it for code-reviewer; structural slot is the same).
      if [ -f "$GROUND_TRUTH_FILE" ]; then
        if ! node -e "
          const d = JSON.parse(require('fs').readFileSync('$GROUND_TRUTH_FILE','utf8'));
          if (!Array.isArray(d.bugs) || d.bugs.length === 0) { console.log('missing bugs'); process.exit(1); }
          if (typeof d.minimum_detection !== 'number') { console.log('missing minimum_detection'); process.exit(1); }
          " >/tmp/.evals-gate-gt.$$ 2>&1; then
          REASON=$(cat /tmp/.evals-gate-gt.$$ 2>/dev/null || echo "parse error")
          if echo "$REASON" | grep -q "bugs"; then
            fail "ground-truth missing bugs[]: $GROUND_TRUTH_FILE"
          elif echo "$REASON" | grep -q "minimum_detection"; then
            fail "ground-truth missing minimum_detection: $GROUND_TRUTH_FILE"
          else
            fail "ground-truth malformed: $GROUND_TRUTH_FILE ($REASON)"
          fi
          rm -f /tmp/.evals-gate-gt.$$
        fi
      else
        # Ground-truth is required for code-reviewer fixtures per design.
        fail "missing bugs/minimum_detection: ground-truth.json not found at $GROUND_TRUTH_FILE"
      fi
    done
  done
fi

if [ "$AGENT_COUNT" -eq 0 ]; then
  fail "no agent fixture directories found under $FIXTURES_DIR"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
if [ "$FAILURES" -eq 0 ]; then
  echo "gate: all structural checks passed."
  exit 0
else
  echo "gate: $FAILURES check(s) failed."
  exit 1
fi
