#!/usr/bin/env bash
# Acceptance tests for the artifact-frontmatter `topic` consistency fix
# (team-k02).
#
# Asserts that prompts make the topic-consistency invariant explicit so
# the questioner does not write inconsistent topics across task.md and
# questions.md, and the orchestrator does not improvise a topic when
# writing research.md.
#
# Run from the repository root: bash tests/topic-consistency-tests.sh

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

QUESTIONER="$REPO_ROOT/agents/questioner.md"
RESEARCHER="$REPO_ROOT/agents/researcher.md"
TEAM_RESEARCH="$REPO_ROOT/skills/team-research/SKILL.md"
QRSPI="$REPO_ROOT/skills/qrspi-workflow/SKILL.md"

# Flatten newlines so multi-line prose can be matched in one regex.
flat() {
  tr '\n' ' ' < "$1"
}

# ---------------------------------------------------------------------------
# T1: questioner.md states `topic` must be identical across task.md and
#     questions.md.
# ---------------------------------------------------------------------------
if flat "$QUESTIONER" | grep -qiE "topic[^.]{0,200}(identical|same|match)[^.]{0,200}(task\.md|questions\.md|both)"; then
  pass "T1: questioner requires identical topic across task.md and questions.md"
else
  fail "T1: questioner requires identical topic across task.md and questions.md"
fi

# ---------------------------------------------------------------------------
# T2: questioner.md says `topic` is the kebab portion of <id> (excludes
#     ticket prefix or date prefix).
# ---------------------------------------------------------------------------
if flat "$QUESTIONER" | grep -qiE "topic.{0,250}(kebab portion of \`?<id>|slug portion of \`?<id>|<id>.{0,40}minus the.{0,40}(ticket|date)|without the (ticket|date) prefix)"; then
  pass "T2: questioner ties topic to the kebab portion of <id>"
else
  fail "T2: questioner ties topic to the kebab portion of <id>"
fi

# ---------------------------------------------------------------------------
# T3: research.md authoring guidance specifies that `topic` must be
#     copied from questions.md (not improvised by the orchestrator).
# ---------------------------------------------------------------------------
if flat "$RESEARCHER" | grep -qiE "topic[^.]{0,200}(from|copy|read|same as|match)[^.]{0,200}questions\.md" \
   || flat "$TEAM_RESEARCH" | grep -qiE "topic[^.]{0,200}(from|copy|read|same as|match)[^.]{0,200}questions\.md"; then
  pass "T3: research.md frontmatter must reuse the topic from questions.md"
else
  fail "T3: research.md frontmatter must reuse the topic from questions.md"
fi

# ---------------------------------------------------------------------------
# T4: qrspi-workflow.md carries an explicit topic-consistency invariant
#     (not just the existing <id>-consistency rule).
# ---------------------------------------------------------------------------
if flat "$QRSPI" | grep -qiE "topic[^.]{0,200}(must|should)[^.]{0,200}(identical|same|match)[^.]{0,200}(across|every|all)[^.]{0,200}artifact"; then
  pass "T4: qrspi-workflow states topic-consistency invariant"
else
  fail "T4: qrspi-workflow states topic-consistency invariant"
fi

# ---------------------------------------------------------------------------
# T5: qrspi-workflow.md documents why ticketId is only on task.md.
# ---------------------------------------------------------------------------
if flat "$QRSPI" | grep -qiE "ticketId[^.]{0,200}(only|just)[^.]{0,200}task\.md|task\.md[^.]{0,200}(canonical|sole|only)[^.]{0,200}ticketId|<id>[^.]{0,200}already[^.]{0,200}(encode|carry|contain)[^.]{0,200}ticket"; then
  pass "T5: qrspi-workflow documents why ticketId lives only on task.md"
else
  fail "T5: qrspi-workflow documents why ticketId lives only on task.md"
fi

echo
if [ "$FAILURES" -gt 0 ]; then
  echo "FAILED: $FAILURES test(s) failed"
  exit 1
fi
echo "All tests passed"
