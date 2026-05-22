#!/usr/bin/env bash
# Acceptance tests for the red-green-refactor-tdd rearchitecture.
#
# This script is the immutable scope fence for the IMPLEMENT-phase
# rearchitecture that reshapes red-author -> implementer -> reviewers
# into red-author (per slice) -> red gate -> green-author -> green gate ->
# refactor-author -> next slice -> 5 reviewers. When every assertion here
# passes, the rearchitecture is done.
#
# Conventions:
# - POSIX bash with `set -u` and `set -o pipefail` (NOT `-e`): we want
#   every assertion to run even if a prior one fails so we get a full
#   failure list.
# - Read-only checks (grep, test -f, JSON probes, hook exit-code).
#   Re-runnable. No side effects.
# - Run from the worktree/repo root:
#     bash tests/acceptance/red-green-refactor-tdd.sh
#
# Acceptance-test names map 1:1 to the entries in
# docs/plans/2026-05-22-red-green-refactor-tdd/plan.md.

set -u
set -o pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

PASS_COUNT=0
FAIL_COUNT=0
FAILED_LINES=""

pass() {
  # usage: pass "<slice>" "<check-name>"
  local slice="$1"
  local name="$2"
  PASS_COUNT=$((PASS_COUNT + 1))
  printf "  PASS [%s] %s\n" "$slice" "$name"
}

fail() {
  # usage: fail "<slice>" "<check-name>" "<reason>"
  local slice="$1"
  local name="$2"
  local reason="$3"
  FAIL_COUNT=$((FAIL_COUNT + 1))
  local line="FAIL [${slice}] ${name} -- ${reason}"
  FAILED_LINES="${FAILED_LINES}${line}
"
  printf "  %s\n" "$line"
}

section() {
  printf "\n=============================================================\n"
  printf "  %s\n" "$1"
  printf "=============================================================\n"
}

# ---------------------------------------------------------------------------
# Helper assertions. Each returns 0 on pass / non-zero on fail and calls
# pass/fail itself. They MUST NOT exit the script -- we want every check
# to run.
# ---------------------------------------------------------------------------

# assert_file_exists <slice> <name> <path>
assert_file_exists() {
  local slice="$1" name="$2" path="$3"
  if [ -f "$path" ]; then
    pass "$slice" "$name"
  else
    fail "$slice" "$name" "expected file to exist: $path"
  fi
}

# assert_grep <slice> <name> <pattern> <path>
# Uses ERE (`grep -qE`). Treats a missing file as a fail (not a crash).
assert_grep() {
  local slice="$1" name="$2" pattern="$3" path="$4"
  if [ ! -f "$path" ]; then
    fail "$slice" "$name" "file does not exist: $path"
    return
  fi
  if grep -qE "$pattern" "$path"; then
    pass "$slice" "$name"
  else
    fail "$slice" "$name" "pattern not found in $path -- /${pattern}/"
  fi
}

# assert_not_grep <slice> <name> <pattern> <path>
# Treats a missing file as a fail (the absence-check is only meaningful
# against a file we expect to exist).
assert_not_grep() {
  local slice="$1" name="$2" pattern="$3" path="$4"
  if [ ! -f "$path" ]; then
    fail "$slice" "$name" "file does not exist: $path"
    return
  fi
  if grep -qE "$pattern" "$path"; then
    fail "$slice" "$name" "forbidden pattern present in $path -- /${pattern}/"
  else
    pass "$slice" "$name"
  fi
}

# assert_hook_exit_zero <slice> <name>
assert_hook_exit_zero() {
  local slice="$1" name="$2"
  local hook=".claude/hooks/check-registry-sync.mjs"
  if [ ! -f "$hook" ]; then
    fail "$slice" "$name" "hook script missing: $hook"
    return
  fi
  # Run, capture status, do NOT let pipefail/set-u kill us.
  local status=0
  node "$hook" >/dev/null 2>&1 || status=$?
  if [ "$status" -eq 0 ]; then
    pass "$slice" "$name"
  else
    fail "$slice" "$name" "node $hook exited $status (expected 0)"
  fi
}

# assert_registry_agent <slice> <name> <agent-name>
# Verifies skills/team/registry.json contains an agent entry with
# phase=="IMPLEMENT" and parallel is not true.
assert_registry_agent() {
  local slice="$1" name="$2" agent="$3"
  local registry="skills/team/registry.json"
  if [ ! -f "$registry" ]; then
    fail "$slice" "$name" "registry missing: $registry"
    return
  fi
  local status=0
  python3 - "$registry" "$agent" <<'PY' || status=$?
import json, sys
registry_path, agent_name = sys.argv[1], sys.argv[2]
try:
    with open(registry_path) as f:
        data = json.load(f)
except Exception as e:
    print(f"json-load-error: {e}", file=sys.stderr)
    sys.exit(2)
agents = data.get("agents", [])
entry = next((a for a in agents if a.get("name") == agent_name), None)
if entry is None:
    print(f"agent '{agent_name}' not in registry", file=sys.stderr)
    sys.exit(3)
if entry.get("phase") != "IMPLEMENT":
    print(f"agent '{agent_name}' phase={entry.get('phase')!r}, expected IMPLEMENT", file=sys.stderr)
    sys.exit(4)
if entry.get("parallel") is True:
    print(f"agent '{agent_name}' has parallel:true (should be sequential)", file=sys.stderr)
    sys.exit(5)
PY
  if [ "$status" -eq 0 ]; then
    pass "$slice" "$name"
  else
    fail "$slice" "$name" "registry probe failed (python3 exit=$status) for agent '$agent'"
  fi
}

# ---------------------------------------------------------------------------
# Slice 1: red-author goes per-slice
# ---------------------------------------------------------------------------
section "### Slice 1 ### red-author goes per-slice"

# red-author-responsibilities-per-slice
assert_grep "Slice 1" \
  "red-author-responsibilities-per-slice" \
  "per[ -]slice" \
  "agents/red-author.md"

# The previous "every acceptance test from structure.md" wording must be gone.
assert_not_grep "Slice 1" \
  "red-author-old-every-test-wording-removed" \
  "every acceptance test from" \
  "agents/red-author.md"

# red-author-emits-test-commit
assert_grep "Slice 1" \
  "red-author-emits-test-commit" \
  "test: <slice>|test:.*slice|^## Commit" \
  "agents/red-author.md"

# team-implement-per-slice-dispatch-loop
assert_grep "Slice 1" \
  "team-implement-per-slice-dispatch-loop" \
  "for each slice|per slice|per-slice" \
  "skills/team-implement/SKILL.md"

# team-implement-first-slice-boundary
assert_grep "Slice 1" \
  "team-implement-first-slice-boundary" \
  "first slice|prior slices.*empty|prior-slices set is empty" \
  "skills/team-implement/SKILL.md"

# registry-sync-still-passes-slice-1
assert_hook_exit_zero "Slice 1" "registry-sync-still-passes-slice-1"

# ---------------------------------------------------------------------------
# Slice 2: introduce green-author and the mechanical green gate
# ---------------------------------------------------------------------------
section "### Slice 2 ### introduce green-author and the mechanical green gate"

# green-author-agent-file-exists
assert_file_exists "Slice 2" \
  "green-author-agent-file-exists" \
  "agents/green-author.md"

# green-author-frontmatter-complete (all five required fields)
assert_grep "Slice 2" "green-author-frontmatter-name"           "^name:"           "agents/green-author.md"
assert_grep "Slice 2" "green-author-frontmatter-description"    "^description:"    "agents/green-author.md"
assert_grep "Slice 2" "green-author-frontmatter-model"          "^model:"          "agents/green-author.md"
assert_grep "Slice 2" "green-author-frontmatter-tools"          "^tools:"          "agents/green-author.md"
assert_grep "Slice 2" "green-author-frontmatter-permissionMode" "^permissionMode:" "agents/green-author.md"

# green-author-scope-fence-present (forbids refactoring/abstraction beyond a failing test)
assert_grep "Slice 2" \
  "green-author-scope-fence-present" \
  "[Ss]cope fence|cannot refactor|forbidden.*refactor|do NOT.*refactor|no.*abstraction" \
  "agents/green-author.md"

# green-author-in-registry (entry exists, phase=IMPLEMENT, no parallel:true)
assert_registry_agent "Slice 2" "green-author-in-registry" "green-author"

# green-author-in-phase-table
assert_grep "Slice 2" \
  "green-author-in-phase-table" \
  "green-author" \
  "skills/team/SKILL.md"

# green-gate-documented in skills/team-implement/SKILL.md
assert_grep "Slice 2" \
  "green-gate-documented-mention" \
  "green gate" \
  "skills/team-implement/SKILL.md"

assert_grep "Slice 2" \
  "green-gate-documented-3-attempts" \
  "3 attempts|cap.*3|maxRetries.*3" \
  "skills/team-implement/SKILL.md"

assert_grep "Slice 2" \
  "green-gate-documented-prior-slices" \
  "prior slice|prior-slices|prior slices still pass" \
  "skills/team-implement/SKILL.md"

assert_grep "Slice 2" \
  "green-gate-documented-typed-class" \
  "green failed|typed.*class" \
  "skills/team-implement/SKILL.md"

# implementer-normal-dispatch-retired
assert_not_grep "Slice 2" \
  "implementer-normal-dispatch-removed" \
  "Normal [Dd]ispatch|Initial [Dd]ispatch" \
  "agents/implementer.md"

# "review-fix" (or equivalent) should lead the file. We check that the
# string appears within the first 30 non-frontmatter lines.
implementer_path="agents/implementer.md"
if [ -f "$implementer_path" ]; then
  if head -n 30 "$implementer_path" | grep -qEi "review[- ]fix|fix dispatch"; then
    pass "Slice 2" "implementer-review-fix-leads-file"
  else
    fail "Slice 2" "implementer-review-fix-leads-file" \
      "expected 'review-fix' or 'fix dispatch' within first 30 lines of $implementer_path"
  fi
else
  fail "Slice 2" "implementer-review-fix-leads-file" "file missing: $implementer_path"
fi

# registry-sync-passes-slice-2
assert_hook_exit_zero "Slice 2" "registry-sync-passes-slice-2"

# ---------------------------------------------------------------------------
# Slice 3: introduce refactor-author and complete the trio
# ---------------------------------------------------------------------------
section "### Slice 3 ### introduce refactor-author and complete the trio"

# refactor-author-agent-file-exists
assert_file_exists "Slice 3" \
  "refactor-author-agent-file-exists" \
  "agents/refactor-author.md"

# refactor-author-frontmatter-complete
assert_grep "Slice 3" "refactor-author-frontmatter-name"           "^name:"           "agents/refactor-author.md"
assert_grep "Slice 3" "refactor-author-frontmatter-description"    "^description:"    "agents/refactor-author.md"
assert_grep "Slice 3" "refactor-author-frontmatter-model"          "^model:"          "agents/refactor-author.md"
assert_grep "Slice 3" "refactor-author-frontmatter-tools"          "^tools:"          "agents/refactor-author.md"
assert_grep "Slice 3" "refactor-author-frontmatter-permissionMode" "^permissionMode:" "agents/refactor-author.md"

# refactor-author-runs-only-on-green
assert_grep "Slice 3" \
  "refactor-author-runs-only-on-green" \
  "only runs on green|only.*on green|runs only on green" \
  "agents/refactor-author.md"

# refactor-author-reruns-tests-each-change
assert_grep "Slice 3" \
  "refactor-author-reruns-tests-each-change" \
  "re-?run.*test.*after each|after each.*(structural )?change.*re-?run|re-?run the full test suite after each" \
  "agents/refactor-author.md"

# refactor-author-noop-on-failure (revert + report no-op when refactoring breaks a previously-green test)
assert_grep "Slice 3" \
  "refactor-author-noop-on-failure" \
  "no-op|noop" \
  "agents/refactor-author.md"

assert_grep "Slice 3" \
  "refactor-author-revert-on-red" \
  "revert|forbidden.*commit.*red|do NOT commit.*red|cannot commit.*red" \
  "agents/refactor-author.md"

# refactor-author-in-registry
assert_registry_agent "Slice 3" "refactor-author-in-registry" "refactor-author"

# refactor-author-in-phase-table (both green-author and refactor-author in IMPLEMENT row)
assert_grep "Slice 3" \
  "refactor-author-in-phase-table-green-author" \
  "green-author" \
  "skills/team/SKILL.md"

assert_grep "Slice 3" \
  "refactor-author-in-phase-table-refactor-author" \
  "refactor-author" \
  "skills/team/SKILL.md"

# Order check: green-author appears before refactor-author in skills/team/SKILL.md.
skill_path="skills/team/SKILL.md"
if [ -f "$skill_path" ]; then
  green_author_line=$(grep -nE "green-author" "$skill_path" | head -n 1 | cut -d: -f1 || true)
  refactor_author_line=$(grep -nE "refactor-author" "$skill_path" | head -n 1 | cut -d: -f1 || true)
  if [ -n "${green_author_line:-}" ] && [ -n "${refactor_author_line:-}" ] && [ "$green_author_line" -lt "$refactor_author_line" ]; then
    pass "Slice 3" "phase-table-order-green-author-before-refactor-author"
  else
    fail "Slice 3" "phase-table-order-green-author-before-refactor-author" \
      "expected green-author (line=${green_author_line:-NONE}) before refactor-author (line=${refactor_author_line:-NONE}) in $skill_path"
  fi
else
  fail "Slice 3" "phase-table-order-green-author-before-refactor-author" "file missing: $skill_path"
fi

# trio-loop-documented in team-implement skill (full trio + optional refactor commit)
assert_grep "Slice 3" \
  "trio-loop-documented-green-author" \
  "green-author" \
  "skills/team-implement/SKILL.md"

assert_grep "Slice 3" \
  "trio-loop-documented-refactor-author" \
  "refactor-author" \
  "skills/team-implement/SKILL.md"

assert_grep "Slice 3" \
  "trio-loop-documented-optional-commit" \
  "optional|no-op|no commit|skipped" \
  "skills/team-implement/SKILL.md"

# agent-count-updated -- AGENTS.md
assert_grep "Slice 3" \
  "agent-count-updated-agents-md" \
  "Agents \(15\)" \
  "AGENTS.md"

# architecture-agent-count-updated
assert_grep "Slice 3" \
  "architecture-agent-count-updated" \
  "15 specialist agents" \
  "docs/architecture.md"

# registry-sync-passes-slice-3
assert_hook_exit_zero "Slice 3" "registry-sync-passes-slice-3"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
section "Summary"
printf "  Passed: %d\n" "$PASS_COUNT"
printf "  Failed: %d\n" "$FAIL_COUNT"

if [ "$FAIL_COUNT" -gt 0 ]; then
  printf "\nFailed assertions:\n%s" "$FAILED_LINES"
  exit 1
fi

printf "\nAll acceptance checks passed.\n"
exit 0
