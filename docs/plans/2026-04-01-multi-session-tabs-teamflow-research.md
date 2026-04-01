# Research: Multi-Session Tabs in Teamflow Dashboard

**Date:** 2026-04-01
**Topic:** multi-session-tabs-teamflow
**Issue:** team-wfz

---

## Relevant Files

### Core Server-Side

| File | Purpose |
|------|---------|
| `teamflow/src/server.ts` | Fastify server entry; bootstraps state engine, SSE, tailing, API |
| `teamflow/src/state.ts` | In-memory state engine; `applyEvent` pure reducer, `createStateEngine` factory |
| `teamflow/src/types.ts` | Shared types: `RunState`, `AgentStatus`, `GateStatus`, `TimelineEntry` |
| `teamflow/src/sse.ts` | SSE Fastify plugin; `GET /api/events`; module-level client Set; `getBroadcast` |
| `teamflow/src/tail.ts` | Offset-based file tailer; 300ms polling; partial-line buffering |
| `teamflow/src/api.ts` | REST plugin; `GET /api/state` returns current snapshot |
| `teamflow/bin/teamflow.mjs` | Launcher shim via tsx |
| `teamflow/bin/demo.mjs` | Demo pipeline event generator (~60s) |

### Client Components

| File | Purpose |
|------|---------|
| `teamflow/src/client/App.svelte` | Root component; SSE connection; state binding; empty state routing |
| `teamflow/src/client/main.ts` | Svelte 5 mount entry |
| `teamflow/src/client/components/Header.svelte` | Topic, elapsed duration, theme toggle |
| `teamflow/src/client/components/PhaseCards.svelte` | Per-phase cards with agent list, gate status |
| `teamflow/src/client/components/PhaseTracker.svelte` | Linear phase progress indicator |
| `teamflow/src/client/components/AgentList.svelte` | Agent status rows with colored dots |
| `teamflow/src/client/components/Timeline.svelte` | Event list; auto-scroll; keyed by seq |
| `teamflow/src/client/components/ErrorPanel.svelte` | Hard-gate errors, retry counts |
| `teamflow/src/client/components/EmptyState.svelte` | "Connecting..." / "No pipeline running" |
| `teamflow/src/client/styles/theme.css` | CSS custom properties; dark/light/system themes; motion tokens |

### Shared Library

| File | Purpose |
|------|---------|
| `lib/events.mjs` | `EVENT_TO_PHASE`, `deriveState`, `readEventLog`, `teamDir`, `projectDir` |

### Tests

| File | Purpose |
|------|---------|
| `teamflow/src/__tests__/state.test.ts` | State engine event application, gate status |
| `teamflow/src/__tests__/animation.test.ts` | Motion tokens, transitions |
| `teamflow/src/__tests__/empty-state.test.ts` | Empty state visibility logic |
| `teamflow/src/__tests__/gate-visualization.test.ts` | Gate status UI |
| `teamflow/src/__tests__/helpers.ts` | `readSource`, `extractStyleBlock` |
| `tests/teamflow-dashboard-tests.sh` | 23-test acceptance suite |

### Config & Build

| File | Purpose |
|------|---------|
| `teamflow/package.json` | Dependencies, scripts |
| `teamflow/vite.config.ts` | Vite + Svelte plugin, dev proxy to :7425 |
| `teamflow/index.html` | Static entry point |
| `skills/team/registry.json` | Pipeline wiring (agents, gates, joins) |

---

## Current Architecture

### Tech Stack
- **Server**: Node.js, Fastify 5.x, `@fastify/static`, TypeScript via `tsx`
- **Client**: Svelte 5.23, Vite 6.x, TypeScript
- **Test**: Vitest 3.x (structural source-code tests, no DOM renderer)

### Data Flow
```
events.jsonl → createTailer(path, cb) → [parse JSON lines]
  → stateEngine.apply(events) → broadcast(snapshot)
    → SSE clients receive RunState → App.svelte $state update
      → child components re-render via props
```

### Single-Session Design

The entire system is hardcoded to a single session:

1. **server.ts:53** — `join(homedir(), ".team", "events.jsonl")` (one file)
2. **sse.ts** — module-level `Set<FastifyReply>` (no session namespacing)
3. **state.ts** — single `createStateEngine()` instance
4. **tail.ts** — single `createTailer()` instance
5. **App.svelte** — single `state: RunState` binding
6. **lib/events.mjs** — `teamDir()` returns `~/.team` (single global dir)

No `sessionId` field in event schema. No session boundary detection.

### Component Hierarchy
```
main.ts
  └── App.svelte (state: RunState, connected, hasEverConnected)
        ├── Header.svelte (topic, duration, theme, onToggleTheme)
        ├── [reconnecting banner] (inline)
        ├── PhaseCards.svelte (phase, agents, gates, events, now)
        ├── Timeline.svelte (events)
        ├── EmptyState.svelte (connected) [conditional]
        └── ErrorPanel.svelte (errors)
```

All data flows down as props. No Svelte stores. No context API.

### Reusable Factories
- `createTailer(filePath, onEvents)` — parameterized, can be instantiated per-session
- `createStateEngine()` — stateless factory, can be instantiated per-session
- `applyEvent(state, event)` — pure reducer, session-agnostic
- `readEventLog(dir?)` — accepts optional directory override

---

## Open Questions

1. **Session identification scheme**: Where do multi-session event logs live?
   - Option A: `~/.team/<session-id>/events.jsonl` (subdirectories)
   - Option B: `~/.team/events-<timestamp>.jsonl` (flat naming)
   - Option C: Single file with `sessionId` field in events (schema change)
   - Current hooks all write to `~/.team/events.jsonl` — any multi-session scheme needs hook compatibility.

2. **Session boundary detection**: `feature.requested` starts a session, `feature.shipped` ends it. If we keep a single events.jsonl, how are run boundaries detected? The demo script truncates the file before each run — no built-in multi-run parsing.

3. **Session dismissal persistence**: Requirements say "completed sessions remain visible until dismissed." Where is dismissed state stored? In-memory (lost on restart) vs localStorage (per-browser).

4. **SSE protocol for multi-session**: Single multiplexed endpoint (`/api/events` sends `{sessionId, state}`) vs per-session endpoints (`/api/events/:sessionId`)?

5. **EmptyState grid adjustment**: `EmptyState.svelte` uses `grid-row: 2 / 4`. Adding a tab bar row shifts all rows. Test E8 asserts `grid-row: 2 / 4` specifically.

6. **Tab bar visibility**: "No tab bar for single session" — conditional render based on session count.

---

## Constraints

### Hard
- `RunState` has no `sessionId` — adding one changes SSE wire format
- `sse.ts` broadcasts to all clients regardless of session
- `server.ts:53` hardcodes single events.jsonl path
- Hooks use `teamDir()` → `~/.team` globally
- Test E8 asserts `grid-row: 2 / 4`

### Soft
- Tests are structural (source-code), no DOM — new tests should match
- Svelte 5 runes (`$props`, `$state`, `$derived`) — no legacy stores
- CSS uses existing custom properties from theme.css
- Broadcast sends full RunState snapshots (not diffs)

---

## Risks

1. **Hook compatibility**: The TEAM router writes to `~/.team/events.jsonl`. If sessions move to subdirectories, every hook and the router skill itself must be updated. This is a large blast radius.
2. **Connection management**: Per-session SSE connections multiply resource usage. Must handle cleanup.
3. **File watcher scalability**: One tailer per session; many sessions = many polling intervals.
4. **State memory**: Each session holds a full RunState in memory. Bounded by session count.
