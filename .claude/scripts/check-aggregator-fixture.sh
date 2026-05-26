#!/usr/bin/env bash
#
# check-aggregator-fixture.sh — acceptance suite for the review-aggregator
# agent's contract surface.
#
# Dev-only, non-distributed (lives under .claude/, not hooks/) per the
# runtime-vs-development split in CLAUDE.md.
#
# Strategy: the review-aggregator agent is a sonnet LLM and its full
# free-text output is non-deterministic. This fixture asserts on the
# **contract surface** — the stable substrings every aggregation MUST
# emit per skills/review-aggregation/SKILL.md:
#   - "Reviewers consulted: <claude_count> Claude + <ext_pass>/<ext_total> external (...)"
#   - "corroborated by N/M" tags on multi-model findings
#   - "[single-model — extra scrutiny]" tag on single-model findings
#   - "**Verdict:** PASS | FAIL | SKIP | PARTIAL" verdict-line shape
#
# The LLM itself is exercised end-to-end via /team-implement; this
# fixture pins the contract by running a deterministic Bash helper
# (.claude/scripts/lib/aggregator-helper.sh) over synthetic reviewer
# artifacts. The helper mirrors the skill's stated algorithm so a
# contract drift in either side surfaces here.
#
# set -uo pipefail (NOT -e): every assertion must run so the failure
# count is complete.
set -uo pipefail

# --- locate the repo root ----------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HELPER="$SCRIPT_DIR/lib/aggregator-helper.sh"

# --- temp cleanup ------------------------------------------------------------
cleanup() {
  [ -n "${fx:-}" ] && \rm -rf "$fx" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# --- failure bookkeeping -----------------------------------------------------
ERRORS=0
fail() {
  # $1 = fixture name, $2 = expectation, $3 = actual
  ERRORS=$((ERRORS + 1))
  printf 'FAIL [%s]\n  expected: %s\n  actual:   %s\n' "$1" "$2" "$3" >&2
}

# --- preflight ---------------------------------------------------------------
if [ ! -x "$HELPER" ]; then
  fail "preflight" "executable deterministic helper at $HELPER" "missing or not executable"
  printf '\n%s assertion(s) failed.\n' "$ERRORS" >&2
  exit 1
fi

# Run the helper against an artifact directory. Args: <reviews-dir>
run_aggregator() {
  bash "$HELPER" "$1" 2>/dev/null
}

# =============================================================================
# FIXTURE A — corroboration: 2 reviewers flag the same file:line; a third
# reports an unrelated low-severity finding.
# Expectations:
#   - Header includes "Reviewers consulted:"
#   - Two-model finding carries "corroborated by 2/3"
#   - Single-model finding carries "[single-model — extra scrutiny]"
# =============================================================================
fx="$(mktemp -d)"
mkdir -p "$fx/reviews"
cat > "$fx/reviews/code-reviewer.md" <<'EOF'
## Code Review

**issue (blocking):** missing null check on userInput
file: src/foo.ts:42

**Verdict:** REQUEST CHANGES
EOF
cat > "$fx/reviews/security-reviewer.md" <<'EOF'
## Security Review

**issue (blocking):** userInput dereferenced without null guard
file: src/foo.ts:42

**Verdict:** FAIL
EOF
cat > "$fx/reviews/ux-reviewer.md" <<'EOF'
## UX Review

**nitpick (non-blocking):** loading spinner could be more visible
file: src/bar.ts:7

**Verdict:** APPROVE
EOF

out="$(run_aggregator "$fx/reviews")"
echo "$out" | grep -qF 'Reviewers consulted:' \
  || fail "A header" "synthesis contains 'Reviewers consulted:'" "header missing"
echo "$out" | grep -qF 'corroborated by 2/3' \
  || fail "A corroboration" "two-model finding tagged 'corroborated by 2/3'" "corroboration tag absent"
echo "$out" | grep -qF '[single-model' \
  || fail "A single-model" "single-model finding tagged '[single-model — extra scrutiny]'" "single-model tag absent"
\rm -rf "$fx"

# =============================================================================
# FIXTURE B — SKIP semantics: 2 active findings + 1 SKIP artifact.
# Expectations:
#   - SKIP reviewer appears in the consulted header
#   - SKIP reviewer does NOT contribute to any corroboration count
#     (denominator never includes the SKIP'd reviewer)
# =============================================================================
fx="$(mktemp -d)"
mkdir -p "$fx/reviews"
cat > "$fx/reviews/code-reviewer.md" <<'EOF'
## Code Review

**issue (blocking):** missing null check on userInput
file: src/foo.ts:42

**Verdict:** REQUEST CHANGES
EOF
cat > "$fx/reviews/security-reviewer.md" <<'EOF'
## Security Review

**issue (blocking):** userInput dereferenced without null guard
file: src/foo.ts:42

**Verdict:** FAIL
EOF
cat > "$fx/reviews/external-reviewer-codex.md" <<'EOF'
## External Review (codex)

SKIP — codex not installed

**Verdict:** SKIP
EOF

out="$(run_aggregator "$fx/reviews")"
echo "$out" | grep -qF 'codex' \
  || fail "B consulted header" "SKIP'd reviewer 'codex' surfaces in consulted header" "codex absent from synthesis"
# Denominator must be 2 (the two non-SKIP reviewers), never 3.
echo "$out" | grep -qF 'corroborated by 2/2' \
  || fail "B corroboration denominator" "corroboration uses denominator 2 (SKIP excluded)" "expected '/2' denominator absent"
if echo "$out" | grep -qF 'corroborated by 2/3'; then
  fail "B SKIP exclusion" "SKIP must NOT count toward corroboration denominator" "denominator '2/3' present (SKIP wrongly counted)"
fi
\rm -rf "$fx"

# =============================================================================
# FIXTURE C — malformed file:unknown: one artifact has a finding without
# file:line (rendered as file:unknown).
# Expectations:
#   - Finding appears verbatim in synthesis
#   - Finding has NO 'corroborated by' tag (cannot match anything)
# =============================================================================
fx="$(mktemp -d)"
mkdir -p "$fx/reviews"
cat > "$fx/reviews/code-reviewer.md" <<'EOF'
## Code Review

**issue (blocking):** vague concern about the entire module
file: unknown

**Verdict:** REQUEST CHANGES
EOF
cat > "$fx/reviews/security-reviewer.md" <<'EOF'
## Security Review

**issue (blocking):** input validation gap at the API edge
file: src/api/edge.ts:15

**Verdict:** FAIL
EOF

out="$(run_aggregator "$fx/reviews")"
echo "$out" | grep -qF 'file: unknown' \
  || fail "C malformed inclusion" "malformed finding 'file: unknown' surfaces verbatim" "unknown-file finding absent"
# Pull the block describing the unknown finding and check no corroboration tag
unknown_block="$(echo "$out" | awk '/file: unknown/{found=1} found && /^---/{exit} found{print}')"
if echo "$unknown_block" | grep -qF 'corroborated by'; then
  fail "C malformed no-match" "file:unknown finding never carries 'corroborated by'" "corroboration tag present on unknown finding"
fi
\rm -rf "$fx"

# =============================================================================
# RESULT
# =============================================================================
if [ "$ERRORS" -ne 0 ]; then
  printf '\n%s assertion(s) failed.\n' "$ERRORS" >&2
  exit 1
fi
printf '\nAll aggregator-fixture assertions passed.\n'
exit 0
