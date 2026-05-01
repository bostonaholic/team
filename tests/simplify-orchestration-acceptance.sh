#!/usr/bin/env bash
# Acceptance tests for the artifact-frontmatter rearchitecture.
#
# This script is the immutable scope fence for the rearchitecture that
# replaces ~/.team/<topic>/state.json + lib/state.mjs with artifact-only
# state (YAML frontmatter on every docs/plans/ artifact) and TodoWrite
# as the live coordination ledger. When every assertion here passes, the
# rearchitecture is done.
#
# Fails loudly on the first failing assertion (set -e). Run from the
# repository root: bash tests/simplify-orchestration-acceptance.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

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
# State infrastructure removal
# =============================================================================
section "lib/state.mjs is deleted; no references remain in active code"

assert "lib/state.mjs no longer exists" \
  test ! -f lib/state.mjs

assert_shell "no source files import lib/state (excluding docs/plans/)" \
  "! grep -rn 'lib/state' hooks/ skills/ agents/ .claude/"

assert_shell "no active code references writeState/readState/initState (excluding docs/plans/)" \
  "! grep -rEn 'writeState|readState|initState' hooks/ skills/ agents/ .claude/"

assert_shell "no active code (mjs/json) references ~/.team or state.json filename" \
  "! grep -rEn --include='*.mjs' --include='*.json' '~/\.team|state\.json' hooks/ skills/ agents/ .claude/"

# =============================================================================
# Hooks scan docs/plans/, not ~/.team/
# =============================================================================
section "Hooks rewritten: scan docs/plans/ for active topic"

assert "hooks/pre-compact-anchor.mjs parses with node --check" \
  node --check hooks/pre-compact-anchor.mjs

assert "hooks/session-start-recover.mjs parses with node --check" \
  node --check hooks/session-start-recover.mjs

assert_shell "pre-compact-anchor reads docs/plans/ (not ~/.team/)" \
  "grep -q 'docs.*plans' hooks/pre-compact-anchor.mjs"

assert_shell "session-start-recover reads docs/plans/ (not ~/.team/)" \
  "grep -q 'docs.*plans' hooks/session-start-recover.mjs"

assert_shell "no hook imports homedir from node:os" \
  "! grep -E '\\bhomedir\\b' hooks/*.mjs"

# =============================================================================
# Event vocabulary purged from agent frontmatter and registry
# =============================================================================
section "Event vocabulary stripped: agent frontmatter has phase, not consumes/produces"

assert_shell "no agent frontmatter contains consumes:" \
  "! grep -lE '^consumes:' agents/*.md"

assert_shell "no agent frontmatter contains produces:" \
  "! grep -lE '^produces:' agents/*.md"

assert_shell "every agent file has a phase: field in frontmatter" \
  "[ \"\$(grep -lE '^phase:' agents/*.md | wc -l | tr -d ' ')\" = '13' ]"

assert_shell "registry.json has no passEvent fields" \
  "! grep -q passEvent skills/team/registry.json"

assert_shell "registry.json agents array still has 13 entries" \
  "[ \"\$(jq '.agents | length' skills/team/registry.json)\" = '13' ]"

assert_shell "every registry agent has a phase field" \
  "[ \"\$(jq '[.agents[] | select(.phase != null)] | length' skills/team/registry.json)\" = '13' ]"

# =============================================================================
# Approval recorded as artifact frontmatter, not sidecar files
# =============================================================================
section "Approval is recorded as artifact frontmatter (no .approved sidecar files)"

assert_shell "no active code references .md.approved sidecar file paths" \
  "! grep -rEn '\\.md\\.approved' skills/ agents/ hooks/ .claude/"

# =============================================================================
# Documentation aligned: no stale state.json mentions outside docs/plans/
# =============================================================================
section "Docs aligned: no stale state.json/event-log references"

assert_shell "docs/architecture.md does not describe writeState/readState/initState as live API" \
  "! grep -E '(writeState|readState|initState)\\(' docs/architecture.md"

# =============================================================================
# Success banner
# =============================================================================
echo ""
echo "=============================================================="
echo "  ALL ACCEPTANCE TESTS PASSED"
echo "  artifact-frontmatter rearchitecture scope fence satisfied."
echo "=============================================================="
