#!/usr/bin/env bash
# Acceptance test for Slice 3 (defense in depth for malformed deps):
# A fixture with `deps:` that is not a YAML list of strings is rejected at
# selection time with a named error. This is defense in depth alongside the
# slice 2 gate check — `evals/lib/select.mjs` must not crash silently when
# it encounters a malformed glob.
#
# Run from the repository root: bash tests/evals-select-malformed-deps-tests.sh

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

# ---------------------------------------------------------------------------
# T0: selector module exists.
# ---------------------------------------------------------------------------
if [ -f "$SELECT" ]; then
  pass "T0: evals/lib/select.mjs exists"
else
  fail "T0: evals/lib/select.mjs exists (not found at $SELECT)"
fi

# ---------------------------------------------------------------------------
# Tempdir with one fixture whose `deps:` is a scalar (not a list).
# ---------------------------------------------------------------------------
WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

mkdir -p "$WORKDIR/fixtures/code-reviewer/case-malformed"
cat >"$WORKDIR/fixtures/code-reviewer/case-malformed/input.md" <<'EOF'
---
agent: code-reviewer
tier: periodic
deps: not-a-list
---

malformed deps
EOF

# ---------------------------------------------------------------------------
# T1: selector exits non-zero and the error message names `deps` and the
#     offending fixture filename / case directory.
# ---------------------------------------------------------------------------
STDOUT=$(mktemp); STDERR=$(mktemp)
set +e
env EVALS_FIXTURE_ROOT="$WORKDIR/fixtures" \
  EVALS_FAKE_CHANGED_FILES="agents/code-reviewer.md" \
  node "$SELECT" --print-selected >"$STDOUT" 2>"$STDERR"
SELECT_EXIT=$?
set -e

# T1: selector exits non-zero on malformed deps. Require the module to exist
# so we don't conflate "ESM not found" with the real malformed-deps signal.
if [ -f "$SELECT" ] && [ "$SELECT_EXIT" -ne 0 ]; then
  pass "T1: selector exits non-zero on malformed deps"
else
  fail "T1: selector exits non-zero on malformed deps (exit=$SELECT_EXIT, stdout: $(tr '\n' '|' <"$STDOUT" | head -c 240))"
fi

if grep -qE "deps" "$STDERR" && grep -qE "case-malformed|input\.md" "$STDERR"; then
  pass "T2: error names \`deps\` and the offending fixture"
else
  fail "T2: error names \`deps\` and the offending fixture (stderr: $(tr '\n' '|' <"$STDERR" | head -c 240))"
fi

rm -f "$STDOUT" "$STDERR"

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
