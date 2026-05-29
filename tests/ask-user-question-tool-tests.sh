#!/usr/bin/env bash
# Acceptance tests for the AskUserQuestion contract across the team
# pipeline (post topic surface-pipeline-open-questions).
#
# The contract: subagents do NOT call AskUserQuestion. Instead, subagents
# that need user input emit an `openQuestions` envelope per
# `skills/agent-open-questions/SKILL.md` and the orchestrator renders the
# prompt via AskUserQuestion on their behalf. The orchestrator skills
# (team-design, team-structure, team-implement, team-pr, team) keep
# calling AskUserQuestion directly at their documented gates.
#
# Summary: subagents emit the openQuestions envelope; only the
# orchestrator calls AskUserQuestion.
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
QUESTIONER="$REPO_ROOT/agents/questioner.md"
TEAM_DESIGN="$REPO_ROOT/skills/team-design/SKILL.md"
TEAM_STRUCTURE="$REPO_ROOT/skills/team-structure/SKILL.md"
TEAM_IMPLEMENT="$REPO_ROOT/skills/team-implement/SKILL.md"
TEAM_PR="$REPO_ROOT/skills/team-pr/SKILL.md"
TEAM_SKILL="$REPO_ROOT/skills/team/SKILL.md"

# ---------------------------------------------------------------------------
# T1 — design-author's tools frontmatter must NOT include AskUserQuestion.
# Subagents emit the envelope; the orchestrator renders the prompt.
# ---------------------------------------------------------------------------
if awk '/^---$/{c++; next} c==1' "$DESIGN_AUTHOR" \
   | grep -qE '^tools:.*\bAskUserQuestion\b'; then
  fail "T1: design-author tools frontmatter must NOT include AskUserQuestion"
else
  pass "T1: design-author tools frontmatter excludes AskUserQuestion"
fi

# ---------------------------------------------------------------------------
# T2 — design-author's body documents the envelope protocol: it references
# the `openQuestions` key and loads the agent-open-questions skill.
# ---------------------------------------------------------------------------
if grep -q "openQuestions" "$DESIGN_AUTHOR" \
   && grep -q "agent-open-questions" "$DESIGN_AUTHOR"; then
  pass "T2: design-author body references openQuestions + agent-open-questions"
else
  fail "T2: design-author body must reference openQuestions + agent-open-questions"
fi

# ---------------------------------------------------------------------------
# T3 — team-design's human gate uses AskUserQuestion (no free-text
# "Do you approve" prompt). This is an orchestrator site and stays.
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
# T4 — team-structure's human gate uses AskUserQuestion. Orchestrator site.
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
# choice. Orchestrator site.
# ---------------------------------------------------------------------------
if grep -q "AskUserQuestion" "$TEAM_IMPLEMENT"; then
  pass "T5: team-implement SKILL references AskUserQuestion"
else
  fail "T5: team-implement SKILL is missing AskUserQuestion for worktree choice"
fi

# ---------------------------------------------------------------------------
# T6 — team-pr presents shipping options via AskUserQuestion. Orchestrator
# site.
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
# T8 — questioner's tools frontmatter must NOT include AskUserQuestion.
# Subagents emit the envelope; the orchestrator renders the prompt.
# ---------------------------------------------------------------------------
if awk '/^---$/{c++; next} c==1' "$QUESTIONER" \
   | grep -qE '^tools:.*\bAskUserQuestion\b'; then
  fail "T8: questioner tools frontmatter must NOT include AskUserQuestion"
else
  pass "T8: questioner tools frontmatter excludes AskUserQuestion"
fi

# ---------------------------------------------------------------------------
# T9 — questioner's body documents the envelope protocol: references the
# `openQuestions` key and loads the agent-open-questions skill.
# ---------------------------------------------------------------------------
if grep -q "openQuestions" "$QUESTIONER" \
   && grep -q "agent-open-questions" "$QUESTIONER"; then
  pass "T9: questioner body references openQuestions + agent-open-questions"
else
  fail "T9: questioner body must reference openQuestions + agent-open-questions"
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
