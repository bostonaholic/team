#!/usr/bin/env bash
# Run from the repository root: bash tests/evals-tier-filter-tests.sh
#
# Asserts that fixture `tier:` frontmatter and the `EVALS_TIER` env var
# combine to filter which cases run.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILURES=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; FAILURES=$((FAILURES + 1)); }

SELECT_MJS="$REPO_ROOT/evals/lib/select.mjs"

# Build a synthetic fixture tree under a tempdir so we don't disturb the
# real evals/fixtures/.
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT
FIXROOT="$SCRATCH/fixtures"
mkdir -p "$FIXROOT/code-reviewer/gate-case"
mkdir -p "$FIXROOT/code-reviewer/periodic-case"

cat > "$FIXROOT/code-reviewer/gate-case/input.md" <<'EOF'
---
agent: code-reviewer
tier: gate
deps:
  - "agents/code-reviewer.md"
---
synthetic gate-tier input
EOF

cat > "$FIXROOT/code-reviewer/periodic-case/input.md" <<'EOF'
---
agent: code-reviewer
tier: periodic
deps:
  - "agents/code-reviewer.md"
---
synthetic periodic-tier input
EOF

run_selector() {
  # $1 = EVALS_TIER value (or empty for unset)
  if [ -n "${1:-}" ]; then
    EVALS_TIER="$1" \
      EVALS_FIXTURE_ROOT="$FIXROOT" \
      ALL=1 \
      node "$SELECT_MJS" --print-selected 2>"$SCRATCH/stderr.log"
  else
    EVALS_FIXTURE_ROOT="$FIXROOT" \
      ALL=1 \
      node "$SELECT_MJS" --print-selected 2>"$SCRATCH/stderr.log"
  fi
}

# T0: precondition — selector module exists
if [ -f "$SELECT_MJS" ]; then
  pass "T0: evals/lib/select.mjs exists"
else
  fail "T0: evals/lib/select.mjs exists"
fi

# T1: EVALS_TIER unset — all cases selected
out="$(run_selector "" || true)"
if echo "$out" | grep -q "code-reviewer/gate-case" && echo "$out" | grep -q "code-reviewer/periodic-case"; then
  pass "T1: unset EVALS_TIER selects both gate and periodic cases"
else
  fail "T1: unset EVALS_TIER selects both gate and periodic cases (got: $(echo "$out" | tr '\n' ' '))"
fi

# T2: EVALS_TIER=gate — only gate selected
out="$(run_selector "gate" || true)"
if echo "$out" | grep -q "code-reviewer/gate-case" && ! echo "$out" | grep -q "code-reviewer/periodic-case"; then
  pass "T2: EVALS_TIER=gate selects only gate-tier cases"
else
  fail "T2: EVALS_TIER=gate selects only gate-tier cases (got: $(echo "$out" | tr '\n' ' '))"
fi

# T3: EVALS_TIER=periodic — only periodic selected
out="$(run_selector "periodic" || true)"
if echo "$out" | grep -q "code-reviewer/periodic-case" && ! echo "$out" | grep -q "code-reviewer/gate-case"; then
  pass "T3: EVALS_TIER=periodic selects only periodic-tier cases"
else
  fail "T3: EVALS_TIER=periodic selects only periodic-tier cases (got: $(echo "$out" | tr '\n' ' '))"
fi

# T4: invalid EVALS_TIER — fail fast with named-error message
set +e
out="$(EVALS_TIER=bogus EVALS_FIXTURE_ROOT="$FIXROOT" ALL=1 node "$SELECT_MJS" --print-selected 2>"$SCRATCH/stderr.log")"
exit_code=$?
set -e
err="$(cat "$SCRATCH/stderr.log")"
if [ "$exit_code" -ne 0 ] && echo "$err" | grep -qE "EVALS_TIER.*(gate|periodic)"; then
  pass "T4: invalid EVALS_TIER fails fast with actionable stderr"
else
  fail "T4: invalid EVALS_TIER fails fast with actionable stderr (exit=$exit_code, stderr='$err')"
fi

# T5: fixture missing tier — malformed-frontmatter style failure
mkdir -p "$FIXROOT/code-reviewer/no-tier-case"
cat > "$FIXROOT/code-reviewer/no-tier-case/input.md" <<'EOF'
---
agent: code-reviewer
deps:
  - "agents/code-reviewer.md"
---
fixture with no tier
EOF

set +e
out="$(EVALS_FIXTURE_ROOT="$FIXROOT" ALL=1 node "$SELECT_MJS" --print-selected 2>"$SCRATCH/stderr.log")"
exit_code=$?
set -e
err="$(cat "$SCRATCH/stderr.log")"
if [ "$exit_code" -ne 0 ] && echo "$err" | grep -qE "tier|no-tier-case"; then
  pass "T5: fixture missing tier: surfaces a named error"
else
  fail "T5: fixture missing tier: surfaces a named error (exit=$exit_code, stderr='$err')"
fi

# Clean up the no-tier case so the remaining tests don't trip on it.
rm -rf "$FIXROOT/code-reviewer/no-tier-case"

# T6: fixture with invalid tier value — named error
mkdir -p "$FIXROOT/code-reviewer/bad-tier-case"
cat > "$FIXROOT/code-reviewer/bad-tier-case/input.md" <<'EOF'
---
agent: code-reviewer
tier: never
deps:
  - "agents/code-reviewer.md"
---
fixture with invalid tier
EOF

set +e
out="$(EVALS_FIXTURE_ROOT="$FIXROOT" ALL=1 node "$SELECT_MJS" --print-selected 2>"$SCRATCH/stderr.log")"
exit_code=$?
set -e
err="$(cat "$SCRATCH/stderr.log")"
if [ "$exit_code" -ne 0 ] && echo "$err" | grep -qE "tier.*(gate|periodic|never|bad-tier-case)"; then
  pass "T6: fixture with non-{gate|periodic} tier surfaces a named error"
else
  fail "T6: fixture with non-{gate|periodic} tier surfaces a named error (exit=$exit_code, stderr='$err')"
fi

if [ "$FAILURES" -eq 0 ]; then
  echo "All tests passed."
  exit 0
else
  echo "$FAILURES test(s) failed."
  exit 1
fi
