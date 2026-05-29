#!/usr/bin/env bash
# Acceptance test for Slice 3 (diff-based selection):
# `evals/lib/select.mjs` selects cases whose `deps:` glob matches the changed
# files. `GLOBAL_DEPS` (runner/judge changes) trigger a full run. `ALL=1`
# overrides selection. An empty match returns no cases AND the runner prints
# the documented "no matching evals; use `ALL=1`" message.
#
# Drives the selector with EVALS_FAKE_CHANGED_FILES so this stays offline
# and independent of the host repo's git state.
#
# Run from the repository root: bash tests/evals-select-tests.sh

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

SELECT="$REPO_ROOT/evals/lib/select.mjs"
ENTRY="$REPO_ROOT/evals/e2e/run.sh"

# ---------------------------------------------------------------------------
# Tempdir with two fixtures whose `deps:` differ. case-a depends on
# agents/code-reviewer.md, case-b depends on agents/planner.md.
# ---------------------------------------------------------------------------
WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

mkdir -p "$WORKDIR/fixtures/code-reviewer/case-a"
cat >"$WORKDIR/fixtures/code-reviewer/case-a/input.md" <<'EOF'
---
agent: code-reviewer
tier: periodic
deps:
  - agents/code-reviewer.md
---

body a
EOF

mkdir -p "$WORKDIR/fixtures/code-reviewer/case-b"
cat >"$WORKDIR/fixtures/code-reviewer/case-b/input.md" <<'EOF'
---
agent: code-reviewer
tier: periodic
deps:
  - agents/planner.md
---

body b
EOF

# ---------------------------------------------------------------------------
# T0: selector module exists.
# ---------------------------------------------------------------------------
if [ -f "$SELECT" ]; then
  pass "T0: evals/lib/select.mjs exists"
else
  fail "T0: evals/lib/select.mjs exists (not found at $SELECT)"
fi

# ---------------------------------------------------------------------------
# Helper: drive select.mjs with --print-selected, returning newline-separated
# case names that would run. Tolerates either of two reasonable CLI shapes.
# ---------------------------------------------------------------------------
selected_cases() {
  local changed="$1"
  local all="${2:-}"
  local fixture_root="${3:-$WORKDIR/fixtures}"
  local env_args=()
  env_args+=("EVALS_FIXTURE_ROOT=$fixture_root")
  env_args+=("EVALS_FAKE_CHANGED_FILES=$changed")
  [ -n "$all" ] && env_args+=("ALL=$all")
  env "${env_args[@]}" node "$SELECT" --print-selected 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# T1: changed file matches case-a's deps; only case-a is selected.
# ---------------------------------------------------------------------------
OUT=$(selected_cases "agents/code-reviewer.md")
if echo "$OUT" | grep -q "case-a" && ! echo "$OUT" | grep -q "case-b"; then
  pass "T1: matching deps selects case-a only"
else
  fail "T1: matching deps selects case-a only (got: $(echo "$OUT" | tr '\n' '|'))"
fi

# ---------------------------------------------------------------------------
# T2: GLOBAL_DEPS file changed (e.g. evals/lib/run-agent.mjs) triggers a
#     full run — both cases selected.
# ---------------------------------------------------------------------------
OUT=$(selected_cases "evals/lib/run-agent.mjs")
if echo "$OUT" | grep -q "case-a" && echo "$OUT" | grep -q "case-b"; then
  pass "T2: GLOBAL_DEPS change triggers full run (both cases selected)"
else
  fail "T2: GLOBAL_DEPS change triggers full run (got: $(echo "$OUT" | tr '\n' '|'))"
fi

# ---------------------------------------------------------------------------
# T3: ALL=1 forces a full run regardless of changed files.
# ---------------------------------------------------------------------------
OUT=$(selected_cases "unrelated/file.md" "1")
if echo "$OUT" | grep -q "case-a" && echo "$OUT" | grep -q "case-b"; then
  pass "T3: ALL=1 forces full run"
else
  fail "T3: ALL=1 forces full run (got: $(echo "$OUT" | tr '\n' '|'))"
fi

# ---------------------------------------------------------------------------
# T4: empty match prints the documented "no matching evals; use `ALL=1`"
#     message and exits 0. Drive the entry script (not just the selector) so
#     we observe the message at the user-facing seam.
# ---------------------------------------------------------------------------
if [ -f "$ENTRY" ]; then
  OUT_LOG=$(mktemp)
  set +e
  env -u ANTHROPIC_API_KEY \
    EVALS_FIXTURE_ROOT="$WORKDIR/fixtures" \
    EVALS_FAKE_CHANGED_FILES="unrelated/file.md" \
    bash "$ENTRY" >"$OUT_LOG" 2>&1
  ENTRY_EXIT=$?
  set -e

  if [ "$ENTRY_EXIT" -eq 0 ] && grep -qE "no matching evals" "$OUT_LOG" && grep -qE "ALL=1" "$OUT_LOG"; then
    pass "T4: empty match prints 'no matching evals; use ALL=1' and exits 0"
  else
    fail "T4: empty match prints 'no matching evals; use ALL=1' and exits 0 (exit=$ENTRY_EXIT, output: $(head -5 "$OUT_LOG" | tr '\n' '|'))"
  fi
  rm -f "$OUT_LOG"
else
  fail "T4: empty match prints 'no matching evals' (entry script missing)"
fi

# ---------------------------------------------------------------------------
# T5: glob deps (e.g. `agents/**`) match anything under agents/.
#     Add a third case with a glob dep.
# ---------------------------------------------------------------------------
mkdir -p "$WORKDIR/fixtures/code-reviewer/case-glob"
cat >"$WORKDIR/fixtures/code-reviewer/case-glob/input.md" <<'EOF'
---
agent: code-reviewer
tier: periodic
deps:
  - agents/**
---

body glob
EOF
OUT=$(selected_cases "agents/questioner.md")
if echo "$OUT" | grep -q "case-glob"; then
  pass "T5: glob \`agents/**\` matches agents/questioner.md"
else
  fail "T5: glob \`agents/**\` matches agents/questioner.md (got: $(echo "$OUT" | tr '\n' '|'))"
fi

# ===========================================================================
# Summary
# ===========================================================================
echo ""
if [ "$FAILURES" -eq 0 ]; then
  echo "All tests passed."
  exit 0
else
  echo "$FAILURES test(s) failed."
  exit 1
fi
