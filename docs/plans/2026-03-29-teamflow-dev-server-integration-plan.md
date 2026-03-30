# Teamflow Dev Server Integration -- Implementation Plan

**Date:** 2026-03-29

---

### Context

The Teamflow dashboard server can only be started via `dev demo`, which couples
server startup with fake event generation. Developers running real pipelines
have no way to start just the server. This plan adds a `dev server` command,
refactors `demo.mjs` to detect an already-running server, and adds acceptance
tests T20-T22. Research findings are in
`docs/plans/2026-03-29-teamflow-dev-server-integration-research.md`.

**Resolved decisions:**
- D1: `dev server` blocks (foreground), no daemonization
- D2: `demo.mjs` checks `/api/health` first, spawns server only if not running
- D3: Add `server:` command to `dev.yml` `commands:` section
- D4: New tests T20-T22 follow existing T10-T19 pattern
- D5: No parallel process support in dev CLI

---

### Open Questions

None. All five questions from the research were resolved by product decisions
D1-D5 provided in the prompt.

---

### Steps

#### Phase 1: Add `dev server` command

**Goal:** A new `dev server` command starts the Teamflow Fastify server in the
foreground with `TEAMFLOW_NO_OPEN=1`, blocking until killed.

**File: `dev.yml`**
- Add a `server` entry to the `commands:` section, after `demo`:
  ```yaml
  server:
    desc: "Start the Teamflow dashboard server (foreground, no demo data)"
    run: "cd teamflow && npm install --silent && TEAMFLOW_NO_OPEN=1 npm start"
  ```
- The `npm start` script already runs `node --import tsx src/server.ts`.
- `TEAMFLOW_NO_OPEN=1` suppresses browser auto-open in server context.
- `npm install --silent` ensures `node_modules` exists (matches `demo` pattern).

**Verify:** `dev server` starts the server, `curl http://127.0.0.1:7425/api/health` returns `{"status":"ok"}`, and Ctrl+C stops it cleanly.

#### Phase 2: Refactor `demo.mjs` to detect running server

**Goal:** `demo.mjs` checks whether a server is already listening before
spawning one, so `dev demo` works correctly when `dev server` is already running
in another terminal.

**File: `teamflow/bin/demo.mjs`**

1. Add a `checkHealth()` async helper that fetches
   `http://127.0.0.1:${port}/api/health` and returns `true` if the response
   status is 200, `false` on any error (connection refused, timeout, etc.).
   Use Node's built-in `fetch` (available in Node 18+). Set a 1-second timeout
   via `AbortSignal.timeout(1000)`.

2. In `main()`, before the server spawn block, call `checkHealth()`:
   - If `true`: log `"Server already running, skipping spawn."`, set
     `server = null` (no child process to manage).
   - If `false`: spawn as today (existing code, no change).

3. Update the SIGINT/SIGTERM handlers to only call `server.kill()` when
   `server !== null`.

4. Replace the fixed `await sleep(1500)` wait with a health-poll loop:
   poll `checkHealth()` every 200ms for up to 5 seconds after spawn. This
   makes startup deterministic instead of relying on a magic delay.

**File: `teamflow/bin/demo.mjs` -- summary of changes:**
- Add `checkHealth(port)` function (~8 lines)
- Wrap spawn in `if (!(await checkHealth(port)))` guard
- Replace `sleep(1500)` with poll loop after spawn
- Guard `server.kill()` in signal handlers

**Verify:** Start `dev server` in terminal A, then `dev demo` in terminal B.
Terminal B should log "Server already running" and only emit events. Killing
terminal B should not kill terminal A's server.

#### Phase 3: Frontend build staleness check

**Goal:** `dev server` serves the dashboard UI, so `teamflow/dist/` must exist.
The `run:` command handles this.

**File: `dev.yml`** (update the `server` command from Phase 1)
- Extend the `run:` string to build the frontend if `dist/` is missing or
  stale:
  ```yaml
  server:
    desc: "Start the Teamflow dashboard server (foreground, no demo data)"
    run: "cd teamflow && npm install --silent && npm run build && TEAMFLOW_NO_OPEN=1 npm start"
  ```
- `npm run build` runs `vite build`, which is fast (~1s) and idempotent. Running
  it unconditionally is simpler and safer than staleness detection. Vite's
  internal caching handles the performance concern.

**Verify:** Delete `teamflow/dist/`, run `dev server`, confirm `dist/` is
rebuilt and `http://127.0.0.1:7425/` serves the dashboard HTML.

#### Phase 4: Acceptance tests T20-T22

**Goal:** Three new tests validating the new behavior, appended to
`tests/teamflow-dashboard-tests.sh` before the summary block.

**File: `tests/teamflow-dashboard-tests.sh`**

Insert a new section before the `# Summary` block:

```
# ===========================================================================
# Phase 5: Dev Server Integration
# ===========================================================================
```

**T20: `dev.yml` has server command**
- Parse `dev.yml` and verify the `commands.server` key exists.
- Pattern: `grep -q "server:" "$REPO_ROOT/dev.yml"` (matches existing T-style).

**T21: demo.mjs detects running server (health-check dedup)**
- Start the server in background (same pattern as T10).
- Run `node teamflow/bin/demo.mjs` with `TEAMFLOW_NO_OPEN=1` and capture
  stdout to a variable (timeout after 15s via `timeout 15`).
- Assert stdout contains "already running" (the dedup message from Phase 2).
- Kill both processes in cleanup.

**T22: `dev server` sets TEAMFLOW_NO_OPEN=1**
- Parse the `dev.yml` server command's `run:` value.
- Assert it contains `TEAMFLOW_NO_OPEN=1`.
- Pattern: `grep -q "TEAMFLOW_NO_OPEN=1" "$REPO_ROOT/dev.yml"` scoped to the
  server command context. More precisely: extract the server run line and check
  for the env var.

**Cleanup:** T21 starts a server, so add its PID to the existing cleanup trap.
Use a dedicated variable `T21_SERVER_PID` and add cleanup logic matching the
existing T19 pattern.

**Verify:** `bash tests/teamflow-dashboard-tests.sh` passes all 22 tests.

---

### Tests

| ID  | Description                              | Type        |
|-----|------------------------------------------|-------------|
| T20 | `dev.yml` has server command             | Static      |
| T21 | demo.mjs detects running server          | Integration |
| T22 | `dev server` sets TEAMFLOW_NO_OPEN=1     | Static      |

---

### Done Criteria

1. `dev server` starts the Teamflow server in the foreground, serves the
   dashboard, and blocks until Ctrl+C.
2. `dev demo` detects an already-running server and skips spawning a duplicate.
3. `dev server` always builds the frontend before starting.
4. `TEAMFLOW_NO_OPEN=1` is set in the `dev server` command.
5. All 22 acceptance tests pass: `bash tests/teamflow-dashboard-tests.sh`
6. No changes to `server.ts`, `teamflow.mjs`, or any other file not listed
   in the plan.

---

### Files Changed

| File | Change |
|------|--------|
| `dev.yml` | Add `server` command |
| `teamflow/bin/demo.mjs` | Add health check, conditional spawn, poll loop |
| `tests/teamflow-dashboard-tests.sh` | Add T20-T22 |

### Files Not Changed

| File | Reason |
|------|--------|
| `teamflow/src/server.ts` | Already has `/api/health`; no modifications needed |
| `teamflow/bin/teamflow.mjs` | Launcher shim unchanged; `dev server` uses `npm start` |
| `teamflow/package.json` | No new dependencies; `fetch` is built into Node 18+ |
