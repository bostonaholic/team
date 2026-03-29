# Teamflow Dashboard -- Implementation Plan

**Date:** 2026-03-28

---

### Context

The TEAM plugin's event-driven pipeline has no visual observability. Users run
`/team` and get text output in a terminal with no way to see which agents are
active, what phase the pipeline is in, or where failures occurred. This plan
adds a local Svelte 5 dashboard served by a Fastify sidecar that tails
`.team/events.jsonl` and streams state to the browser via SSE. Research
findings are in `docs/plans/2026-03-28-teamflow-dashboard-research.md`.

---

### Open Questions

None. All seven questions from the research were resolved by product decisions
D1--D7 provided in the prompt.

---

### Steps

#### Phase 1: Shared Event Library (extract duplication)

**Goal:** Extract `EVENT_TO_PHASE`, `deriveState()`, and `readEventLog()` from
the two hooks into a shared module that hooks and the server both import.

**1.1** `[sequential]` Create `lib/events.mjs`
- Export `EVENT_TO_PHASE`, `deriveState(events)`, `readEventLog(projectDir)`,
  and `projectDir()`.
- Logic is identical to what exists in `hooks/session-start-recover.mjs` and
  `hooks/pre-compact-anchor.mjs` -- move, do not rewrite.
- **Verify:** `node -e "import('./lib/events.mjs').then(m => console.log(Object.keys(m)))"` prints the four exports.

**1.2** `[parallel]` Update `hooks/session-start-recover.mjs`
- Replace inline `EVENT_TO_PHASE`, `deriveState`, `readEventLog`, `projectDir`
  with imports from `../lib/events.mjs`.
- Keep `readStateFile`, `detectPartialWork`, `formatRecoveryContext`, `main`
  in the hook file (they are hook-specific).
- **Verify:** `echo '{}' | node hooks/session-start-recover.mjs` exits 0 (no
  pipeline active).

**1.3** `[parallel]` Update `hooks/pre-compact-anchor.mjs`
- Same extraction pattern as 1.2.
- Keep `readStateFile`, `formatRecentEvents`, `formatAnchorContext`, `main`.
- **Verify:** `echo '{}' | node hooks/pre-compact-anchor.mjs` exits 0.

**1.4** `[sequential]` Run existing test suite
- **Verify:** `bash tests/skill-architecture-tests.sh` passes (T12 registry
  sync hook still works, no regressions).

---

#### Phase 2: Teamflow Server Scaffolding

**Goal:** Standalone `teamflow/` directory with package.json, TypeScript config,
and a minimal Fastify server that starts and serves a health endpoint.

**2.1** `[sequential]` Create `teamflow/package.json`
- `name`: `@team/teamflow`, `private: true`, `type: "module"`
- `scripts`: `dev`, `build`, `preview`, `start`, `test`
- Dependencies: `fastify`, `open`
- DevDependencies: `typescript`, `svelte`, `@sveltejs/vite-plugin-svelte`,
  `vite`, `vitest`, `@types/node`

**2.2** `[parallel]` Create `teamflow/tsconfig.json`
- Target ES2022, module NodeNext, strict, outDir `build/`.

**2.3** `[parallel]` Create `teamflow/vite.config.ts`
- Svelte plugin, build output to `dist/`, dev server proxy `/api` to Fastify.

**2.4** `[sequential]` Create `teamflow/src/server.ts` (entry point)
- Create Fastify instance bound to `127.0.0.1`.
- Port from `TEAMFLOW_PORT` env var, default `7425`.
- Register static file serving from `dist/` directory.
- `GET /api/health` returns `{ status: "ok" }`.
- Accept `--project-dir` CLI arg (defaults to `CLAUDE_PROJECT_DIR` or cwd).
- On start, log the URL and open browser via `open` package.
- **Verify:** `cd teamflow && npm install && npx tsx src/server.ts` starts on
  port 7425; `curl http://127.0.0.1:7425/api/health` returns `{"status":"ok"}`.

---

#### Phase 3: Event Tailing and State Engine

**Goal:** The server tails `events.jsonl`, maintains in-memory state, and
exposes it via REST and SSE.

**3.1** `[sequential]` Create `teamflow/src/tail.ts`
- Exports a `createTailer(filePath, onEvents)` function.
- Uses `fs.watch` on the file (or parent directory if file does not exist yet).
- Maintains a byte offset; on change, reads from offset to EOF, splits into
  lines, parses JSON, calls `onEvents(newEvents[])`.
- Handles file-not-found gracefully (waits for creation).
- Handles partial lines (buffer incomplete trailing data).
- **Verify:** Unit test `teamflow/src/tail.test.ts` -- write lines to a temp
  file, assert callback receives parsed events in order.

**3.2** `[sequential]` Create `teamflow/src/state.ts`
- Imports `EVENT_TO_PHASE` from `../../lib/events.mjs`.
- Exports a `RunState` type and a `createStateEngine()` function.
- `RunState` contains: `phase`, `topic`, `startedAt`, `agents` (map of agent
  name to status), `events` (timeline array), `errors` (array), `progress`
  (step/total for implementer), `duration`, `lastSeq`.
- `applyEvent(state, event)` -- pure function, returns new state.
  Uses `EVENT_TO_PHASE` for phase transitions. Tracks agent status from
  producer field. Extracts errors from `hard-gate.failed`. Tracks step
  progress from `step.completed`. Computes duration from first to latest `ts`.
- `createStateEngine()` returns `{ apply(events), getSnapshot() }`.
- **Verify:** Unit test `teamflow/src/state.test.ts` -- feed a sequence of
  events, assert state transitions match expectations.

**3.3** `[sequential]` Create `teamflow/src/sse.ts`
- Exports a Fastify plugin that registers `GET /api/events` as an SSE endpoint.
- On connect, sends a `snapshot` message with full current state.
- Exposes `broadcast(data)` to push `update` messages to all connected clients.
- Handles client disconnect (remove from set).
- Sets appropriate headers: `Content-Type: text/event-stream`,
  `Cache-Control: no-cache`, `Connection: keep-alive`.
- **Verify:** Unit test `teamflow/src/sse.test.ts` -- inject a request to
  `/api/events`, assert it receives the snapshot message.

**3.4** `[sequential]` Create `teamflow/src/api.ts`
- Exports a Fastify plugin that registers `GET /api/state`.
- Returns the current `RunState` snapshot as JSON.
- **Verify:** Integration: start server, hit `/api/state`, get valid JSON
  with expected shape.

**3.5** `[sequential]` Wire everything in `teamflow/src/server.ts`
- On startup: create state engine, create tailer pointing to
  `<projectDir>/.team/events.jsonl`, register SSE plugin, register API plugin.
- Tailer callback: apply new events to state engine, broadcast via SSE.
- **Verify:** Create a temp `events.jsonl` with sample events, start server,
  `curl /api/state` returns derived state matching the events.

---

#### Phase 4: Svelte Frontend

**Goal:** A single-page Svelte 5 app that connects to SSE and renders the
dashboard.

**4.1** `[sequential]` Create `teamflow/src/client/main.ts`
- Svelte app entry point. Mounts `App.svelte` on `#app`.

**4.2** `[sequential]` Create `teamflow/src/client/App.svelte`
- Root component. Manages SSE connection via `EventSource`.
- On `snapshot` message, sets full state.
- On `update` message, merges partial state.
- On connection error, shows reconnecting indicator, retries with backoff.
- Renders child components: `Header`, `PhaseTracker`, `AgentList`, `Timeline`,
  `ErrorPanel`.
- Passes state down as props (no global store needed for MVP).

**4.3** `[parallel]` Create `teamflow/src/client/components/Header.svelte`
- Shows topic name, current phase badge, elapsed duration.
- Theme toggle button (dark/light/system).

**4.4** `[parallel]` Create `teamflow/src/client/components/PhaseTracker.svelte`
- Horizontal pipeline visualization: RESEARCH > PLAN > TEST-FIRST > IMPLEMENT
  > VERIFY > SHIP.
- Highlights current phase, marks completed phases, dims future phases.

**4.5** `[parallel]` Create `teamflow/src/client/components/AgentList.svelte`
- Lists agents with their current status (idle/running/done/error).
- Shows agent name and the event it produced (if any).

**4.6** `[parallel]` Create `teamflow/src/client/components/Timeline.svelte`
- Scrollable list of events in chronological order.
- Each entry shows: timestamp, event name, producer, brief data summary.
- Auto-scrolls to bottom on new events.

**4.7** `[parallel]` Create `teamflow/src/client/components/ErrorPanel.svelte`
- Displays errors and warnings from `hard-gate.failed` events.
- Shows retry count and max retries.
- Hidden when no errors exist.

**4.8** `[sequential]` Create `teamflow/src/client/styles/theme.css`
- CSS custom properties for dark and light themes.
- `prefers-color-scheme` media query for system default.
- `.theme-dark` and `.theme-light` class overrides for manual toggle.
- Base layout styles (grid, spacing, typography).

**4.9** `[sequential]` Create `teamflow/index.html`
- Vite entry HTML. Loads `src/client/main.ts`.
- Includes `<div id="app">`.

**4.10** `[sequential]` Build and commit `teamflow/dist/`
- Run `vite build` to produce `teamflow/dist/`.
- Commit the built output so users have zero build-on-install.
- Add `teamflow/node_modules/` to `.gitignore`.
- **Verify:** Open `teamflow/dist/index.html` -- it contains bundled JS/CSS.

---

#### Phase 5: Integration and Polish

**Goal:** End-to-end wiring, CLI convenience, and documentation.

**5.1** `[sequential]` Add `bin` field to `teamflow/package.json`
- Points `teamflow` to `src/server.ts` (via tsx) for development, and
  `build/server.js` for production.
- Add a `teamflow/bin/teamflow.mjs` shim that resolves and runs the compiled
  server entry.
- **Verify:** `cd teamflow && node bin/teamflow.mjs --help` prints usage.

**5.2** `[sequential]` Add startup instructions to relevant skill files
- In the `team` skill's output, add a note suggesting the user can run the
  dashboard with `node teamflow/server.js` alongside the pipeline.
- Do NOT auto-start the server (per D7).
- **Verify:** Grep the skill file for the dashboard mention.

**5.3** `[sequential]` Update `CLAUDE.md` to document Teamflow
- Add a row to the "Runtime vs. Development" table for the Teamflow dashboard.
- Add a brief section describing what it is and how to start it.
- **Verify:** Grep `CLAUDE.md` for "teamflow".

**5.4** `[sequential]` Run full test suite
- `bash tests/skill-architecture-tests.sh` -- no regressions.
- `cd teamflow && npx vitest run` -- all unit tests pass.
- `bash tests/teamflow-dashboard-tests.sh` -- all acceptance tests pass.

---

### Tests

All acceptance tests live in `tests/teamflow-dashboard-tests.sh`, following
the existing convention in `tests/skill-architecture-tests.sh`.

| # | Test Name | Verifies | Step |
|---|-----------|----------|------|
| T1 | `lib/events.mjs exports EVENT_TO_PHASE` | Shared module exports the phase map | 1.1 |
| T2 | `lib/events.mjs exports deriveState` | Shared module exports the state derivation function | 1.1 |
| T3 | `lib/events.mjs exports readEventLog` | Shared module exports the event log reader | 1.1 |
| T4 | `session-start-recover.mjs imports from lib/events.mjs` | Hook uses shared module, not inline copy | 1.2 |
| T5 | `pre-compact-anchor.mjs imports from lib/events.mjs` | Hook uses shared module, not inline copy | 1.3 |
| T6 | `session-start-recover.mjs exits 0 with no pipeline` | No regression in hook behavior | 1.2 |
| T7 | `pre-compact-anchor.mjs exits 0 with no pipeline` | No regression in hook behavior | 1.3 |
| T8 | `teamflow/package.json exists with correct name` | Scaffolding is correct | 2.1 |
| T9 | `teamflow/package.json has fastify dependency` | Required dependency declared | 2.1 |
| T10 | `teamflow server starts on port 7425` | Server binds to expected port | 2.4 |
| T11 | `health endpoint returns ok` | `/api/health` responds correctly | 2.4 |
| T12 | `state endpoint returns valid JSON` | `/api/state` returns parseable state | 3.4 |
| T13 | `SSE endpoint sends snapshot on connect` | Late-join snapshot works | 3.3 |
| T14 | `state reflects events from file` | Tailing + state engine wired correctly | 3.5 |
| T15 | `teamflow/dist/index.html exists` | Built frontend committed | 4.10 |
| T16 | `dist contains bundled JS` | Vite build produced output | 4.10 |
| T17 | `shared lib has no duplicate in hooks` | Hooks no longer contain inline EVENT_TO_PHASE | 1.2, 1.3 |
| T18 | `existing tests still pass` | No regressions | 1.4 |

Additionally, unit tests in `teamflow/src/*.test.ts` (run via `vitest`):

| # | Test File | Verifies | Step |
|---|-----------|----------|------|
| U1 | `tail.test.ts` | Offset-based tailing parses new lines correctly | 3.1 |
| U2 | `tail.test.ts` | Handles file creation after watcher starts | 3.1 |
| U3 | `tail.test.ts` | Buffers partial lines across reads | 3.1 |
| U4 | `state.test.ts` | Phase transitions follow EVENT_TO_PHASE map | 3.2 |
| U5 | `state.test.ts` | Agent status tracked from producer field | 3.2 |
| U6 | `state.test.ts` | Step progress extracted from step.completed | 3.2 |
| U7 | `state.test.ts` | Errors accumulated from hard-gate.failed | 3.2 |
| U8 | `state.test.ts` | Duration computed from first to latest timestamp | 3.2 |
| U9 | `sse.test.ts` | Snapshot sent on new connection | 3.3 |
| U10 | `sse.test.ts` | Broadcast reaches all connected clients | 3.3 |

---

### Done Criteria

- [ ] `lib/events.mjs` exists and exports `EVENT_TO_PHASE`, `deriveState`,
      `readEventLog`, `projectDir`
- [ ] Both hooks import from `lib/events.mjs` with zero inline duplication of
      `EVENT_TO_PHASE` or `deriveState`
- [ ] `bash tests/skill-architecture-tests.sh` passes (no regressions)
- [ ] `bash tests/teamflow-dashboard-tests.sh` passes (all 18 acceptance tests)
- [ ] `cd teamflow && npx vitest run` passes (all 10 unit tests)
- [ ] `teamflow/dist/` is committed and contains a working Svelte build
- [ ] Server starts with `node teamflow/bin/teamflow.mjs`, serves dashboard
      on `http://127.0.0.1:7425`, opens browser
- [ ] SSE endpoint streams state updates when `events.jsonl` is appended to
- [ ] Late-joining browser receives full state snapshot on connect
- [ ] Dark/light/system theme toggle works in the browser
- [ ] `TEAMFLOW_PORT` env var overrides the default port
- [ ] `CLAUDE.md` documents the Teamflow dashboard
- [ ] `teamflow/node_modules/` is in `.gitignore`
