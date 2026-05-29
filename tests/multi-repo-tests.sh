#!/usr/bin/env bash
# Acceptance tests for multi-repo topic support.
#
# Asserts that the QRSPI pipeline carries the multi-repo extension end to
# end: the questioner can write `repos.md`, the design-author confirms it,
# the worktree skill creates a worktree per repo, the structure/planner
# annotate slices and steps with [repo: <name>], the implementer cd's
# between worktrees, and team-pr opens cross-linked PRs.
#
# Run from the repository root: bash tests/multi-repo-tests.sh

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

QRSPI="$REPO_ROOT/skills/qrspi-workflow/SKILL.md"
WORKTREE_ISO="$REPO_ROOT/skills/worktree-isolation/SKILL.md"
TEAM_WT="$REPO_ROOT/skills/team-worktree/SKILL.md"
TEAM_IMPL="$REPO_ROOT/skills/team-implement/SKILL.md"
TEAM_PR="$REPO_ROOT/skills/team-pr/SKILL.md"
TEAM_RES="$REPO_ROOT/skills/team-research/SKILL.md"
TEAM="$REPO_ROOT/skills/team/SKILL.md"
QUESTIONER="$REPO_ROOT/agents/questioner.md"
DESIGN_AUTHOR="$REPO_ROOT/agents/design-author.md"
RESEARCHER="$REPO_ROOT/agents/researcher.md"
FILE_FINDER="$REPO_ROOT/agents/file-finder.md"
STRUCTURE_PLANNER="$REPO_ROOT/agents/structure-planner.md"
PLANNER="$REPO_ROOT/agents/planner.md"
IMPLEMENTER="$REPO_ROOT/agents/implementer.md"

# T1 — qrspi-workflow documents repos.md as an artifact and gives a schema
if grep -q "repos.md" "$QRSPI" \
  && grep -q "phase: repos" "$QRSPI"; then
  pass "T1: qrspi-workflow documents repos.md artifact + schema"
else
  fail "T1: qrspi-workflow does not document repos.md schema"
fi

# T2 — worktree-isolation explains multi-repo topology
if grep -q "Multi-repo" "$WORKTREE_ISO" \
  && grep -q "one worktree per listed repo" "$WORKTREE_ISO"; then
  pass "T2: worktree-isolation documents multi-repo topology"
else
  fail "T2: worktree-isolation does not document multi-repo topology"
fi

# T3 — team-worktree reads repos.md and creates per-repo worktrees
if grep -q "repos.md" "$TEAM_WT" \
  && grep -Eq "git -C .* worktree add" "$TEAM_WT"; then
  pass "T3: team-worktree reads repos.md and runs per-repo worktree add"
else
  fail "T3: team-worktree does not handle multi-repo worktree creation"
fi

# T4 — team-worktree records per-repo worktree paths back into repos.md
if grep -q "## Worktrees" "$TEAM_WT"; then
  pass "T4: team-worktree records ## Worktrees section in repos.md"
else
  fail "T4: team-worktree does not record worktree paths back into repos.md"
fi

# T5 — questioner does NOT have AskUserQuestion in tools (subagents emit
# the envelope; the orchestrator renders the prompt) AND has a multi-repo
# detection step that uses the openQuestions envelope protocol.
T5_TOOLS_OK=0
T5_BODY_OK=0
if awk '/^---$/{c++; next} c==1' "$QUESTIONER" \
   | grep -qE '^tools:.*\bAskUserQuestion\b'; then
  T5_TOOLS_OK=0
else
  T5_TOOLS_OK=1
fi
if grep -q "Multi-repo detection" "$QUESTIONER" \
   && grep -q "openQuestions" "$QUESTIONER" \
   && grep -q "agent-open-questions" "$QUESTIONER" \
   && grep -q "Repos" "$QUESTIONER"; then
  T5_BODY_OK=1
fi
if [[ $T5_TOOLS_OK -eq 1 && $T5_BODY_OK -eq 1 ]]; then
  pass "T5: questioner excludes AskUserQuestion + multi-repo detection uses openQuestions envelope"
else
  fail "T5: questioner must exclude AskUserQuestion from tools AND use openQuestions envelope for multi-repo detection"
fi

# T6 — design-author confirms repo scope before drafting
if grep -q "Confirm repo scope" "$DESIGN_AUTHOR"; then
  pass "T6: design-author confirms repo scope before drafting"
else
  fail "T6: design-author does not confirm repo scope"
fi

# T7 — researcher and file-finder may read repos.md (scope-not-intent)
if grep -q "repos.md" "$RESEARCHER" \
  && grep -q "scope, not intent" "$RESEARCHER"; then
  pass "T7: researcher allowed to read repos.md (scope, not intent)"
else
  fail "T7: researcher does not document repos.md as readable scope"
fi
if grep -q "repos.md" "$FILE_FINDER"; then
  pass "T7b: file-finder references repos.md"
else
  fail "T7b: file-finder does not reference repos.md"
fi

# T8 — team-research passes repos.md path alongside questions.md
if grep -q "repos.md" "$TEAM_RES"; then
  pass "T8: team-research includes repos.md path in dispatch"
else
  fail "T8: team-research does not include repos.md path"
fi

# T9 — structure-planner and planner support [repo: <name>] / Repos: field
if grep -q "Repos:" "$STRUCTURE_PLANNER"; then
  pass "T9a: structure-planner supports per-slice Repos: field"
else
  fail "T9a: structure-planner does not support Repos: field"
fi
if grep -q "\[repo: <slug>\]\|\[repo: " "$PLANNER"; then
  pass "T9b: planner uses [repo: <slug>] step prefix"
else
  fail "T9b: planner does not use [repo: <slug>] step prefix"
fi

# T10 — implementer cd's between worktrees per [repo: <slug>] annotation
if grep -q "\[repo: <slug>\]\|\[repo: " "$IMPLEMENTER" \
  && grep -q "cd " "$IMPLEMENTER"; then
  pass "T10: implementer cd's into per-repo worktrees per step"
else
  fail "T10: implementer does not cd between per-repo worktrees"
fi

# T11 — team-implement detects multi-repo mode and refuses in-place when
# repos.md is present
if grep -q "repos.md" "$TEAM_IMPL" \
  && grep -q "multi-repo work requires worktrees" "$TEAM_IMPL"; then
  pass "T11: team-implement detects multi-repo and refuses in-place"
else
  fail "T11: team-implement does not enforce worktrees for multi-repo"
fi

# T12 — team-pr opens cross-linked PRs in multi-repo mode
if grep -q "Companion PRs" "$TEAM_PR" \
  && grep -q "one PR per repo" "$TEAM_PR"; then
  pass "T12: team-pr opens cross-linked PRs in multi-repo mode"
else
  fail "T12: team-pr does not open cross-linked multi-repo PRs"
fi

# T13 — main team SKILL describes multi-repo flow in WORKTREE and PR phases
if grep -q "Multi-repo topics" "$TEAM" \
  && grep -q "multi-repo mode" "$TEAM"; then
  pass "T13: team SKILL describes multi-repo flow"
else
  fail "T13: team SKILL does not describe multi-repo flow"
fi

if [[ $FAILURES -eq 0 ]]; then
  echo
  echo "All tests passed"
  exit 0
fi
echo
echo "$FAILURES test(s) failed"
exit 1
