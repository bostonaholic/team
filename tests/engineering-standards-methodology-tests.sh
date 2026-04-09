#!/usr/bin/env bash
# Acceptance tests for engineering-standards methodology skill integration.
# Each test prints PASS or FAIL with its description.
# Exit code is non-zero if any test fails.
# Run from the repository root: bash tests/engineering-standards-methodology-tests.sh

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

SKILL_FILE="$REPO_ROOT/skills/engineering-standards/SKILL.md"

# ---------------------------------------------------------------------------
# T1: skill file exists with valid frontmatter
# ---------------------------------------------------------------------------
if [ -f "$SKILL_FILE" ] && head -10 "$SKILL_FILE" | grep -q "name: engineering-standards"; then
  pass "T1: skill file exists with valid frontmatter"
else
  fail "T1: skill file exists with valid frontmatter"
fi

# ---------------------------------------------------------------------------
# T2: skill contains all 6 philosopher names
# ---------------------------------------------------------------------------
T2_PASS=true
if [ -f "$SKILL_FILE" ]; then
  for name in "Hickey" "Carmack" "Armstrong" "Knuth" "Liskov" "Ousterhout"; do
    if ! grep -q "$name" "$SKILL_FILE"; then
      T2_PASS=false
      break
    fi
  done
else
  T2_PASS=false
fi

if [ "$T2_PASS" = "true" ]; then
  pass "T2: skill contains all 6 philosopher names"
else
  fail "T2: skill contains all 6 philosopher names"
fi

# ---------------------------------------------------------------------------
# T3: skill contains all 9 quality checklist items
# ---------------------------------------------------------------------------
T3_PASS=true
if [ -f "$SKILL_FILE" ]; then
  for item in "Single Responsibility" "Clear Naming" "No Magic Numbers" \
              "Explicit Error Handling" "Low Coupling" "Testability" \
              "Readability" "DRY" "Performance Awareness"; do
    if ! grep -q "$item" "$SKILL_FILE"; then
      T3_PASS=false
      break
    fi
  done
else
  T3_PASS=false
fi

if [ "$T3_PASS" = "true" ]; then
  pass "T3: skill contains all 9 quality checklist items"
else
  fail "T3: skill contains all 9 quality checklist items"
fi

# ---------------------------------------------------------------------------
# T4: skill contains role-specific sections
# ---------------------------------------------------------------------------
if [ -f "$SKILL_FILE" ] \
  && grep -q "When Implementing" "$SKILL_FILE" \
  && grep -q "When Reviewing" "$SKILL_FILE"; then
  pass "T4: skill contains role-specific sections"
else
  fail "T4: skill contains role-specific sections"
fi

# ---------------------------------------------------------------------------
# T5: planner.md references engineering-standards/SKILL.md
# ---------------------------------------------------------------------------
if grep -q "engineering-standards/SKILL.md" "$REPO_ROOT/agents/planner.md"; then
  pass "T5: planner.md references engineering-standards/SKILL.md"
else
  fail "T5: planner.md references engineering-standards/SKILL.md"
fi

# ---------------------------------------------------------------------------
# T6: implementer.md references engineering-standards/SKILL.md
# ---------------------------------------------------------------------------
if grep -q "engineering-standards/SKILL.md" "$REPO_ROOT/agents/implementer.md"; then
  pass "T6: implementer.md references engineering-standards/SKILL.md"
else
  fail "T6: implementer.md references engineering-standards/SKILL.md"
fi

# ---------------------------------------------------------------------------
# T7: code-reviewer.md references engineering-standards/SKILL.md
# ---------------------------------------------------------------------------
if grep -q "engineering-standards/SKILL.md" "$REPO_ROOT/agents/code-reviewer.md"; then
  pass "T7: code-reviewer.md references engineering-standards/SKILL.md"
else
  fail "T7: code-reviewer.md references engineering-standards/SKILL.md"
fi

# ---------------------------------------------------------------------------
# T8: architecture.md methodology table includes engineering-standards row with all 3
#     consumers (planner, implementer, code-reviewer)
# ---------------------------------------------------------------------------
T8_PASS=true

ENGINEERING_STANDARDS_ROW=$(grep "engineering-standards" "$REPO_ROOT/docs/architecture.md" \
  | grep -v "^#\|^>\|//\|event" | head -5 || true)

if [ -z "$ENGINEERING_STANDARDS_ROW" ]; then
  T8_PASS=false
else
  for agent in "planner" "implementer" "code-reviewer"; do
    if ! echo "$ENGINEERING_STANDARDS_ROW" | grep -q "$agent"; then
      T8_PASS=false
      break
    fi
  done
fi

if [ "$T8_PASS" = "true" ]; then
  pass "T8: architecture.md methodology table includes engineering-standards row with all 3 consumers"
else
  fail "T8: architecture.md methodology table includes engineering-standards row with all 3 consumers"
fi

# ---------------------------------------------------------------------------
# T9: architecture.md adversarial-review row unchanged
# ---------------------------------------------------------------------------
T9_PASS=true

ADVERSARIAL_ROW=$(grep "adversarial-review" "$REPO_ROOT/docs/architecture.md" \
  | grep -v "^#\|^>\|SKILL.md\|//\|event" | head -5 || true)

for agent in "code-reviewer" "security-reviewer" "ux-reviewer" "technical-writer"; do
  if ! echo "$ADVERSARIAL_ROW" | grep -q "$agent"; then
    T9_PASS=false
    break
  fi
done

if [ "$T9_PASS" = "true" ]; then
  pass "T9: architecture.md adversarial-review row unchanged"
else
  fail "T9: architecture.md adversarial-review row unchanged"
fi

# ---------------------------------------------------------------------------
# T10: skill defers to solid-principles for LSP/SRP
# ---------------------------------------------------------------------------
if [ -f "$SKILL_FILE" ] && grep -q "solid-principles/SKILL.md" "$SKILL_FILE"; then
  pass "T10: skill defers to solid-principles for LSP/SRP"
else
  fail "T10: skill defers to solid-principles for LSP/SRP"
fi

# ---------------------------------------------------------------------------
# T11: implementer.md still references solid-principles/SKILL.md (no regression)
# ---------------------------------------------------------------------------
if grep -q "solid-principles/SKILL.md" "$REPO_ROOT/agents/implementer.md"; then
  pass "T11: implementer.md still references solid-principles/SKILL.md"
else
  fail "T11: implementer.md still references solid-principles/SKILL.md"
fi

# ---------------------------------------------------------------------------
# T12: implementer.md still references refactoring-to-patterns/SKILL.md (no regression)
# ---------------------------------------------------------------------------
if grep -q "refactoring-to-patterns/SKILL.md" "$REPO_ROOT/agents/implementer.md"; then
  pass "T12: implementer.md still references refactoring-to-patterns/SKILL.md"
else
  fail "T12: implementer.md still references refactoring-to-patterns/SKILL.md"
fi

# ---------------------------------------------------------------------------
# T13: code-reviewer.md still references solid-principles/SKILL.md (no regression)
# ---------------------------------------------------------------------------
if grep -q "solid-principles/SKILL.md" "$REPO_ROOT/agents/code-reviewer.md"; then
  pass "T13: code-reviewer.md still references solid-principles/SKILL.md"
else
  fail "T13: code-reviewer.md still references solid-principles/SKILL.md"
fi

# ---------------------------------------------------------------------------
# T14: code-reviewer.md still references adversarial-review/SKILL.md (no regression)
# ---------------------------------------------------------------------------
if grep -q "adversarial-review/SKILL.md" "$REPO_ROOT/agents/code-reviewer.md"; then
  pass "T14: code-reviewer.md still references adversarial-review/SKILL.md"
else
  fail "T14: code-reviewer.md still references adversarial-review/SKILL.md"
fi

# ---------------------------------------------------------------------------
# T15: skill contains design-first workflow with all 5 steps
#   (1) "understand" or "requirements"
#   (2) "Design First" or "Design-First"
#   (3) "incrementally" or "incremental"
#   (4) "self-review" or "quality checklist"
#   (5) "explain decisions" or "trade-offs"
# ---------------------------------------------------------------------------
T15_PASS=true
if [ -f "$SKILL_FILE" ]; then
  grep -qiE "Design.First|Design-First" "$SKILL_FILE" || T15_PASS=false
  grep -qiE "understand|requirements" "$SKILL_FILE" || T15_PASS=false
  grep -qiE "incrementally|incremental" "$SKILL_FILE" || T15_PASS=false
  grep -qiE "self-review|quality checklist" "$SKILL_FILE" || T15_PASS=false
  grep -qiE "explain decisions|trade-offs" "$SKILL_FILE" || T15_PASS=false
else
  T15_PASS=false
fi

if [ "$T15_PASS" = "true" ]; then
  pass "T15: skill contains design-first workflow with all 5 steps"
else
  fail "T15: skill contains design-first workflow with all 5 steps"
fi

# ---------------------------------------------------------------------------
# T16: registry.json and plugin.json unchanged
# ---------------------------------------------------------------------------
T16_PASS=true
if git -C "$REPO_ROOT" diff --name-only | grep -q "skills/team/registry.json"; then
  T16_PASS=false
fi
if git -C "$REPO_ROOT" diff --name-only | grep -q ".claude-plugin/plugin.json"; then
  T16_PASS=false
fi

if [ "$T16_PASS" = "true" ]; then
  pass "T16: registry.json and plugin.json unchanged"
else
  fail "T16: registry.json and plugin.json unchanged"
fi

# ---------------------------------------------------------------------------
# T17: architecture.md methodology table includes solid-principles row
# ---------------------------------------------------------------------------
SOLID_ROW=$(grep "solid-principles" "$REPO_ROOT/docs/architecture.md" \
  | grep -v "^#\|^>\|//\|event" | head -5 || true)

if [ -n "$SOLID_ROW" ]; then
  pass "T17: architecture.md methodology table includes solid-principles row"
else
  fail "T17: architecture.md methodology table includes solid-principles row"
fi

# ---------------------------------------------------------------------------
# T18: architecture.md methodology table includes refactoring-to-patterns row
# ---------------------------------------------------------------------------
REFACTORING_ROW=$(grep "refactoring-to-patterns" "$REPO_ROOT/docs/architecture.md" \
  | grep -v "^#\|^>\|//\|event" | head -5 || true)

if [ -n "$REFACTORING_ROW" ]; then
  pass "T18: architecture.md methodology table includes refactoring-to-patterns row"
else
  fail "T18: architecture.md methodology table includes refactoring-to-patterns row"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
if [ "$FAILURES" -eq 0 ]; then
  echo "All tests passed."
  exit 0
else
  echo "$FAILURES test(s) failed."
  exit 1
fi
