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
# Stderr is NOT discarded — helper diagnostics surface on the test's
# stderr so a real failure is visible instead of masked.
run_aggregator() {
  bash "$HELPER" "$1"
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
# Every emitted finding MUST carry the fully-decorated Conventional
# Comments label per skills/code-review/SKILL.md "Comment Types":
# '**issue (blocking):**', not the prefix '**issue:**'. Anchored on
# the full token so a regression to the bare prefix surfaces here.
echo "$out" | grep -qF '**issue (blocking):' \
  || fail "A full label" "findings carry full label '**issue (blocking):'" "label not fully decorated"
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
# FIXTURE D — 7-reviewer SKIP denominator: 5 Claude reports + 2 external SKIPs.
# Locks in the design's "zero external CLIs -> byte-identical to today"
# invariant — SKIPs surface in the consulted header but never count toward
# corroboration denominators.
# Expectations:
#   - Header reads "Reviewers consulted: 5 Claude + 0/2 external"
#   - Any 'corroborated by' tag uses denominator /5 (the non-SKIP reviewers)
#   - No 'corroborated by' line uses denominator /7
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
cat > "$fx/reviews/technical-writer.md" <<'EOF'
## Documentation Review

**suggestion (non-blocking):** missing JSDoc on the new exported helper
file: src/foo.ts:42

**Verdict:** GAPS
EOF
cat > "$fx/reviews/ux-reviewer.md" <<'EOF'
## UX Review

**nitpick (non-blocking):** error message could be friendlier
file: src/baz.ts:10

**Verdict:** APPROVE
EOF
cat > "$fx/reviews/verifier.md" <<'EOF'
## Verification Report

**issue (blocking):** tsc reports a type error on line 42
file: src/foo.ts:42

**Verdict:** FAIL
EOF
cat > "$fx/reviews/external-reviewer-codex.md" <<'EOF'
## External Review (codex)

SKIP — codex not installed

**Verdict:** SKIP
EOF
cat > "$fx/reviews/external-reviewer-gemini.md" <<'EOF'
## External Review (gemini)

SKIP — gemini not installed

**Verdict:** SKIP
EOF

out="$(run_aggregator "$fx/reviews")"
echo "$out" | grep -qF 'Reviewers consulted: 5 Claude + 0/2 external' \
  || fail "D header shape" "header reads exactly '5 Claude + 0/2 external'" "header drifted"
# The parenthetical MUST carry each external reviewer's SKIP reason
# verbatim (skills/review-aggregation/SKILL.md "Header"). Without
# this, silent SKIP fatigue is invisible to the user.
echo "$out" | grep -qF '(codex: codex not installed' \
  || fail "D parenthetical codex" \
       "header parenthetical includes 'codex: codex not installed'" \
       "codex SKIP reason missing from parenthetical"
echo "$out" | grep -qF 'gemini: gemini not installed)' \
  || fail "D parenthetical gemini" \
       "header parenthetical includes 'gemini: gemini not installed'" \
       "gemini SKIP reason missing from parenthetical"
echo "$out" | grep -qE 'corroborated by [0-9]+/5' \
  || fail "D /5 denominator" "corroboration uses /5 denominator (SKIPs excluded)" "no /5 corroboration found"
if echo "$out" | grep -qE 'corroborated by [0-9]+/7'; then
  fail "D no /7 denominator" "SKIP'd externals never appear in denominator" "denominator '/7' present (SKIP wrongly counted)"
fi
\rm -rf "$fx"

# =============================================================================
# FIXTURE E — kind-promotion collision: two reviewers flag path/foo.ts:42
# with different kinds AND different summary text. The lower-severity
# reviewer (suggestion) is listed FIRST in the artifact directory's lexical
# order; the issue artifact lands SECOND. The aggregator MUST promote to
# 'issue (blocking)' — the issue's label AND its distinct summary text
# must win, proving the helper is selecting by severity (not just by
# input order).
# Expectations:
#   - Exactly ONE finding emerges at path/foo.ts:42
#   - Surviving label is '**issue (blocking):' (full token, anchored)
#   - Surviving summary is the issue reviewer's wording, NOT the
#     suggestion reviewer's
#   - The suggestion label does NOT appear as a separate emitted finding
#     at that file:line
# =============================================================================
fx="$(mktemp -d)"
mkdir -p "$fx/reviews"
# Lexical filename order: code-reviewer.md emits the suggestion FIRST.
cat > "$fx/reviews/code-reviewer.md" <<'EOF'
## Code Review

**suggestion (non-blocking):** comment could be clearer about the loop semantics
file: path/foo.ts:42

**Verdict:** COMMENT
EOF
cat > "$fx/reviews/security-reviewer.md" <<'EOF'
## Security Review

**issue (blocking):** stale comment hides a null deref on this branch
file: path/foo.ts:42

**Verdict:** FAIL
EOF

out="$(run_aggregator "$fx/reviews")"
echo "$out" | grep -qF 'file: path/foo.ts:42' \
  || fail "E finding present" "single emitted finding at 'path/foo.ts:42'" "no finding emitted at that file:line"
# Count how many times the finding block appears (one per emit).
count=$(echo "$out" | grep -cF 'file: path/foo.ts:42')
if [ "$count" -ne 1 ]; then
  fail "E collapsed" "exactly ONE finding emerges at path/foo.ts:42 (most-severe kind wins)" "got $count emissions"
fi
# Kind promotion — fully-decorated label, anchored on the FULL token.
# Anchoring on '**issue:' would vacuously pass even if the helper
# regressed to emitting the bare-prefix form; '**issue (blocking):'
# pins the Conventional Comments contract.
echo "$out" | grep -qF '**issue (blocking):' \
  || fail "E kind promotion (label)" \
       "surviving collapsed finding carries '**issue (blocking):' label" \
       "no '**issue (blocking):' label survived collapse"
# The surviving summary text must come from the issue reviewer
# (security-reviewer's wording), not from the suggestion reviewer's
# (code-reviewer's). This proves promotion is selecting by severity
# rather than by input/lexical order.
echo "$out" | grep -qF 'stale comment hides a null deref on this branch' \
  || fail "E kind promotion (summary)" \
       "surviving summary is the issue reviewer's wording" \
       "issue summary missing — suggestion summary likely survived"
# Negative: the bare suggestion label must NOT appear as a separate
# emitted finding at this file:line. Look only inside the block for
# path/foo.ts:42 (other fixtures' suggestion-bearing artifacts are
# already torn down by their `\rm -rf "$fx"` lines above).
foo_block="$(echo "$out" | awk '/^---$/{block=""} {block=block"\n"$0} /file: path\/foo\.ts:42/{print block}')"
if echo "$foo_block" | grep -qF '**suggestion (non-blocking):'; then
  fail "E suggestion swallowed" \
       "suggestion label is swallowed by the issue at this file:line" \
       "suggestion label leaked through despite kind-promotion"
fi
\rm -rf "$fx"

# =============================================================================
# FIXTURE F — single-model hard-gate preservation: only security-reviewer
# reports a CRITICAL finding ending **Verdict:** FAIL. No corroboration
# exists. The hard-gate verdict MUST be preserved verbatim, NOT downgraded
# by the [single-model — extra scrutiny] confidence tag.
# Expectations:
#   - Synthesis ends with '**Verdict:** FAIL' on its own line
#   - Synthesis contains '[single-model' tag (display annotation)
#   - The CRITICAL finding's file:line appears in the synthesis
# =============================================================================
fx="$(mktemp -d)"
mkdir -p "$fx/reviews"
cat > "$fx/reviews/security-reviewer.md" <<'EOF'
## Security Review

**issue (blocking):** [CRITICAL] hardcoded API key committed in src/secrets.ts
file: src/secrets.ts:3

**Verdict:** FAIL
EOF

out="$(run_aggregator "$fx/reviews")"
echo "$out" | grep -qF '**Verdict:** FAIL' \
  || fail "F verdict verbatim" "synthesis ends '**Verdict:** FAIL' on its own line" "FAIL verdict missing or drifted"
echo "$out" | grep -qF '[single-model' \
  || fail "F single-model tag" "single-model finding tagged '[single-model — extra scrutiny]'" "single-model tag absent"
echo "$out" | grep -qF 'file: src/secrets.ts:3' \
  || fail "F finding preserved" "CRITICAL finding appears verbatim at src/secrets.ts:3" "finding absent from synthesis"
# Fully-decorated Conventional Comments label — anchored on the full
# token, not the bare-prefix form.
echo "$out" | grep -qF '**issue (blocking):' \
  || fail "F full label" "preserved finding carries '**issue (blocking):' label" "label not fully decorated"
# Negative: the verdict must NOT have been downgraded to PASS.
if echo "$out" | grep -qE '\*\*Verdict:\*\* PASS'; then
  fail "F no downgrade" "verdict NOT downgraded to PASS by single-model tag" "verdict was downgraded to PASS"
fi
\rm -rf "$fx"

# =============================================================================
# FIXTURE G — PARTIAL semantics: a PARTIAL external + a Claude APPROVE.
# Per skills/review-aggregation/SKILL.md SKIP/PARTIAL semantics, a PARTIAL
# artifact contributes findings (they appear in the synthesis) but its
# verdict is ADVISORY — it does NOT trigger a FAIL gate. The helper's
# aggregate verdict MUST be PASS when no FAIL/REQUEST CHANGES is present,
# even with a PARTIAL artifact contributing findings.
# Expectations:
#   - Synthesis aggregate verdict is '**Verdict:** PASS'
#   - The PARTIAL artifact's finding appears in the synthesis
# =============================================================================
fx="$(mktemp -d)"
mkdir -p "$fx/reviews"
cat > "$fx/reviews/code-reviewer.md" <<'EOF'
## Code Review

**Verdict:** APPROVE
EOF
cat > "$fx/reviews/external-reviewer-codex.md" <<'EOF'
## External Review (codex)

**nitpick (non-blocking):** loop variable could be named more descriptively
file: src/foo.ts:7

**Verdict:** PARTIAL
EOF

out="$(run_aggregator "$fx/reviews")"
echo "$out" | grep -qF '**Verdict:** PASS' \
  || fail "G partial advisory" \
       "PARTIAL is advisory — aggregate verdict must be PASS" \
       "verdict was not PASS despite no FAIL/REQUEST CHANGES"
echo "$out" | grep -qF 'loop variable could be named more descriptively' \
  || fail "G partial findings" \
       "PARTIAL artifact's findings surface in the synthesis" \
       "PARTIAL finding was swallowed"
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
