#!/usr/bin/env bash
# Acceptance tests for the simplify-orchestration refactor.
#
# This script is the immutable scope fence for the 9-slice strangler-fig
# rewrite that replaces the events.jsonl event log with a state.json snapshot
# plus .approved sidecar markers. When every assertion here passes, the
# refactor is done.
#
# Fails loudly on the first failing assertion (set -e). Run from the
# repository root: bash tests/simplify-orchestration-acceptance.sh
#
# Plan: docs/plans/2026-04-22-simplify-orchestration-plan.md
# Structure: docs/plans/2026-04-22-simplify-orchestration-structure.md
# Design: docs/plans/2026-04-22-simplify-orchestration-design.md

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

TEST_TOPIC="_test_slice1"
TEST_STATE_DIR="${HOME}/.team/${TEST_TOPIC}"

cleanup() {
  command rm -rf "${TEST_STATE_DIR}" 2>/dev/null || true
}
trap cleanup EXIT

section() {
  echo ""
  echo "=============================================================="
  echo "  $1"
  echo "=============================================================="
}

assert() {
  # usage: assert "<description>" <command...>
  local desc="$1"
  shift
  echo "  - ${desc}"
  if ! "$@"; then
    echo ""
    echo "FAIL: ${desc}"
    echo "  command: $*"
    exit 1
  fi
}

assert_shell() {
  # usage: assert_shell "<description>" "<shell expression>"
  local desc="$1"
  local expr="$2"
  echo "  - ${desc}"
  if ! bash -c "set -euo pipefail; ${expr}"; then
    echo ""
    echo "FAIL: ${desc}"
    echo "  expression: ${expr}"
    exit 1
  fi
}

# =============================================================================
# Slice 1: state.json schema + helper module (write-only)
# =============================================================================
section "Slice 1: lib/state.mjs helper and 10-field schema"

assert "lib/state.mjs file exists" \
  test -f lib/state.mjs

# initState('_test_slice1', null, '2026-04-22') must produce a 10-field
# snapshot with phase=QUESTION and designRevisionCount=0. Run the exact
# one-liner from the plan's Slice 1 verification.
cleanup
assert_shell "initState creates 10-field snapshot with phase=QUESTION" \
  "node -e \"import('./lib/state.mjs').then(m => m.initState('${TEST_TOPIC}', null, '2026-04-22').then(() => m.readState('${TEST_TOPIC}'))).then(s => { if (s.phase !== 'QUESTION' || s.designRevisionCount !== 0 || Object.keys(s).length !== 10) process.exit(1); })\""

assert_shell "state.json jq keys length is 10" \
  "[ \"\$(jq 'keys | length' '${TEST_STATE_DIR}/state.json')\" = '10' ]"

cleanup

# =============================================================================
# Slice 5: router SKILL.md no longer references events.jsonl
# =============================================================================
section "Slice 5: router rewritten to phase-table loop (no events.jsonl)"

assert_shell "skills/team/SKILL.md contains zero 'events.jsonl' references" \
  "[ \"\$(grep -c events.jsonl skills/team/SKILL.md)\" = '0' ]"

# =============================================================================
# Slice 6: nine team-<phase> entry points dropped events.jsonl scans
# =============================================================================
section "Slice 6: partial entry-point skills gate on artifacts, not events"

assert_shell "grep -r events.jsonl skills/team-*/SKILL.md returns no matches" \
  "! grep -r events.jsonl skills/team-*/SKILL.md"

# =============================================================================
# Slice 7: lib/events.mjs deleted, hooks compile and stay under line targets
# =============================================================================
section "Slice 7: lib/events.mjs removed, hooks stateless"

assert "lib/events.mjs no longer exists" \
  test ! -f lib/events.mjs

assert "hooks/pre-compact-anchor.mjs parses with node --check" \
  node --check hooks/pre-compact-anchor.mjs

assert "hooks/session-start-recover.mjs parses with node --check" \
  node --check hooks/session-start-recover.mjs

assert_shell "hooks/pre-compact-anchor.mjs is <= 60 lines" \
  "lines=\$(wc -l < hooks/pre-compact-anchor.mjs); [ \"\$lines\" -le 60 ]"

assert_shell "hooks/session-start-recover.mjs is <= 80 lines" \
  "lines=\$(wc -l < hooks/session-start-recover.mjs); [ \"\$lines\" -le 80 ]"

assert_shell "no source files import lib/events (excluding docs/plans and tests)" \
  "! grep -rn 'lib/events' hooks/ skills/ agents/ .claude/"

# =============================================================================
# Slice 8: teamflow/ tree deleted
# =============================================================================
section "Slice 8: teamflow/ dev sidecar removed"

assert "teamflow/ directory no longer exists" \
  test ! -d teamflow

assert_shell "no JSON/MJS/TS files under repo reference teamflow" \
  "! grep -R teamflow . --include='*.json' --include='*.mjs' --include='*.mts' --include='*.ts' --exclude-dir=plans --exclude-dir=node_modules --exclude-dir=.git"

# =============================================================================
# Slice 9: documentation sync and registry $comment
# =============================================================================
section "Slice 9: docs purged of events.jsonl + Teamflow; registry annotated"

# Exclude docs/plans/ — plan artifacts are a historical record and are
# expected to reference events.jsonl and Teamflow.
assert_shell "docs/ and CLAUDE.md contain zero 'events.jsonl' references (excluding docs/plans/)" \
  "! grep -rn --exclude-dir=plans events.jsonl docs/ CLAUDE.md"

assert_shell "docs/ and CLAUDE.md contain zero 'teamflow' references (case-insensitive, excluding docs/plans/)" \
  "! grep -rn -i --exclude-dir=plans teamflow docs/ CLAUDE.md"

assert_shell "skills/team/registry.json has a non-null \$comment top-level field" \
  "val=\$(jq '.[\"\$comment\"]' skills/team/registry.json); [ \"\$val\" != 'null' ] && [ -n \"\$val\" ]"

assert_shell "skills/team/registry.json still lists exactly 13 agents" \
  "[ \"\$(jq '.agents | length' skills/team/registry.json)\" = '13' ]"

# =============================================================================
# Done criteria (from plan.md)
# =============================================================================
section "Done criteria: lib/ contains state.mjs"

assert_shell "ls lib/ includes state.mjs" \
  "ls lib/ | grep -q '^state.mjs$'"

# =============================================================================
# Success banner
# =============================================================================
echo ""
echo "=============================================================="
echo "  ALL ACCEPTANCE TESTS PASSED"
echo "  simplify-orchestration refactor scope fence satisfied."
echo "=============================================================="
