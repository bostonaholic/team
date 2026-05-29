#!/usr/bin/env bash
# Acceptance tests for the agent-open-questions envelope protocol
# (topic surface-pipeline-open-questions).
#
# Asserts the structural contract introduced by the new shared skill:
# - `skills/agent-open-questions/SKILL.md` exists with proper YAML
#   frontmatter and documents the `openQuestions` envelope plus the
#   `SendMessage` resume mechanism and Decision 5 "first block wins"
#   parse rule.
# - `skills/team/SKILL.md` cross-links the new skill from the phase loop
#   and qualifies AskUserQuestion as the orchestrator's tool ("from the
#   orchestrator").
# - `skills/qrspi-workflow/SKILL.md` cross-links the new skill so the 11
#   unmigrated agents discover the protocol.
# - `CLAUDE.md` reflects the new skill count (28, not 27).
#
# Run from the repository root:
#   bash tests/agent-open-questions-protocol-tests.sh

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

AOQ_SKILL="$REPO_ROOT/skills/agent-open-questions/SKILL.md"
TEAM_SKILL="$REPO_ROOT/skills/team/SKILL.md"
QRSPI_SKILL="$REPO_ROOT/skills/qrspi-workflow/SKILL.md"
CLAUDE_MD="$REPO_ROOT/CLAUDE.md"

# ---------------------------------------------------------------------------
# T1 — The new shared skill file exists.
# ---------------------------------------------------------------------------
if [[ -f "$AOQ_SKILL" ]]; then
  pass "T1: skills/agent-open-questions/SKILL.md exists"
else
  fail "T1: skills/agent-open-questions/SKILL.md is missing"
fi

# ---------------------------------------------------------------------------
# T2 — Skill has YAML frontmatter with name: agent-open-questions.
# ---------------------------------------------------------------------------
if [[ -f "$AOQ_SKILL" ]] && \
   awk '/^---$/{c++; next} c==1' "$AOQ_SKILL" \
   | grep -qE '^name:[[:space:]]*agent-open-questions[[:space:]]*$'; then
  pass "T2: agent-open-questions frontmatter declares name: agent-open-questions"
else
  fail "T2: agent-open-questions frontmatter must declare name: agent-open-questions"
fi

# ---------------------------------------------------------------------------
# T3 — Skill has a non-empty `description:` field in frontmatter.
# ---------------------------------------------------------------------------
if [[ -f "$AOQ_SKILL" ]] && \
   awk '/^---$/{c++; next} c==1' "$AOQ_SKILL" \
   | grep -qE '^description:[[:space:]]*[^[:space:]]'; then
  pass "T3: agent-open-questions frontmatter has a non-empty description"
else
  fail "T3: agent-open-questions frontmatter must have a non-empty description"
fi

# ---------------------------------------------------------------------------
# T4 — Skill body references `openQuestions` (the envelope key).
# ---------------------------------------------------------------------------
if [[ -f "$AOQ_SKILL" ]] && grep -q "openQuestions" "$AOQ_SKILL"; then
  pass "T4: agent-open-questions body references openQuestions"
else
  fail "T4: agent-open-questions body must reference openQuestions"
fi

# ---------------------------------------------------------------------------
# T5 — Skill body references `SendMessage` (the resume mechanism).
# ---------------------------------------------------------------------------
if [[ -f "$AOQ_SKILL" ]] && grep -q "SendMessage" "$AOQ_SKILL"; then
  pass "T5: agent-open-questions body references SendMessage"
else
  fail "T5: agent-open-questions body must reference SendMessage"
fi

# ---------------------------------------------------------------------------
# T6 — Skill body states the Decision 5 first-block-wins parse rule:
# `first` and `block` appear near (within 5 lines of) `openQuestions`.
# ---------------------------------------------------------------------------
if [[ -f "$AOQ_SKILL" ]] && \
   grep -n "openQuestions" "$AOQ_SKILL" \
   | head -50 \
   | while IFS=: read -r ln _; do
       start=$((ln > 5 ? ln - 5 : 1))
       end=$((ln + 5))
       awk -v s="$start" -v e="$end" 'NR>=s && NR<=e' "$AOQ_SKILL"
     done \
   | grep -qi "first" \
   && \
   grep -n "openQuestions" "$AOQ_SKILL" \
   | head -50 \
   | while IFS=: read -r ln _; do
       start=$((ln > 5 ? ln - 5 : 1))
       end=$((ln + 5))
       awk -v s="$start" -v e="$end" 'NR>=s && NR<=e' "$AOQ_SKILL"
     done \
   | grep -qi "block"; then
  pass "T6: agent-open-questions states first-block-wins near openQuestions"
else
  fail "T6: agent-open-questions must state first-block-wins parse rule near openQuestions"
fi

# ---------------------------------------------------------------------------
# T7 — skills/team/SKILL.md cross-links agent-open-questions.
# ---------------------------------------------------------------------------
if grep -q "agent-open-questions" "$TEAM_SKILL"; then
  pass "T7: skills/team/SKILL.md cross-links agent-open-questions"
else
  fail "T7: skills/team/SKILL.md must cross-link agent-open-questions"
fi

# ---------------------------------------------------------------------------
# T8 — skills/team/SKILL.md canonical-tool passage carries the qualifier
# "from the orchestrator" so AskUserQuestion is scoped correctly.
# ---------------------------------------------------------------------------
if grep -q "from the orchestrator" "$TEAM_SKILL"; then
  pass "T8: skills/team/SKILL.md scopes AskUserQuestion 'from the orchestrator'"
else
  fail "T8: skills/team/SKILL.md must qualify AskUserQuestion as 'from the orchestrator'"
fi

# ---------------------------------------------------------------------------
# T9 — skills/qrspi-workflow/SKILL.md cross-links the new skill.
# ---------------------------------------------------------------------------
if grep -q "agent-open-questions" "$QRSPI_SKILL"; then
  pass "T9: skills/qrspi-workflow/SKILL.md cross-links agent-open-questions"
else
  fail "T9: skills/qrspi-workflow/SKILL.md must cross-link agent-open-questions"
fi

# ---------------------------------------------------------------------------
# T10 — CLAUDE.md reflects the new skill count: `## Skills (28)`.
# ---------------------------------------------------------------------------
if grep -qE '^## Skills \(28\)' "$CLAUDE_MD"; then
  pass "T10: CLAUDE.md has '## Skills (28)' heading"
else
  fail "T10: CLAUDE.md must have '## Skills (28)' heading (was 27)"
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
