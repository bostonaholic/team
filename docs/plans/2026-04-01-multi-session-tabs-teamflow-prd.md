# PRD: Multi-Session Tabs in Teamflow Dashboard

**Date:** 2026-04-01
**Topic:** multi-session-tabs-teamflow
**Issue:** team-wfz
**Research:** `docs/plans/2026-04-01-multi-session-tabs-teamflow-research.md`

---

## Problem Statement

The Teamflow dashboard can only display one TEAM pipeline at a time. When a
developer runs two `/team` pipelines in parallel (e.g., one feature and one
bugfix), the dashboard can only show whichever session's events happen to be
in `~/.team/events.jsonl` at any given moment. There is no way to see both
sessions simultaneously or switch between them. This defeats the purpose of
worktree isolation, which explicitly enables parallel pipeline runs.

---

## Product Decisions

### D1: Session identification scheme

**Question:** Where do multi-session event logs live, and how are they
identified without requiring changes to the router, hooks, or runtime skills?

**Decision:** Each pipeline session writes its events to its own subdirectory:
`~/.team/<session-id>/events.jsonl`. The `session-id` is the pipeline `topic`
value (already a kebab-case slug derived in the router's Setup step). The
Teamflow server discovers sessions by scanning `~/.team/` for subdirectories
that contain an `events.jsonl` file, and watches for new ones to appear.

The existing `~/.team/events.jsonl` flat path becomes the legacy/fallback
path. The server treats a flat `~/.team/events.jsonl` as a single unnamed
session (session-id: "default") if no subdirectories are found. This allows
the current demo script and any existing pipelines to continue working
unchanged.

The router skill (`skills/team/SKILL.md`) will be updated to write to
`~/.team/<topic>/events.jsonl` instead of `~/.team/events.jsonl`. The two
runtime hooks (`session-start-recover.mjs`, `pre-compact-anchor.mjs`) will be
updated to scan `~/.team/` subdirectories and find the most recent active
session, falling back to the flat file for backward compatibility.
`lib/events.mjs` will add a `sessionDir(topic)` export returning
`~/.team/<topic>`.

**Rationale:** Options B (flat naming `events-<timestamp>.jsonl`) and C
(single file with `sessionId` field) both require either a schema change to
event records or a non-obvious naming convention that every reader must parse.
Option A (subdirectories) keeps event files structurally identical — each is
still a self-contained `events.jsonl` — and uses the topic slug that already
exists in `feature.requested` data. The `createTailer` and `createStateEngine`
factories are already parameterized and can be instantiated once per
subdirectory without modification.

The hook blast radius is bounded: both hooks already call `readEventLog(dir?)`
which accepts an optional directory. The change is a scan for directories
instead of a hardcoded read.

**Alternatives considered:**
- Option B (flat file naming) — rejected: requires every reader to parse
  timestamps from filenames; no natural session identity.
- Option C (single file, `sessionId` field) — rejected: schema change affects
  all existing events; the entire `deriveState` pipeline needs to handle
  interleaved sessions; highest complexity.

**Confidence:** HIGH — subdirectory-per-session maps directly onto the
existing worktree-per-session model. Each worktree already has a `topic`; the
event log directory just follows suit.

---

### D2: Session boundary detection

**Question:** How does the dashboard know where one run ends and another
begins within a single file?

**Decision:** This question is resolved by D1. With subdirectory isolation,
each `events.jsonl` contains exactly one run. There are no intra-file
boundaries to detect. The `feature.requested` event at seq=1 is the session
start; `feature.shipped` is the session end. If `feature.shipped` is absent,
the session is still active.

**Rationale:** Boundary detection within a single file is a complex parsing
problem with edge cases (e.g., a file that contains `feature.shipped` followed
by a new `feature.requested` from a resumed/restarted run). The subdirectory
model eliminates this entirely.

**Confidence:** HIGH — this is a direct consequence of D1.

---

### D3: Session dismissal persistence

**Question:** Where is "dismissed" state stored — in-memory (lost on restart)
or localStorage (per-browser)?

**Decision:** `localStorage`. Key: `teamflow:dismissed-sessions`, value: a
JSON array of session-id strings. Dismissed sessions are filtered client-side
in `App.svelte`. Sessions are only dismissable when their phase is `SHIPPED`
or when the events file has been deleted (session gone from server).

**Rationale:** Teamflow is a developer sidecar — the developer expects
dismissed sessions to stay dismissed across browser refreshes. In-memory
dismissal would re-show completed sessions every time the browser tab is
refreshed, which is noise. `localStorage` is the simplest persistent option
with no server state needed, no new API endpoint, and reversal is easy (just
clear the key). The Teamflow server is not a stateful service and should not
be made to track UI preferences.

**Alternatives considered:**
- In-memory — rejected: dismissed sessions reappear on refresh; annoying for
  developers who leave the dashboard open and occasionally refresh.
- Server-side persistence (a new `~/.team/dismissed.json` file) — rejected:
  adds server complexity and a write path for what is purely a UI preference.

**Confidence:** HIGH — localStorage is the established browser precedent for
ephemeral UI state that should survive tab refresh.

---

### D4: SSE protocol for multi-session

**Question:** Single multiplexed SSE endpoint or per-session endpoints?

**Decision:** Single multiplexed endpoint at `/api/events`. Messages carry a
`sessionId` field. The wire format changes from broadcasting a bare `RunState`
to broadcasting `{ sessionId: string, state: RunState }`. On connect, the
server sends one `snapshot` message per known session.

The client receives these events and maintains a `Map<sessionId, RunState>` in
`App.svelte`. The tab bar derives its list from the keys of this map.

**Rationale:** Per-session endpoints (`/api/events/:sessionId`) would require
the client to open one SSE connection per session. This creates connection
management complexity: the client must poll `/api/sessions` to discover new
sessions, then open new `EventSource` objects dynamically. A single connection
that multiplexes all sessions is simpler — one `EventSource` instance,
reconnect logic in one place, and no session discovery polling needed. The
wire format change is confined to `sse.ts` (server) and `App.svelte` (client).

**Alternatives considered:**
- Per-session endpoints — rejected: multiplies connection management
  complexity proportionally with session count; requires a separate session
  discovery mechanism.

**Confidence:** HIGH — multiplexing over a single SSE connection is the
standard approach when the number of streams is dynamic.

---

### D5: EmptyState grid adjustment

**Question:** Adding a tab bar row shifts the grid layout. `EmptyState.svelte`
uses `grid-row: 2 / 4` and test E8 asserts this specifically.

**Decision:** When the tab bar is visible (more than one active session), the
`grid-template-rows` in `.dashboard` gains one more row: `auto auto auto 1fr
auto` (header, tab-bar, phase-cards, content, error-panel). `EmptyState` in
this layout should span `grid-row: 3 / 5`. When the tab bar is hidden (zero
or one session), the layout stays at `auto auto 1fr auto` and `EmptyState`
stays at `grid-row: 2 / 4`.

Implement this as a CSS class toggle on `.dashboard`: `.dashboard.has-tabs`
carries the 5-row template. `EmptyState.svelte` uses `:global(.has-tabs)
.empty-state { grid-row: 3 / 5 }` to override. Test E8 still passes because
the base (no-tabs) case is unchanged.

**Rationale:** The alternative — always reserving a row for the tab bar even
when it is hidden — would leave a gap in the layout for the single-session
case. CSS class toggling on the root element is the established pattern for
conditional layout variants and requires no new reactive Svelte props threading
through multiple components.

**Alternatives considered:**
- Always reserve a tab bar row — rejected: creates visible empty space in
  single-session view.
- Svelte prop threading (`hasTabs` prop into EmptyState) — rejected: adds
  coupling; EmptyState should not know about the tab count.

**Confidence:** MEDIUM — the CSS approach is sound; the exact grid-row values
depend on the final component order chosen by the planner. Values stated here
are correct given the current component order.

---

### D6: Tab bar visibility

**Question:** When is the tab bar shown?

**Decision:** The tab bar renders when there are two or more known sessions.
Zero sessions: show EmptyState. Exactly one session: show the full dashboard
with no tab bar (current behavior preserved). Two or more sessions: show the
tab bar above the phase cards.

**Rationale:** The requirement states "No tab bar needed for single session."
A tab bar with one tab is visual noise and changes the layout for no benefit.
The condition `sessions.size >= 2` maps directly to this requirement. This is
implemented as a `$derived` in `App.svelte`.

**Confidence:** HIGH — directly stated in the requirements.

---

## User Stories

**US-1 (Parallel monitoring):** As a plugin developer running two `/team`
pipelines simultaneously, I want to see both sessions in the Teamflow
dashboard and switch between them, so that I can monitor progress without
running two browser tabs.

**US-2 (New session detection):** As a plugin developer, I want a new
session tab to appear automatically when I start a new `/team` pipeline,
so that I do not need to refresh the dashboard.

**US-3 (Completed session management):** As a plugin developer, I want
completed sessions (SHIPPED) to remain visible in the tab bar until I
explicitly dismiss them, so that I can review their final state after they
finish.

**US-4 (Single session clarity):** As a plugin developer running one pipeline,
I want the dashboard to look identical to today (no tab bar, no layout shift),
so that the multi-session feature has zero cost for the common single-session
case.

---

## Acceptance Criteria

### US-1: Parallel monitoring

**T1: Tab bar appears with two sessions**
GIVEN two sessions are active in `~/.team/<id>/events.jsonl`
WHEN the dashboard loads
THEN a tab bar is visible below the header, showing one tab per session

**T2: Tab label content**
GIVEN a session with topic "add-auth" in IMPLEMENT phase
WHEN the tab bar renders
THEN the tab label shows the topic ("add-auth") and current phase ("IMPLEMENT")

**T3: Active tab highlight**
GIVEN two sessions are visible in the tab bar
WHEN one tab is selected
THEN the selected tab is visually distinct (active styling) and the main panel shows that session's phase cards, timeline, and error panel

**T4: Tab switching**
GIVEN two sessions A and B, currently viewing A
WHEN the user clicks tab B
THEN the main panel switches to session B's state without a page reload

### US-2: New session detection

**T5: Auto-discovery of new sessions**
GIVEN the dashboard is open with one session
WHEN a second `~/.team/<new-id>/events.jsonl` is created and a `feature.requested` event is appended
THEN the new session tab appears in the tab bar within 1 second (one poll cycle)

### US-3: Completed session management

**T6: Completed sessions remain visible**
GIVEN session A has emitted `feature.shipped`
WHEN the dashboard renders
THEN session A's tab is still visible, visually marked as completed (distinct from active sessions)

**T7: Dismiss a completed session**
GIVEN session A is in SHIPPED state
WHEN the user clicks the dismiss control on session A's tab
THEN session A's tab is removed from the tab bar

**T8: Dismissal persists across refresh**
GIVEN session A was dismissed
WHEN the browser tab is refreshed
THEN session A's tab does not reappear

**T9: Cannot dismiss active sessions**
GIVEN session A is in IMPLEMENT phase (not SHIPPED)
WHEN the user views session A's tab
THEN no dismiss control is visible on session A's tab

### US-4: Single session clarity

**T10: No tab bar for single session**
GIVEN exactly one session is active
WHEN the dashboard renders
THEN no tab bar is visible and the layout is identical to the current dashboard

**T11: Grid layout preserved for single session**
GIVEN exactly one session is active
WHEN the EmptyState component is visible
THEN `grid-row` is `2 / 4` (test E8 continues to pass)

---

## Scope Boundaries

**In Scope:**
- Tab bar component (`TabBar.svelte`) rendered below the header when session count >= 2
- Per-session subdirectory layout: `~/.team/<topic>/events.jsonl`
- Server-side session discovery by scanning `~/.team/` for subdirectories containing `events.jsonl`
- Directory watcher/poller to detect new session directories (300ms, matching existing tail interval)
- Multiplexed SSE wire format: `{ sessionId: string, state: RunState }` messages
- Client-side `Map<sessionId, RunState>` in `App.svelte`
- `localStorage` persistence for dismissed sessions
- CSS class toggle on `.dashboard` for tab-bar-present vs absent layout
- Updated `EmptyState.svelte` grid-row override for the tab-bar-present case
- Updated `skills/team/SKILL.md` to write to `~/.team/<topic>/events.jsonl`
- Updated runtime hooks to scan subdirectories, falling back to flat file
- Updated `lib/events.mjs` to export `sessionDir(topic)`
- Demo script updated to write to `~/.team/demo/events.jsonl`
- Backward compat: flat `~/.team/events.jsonl` treated as session-id "default"
- Acceptance tests for T1–T11 following structural/source-code test pattern

**Out of Scope:**
- Session renaming or custom labels
- Drag-to-reorder tabs
- Session search or filtering
- Pinning tabs
- Notification badges on inactive tabs
- Cross-machine session sharing
- Persisting dismissed sessions to the server
- Tab overflow / horizontal scrolling for more than ~10 tabs
- Keyboard navigation between tabs
- Any changes to the pipeline itself (agents, registry, router event loop)

**Future Scope:**
- Overflow handling when tab count exceeds viewport width
- Keyboard shortcut to cycle between session tabs
- Badge showing count of new events on inactive tabs since last viewed

---

## Constraints

- **Zero changes to `RunState` fields.** Adding `sessionId` to `RunState`
  would change the type used across state.ts, sse.ts, api.ts, and all tests.
  `sessionId` is carried as the envelope around `RunState` in the SSE wire
  format, not inside it.
- **Test E8 must still pass unmodified.** The base `grid-row: 2 / 4` on
  `.empty-state` must remain the default; the tab-bar-present override is
  additive via CSS class.
- **No new runtime dependencies.** The server already uses Fastify and the
  Node.js fs module. Session discovery uses `fs.readdir` + `fs.watch` or the
  existing polling pattern.
- **300ms poll interval.** New session directories must be detected within one
  poll cycle, matching the tail.ts polling interval.
- **Backward compat for flat file.** Any developer with an existing
  `~/.team/events.jsonl` must not lose their session on upgrade.
