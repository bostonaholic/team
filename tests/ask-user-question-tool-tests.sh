#!/usr/bin/env bash
# Acceptance tests for consistent use of Claude Code's AskUserQuestion
# tool at every multi-choice user prompt across the team pipeline
# (team-6ke).
#
# Per https://code.claude.com/docs/en/tools-reference, AskUserQuestion is
# the canonical Claude Code tool for multi-choice clarification. The
# design-author agent and the orchestrator skills surface several such
# prompts (open design questions, human gates for design/structure
# approval, worktree-vs-in-place, shipping options); they must all
# reference AskUserQuestion rather than free-text "ask the user".
#
# Run from the repository root:
#   bash tests/ask-user-question-tool-tests.sh

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

DESIGN_AUTHOR="$REPO_ROOT/agents/design-author.md"
TEAM_DESIGN="$REPO_ROOT/skills/team-design/SKILL.md"
TEAM_STRUCTURE="$REPO_ROOT/skills/team-structure/SKILL.md"
TEAM_IMPLEMENT="$REPO_ROOT/skills/team-implement/SKILL.md"
TEAM_PR="$REPO_ROOT/skills/team-pr/SKILL.md"
TEAM_SKILL="$REPO_ROOT/skills/team/SKILL.md"

# ---------------------------------------------------------------------------
# T1 — design-author declares AskUserQuestion in its tools list so the
# agent has access to the tool at runtime.
# ---------------------------------------------------------------------------
if awk '/^---$/{c++; next} c==1' "$DESIGN_AUTHOR" \
   | grep -qE '^tools:.*\bAskUserQuestion\b'; then
  pass "T1: design-author tools frontmatter includes AskUserQuestion"
else
  fail "T1: design-author tools frontmatter is missing AskUserQuestion"
fi

# ---------------------------------------------------------------------------
# T2 — design-author body documents the AskUserQuestion call shape so the
# interactive step is concrete (not a vague "ask the user" instruction).
# ---------------------------------------------------------------------------
if grep -q "AskUserQuestion" "$DESIGN_AUTHOR" \
   && grep -q '\boptions\b' "$DESIGN_AUTHOR"; then
  pass "T2: design-author body references AskUserQuestion + options"
else
  fail "T2: design-author body must document AskUserQuestion + options"
fi

# ---------------------------------------------------------------------------
# T3 — team-design's human gate uses AskUserQuestion (no free-text
# "Do you approve" prompt).
# ---------------------------------------------------------------------------
if grep -q "AskUserQuestion" "$TEAM_DESIGN"; then
  pass "T3: team-design SKILL references AskUserQuestion"
else
  fail "T3: team-design SKILL is missing AskUserQuestion at human gate"
fi

if grep -qE '"Do you[[:space:]]+approve' "$TEAM_DESIGN"; then
  fail "T3b: team-design SKILL still uses free-text 'Do you approve' prompt"
else
  pass "T3b: team-design SKILL replaced free-text approve prompt"
fi

# ---------------------------------------------------------------------------
# T4 — team-structure's human gate uses AskUserQuestion.
# ---------------------------------------------------------------------------
if grep -q "AskUserQuestion" "$TEAM_STRUCTURE"; then
  pass "T4: team-structure SKILL references AskUserQuestion"
else
  fail "T4: team-structure SKILL is missing AskUserQuestion at human gate"
fi

if grep -qE '"Do you[[:space:]]+approve' "$TEAM_STRUCTURE"; then
  fail "T4b: team-structure SKILL still uses free-text 'Do you approve' prompt"
else
  pass "T4b: team-structure SKILL replaced free-text approve prompt"
fi

# ---------------------------------------------------------------------------
# T5 — team-implement uses AskUserQuestion for the worktree-vs-in-place
# choice (multi-choice prompt).
# ---------------------------------------------------------------------------
if grep -q "AskUserQuestion" "$TEAM_IMPLEMENT"; then
  pass "T5: team-implement SKILL references AskUserQuestion"
else
  fail "T5: team-implement SKILL is missing AskUserQuestion for worktree choice"
fi

# ---------------------------------------------------------------------------
# T6 — team-pr presents shipping options via AskUserQuestion.
# ---------------------------------------------------------------------------
if grep -q "AskUserQuestion" "$TEAM_PR"; then
  pass "T6: team-pr SKILL references AskUserQuestion for shipping options"
else
  fail "T6: team-pr SKILL is missing AskUserQuestion for shipping options"
fi

# ---------------------------------------------------------------------------
# T7 — team orchestrator SKILL documents the AskUserQuestion convention
# in its Rules section so future maintainers see the expectation.
# ---------------------------------------------------------------------------
if grep -q "AskUserQuestion" "$TEAM_SKILL"; then
  pass "T7: team SKILL references AskUserQuestion at human gates"
else
  fail "T7: team SKILL must reference AskUserQuestion at human gates"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo
if [[ $FAILURES -eq 0 ]]; then
  echo "All tests passed"
  exit 0
else
  echo "$FAILURES test(s) failed"
  exit 1
fi
