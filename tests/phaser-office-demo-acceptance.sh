#!/usr/bin/env bash
# Acceptance tests for the Phaser office demo (replaces the Jekyll site
# under docs/ with a no-build Phaser 3 demo).
#
# Each test prints PASS or FAIL with its description.
# Exit code is non-zero if any test fails.
# Run from the repository root: bash tests/phaser-office-demo-acceptance.sh

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
# T1: docs/.nojekyll exists (GitHub Pages serves files verbatim)
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/docs/.nojekyll" ]; then
  pass "T1: docs/.nojekyll exists"
else
  fail "T1: docs/.nojekyll exists"
fi

# ---------------------------------------------------------------------------
# T2: docs/_config.yml does NOT exist (Jekyll removed)
# ---------------------------------------------------------------------------
if [ ! -f "$REPO_ROOT/docs/_config.yml" ]; then
  pass "T2: docs/_config.yml does not exist"
else
  fail "T2: docs/_config.yml does not exist (Jekyll config still present)"
fi

# ---------------------------------------------------------------------------
# T3: docs/Gemfile does NOT exist
# ---------------------------------------------------------------------------
if [ ! -f "$REPO_ROOT/docs/Gemfile" ]; then
  pass "T3: docs/Gemfile does not exist"
else
  fail "T3: docs/Gemfile does not exist (Jekyll Gemfile still present)"
fi

# ---------------------------------------------------------------------------
# T4: docs/index.md does NOT exist (replaced by index.html)
# ---------------------------------------------------------------------------
if [ ! -f "$REPO_ROOT/docs/index.md" ]; then
  pass "T4: docs/index.md does not exist"
else
  fail "T4: docs/index.md does not exist (still present)"
fi

# ---------------------------------------------------------------------------
# T5: docs/architecture.md does NOT exist (moved to repo-root ARCHITECTURE.md)
# ---------------------------------------------------------------------------
if [ ! -f "$REPO_ROOT/docs/architecture.md" ]; then
  pass "T5: docs/architecture.md does not exist"
else
  fail "T5: docs/architecture.md does not exist (should have moved to repo root)"
fi

# ---------------------------------------------------------------------------
# T6: Repo-root ARCHITECTURE.md exists with the substantive content
#     (recognizable H1 title from prior docs/architecture.md)
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/ARCHITECTURE.md" ] && \
   grep -q "Team Plugin — Architecture" "$REPO_ROOT/ARCHITECTURE.md"; then
  pass "T6: ARCHITECTURE.md exists at repo root with rescued architecture content"
else
  fail "T6: ARCHITECTURE.md exists at repo root with rescued architecture content"
fi

# ---------------------------------------------------------------------------
# T7: docs/index.html exists
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/docs/index.html" ]; then
  pass "T7: docs/index.html exists"
else
  fail "T7: docs/index.html exists"
fi

# ---------------------------------------------------------------------------
# T8: docs/index.html references phaser@3.80.1 (CDN version pin)
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/docs/index.html" ] && \
   grep -q "phaser@3.80.1" "$REPO_ROOT/docs/index.html"; then
  pass "T8: docs/index.html pins phaser@3.80.1"
else
  fail "T8: docs/index.html pins phaser@3.80.1"
fi

# ---------------------------------------------------------------------------
# T9: docs/index.html contains an integrity= attribute (SRI hash present)
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/docs/index.html" ] && \
   grep -q "integrity=" "$REPO_ROOT/docs/index.html"; then
  pass "T9: docs/index.html contains integrity= attribute (SRI hash)"
else
  fail "T9: docs/index.html contains integrity= attribute (SRI hash)"
fi

# ---------------------------------------------------------------------------
# T10: docs/index.html contains a crossorigin= attribute
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/docs/index.html" ] && \
   grep -q "crossorigin=" "$REPO_ROOT/docs/index.html"; then
  pass "T10: docs/index.html contains crossorigin= attribute"
else
  fail "T10: docs/index.html contains crossorigin= attribute"
fi

# ---------------------------------------------------------------------------
# T11: docs/src/main.js exists
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/docs/src/main.js" ]; then
  pass "T11: docs/src/main.js exists"
else
  fail "T11: docs/src/main.js exists"
fi

# ---------------------------------------------------------------------------
# T12: docs/src/main.js references pixelArt: true
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/docs/src/main.js" ] && \
   grep -q "pixelArt: true" "$REPO_ROOT/docs/src/main.js"; then
  pass "T12: docs/src/main.js sets pixelArt: true"
else
  fail "T12: docs/src/main.js sets pixelArt: true"
fi

# ---------------------------------------------------------------------------
# T13: docs/src/main.js references setZoom(2) (2x camera zoom)
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/docs/src/main.js" ] && \
   grep -q "setZoom(2)" "$REPO_ROOT/docs/src/main.js"; then
  pass "T13: docs/src/main.js calls setZoom(2)"
else
  fail "T13: docs/src/main.js calls setZoom(2)"
fi

# ---------------------------------------------------------------------------
# T14: docs/src/main.js references canvas dimensions 640 and 480
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/docs/src/main.js" ] && \
   grep -q "640" "$REPO_ROOT/docs/src/main.js" && \
   grep -q "480" "$REPO_ROOT/docs/src/main.js"; then
  pass "T14: docs/src/main.js references canvas dimensions 640 and 480"
else
  fail "T14: docs/src/main.js references canvas dimensions 640 and 480"
fi

# ---------------------------------------------------------------------------
# T15: docs/src/main.js references setSize(12 and setOffset(2 (body collider)
#      Whitespace-tolerant via grep -E.
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/docs/src/main.js" ] && \
   grep -qE "setSize\(\s*12" "$REPO_ROOT/docs/src/main.js" && \
   grep -qE "setOffset\(\s*2" "$REPO_ROOT/docs/src/main.js"; then
  pass "T15: docs/src/main.js sets body collider setSize(12,...) and setOffset(2,...)"
else
  fail "T15: docs/src/main.js sets body collider setSize(12,...) and setOffset(2,...)"
fi

# ---------------------------------------------------------------------------
# T16: docs/src/main.js references all 13 agent names from
#      skills/team/registry.json
# ---------------------------------------------------------------------------
T16_PASS=true
T16_MISSING=""
AGENT_NAMES=(
  "questioner"
  "file-finder"
  "researcher"
  "design-author"
  "structure-planner"
  "planner"
  "test-architect"
  "implementer"
  "code-reviewer"
  "security-reviewer"
  "technical-writer"
  "ux-reviewer"
  "verifier"
)
if [ -f "$REPO_ROOT/docs/src/main.js" ]; then
  for name in "${AGENT_NAMES[@]}"; do
    if ! grep -q "$name" "$REPO_ROOT/docs/src/main.js"; then
      T16_PASS=false
      T16_MISSING="$T16_MISSING $name"
    fi
  done
else
  T16_PASS=false
  T16_MISSING=" (file missing)"
fi
if [ "$T16_PASS" = "true" ]; then
  pass "T16: docs/src/main.js references all 13 agent names"
else
  fail "T16: docs/src/main.js references all 13 agent names (missing:$T16_MISSING)"
fi

# ---------------------------------------------------------------------------
# T17: docs/assets/sprites/agent.png exists
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/docs/assets/sprites/agent.png" ]; then
  pass "T17: docs/assets/sprites/agent.png exists"
else
  fail "T17: docs/assets/sprites/agent.png exists"
fi

# ---------------------------------------------------------------------------
# T18: docs/assets/sprites/agent.png is a valid PNG (magic bytes \x89PNG)
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/docs/assets/sprites/agent.png" ] && \
   head -c 4 "$REPO_ROOT/docs/assets/sprites/agent.png" | \
   od -An -c | grep -q '211   P   N   G'; then
  pass "T18: docs/assets/sprites/agent.png has valid PNG magic bytes"
else
  fail "T18: docs/assets/sprites/agent.png has valid PNG magic bytes"
fi

# ---------------------------------------------------------------------------
# T19: docs/assets/sprites/agent.png is exactly 64x16
#      `file` prints `PNG image data, 64 x 16` on macOS/Linux
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/docs/assets/sprites/agent.png" ] && \
   file "$REPO_ROOT/docs/assets/sprites/agent.png" | grep -q "64 x 16"; then
  pass "T19: docs/assets/sprites/agent.png is 64x16"
else
  fail "T19: docs/assets/sprites/agent.png is 64x16"
fi

# ---------------------------------------------------------------------------
# T20: docs/assets/backgrounds/office.png exists
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/docs/assets/backgrounds/office.png" ]; then
  pass "T20: docs/assets/backgrounds/office.png exists"
else
  fail "T20: docs/assets/backgrounds/office.png exists"
fi

# ---------------------------------------------------------------------------
# T21: docs/assets/backgrounds/office.png is a valid PNG
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/docs/assets/backgrounds/office.png" ] && \
   head -c 4 "$REPO_ROOT/docs/assets/backgrounds/office.png" | \
   od -An -c | grep -q '211   P   N   G'; then
  pass "T21: docs/assets/backgrounds/office.png has valid PNG magic bytes"
else
  fail "T21: docs/assets/backgrounds/office.png has valid PNG magic bytes"
fi

# ---------------------------------------------------------------------------
# T22: docs/assets/backgrounds/office.png is exactly 640x480
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/docs/assets/backgrounds/office.png" ] && \
   file "$REPO_ROOT/docs/assets/backgrounds/office.png" | grep -q "640 x 480"; then
  pass "T22: docs/assets/backgrounds/office.png is 640x480"
else
  fail "T22: docs/assets/backgrounds/office.png is 640x480"
fi

# ---------------------------------------------------------------------------
# T23: docs/scripts/generate-assets.mjs exists
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/docs/scripts/generate-assets.mjs" ]; then
  pass "T23: docs/scripts/generate-assets.mjs exists"
else
  fail "T23: docs/scripts/generate-assets.mjs exists"
fi

# ---------------------------------------------------------------------------
# T24: docs/scripts/generate-assets.mjs is ESM (uses import, not require)
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/docs/scripts/generate-assets.mjs" ] && \
   grep -qE "^import " "$REPO_ROOT/docs/scripts/generate-assets.mjs" && \
   ! grep -qE "(^|[^a-zA-Z_])require\(" "$REPO_ROOT/docs/scripts/generate-assets.mjs"; then
  pass "T24: docs/scripts/generate-assets.mjs is ESM (import statements, no require)"
else
  fail "T24: docs/scripts/generate-assets.mjs is ESM (import statements, no require)"
fi

# ---------------------------------------------------------------------------
# T25: docs/package.json exists
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/docs/package.json" ]; then
  pass "T25: docs/package.json exists"
else
  fail "T25: docs/package.json exists"
fi

# ---------------------------------------------------------------------------
# T26: docs/package.json "start" script matches the brief verbatim:
#      live-server --port=8080 --open=./index.html
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/docs/package.json" ] && \
   grep -q '"start": "live-server --port=8080 --open=./index.html"' \
   "$REPO_ROOT/docs/package.json"; then
  pass "T26: docs/package.json start script matches the brief verbatim"
else
  fail "T26: docs/package.json start script matches the brief verbatim"
fi

# ---------------------------------------------------------------------------
# T27: docs/package.json lists live-server as a devDependency
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/docs/package.json" ] && \
   grep -q '"live-server"' "$REPO_ROOT/docs/package.json"; then
  pass "T27: docs/package.json lists live-server (devDependency)"
else
  fail "T27: docs/package.json lists live-server (devDependency)"
fi

# ---------------------------------------------------------------------------
# T28: docs/package.json does NOT list phaser as a dependency or devDependency
#      (Phaser is delivered via CDN per design decision #2)
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/docs/package.json" ] && \
   ! grep -q '"phaser"' "$REPO_ROOT/docs/package.json"; then
  pass "T28: docs/package.json does not list phaser (CDN delivery)"
else
  fail "T28: docs/package.json does not list phaser (CDN delivery)"
fi

# ---------------------------------------------------------------------------
# T29: docs/README.md exists
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/docs/README.md" ]; then
  pass "T29: docs/README.md exists"
else
  fail "T29: docs/README.md exists"
fi

# ---------------------------------------------------------------------------
# T30: docs/README.md mentions npm install and npm start
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/docs/README.md" ] && \
   grep -q "npm install" "$REPO_ROOT/docs/README.md" && \
   grep -q "npm start" "$REPO_ROOT/docs/README.md"; then
  pass "T30: docs/README.md mentions npm install and npm start"
else
  fail "T30: docs/README.md mentions npm install and npm start"
fi

# ---------------------------------------------------------------------------
# T31: docs/README.md mentions team.bostonaholic.dev (deployment target)
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/docs/README.md" ] && \
   grep -q "team.bostonaholic.dev" "$REPO_ROOT/docs/README.md"; then
  pass "T31: docs/README.md mentions team.bostonaholic.dev"
else
  fail "T31: docs/README.md mentions team.bostonaholic.dev"
fi

# ---------------------------------------------------------------------------
# T32: dev.yml docs command no longer references `bundle exec jekyll serve`
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/dev.yml" ] && \
   ! grep -q "bundle exec jekyll serve" "$REPO_ROOT/dev.yml"; then
  pass "T32: dev.yml docs command no longer references bundle exec jekyll serve"
else
  fail "T32: dev.yml docs command no longer references bundle exec jekyll serve"
fi

# ---------------------------------------------------------------------------
# T33: docs/src/main.js contains the literal player label 'You'
#      (the player character represents the orchestrator, distinct from the
#      13 NPC agent names)
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/docs/src/main.js" ] && \
   grep -q "'You'" "$REPO_ROOT/docs/src/main.js"; then
  pass "T33: docs/src/main.js contains player label 'You'"
else
  fail "T33: docs/src/main.js contains player label 'You'"
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
