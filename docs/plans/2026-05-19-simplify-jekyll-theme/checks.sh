#!/usr/bin/env bash
# checks.sh — structural assertion script for the simplify-jekyll-theme branch.
#
# This is NOT a unit test suite. There is no test harness under docs/ — the
# site is a Jekyll project, and the primary mechanical gate is a successful
# `bundle exec jekyll build --trace`. These grep assertions catch regressions
# inside the simplification scope: forbidden tokens that must be absent from
# the source tree after each slice lands.
#
# Usage:
#   bash docs/plans/2026-05-19-simplify-jekyll-theme/checks.sh
#
# The script is idempotent and re-runnable. The implementer can invoke it
# after each slice; PASS counts progress monotonically until all six slices
# land and the final summary reports clean.
#
# Exit code: 0 on full pass; non-zero on the first failed assertion (set -e).

set -euo pipefail

# Move to repo root so all paths are stable regardless of caller cwd.
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

PASS_COUNT=0
TOTAL=0

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  printf 'PASS  %s\n' "$1"
}

fail() {
  printf 'FAIL  %s\n' "$1" >&2
  exit 1
}

# assert_absent <label> <ERE-pattern> [extra-grep-args...]
# Greps the docs/ tree (excluding _site and plans) for the forbidden pattern.
# Fails loudly if any line matches.
assert_absent() {
  TOTAL=$((TOTAL + 1))
  local label="$1"
  local pattern="$2"
  shift 2
  local hits
  if hits=$(grep -RInE \
      --exclude-dir=_site \
      --exclude-dir=plans \
      --exclude-dir=vendor \
      "$@" \
      "$pattern" docs/ 2>/dev/null); then
    printf 'FAIL  %s\n' "$label" >&2
    printf '      forbidden pattern still present:\n' >&2
    printf '%s\n' "$hits" | sed 's/^/        /' >&2
    exit 1
  fi
  pass "$label"
}

# assert_absent_in_file <label> <ERE-pattern> <file>
# Like assert_absent but scoped to a single file.
assert_absent_in_file() {
  TOTAL=$((TOTAL + 1))
  local label="$1"
  local pattern="$2"
  local file="$3"
  if [[ ! -f "$file" ]]; then
    # If the file does not exist, the pattern cannot be present.
    pass "$label (file absent: $file)"
    return 0
  fi
  local hits
  if hits=$(grep -nE "$pattern" "$file" 2>/dev/null); then
    printf 'FAIL  %s\n' "$label" >&2
    printf '      forbidden pattern still present in %s:\n' "$file" >&2
    printf '%s\n' "$hits" | sed 's/^/        /' >&2
    exit 1
  fi
  pass "$label"
}

echo "=== simplify-jekyll-theme structural checks ==="
echo "repo root: $REPO_ROOT"
echo

# ─────────────────────────────────────────────────────────────────────────────
# Mechanical gate: Jekyll build must succeed.
# ─────────────────────────────────────────────────────────────────────────────
echo "--- Build gate ---"
TOTAL=$((TOTAL + 1))
if ( cd docs && bundle exec jekyll build --trace ) >/tmp/jekyll-build.log 2>&1; then
  pass "jekyll build --trace succeeds"
else
  printf 'FAIL  jekyll build --trace failed\n' >&2
  printf '      see /tmp/jekyll-build.log; last 40 lines:\n' >&2
  tail -n 40 /tmp/jekyll-build.log | sed 's/^/        /' >&2
  exit 1
fi
echo

# ─────────────────────────────────────────────────────────────────────────────
# Slice 1: Delete pure dead code
# ─────────────────────────────────────────────────────────────────────────────
echo "--- Slice 1: dead code ---"
assert_absent "Slice 1: no .callout selectors"           '\.callout'
assert_absent "Slice 1: no .card (non-modifier) selectors" '\.card[^-]'
assert_absent "Slice 1: no .container--wide selectors"   '\.container--wide'
assert_absent "Slice 1: no bare container--wide token"   '\bcontainer--wide\b'
echo

# ─────────────────────────────────────────────────────────────────────────────
# Slice 2: Drop Google Fonts; honest font stack in _tokens.scss
# ─────────────────────────────────────────────────────────────────────────────
echo "--- Slice 2: Google Fonts removed; honest token font stack ---"
assert_absent "Slice 2: no fonts.googleapis.com references" 'fonts\.googleapis\.com'
assert_absent "Slice 2: no fonts.gstatic.com references"   'fonts\.gstatic\.com'
assert_absent_in_file "Slice 2: _tokens.scss does not name 'Geist'" \
  "'Geist'" "docs/_sass/_tokens.scss"
assert_absent_in_file "Slice 2: _tokens.scss does not name 'Inter'" \
  "'Inter'" "docs/_sass/_tokens.scss"
echo

# ─────────────────────────────────────────────────────────────────────────────
# Slice 3: Remove scroll-reveal motion
# ─────────────────────────────────────────────────────────────────────────────
echo "--- Slice 3: scroll-reveal removed ---"
assert_absent "Slice 3: no .reveal selector" '\.reveal\b'
assert_absent "Slice 3: no reveal--delay tokens" 'reveal--delay'
assert_absent 'Slice 3: no class="reveal..." in markup' 'class="reveal'
echo

# ─────────────────────────────────────────────────────────────────────────────
# Slice 4: Pipeline SVG include replaced with inline <ol>
# ─────────────────────────────────────────────────────────────────────────────
echo "--- Slice 4: pipeline include replaced ---"
assert_absent "Slice 4: no 'Space Grotesk' references" 'Space Grotesk'
assert_absent "Slice 4: no references to pipeline.html (include or filename)" 'pipeline\.html'
echo

# ─────────────────────────────────────────────────────────────────────────────
# Slice 5: macOS-style code-block headers + copy button removed
# ─────────────────────────────────────────────────────────────────────────────
echo "--- Slice 5: code-block chrome removed ---"
assert_absent "Slice 5: no .code-block-* selectors" '\.code-block-'
assert_absent "Slice 5: no .copy-btn selector"      '\.copy-btn'
echo

# ─────────────────────────────────────────────────────────────────────────────
# Slice 6: Manual theme toggle collapsed to prefers-color-scheme
# ─────────────────────────────────────────────────────────────────────────────
echo "--- Slice 6: manual theme toggle removed ---"
assert_absent "Slice 6: no localStorage references"  'localStorage'
assert_absent "Slice 6: no team-theme references"    'team-theme'
assert_absent "Slice 6: no data-theme references"    'data-theme'
assert_absent "Slice 6: no theme-toggle references"  'theme-toggle'
echo

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
echo "================================================"
printf '  Assertions passed: %d / %d\n' "$PASS_COUNT" "$TOTAL"
echo "  simplify-jekyll-theme: ALL CHECKS PASSED"
echo "================================================"
