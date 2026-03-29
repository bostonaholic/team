#!/usr/bin/env bash
# Acceptance tests for skill architecture improvements.
# Each test prints PASS or FAIL with its description.
# Exit code is non-zero if any test fails.
# Run from the repository root: bash tests/skill-architecture-tests.sh

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

# ---------------------------------------------------------------------------
# T1: code-reviewer loads adversarial-review/SKILL.md
# ---------------------------------------------------------------------------
if grep -q "adversarial-review/SKILL.md" "$REPO_ROOT/agents/code-reviewer.md"; then
  pass "T1: code-reviewer references adversarial-review/SKILL.md"
else
  fail "T1: code-reviewer references adversarial-review/SKILL.md"
fi

# ---------------------------------------------------------------------------
# T2: security-reviewer loads adversarial-review/SKILL.md
# ---------------------------------------------------------------------------
if grep -q "adversarial-review/SKILL.md" "$REPO_ROOT/agents/security-reviewer.md"; then
  pass "T2: security-reviewer references adversarial-review/SKILL.md"
else
  fail "T2: security-reviewer references adversarial-review/SKILL.md"
fi

# ---------------------------------------------------------------------------
# T3: ux-reviewer loads adversarial-review/SKILL.md
# ---------------------------------------------------------------------------
if grep -q "adversarial-review/SKILL.md" "$REPO_ROOT/agents/ux-reviewer.md"; then
  pass "T3: ux-reviewer references adversarial-review/SKILL.md"
else
  fail "T3: ux-reviewer references adversarial-review/SKILL.md"
fi

# ---------------------------------------------------------------------------
# T4: technical-writer loads adversarial-review/SKILL.md
# ---------------------------------------------------------------------------
if grep -q "adversarial-review/SKILL.md" "$REPO_ROOT/agents/technical-writer.md"; then
  pass "T4: technical-writer references adversarial-review/SKILL.md"
else
  fail "T4: technical-writer references adversarial-review/SKILL.md"
fi

# ---------------------------------------------------------------------------
# T5: Duplicated Conventional Comments inline format definition removed from
#     code-reviewer.md. The inline bullet examples (suggestion/issue/nitpick
#     labels) should no longer appear — replaced by a skill reference summary.
# ---------------------------------------------------------------------------
INLINE_COUNT=$(grep -c "suggestion (non-blocking)\|issue (blocking)\|nitpick (non-blocking)" \
  "$REPO_ROOT/agents/code-reviewer.md" || true)
if [ "$INLINE_COUNT" -eq 0 ]; then
  pass "T5: inline Conventional Comments format definition removed from code-reviewer.md"
else
  fail "T5: inline Conventional Comments format definition removed from code-reviewer.md (found $INLINE_COUNT inline definition line(s), expected 0)"
fi

# ---------------------------------------------------------------------------
# T6: verifier does NOT reference adversarial-review/SKILL.md
# ---------------------------------------------------------------------------
if grep -q "adversarial-review/SKILL.md" "$REPO_ROOT/agents/verifier.md"; then
  fail "T6: verifier does NOT reference adversarial-review/SKILL.md (found unexpected reference)"
else
  pass "T6: verifier does NOT reference adversarial-review/SKILL.md"
fi

# ---------------------------------------------------------------------------
# T7: All 4 consumer agent names appear in the adversarial-review row of
#     docs/architecture.md. Uses separate greps (not order-dependent).
#     The methodology table row for adversarial-review must name all 4 agents.
# ---------------------------------------------------------------------------
T7_PASS=true

# Extract the adversarial-review row from the methodology table, then check
# each agent name appears within that row.
ADVERSARIAL_ROW=$(grep "adversarial-review" "$REPO_ROOT/docs/architecture.md" \
  | grep -v "^#\|^>\|SKILL.md\|//\|event" | head -5 || true)

for agent in "code-reviewer" "security-reviewer" "ux-reviewer" "technical-writer"; do
  if echo "$ADVERSARIAL_ROW" | grep -q "$agent"; then
    : # found
  else
    T7_PASS=false
    break
  fi
done

if [ "$T7_PASS" = "true" ]; then
  pass "T7: adversarial-review row in docs/architecture.md names all 4 consumer agents"
else
  fail "T7: adversarial-review row in docs/architecture.md names all 4 consumer agents (one or more missing: code-reviewer, security-reviewer, ux-reviewer, technical-writer)"
fi

# ---------------------------------------------------------------------------
# T8: Extraction threshold documented in docs/architecture.md
# ---------------------------------------------------------------------------
if grep -qi "extraction threshold" "$REPO_ROOT/docs/architecture.md"; then
  pass "T8: extraction threshold documented in docs/architecture.md"
else
  fail "T8: extraction threshold documented in docs/architecture.md"
fi

# ---------------------------------------------------------------------------
# T9: Soft limit of 3 methodology skills documented in docs/architecture.md
# ---------------------------------------------------------------------------
if grep -qiE "soft limit.*3|3 methodology skills" "$REPO_ROOT/docs/architecture.md"; then
  pass "T9: soft limit of 3 methodology skills documented in docs/architecture.md"
else
  fail "T9: soft limit of 3 methodology skills documented in docs/architecture.md"
fi

# ---------------------------------------------------------------------------
# T10: implementer.md still references solid-principles/SKILL.md (no regression)
# ---------------------------------------------------------------------------
if grep -q "solid-principles/SKILL.md" "$REPO_ROOT/agents/implementer.md"; then
  pass "T10: implementer.md still references solid-principles/SKILL.md"
else
  fail "T10: implementer.md still references solid-principles/SKILL.md"
fi

# ---------------------------------------------------------------------------
# T11: technical-writer.md still references writing-prose/SKILL.md (no regression)
# ---------------------------------------------------------------------------
if grep -q "writing-prose/SKILL.md" "$REPO_ROOT/agents/technical-writer.md"; then
  pass "T11: technical-writer.md still references writing-prose/SKILL.md"
else
  fail "T11: technical-writer.md still references writing-prose/SKILL.md"
fi

# ---------------------------------------------------------------------------
# T12: Registry sync hook reports no mismatches (agent frontmatter unchanged).
#      The hook reads from stdin and expects a PostToolUse Write|Edit payload.
#      We simulate a write to agents/code-reviewer.md to trigger the check.
# ---------------------------------------------------------------------------
HOOK="$REPO_ROOT/.claude/hooks/check-registry-sync.mjs"
HOOK_PAYLOAD='{"tool_name":"Write","tool_input":{"file_path":"'"$REPO_ROOT/agents/code-reviewer.md"'"}}'

# The hook writes mismatches to stderr as a JSON hookSpecificOutput payload.
# Capture stderr; no output means no mismatches.
HOOK_STDERR=$(echo "$HOOK_PAYLOAD" | node "$HOOK" 2>&1 1>/dev/null || true)

if echo "$HOOK_STDERR" | grep -q "mismatch"; then
  fail "T12: registry sync hook reports no mismatches (found: $HOOK_STDERR)"
else
  pass "T12: registry sync hook reports no mismatches"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
if [ "$FAILURES" -eq 0 ]; then
  echo "All tests passed."
  exit 0
else
  echo "$FAILURES test(s) failed."
  exit 1
fi
