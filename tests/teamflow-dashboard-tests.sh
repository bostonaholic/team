#!/usr/bin/env bash
# Acceptance tests for the Teamflow Dashboard feature.
# Each test prints PASS or FAIL with its description.
# Exit code is non-zero if any test fails.
# Run from the repository root: bash tests/teamflow-dashboard-tests.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILURES=0
TOTAL=0

pass() {
  TOTAL=$((TOTAL + 1))
  echo "PASS  $1"
}

fail() {
  TOTAL=$((TOTAL + 1))
  echo "FAIL  $1"
  FAILURES=$((FAILURES + 1))
}

# ---------------------------------------------------------------------------
# Cleanup trap for server-dependent tests (T10-T14, T19)
# ---------------------------------------------------------------------------
SERVER_PID=""
TMPDIR_FIXTURE=""

cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  if [ -n "$TMPDIR_FIXTURE" ] && [ -d "$TMPDIR_FIXTURE" ]; then
    command rm -rf "$TMPDIR_FIXTURE"
  fi
}

trap cleanup EXIT

# ===========================================================================
# Phase 1: Shared Event Library
# ===========================================================================

# ---------------------------------------------------------------------------
# T1: lib/events.mjs exports EVENT_TO_PHASE
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/lib/events.mjs" ] && \
   node -e "import('$REPO_ROOT/lib/events.mjs').then(m => { if (typeof m.EVENT_TO_PHASE !== 'object') throw new Error('not an object'); })" 2>/dev/null; then
  pass "T1: lib/events.mjs exports EVENT_TO_PHASE"
else
  fail "T1: lib/events.mjs exports EVENT_TO_PHASE -- expected lib/events.mjs to exist and export EVENT_TO_PHASE as an object"
fi

# ---------------------------------------------------------------------------
# T2: lib/events.mjs exports deriveState
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/lib/events.mjs" ] && \
   node -e "import('$REPO_ROOT/lib/events.mjs').then(m => { if (typeof m.deriveState !== 'function') throw new Error('not a function'); })" 2>/dev/null; then
  pass "T2: lib/events.mjs exports deriveState"
else
  fail "T2: lib/events.mjs exports deriveState -- expected lib/events.mjs to exist and export deriveState as a function"
fi

# ---------------------------------------------------------------------------
# T3: lib/events.mjs exports readEventLog
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/lib/events.mjs" ] && \
   node -e "import('$REPO_ROOT/lib/events.mjs').then(m => { if (typeof m.readEventLog !== 'function') throw new Error('not a function'); })" 2>/dev/null; then
  pass "T3: lib/events.mjs exports readEventLog"
else
  fail "T3: lib/events.mjs exports readEventLog -- expected lib/events.mjs to exist and export readEventLog as a function"
fi

# ---------------------------------------------------------------------------
# T4: session-start-recover.mjs imports from lib/events.mjs
# ---------------------------------------------------------------------------
if grep -q "lib/events.mjs" "$REPO_ROOT/hooks/session-start-recover.mjs" 2>/dev/null; then
  pass "T4: session-start-recover.mjs imports from lib/events.mjs"
else
  fail "T4: session-start-recover.mjs imports from lib/events.mjs -- expected import statement referencing lib/events.mjs"
fi

# ---------------------------------------------------------------------------
# T5: pre-compact-anchor.mjs imports from lib/events.mjs
# ---------------------------------------------------------------------------
if grep -q "lib/events.mjs" "$REPO_ROOT/hooks/pre-compact-anchor.mjs" 2>/dev/null; then
  pass "T5: pre-compact-anchor.mjs imports from lib/events.mjs"
else
  fail "T5: pre-compact-anchor.mjs imports from lib/events.mjs -- expected import statement referencing lib/events.mjs"
fi

# ---------------------------------------------------------------------------
# T6: session-start-recover.mjs exits 0 with no pipeline
#     Simulate hook invocation with empty stdin and a temp project dir
#     that has no .team/events.jsonl.
# ---------------------------------------------------------------------------
TMPDIR_T6=$(mktemp -d)
if CLAUDE_PROJECT_DIR="$TMPDIR_T6" echo '{}' | node "$REPO_ROOT/hooks/session-start-recover.mjs" >/dev/null 2>&1; then
  pass "T6: session-start-recover.mjs exits 0 with no pipeline"
else
  fail "T6: session-start-recover.mjs exits 0 with no pipeline -- hook exited non-zero"
fi
command rm -rf "$TMPDIR_T6"

# ---------------------------------------------------------------------------
# T7: pre-compact-anchor.mjs exits 0 with no pipeline
# ---------------------------------------------------------------------------
TMPDIR_T7=$(mktemp -d)
if CLAUDE_PROJECT_DIR="$TMPDIR_T7" echo '{}' | node "$REPO_ROOT/hooks/pre-compact-anchor.mjs" >/dev/null 2>&1; then
  pass "T7: pre-compact-anchor.mjs exits 0 with no pipeline"
else
  fail "T7: pre-compact-anchor.mjs exits 0 with no pipeline -- hook exited non-zero"
fi
command rm -rf "$TMPDIR_T7"

# ===========================================================================
# Phase 2: Teamflow Server Scaffolding
# ===========================================================================

# ---------------------------------------------------------------------------
# T8: teamflow/package.json exists with correct name
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/teamflow/package.json" ] && \
   node -e "const p = JSON.parse(require('fs').readFileSync('$REPO_ROOT/teamflow/package.json','utf-8')); if (p.name !== '@team/teamflow') throw new Error('wrong name: ' + p.name);" 2>/dev/null; then
  pass "T8: teamflow/package.json exists with correct name"
else
  fail "T8: teamflow/package.json exists with correct name -- expected teamflow/package.json with name '@team/teamflow'"
fi

# ---------------------------------------------------------------------------
# T9: teamflow/package.json has fastify dependency
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/teamflow/package.json" ] && \
   node -e "const p = JSON.parse(require('fs').readFileSync('$REPO_ROOT/teamflow/package.json','utf-8')); if (!p.dependencies || !p.dependencies.fastify) throw new Error('no fastify dep');" 2>/dev/null; then
  pass "T9: teamflow/package.json has fastify dependency"
else
  fail "T9: teamflow/package.json has fastify dependency -- expected fastify in dependencies"
fi

# ---------------------------------------------------------------------------
# T10: teamflow server starts on port 7425
#      Start the server in background, wait for port, then check.
# ---------------------------------------------------------------------------
TMPDIR_FIXTURE=$(mktemp -d)
mkdir -p "$TMPDIR_FIXTURE/.team"

# Create a minimal events.jsonl for the server to tail
cat > "$TMPDIR_FIXTURE/.team/events.jsonl" <<'EVENTS'
{"seq":1,"event":"feature.requested","producer":"router","ts":"2026-03-28T10:00:00Z","data":{"topic":"test-feature","description":"A test feature"}}
EVENTS

SERVER_STARTED=false

if [ -f "$REPO_ROOT/teamflow/package.json" ] && [ -d "$REPO_ROOT/teamflow/node_modules" ]; then
  # Start the server with a temp project dir and suppress browser open
  TEAMFLOW_NO_OPEN=1 CLAUDE_PROJECT_DIR="$TMPDIR_FIXTURE" \
    node --import tsx "$REPO_ROOT/teamflow/src/server.ts" &>/dev/null &
  SERVER_PID=$!

  # Wait up to 5 seconds for port 7425
  for i in $(seq 1 50); do
    if nc -z 127.0.0.1 7425 2>/dev/null; then
      SERVER_STARTED=true
      break
    fi
    sleep 0.1
  done
fi

if [ "$SERVER_STARTED" = "true" ]; then
  pass "T10: teamflow server starts on port 7425"
else
  fail "T10: teamflow server starts on port 7425 -- server did not bind to port 7425 within 5 seconds"
fi

# ---------------------------------------------------------------------------
# T11: health endpoint returns ok
# ---------------------------------------------------------------------------
if [ "$SERVER_STARTED" = "true" ]; then
  HEALTH_RESPONSE=$(curl -s -f http://127.0.0.1:7425/api/health 2>/dev/null || echo "")
  if echo "$HEALTH_RESPONSE" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8')); if(d.status!=='ok') throw new Error();" 2>/dev/null; then
    pass "T11: health endpoint returns ok"
  else
    fail "T11: health endpoint returns ok -- expected {\"status\":\"ok\"} from /api/health, got: $HEALTH_RESPONSE"
  fi
else
  fail "T11: health endpoint returns ok -- server not running, cannot test /api/health"
fi

# ---------------------------------------------------------------------------
# T12: state endpoint returns valid JSON
# ---------------------------------------------------------------------------
if [ "$SERVER_STARTED" = "true" ]; then
  STATE_RESPONSE=$(curl -s -f http://127.0.0.1:7425/api/state 2>/dev/null || echo "")
  if echo "$STATE_RESPONSE" | node -e "JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));" 2>/dev/null; then
    pass "T12: state endpoint returns valid JSON"
  else
    fail "T12: state endpoint returns valid JSON -- expected valid JSON from /api/state, got: $STATE_RESPONSE"
  fi
else
  fail "T12: state endpoint returns valid JSON -- server not running, cannot test /api/state"
fi

# ---------------------------------------------------------------------------
# T13: SSE endpoint sends snapshot on connect
#      Connect to /api/events, read the first SSE message, verify it is
#      a snapshot event.
# ---------------------------------------------------------------------------
if [ "$SERVER_STARTED" = "true" ]; then
  # curl with a timeout to grab the first SSE message
  SSE_OUTPUT=$(curl -s -N --max-time 3 http://127.0.0.1:7425/api/events 2>/dev/null || true)
  if echo "$SSE_OUTPUT" | grep -q "snapshot"; then
    pass "T13: SSE endpoint sends snapshot on connect"
  else
    fail "T13: SSE endpoint sends snapshot on connect -- expected 'snapshot' in SSE stream, got: $(echo "$SSE_OUTPUT" | head -5)"
  fi
else
  fail "T13: SSE endpoint sends snapshot on connect -- server not running, cannot test /api/events"
fi

# ---------------------------------------------------------------------------
# T14: state reflects events from file
#      Append additional events to events.jsonl, wait briefly, then check
#      that /api/state reflects the new phase. Also verifies that multiple
#      rapid appends are captured (critic issue C3).
# ---------------------------------------------------------------------------
if [ "$SERVER_STARTED" = "true" ]; then
  # Append three events in rapid succession to test tailing + rapid capture
  cat >> "$TMPDIR_FIXTURE/.team/events.jsonl" <<'EVENTS'
{"seq":2,"event":"research.completed","producer":"router","ts":"2026-03-28T10:01:00Z","data":{"researchPath":"docs/plans/research.md","openQuestions":0},"artifact":"docs/plans/research.md"}
{"seq":3,"event":"plan.drafted","producer":"planner","ts":"2026-03-28T10:02:00Z","data":{"planPath":"docs/plans/plan.md","steps":5,"testCount":10},"artifact":"docs/plans/plan.md"}
{"seq":4,"event":"plan.approved","producer":"router","ts":"2026-03-28T10:03:00Z","data":{"planPath":"docs/plans/plan.md"}}
EVENTS

  # Give the tailer time to pick up the appends
  sleep 1

  STATE_AFTER=$(curl -s -f http://127.0.0.1:7425/api/state 2>/dev/null || echo "")
  # After plan.approved, the phase should be TEST-FIRST
  if echo "$STATE_AFTER" | grep -q "TEST-FIRST"; then
    pass "T14: state reflects events from file"
  else
    fail "T14: state reflects events from file -- expected phase TEST-FIRST after appending plan.approved event, got: $(echo "$STATE_AFTER" | head -3)"
  fi
else
  fail "T14: state reflects events from file -- server not running, cannot test state tailing"
fi

# Stop the server before filesystem tests
if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  SERVER_PID=""
fi

# ===========================================================================
# Phase 4: Frontend Build
# ===========================================================================

# ---------------------------------------------------------------------------
# T15: teamflow/dist/index.html exists
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/teamflow/dist/index.html" ]; then
  pass "T15: teamflow/dist/index.html exists"
else
  fail "T15: teamflow/dist/index.html exists -- expected built frontend at teamflow/dist/index.html"
fi

# ---------------------------------------------------------------------------
# T16: dist contains bundled JS
# ---------------------------------------------------------------------------
if ls "$REPO_ROOT/teamflow/dist/assets/"*.js 1>/dev/null 2>&1; then
  pass "T16: dist contains bundled JS"
else
  fail "T16: dist contains bundled JS -- expected JS files in teamflow/dist/assets/"
fi

# ===========================================================================
# Phase 1 (continued): Duplication removal
# ===========================================================================

# ---------------------------------------------------------------------------
# T17: shared lib has no duplicate in hooks
#      After extraction, hooks must NOT contain inline EVENT_TO_PHASE
#      definitions. They should import from lib/events.mjs instead.
# ---------------------------------------------------------------------------
T17_PASS=true
T17_DETAIL=""

# Check session-start-recover.mjs for inline EVENT_TO_PHASE object literal
RECOVER_INLINE=$(grep -c "EVENT_TO_PHASE\s*=" "$REPO_ROOT/hooks/session-start-recover.mjs" 2>/dev/null) || RECOVER_INLINE=0
if [ "$RECOVER_INLINE" -gt 0 ]; then
  # If the file has EVENT_TO_PHASE = { ... } it still has the inline copy.
  # Only an import re-export (import { EVENT_TO_PHASE } from ...) is acceptable.
  if ! grep -q "import.*EVENT_TO_PHASE.*from" "$REPO_ROOT/hooks/session-start-recover.mjs" 2>/dev/null; then
    T17_PASS=false
    T17_DETAIL="session-start-recover.mjs still defines EVENT_TO_PHASE inline"
  fi
fi

# Check pre-compact-anchor.mjs for inline EVENT_TO_PHASE object literal
COMPACT_INLINE=$(grep -c "EVENT_TO_PHASE\s*=" "$REPO_ROOT/hooks/pre-compact-anchor.mjs" 2>/dev/null) || COMPACT_INLINE=0
if [ "$COMPACT_INLINE" -gt 0 ]; then
  if ! grep -q "import.*EVENT_TO_PHASE.*from" "$REPO_ROOT/hooks/pre-compact-anchor.mjs" 2>/dev/null; then
    T17_PASS=false
    T17_DETAIL="${T17_DETAIL:+$T17_DETAIL; }pre-compact-anchor.mjs still defines EVENT_TO_PHASE inline"
  fi
fi

if [ "$T17_PASS" = "true" ]; then
  pass "T17: shared lib has no duplicate in hooks"
else
  fail "T17: shared lib has no duplicate in hooks -- $T17_DETAIL"
fi

# ===========================================================================
# Regression check
# ===========================================================================

# ---------------------------------------------------------------------------
# T18: existing tests still pass
# ---------------------------------------------------------------------------
if bash "$REPO_ROOT/tests/skill-architecture-tests.sh" >/dev/null 2>&1; then
  pass "T18: existing tests still pass"
else
  fail "T18: existing tests still pass -- skill-architecture-tests.sh reported failures"
fi

# ===========================================================================
# Critic issue m5: TEAMFLOW_PORT env var override
# ===========================================================================

# ---------------------------------------------------------------------------
# T19: TEAMFLOW_PORT env var overrides default port
#      Start the server with TEAMFLOW_PORT=7430, verify it binds there.
# ---------------------------------------------------------------------------
T19_SERVER_PID=""
T19_STARTED=false

if [ -f "$REPO_ROOT/teamflow/package.json" ] && [ -d "$REPO_ROOT/teamflow/node_modules" ]; then
  TEAMFLOW_PORT=7430 TEAMFLOW_NO_OPEN=1 CLAUDE_PROJECT_DIR="$TMPDIR_FIXTURE" \
    node --import tsx "$REPO_ROOT/teamflow/src/server.ts" &>/dev/null &
  T19_SERVER_PID=$!

  for i in $(seq 1 50); do
    if nc -z 127.0.0.1 7430 2>/dev/null; then
      T19_STARTED=true
      break
    fi
    sleep 0.1
  done
fi

if [ "$T19_STARTED" = "true" ]; then
  T19_HEALTH=$(curl -s -f http://127.0.0.1:7430/api/health 2>/dev/null || echo "")
  if echo "$T19_HEALTH" | grep -q '"ok"'; then
    pass "T19: TEAMFLOW_PORT env var overrides default port"
  else
    fail "T19: TEAMFLOW_PORT env var overrides default port -- server started on 7430 but health check failed"
  fi
else
  fail "T19: TEAMFLOW_PORT env var overrides default port -- server did not bind to port 7430"
fi

if [ -n "$T19_SERVER_PID" ] && kill -0 "$T19_SERVER_PID" 2>/dev/null; then
  kill "$T19_SERVER_PID" 2>/dev/null || true
  wait "$T19_SERVER_PID" 2>/dev/null || true
fi

# ===========================================================================
# Phase 5: Dev Server Integration
# ===========================================================================

# ---------------------------------------------------------------------------
# T20: dev.yml has server command
#      Static check: the commands.server key must exist in dev.yml.
#      Use anchored grep (^  server:) to match the top-level commands entry
#      and avoid false positives from nested keys or comments.
# ---------------------------------------------------------------------------
if grep -q "^  server:" "$REPO_ROOT/dev.yml" 2>/dev/null; then
  pass "T20: dev.yml has server command"
else
  fail "T20: dev.yml has server command -- expected 'server:' under commands: in dev.yml"
fi

# ---------------------------------------------------------------------------
# T21: demo.mjs detects running server (health-check dedup)
#      Start a server in the background, then run demo.mjs with
#      TEAMFLOW_NO_OPEN=1. The refactored demo.mjs should detect the running
#      server and log "already running" instead of spawning a duplicate.
# ---------------------------------------------------------------------------
T21_SERVER_PID=""
T21_DEMO_OUTPUT=""
T21_PASSED=false

if [ -f "$REPO_ROOT/teamflow/package.json" ] && [ -d "$REPO_ROOT/teamflow/node_modules" ]; then
  # Start a background server for demo.mjs to detect
  TEAMFLOW_NO_OPEN=1 CLAUDE_PROJECT_DIR="$TMPDIR_FIXTURE" \
    node --import tsx "$REPO_ROOT/teamflow/src/server.ts" &>/dev/null &
  T21_SERVER_PID=$!

  # Wait up to 5 seconds for the server to be ready
  T21_SERVER_READY=false
  for i in $(seq 1 50); do
    if nc -z 127.0.0.1 7425 2>/dev/null; then
      T21_SERVER_READY=true
      break
    fi
    sleep 0.1
  done

  if [ "$T21_SERVER_READY" = "true" ]; then
    # Run demo.mjs — it should detect the running server and skip spawn.
    # Timeout after 15s so the test doesn't hang.
    T21_DEMO_OUTPUT=$(
      timeout 15 \
        env TEAMFLOW_NO_OPEN=1 CLAUDE_PROJECT_DIR="$TMPDIR_FIXTURE" \
        node "$REPO_ROOT/teamflow/bin/demo.mjs" 2>&1
    ) || true

    if echo "$T21_DEMO_OUTPUT" | grep -qi "already running"; then
      T21_PASSED=true
    fi
  fi
fi

if [ "$T21_PASSED" = "true" ]; then
  pass "T21: demo.mjs detects running server (health-check dedup)"
else
  fail "T21: demo.mjs detects running server (health-check dedup) -- expected 'already running' in demo.mjs output when server is already up; got: $(echo "$T21_DEMO_OUTPUT" | head -5)"
fi

# Inline cleanup — kill T21's server regardless of pass/fail
if [ -n "$T21_SERVER_PID" ] && kill -0 "$T21_SERVER_PID" 2>/dev/null; then
  kill "$T21_SERVER_PID" 2>/dev/null || true
  wait "$T21_SERVER_PID" 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# T22: dev server command sets TEAMFLOW_NO_OPEN=1
#      Scope the search to the server command block in dev.yml so we don't
#      get a false positive from other command blocks. Use awk to extract
#      the run: line that belongs to the server: block, then assert it
#      contains TEAMFLOW_NO_OPEN=1.
# ---------------------------------------------------------------------------
T22_SERVER_RUN=$(awk '/^  server:/{found=1} found && /run:/{print; exit}' "$REPO_ROOT/dev.yml" 2>/dev/null || true)

if echo "$T22_SERVER_RUN" | grep -q "TEAMFLOW_NO_OPEN=1"; then
  pass "T22: dev server command sets TEAMFLOW_NO_OPEN=1"
else
  fail "T22: dev server command sets TEAMFLOW_NO_OPEN=1 -- expected TEAMFLOW_NO_OPEN=1 in server command's run: line; got: $T22_SERVER_RUN"
fi

# ---------------------------------------------------------------------------
# T23: dev server command builds frontend before starting
#      The server command must build the frontend before starting, so that
#      teamflow/dist/ is always up to date when the server is launched.
#      This is done via build_first: true + a top-level build: key.
# ---------------------------------------------------------------------------
T23_BUILD_FIRST=$(awk '/^  server:/{found=1} found && /build_first:/{print; exit}' "$REPO_ROOT/dev.yml" 2>/dev/null || true)
T23_BUILD_KEY=$(grep -q "^build:" "$REPO_ROOT/dev.yml" 2>/dev/null && echo "exists" || echo "")

if echo "$T23_BUILD_FIRST" | grep -q "true" && [ "$T23_BUILD_KEY" = "exists" ]; then
  pass "T23: dev server command builds frontend before starting"
else
  fail "T23: dev server command builds frontend before starting -- expected build_first: true on server command and top-level build: key; got build_first='$T23_BUILD_FIRST', build_key='$T23_BUILD_KEY'"
fi

# ===========================================================================
# Summary
# ===========================================================================
echo ""
echo "---"
echo "Results: $((TOTAL - FAILURES))/$TOTAL passed, $FAILURES failed."
echo ""
if [ "$FAILURES" -eq 0 ]; then
  echo "All tests passed."
  exit 0
else
  echo "$FAILURES test(s) failed."
  exit 1
fi
