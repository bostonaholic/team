# Plan: Multi-Session Tabs in Teamflow Dashboard (v2)

**Date:** 2026-04-01
**Issue:** team-wfz
**Research:** `docs/plans/2026-04-01-multi-session-tabs-teamflow-research.md`
**PRD:** `docs/plans/2026-04-01-multi-session-tabs-teamflow-prd.md`

---

### Context

The Teamflow dashboard displays only one pipeline session at a time. When a
developer runs parallel `/team` pipelines in separate worktrees, there is no
way to monitor both from one browser tab. This plan introduces per-session
subdirectories (`~/.team/<topic>/events.jsonl`), a multiplexed SSE stream,
and a tab bar component so the dashboard can display and switch between
multiple concurrent sessions. It also updates every skill, hook, and
documentation file that hardcodes `~/.team/events.jsonl` to use the new
subdirectory layout.

### Trade-offs

**Multiplexed SSE vs per-session endpoints** -- A single `/api/events`
endpoint wrapping each message in `{ sessionId, state }` avoids N concurrent
`EventSource` connections and eliminates client-side session-discovery polling.
Cost: slightly larger payload per message.

**Subdirectory isolation vs single-file boundaries** -- Each session writes
to `~/.team/<topic>/events.jsonl`. This reuses the existing `createTailer`
and `createStateEngine` factories unmodified. Cost: updating every file that
references the flat path (enumerated exhaustively below).

---

### Complete `~/.team` Reference Inventory

Every file that hardcodes `~/.team/events.jsonl` or `~/.team/` and requires
a path update for the subdirectory model:

| # | File | Line(s) | Current reference | Change to |
|---|------|---------|-------------------|-----------|
| 1 | `lib/events.mjs` | 17-18 | `teamDir()` returns `~/.team` | Add `sessionDir(topic)` returning `~/.team/<topic>` |
| 2 | `skills/team/SKILL.md` | 26,28,41,130 | `~/.team/`, `~/.team/events.jsonl`, delete `~/.team/` | `~/.team/<topic>/`, `~/.team/<topic>/events.jsonl`, delete `~/.team/<topic>/` |
| 3 | `skills/team-research/SKILL.md` | 19-20 | Create `~/.team/`, append to `~/.team/events.jsonl` | Create `~/.team/<topic>/`, append to `~/.team/<topic>/events.jsonl` |
| 4 | `skills/team-plan/SKILL.md` | 16 | Read `~/.team/events.jsonl` | Read `~/.team/<topic>/events.jsonl` |
| 5 | `skills/team-test/SKILL.md` | 12 | Read `~/.team/events.jsonl` | Read `~/.team/<topic>/events.jsonl` |
| 6 | `skills/team-implement/SKILL.md` | 12 | Read `~/.team/events.jsonl` | Read `~/.team/<topic>/events.jsonl` |
| 7 | `skills/team-verify/SKILL.md` | 12 | Read `~/.team/events.jsonl` | Read `~/.team/<topic>/events.jsonl` |
| 8 | `skills/team-ship/SKILL.md` | 12,21 | Read `~/.team/events.jsonl`, delete `~/.team/` | Read `~/.team/<topic>/events.jsonl`, delete `~/.team/<topic>/` |
| 9 | `skills/team-fix/SKILL.md` | 39-40,51,71 | Create `~/.team/`, append `~/.team/events.jsonl`, delete `~/.team/` | Create `~/.team/<topic>/`, append `~/.team/<topic>/events.jsonl`, delete `~/.team/<topic>/` |
| 10 | `skills/team-resume/SKILL.md` | 3,12 | `~/.team/events.jsonl` in description and step 1 | `~/.team/<topic>/events.jsonl` |
| 11 | `skills/rpi-workflow/SKILL.md` | 97 | Append to `~/.team/events.jsonl` | Append to `~/.team/<topic>/events.jsonl` |
| 12 | `skills/worktree-isolation/SKILL.md` | 39 | "event log lives at `~/.team/events.jsonl` (global, not per-worktree)" | "event log lives at `~/.team/<topic>/events.jsonl` (per-pipeline, not per-worktree)" |
| 13 | `hooks/session-start-recover.mjs` | 4-5,95 | `~/.team/events.jsonl`, `~/.team/state.json` | Scan `~/.team/` subdirectories, fall back to flat file |
| 14 | `hooks/pre-compact-anchor.mjs` | 4-5 | `~/.team/events.jsonl`, `~/.team/state.json` | Same scanning logic as hook 13 |
| 15 | `teamflow/src/server.ts` | 13,53 | `teamDir` + `events.jsonl` | Multi-session map via `discoverSessions` |
| 16 | `teamflow/bin/demo.mjs` | 4,17-18,91,158 | `~/.team/events.jsonl`, cleanup deletes `teamDir` | `~/.team/demo/events.jsonl`, cleanup deletes `~/.team/demo/` only |
| 17 | `AGENTS.md` | 86,90 | `~/.team/events.jsonl` | `~/.team/<topic>/events.jsonl` (documentation) |

---

## Phase 1: Shared Library -- `sessionDir` Export

**Atomic commit block: Step 1.1 alone.**

### Step 1.1 -- Add `sessionDir` to lib/events.mjs [parallel]

- **File:** `lib/events.mjs`
- **Current:** exports `teamDir()`, `readEventLog(dir?)`, `deriveState`, `EVENT_TO_PHASE`, `projectDir`
- **Change:** Add `export function sessionDir(topic) { return join(teamDir(), topic); }`. No changes to existing exports.
- **Covers:** T16
- **Verification:** T16 test; existing imports unaffected.

---

## Phase 2: Server-Side Multi-Session Infrastructure

**Atomic commit block: Steps 2.1-2.4 must land together.** Steps 1.3/1.4/1.5 from the prior plan form a compile-time coupled set (server.ts depends on sessions.ts, sse.ts depends on new signatures). They cannot be independently committed.

### Step 2.1 -- Add session scanner module [parallel within block]

- **File:** `teamflow/src/sessions.ts` (new)
- **Exports:**
  - `discoverSessions(baseDir: string): Promise<Array<{ id: string, path: string }>>` -- async `fs.readdir` (not sync) with `withFileTypes`, filters for directories containing `events.jsonl`. Also checks for flat `baseDir/events.jsonl` and includes `{ id: "default", path: baseDir }` if found.
  - `createSessionPoller(baseDir: string, onChange: (added: Array<{id,path}>, removed: string[]) => void, interval?: number): { close(): void }` -- polls every `interval` ms (default 300), calls `discoverSessions`, diffs against previous set, invokes `onChange`.
- **Edge cases:** Race condition where directory exists but `events.jsonl` does not yet -- directory is skipped until next poll. Deleted session directory: appears in `removed` array.
- **Covers:** T5, T15, T18
- **Verification:** T5, T15, T18 tests.

### Step 2.2 -- Refactor server.ts for multi-session [sequential within block]

- **File:** `teamflow/src/server.ts`
- **Current signature:** Single `stateEngine`, single `broadcast`, single `createTailer(eventsPath, cb)`.
- **New structure:**
  - `const sessions = new Map<string, { engine: ReturnType<typeof createStateEngine>, tailer: ReturnType<typeof createTailer> }>()` -- one entry per discovered session.
  - On startup: `discoverSessions(teamDir)` populates the map. Each entry gets its own `createStateEngine()` and `createTailer(session.path + "/events.jsonl", cb)`. For `"default"` session, tail `baseDir/events.jsonl` directly.
  - Register `createSessionPoller(teamDir, onSessionChange)`:
    - `added`: create engine+tailer, broadcast initial snapshot for new session.
    - `removed`: call `tailer.close()`, delete from map, broadcast a `session-removed` SSE event with `{ sessionId }`.
  - `getAllSnapshots(): Array<{ sessionId: string, state: RunState }>` replaces `getSnapshot()`.
  - `broadcastSession(sessionId: string, state: RunState)` replaces `broadcast(state)`.
  - Remove the hardcoded `const eventsPath = join(teamDir, "events.jsonl")`.
- **Covers:** T5 (auto-discovery)
- **Verification:** Server starts, discovers existing sessions, creates per-session tailers.

### Step 2.3 -- Update SSE plugin for multiplexed envelope [sequential within block]

- **File:** `teamflow/src/sse.ts`
- **Current interface:** `SSEPluginOptions { getSnapshot: () => RunState }`
- **New interface:** `SSEPluginOptions { getAllSnapshots: () => Array<{ sessionId: string, state: RunState }> }`
- **Changes:**
  - On connect: iterate `getAllSnapshots()`, send one `event: snapshot\n` per entry. Wire format: `JSON.stringify({ sessionId, state })`.
  - `getBroadcast` signature changes to return `(sessionId: string, data: RunState) => void`. Wire format for `event: update\n`: `JSON.stringify({ sessionId, state: data })`.
  - Add new SSE event type `session-removed`: `getBroadcast` also returns a `broadcastRemoval(sessionId: string) => void` or the server handles this directly.
- **Covers:** T14
- **Verification:** T14 test; `curl /api/events` receives envelope format.

### Step 2.4 -- Update REST API for multi-session [parallel within block]

- **File:** `teamflow/src/api.ts`
- **Current interface:** `ApiPluginOptions { getSnapshot: () => RunState }`
- **New interface:** `ApiPluginOptions { getAllSnapshots: () => Array<{ sessionId: string, state: RunState }> }`
- **Change:** `GET /api/state` returns `Record<string, RunState>` (object keyed by sessionId, built from the array).
- **Verification:** `curl /api/state` returns multi-session object.

---

## Phase 3: Client-Side Multi-Session State and Tab Bar

**Atomic commit block: Steps 3.1-3.4 must land together.** The App.svelte rewrite, TabBar creation, and EmptyState override are interdependent.

### Step 3.1 -- Create TabBar.svelte component [parallel within block]

- **File:** `teamflow/src/client/components/TabBar.svelte` (new)
- **Props interface:** `{ sessions: Map<string, RunState>, activeSessionId: string | null, onSelect: (id: string) => void, onDismiss: (id: string) => void }`
- **Template:** Iterate `sessions` entries. Each tab shows:
  - Label: `state.topic ?? sessionId` (fallback for null topic before `feature.requested`)
  - Phase badge: `state.phase ?? "..."` (fallback for null phase; addresses M1)
  - `.active` class when `sessionId === activeSessionId`
  - `.completed` class when `state.phase === "SHIPPED"`
  - Dismiss button: `{#if state.phase === "SHIPPED"}` only (T7, T9)
  - `onclick` calls `onSelect(sessionId)` (T4)
  - Dismiss button `onclick` calls `onDismiss(sessionId)` with `stopPropagation`
- **Styling:** Use theme.css custom properties. Border-bottom on `.active`.
- **Covers:** T2, T3, T4, T6, T7, T9
- **Verification:** T2, T3, T4, T6, T7, T9 tests.

### Step 3.2 -- Rewrite App.svelte for session map [sequential within block]

- **File:** `teamflow/src/client/App.svelte`
- **Complete prop-passing inventory (7 sites):**

  | # | Current code | New code |
  |---|-------------|----------|
  | 1 | `<Header topic={state.topic} duration={state.startedAt && state.phase !== "SHIPPED" ? now - new Date(state.startedAt).getTime() : state.duration} .../>` | `<Header topic={activeState.topic} duration={activeState.startedAt && activeState.phase !== "SHIPPED" ? now - new Date(activeState.startedAt).getTime() : activeState.duration} .../>` |
  | 2 | `<PhaseCards phase={state.phase} agents={state.agents} gates={state.gates} events={state.events} {now} />` | `<PhaseCards phase={activeState.phase} agents={activeState.agents} gates={activeState.gates} events={activeState.events} {now} />` |
  | 3 | `<Timeline events={state.events} />` | `<Timeline events={activeState.events} />` |
  | 4 | `<ErrorPanel errors={state.errors} />` | `<ErrorPanel errors={activeState.errors} />` |
  | 5 | `<EmptyState {connected} />` | `<EmptyState {connected} />` (unchanged) |
  | 6 | `showEmptyState` derivation: `state.phase === null && state.events.length === 0` | `sessions.size === 0` (no active session data at all) |
  | 7 | `let state: RunState = $state({...})` | `let sessions = $state(new Map<string, RunState>())` + `let activeSessionId: string | null = $state(null)` |

- **Null-guard strategy:** `const activeState: RunState = $derived(sessions.get(activeSessionId ?? "") ?? emptyRunState)` where `emptyRunState` is a module-level constant matching the current initial `state` literal. This ensures all child components always receive a valid `RunState` -- never `undefined`.
- **`showEmptyState` update:** `$derived(!hasEverConnected || (connected && sessions.size === 0))`. Removes `state.phase` and `state.events.length` checks. The invariant comment about EmptyState/reconnecting collision still holds because when `sessions.size === 0` and reconnecting is true, `hasEverConnected` is true, so `showEmptyState` is false.
- **E7 test impact:** The `showEmptyState` derivation still references `hasEverConnected`, so E7's assertion `showEmptyState` derived references `hasEverConnected` continues to pass.
- **`showTabs` derivation:** `$derived(sessions.size >= 2)` (T10).
- **CSS class toggle:** `class:has-tabs={showTabs}` on `.dashboard` div.
- **Grid:** Add `.dashboard.has-tabs { grid-template-rows: auto auto auto 1fr auto; }` to the `<style>` block. Base `.dashboard` grid unchanged at `auto auto 1fr auto`.
- **`connectSSE()` rewrite:**
  - Parse incoming `snapshot` and `update` events as `{ sessionId, state }`.
  - On `snapshot`: `sessions.set(data.sessionId, data.state)`. If `activeSessionId` is null, auto-select the first session received (M3 tiebreaker: first snapshot wins; subsequent snapshots do not steal focus).
  - On `update`: `sessions.set(data.sessionId, data.state)`. If `activeSessionId` is null (edge case after dismiss-all), auto-select this session.
  - On `session-removed`: `sessions.delete(data.sessionId)`. If deleted session was active, auto-select first remaining key or set null.
  - On reconnect (M2): clear the entire sessions map and let snapshots repopulate it. `activeSessionId` is preserved if the session still exists after snapshots arrive; otherwise auto-select first.
  - Filter incoming sessions against localStorage dismissed list on connect.
- **Dismissed sessions:**
  - `localStorage` key: `teamflow:dismissed-sessions` (JSON array of string IDs).
  - `onDismiss(id)`: delete from `sessions` map, add to localStorage array. If dismissed was active, auto-select next.
  - On SSE connect: read dismissed list, skip incoming snapshots for dismissed IDs.
  - m1 mitigation: when a dismissed ID is not in the incoming snapshot set, remove it from localStorage (stale entry cleanup).
- **Header behavior (M6):** Header always shows `activeState.topic` and `activeState.duration`. When no session is active (sessions empty), `activeState` is `emptyRunState` so `topic` is null and duration is null, matching current empty-dashboard behavior.
- **Covers:** T1, T3, T4, T8, T10, T12, T17
- **Verification:** T1, T3, T4, T8, T10, T12, T17 tests; E7 regression check.

### Step 3.3 -- Integrate TabBar into App.svelte [sequential within block]

- **File:** `teamflow/src/client/App.svelte` (same file as 3.2 -- combined during implementation)
- **Change:** Import `TabBar.svelte`. Render `{#if showTabs}<TabBar sessions={sessions} activeSessionId={activeSessionId} onSelect={...} onDismiss={...} />{/if}` between `<Header>` and the reconnecting banner.
- **Covers:** T1
- **Verification:** T1 test.

### Step 3.4 -- Update EmptyState grid override [parallel within block]

- **File:** `teamflow/src/client/components/EmptyState.svelte`
- **Change:** Add rule `:global(.has-tabs) .empty-state { grid-row: 3 / 5; }` to the `<style>` block. The base `.empty-state { grid-row: 2 / 4; }` is unchanged.
- **Covers:** T11, T13
- **Edge case:** EmptyState is only visible when `sessions.size === 0`, which means `showTabs` is false, which means `.has-tabs` is never applied when EmptyState renders. The override rule exists for defensive correctness but is unreachable in normal flow. Test E8 passes because the base rule is untouched.
- **Verification:** T11 (E8 regression), T13 tests.

---

## Phase 4: Skill, Hook, and Documentation Updates

**Atomic commit block: Steps 4.1-4.4 must land together.** All skill files reference `~/.team/events.jsonl` and must be updated consistently to avoid any agent writing to the old path.

### Step 4.1 -- Update all skill files [parallel within block]

Files and exact changes (inventory rows 2-12):

- **`skills/team/SKILL.md`** lines 26,28,41,130:
  - Line 26: `~/.team/` -> `~/.team/<topic>/`; `mkdir -p ~/.team` -> `mkdir -p ~/.team/<topic>`
  - Line 28: `~/.team/events.jsonl` -> `~/.team/<topic>/events.jsonl`
  - Line 41: `~/.team/events.jsonl` -> `~/.team/<topic>/events.jsonl`
  - Line 130 (C3): `Delete ~/.team/ directory` -> `Delete ~/.team/<topic>/ directory`
- **`skills/team-research/SKILL.md`** lines 19-20:
  - `~/.team/` -> `~/.team/<topic>/`
  - `~/.team/events.jsonl` -> `~/.team/<topic>/events.jsonl`
- **`skills/team-plan/SKILL.md`** line 16: `~/.team/events.jsonl` -> `~/.team/<topic>/events.jsonl`
- **`skills/team-test/SKILL.md`** line 12: `~/.team/events.jsonl` -> `~/.team/<topic>/events.jsonl`
- **`skills/team-implement/SKILL.md`** line 12: `~/.team/events.jsonl` -> `~/.team/<topic>/events.jsonl`
- **`skills/team-verify/SKILL.md`** line 12: `~/.team/events.jsonl` -> `~/.team/<topic>/events.jsonl`
- **`skills/team-ship/SKILL.md`** line 12,21:
  - Line 12: `~/.team/events.jsonl` -> `~/.team/<topic>/events.jsonl`
  - Line 21 (C3): `Delete ~/.team/ directory.` -> `Delete ~/.team/<topic>/ directory.`
- **`skills/team-fix/SKILL.md`** lines 39,40,51,71:
  - Line 39: `~/.team/` -> `~/.team/<topic>/`; `mkdir -p ~/.team` -> `mkdir -p ~/.team/<topic>`
  - Line 40: `~/.team/events.jsonl` -> `~/.team/<topic>/events.jsonl`
  - Line 51: `~/.team/events.jsonl` -> `~/.team/<topic>/events.jsonl`
  - Line 71 (C3): `Delete ~/.team/ directory.` -> `Delete ~/.team/<topic>/ directory.`
- **`skills/team-resume/SKILL.md`** line 3 (description) and line 12:
  - `~/.team/events.jsonl` -> `~/.team/<topic>/events.jsonl`
- **`skills/rpi-workflow/SKILL.md`** line 97: `~/.team/events.jsonl` -> `~/.team/<topic>/events.jsonl`
- **`skills/worktree-isolation/SKILL.md`** line 39:
  - `The event log lives at ~/.team/events.jsonl (global, not per-worktree)` -> `The event log lives at ~/.team/<topic>/events.jsonl (per-pipeline, not per-worktree)`

### Step 4.2 -- Update runtime hooks [parallel within block]

- **`hooks/session-start-recover.mjs`:**
  - Import `readdir` from `node:fs/promises`.
  - Replace `readEventLog()` (no args) with: scan `teamDir()` for subdirectories containing `events.jsonl` using async `readdir({ withFileTypes: true })`. For each, call `readEventLog(subdir)` + `deriveState`. Pick the session with the latest event timestamp. Fall back to flat `teamDir()` if no subdirectories found.
  - Line 95: `delete ~/.team/events.jsonl` -> `delete ~/.team/<topic>/events.jsonl`
  - Comments lines 4-5: update to reference subdirectory scanning.
- **`hooks/pre-compact-anchor.mjs`:**
  - Same scanning logic as session-start-recover. Replace bare `readEventLog()` with subdirectory scan + fallback.
  - Comments lines 4-5: update to reference subdirectory scanning.

### Step 4.3 -- Update demo script (M4) [parallel within block]

- **File:** `teamflow/bin/demo.mjs`
- **Changes:**
  - Line 17: `const teamDir = join(homedir(), ".team")` stays (used as base).
  - Line 18: `const eventsPath = join(teamDir, "events.jsonl")` -> `const demoDir = join(teamDir, "demo"); const eventsPath = join(demoDir, "events.jsonl")`
  - Line 91: `mkdirSync(teamDir, ...)` -> `mkdirSync(demoDir, { recursive: true })`
  - Lines 157-159 (SIGINT handler, M4): `rmSync(teamDir, ...)` -> `rmSync(demoDir, { recursive: true, force: true })`. Only deletes `~/.team/demo/`, not all of `~/.team/`.

### Step 4.4 -- Update AGENTS.md documentation [parallel within block]

- **File:** `AGENTS.md`
- **Line 86:** `Event log at ~/.team/events.jsonl` -> `Event log at ~/.team/<topic>/events.jsonl`
- **Line 90:** Update Teamflow Dashboard description to mention per-session subdirectories and tab bar.

---

## Phase 5: Acceptance Tests

**Atomic commit block: Step 5.1 alone.**

### Step 5.1 -- Add multi-session structural tests

- **File:** `teamflow/src/__tests__/multi-session.test.ts` (new)
- **Pattern:** Follow `empty-state.test.ts` structural/source-code pattern using `readSource` and `extractStyleBlock` helpers. No DOM, no browser.

---

### Tests

All tests in `teamflow/src/__tests__/multi-session.test.ts`.

| # | Test name | Verifies | Step |
|---|-----------|----------|------|
| T1 | `tab_bar_renders_when_two_or_more_sessions` | App.svelte conditionally renders TabBar inside `{#if showTabs}` or equivalent `sessions.size >= 2` guard | 3.3 |
| T2 | `tab_label_shows_topic_and_phase` | TabBar.svelte template references `topic` (or `state.topic`) and `phase` (or `state.phase`) for each tab | 3.1 |
| T3 | `active_tab_has_distinct_class` | TabBar.svelte applies `.active` class conditioned on `activeSessionId` | 3.1 |
| T4 | `clicking_tab_calls_on_select` | TabBar.svelte wires `onclick` to `onSelect` prop | 3.1 |
| T5 | `session_poller_detects_new_directories` | sessions.ts exports `createSessionPoller` and calls `discoverSessions` on an interval | 2.1 |
| T6 | `completed_session_has_completed_class` | TabBar.svelte applies `.completed` class when phase is `SHIPPED` | 3.1 |
| T7 | `dismiss_button_exists_for_shipped_sessions` | TabBar.svelte renders dismiss control inside a `SHIPPED` conditional | 3.1 |
| T8 | `dismissal_persists_to_local_storage` | App.svelte references `teamflow:dismissed-sessions` localStorage key | 3.2 |
| T9 | `no_dismiss_for_active_sessions` | TabBar.svelte dismiss control is gated by `SHIPPED` check | 3.1 |
| T10 | `no_tab_bar_for_single_session` | App.svelte `showTabs` derivation uses `.size >= 2` or `>= 2` | 3.2 |
| T11 | `grid_layout_unchanged_for_single_session` | E8 still passes: EmptyState base `grid-row: 2 / 4` is present and unmodified | 3.4 |
| T12 | `has_tabs_class_toggles_grid` | App.svelte style contains `.dashboard.has-tabs` or `.has-tabs` with 5-row grid template | 3.2 |
| T13 | `empty_state_override_for_tabs` | EmptyState.svelte has `:global(.has-tabs)` rule with `grid-row: 3 / 5` | 3.4 |
| T14 | `sse_envelope_contains_session_id` | sse.ts `JSON.stringify` output includes `sessionId` | 2.3 |
| T15 | `sessions_module_exports_discover` | sessions.ts exports `discoverSessions` function | 2.1 |
| T16 | `lib_events_exports_session_dir` | lib/events.mjs exports `sessionDir` | 1.1 |
| T17 | `app_maintains_session_map` | App.svelte declares `sessions` as a `Map` with `$state` | 3.2 |
| T18 | `backward_compat_default_session` | sessions.ts `discoverSessions` body contains logic for flat `events.jsonl` producing `"default"` session id | 2.1 |
| T19 | `skill_files_reference_topic_subdirectory` | All 11 skill files (team, team-research, team-plan, team-test, team-implement, team-verify, team-ship, team-fix, team-resume, rpi-workflow, worktree-isolation) reference `~/.team/<topic>` and none reference bare `~/.team/events.jsonl` | 4.1 |
| T20 | `demo_writes_to_subdirectory` | demo.mjs references `"demo"` subdirectory path and SIGINT handler does not `rmSync` on bare `teamDir` | 4.3 |
| T21 | `hooks_scan_subdirectories` | Both hooks (session-start-recover.mjs, pre-compact-anchor.mjs) contain `readdir` call or equivalent subdirectory scanning logic | 4.2 |
| T22 | `session_removed_event_on_delete` | sse.ts or server.ts contains `session-removed` event type string | 2.2/2.3 |

---

### Done Criteria

- [ ] All T1-T22 acceptance tests pass (`npx vitest run`)
- [ ] Existing test suites pass with no regressions (E1-E8, state tests, gate tests, animation tests)
- [ ] Test E7 specifically passes unmodified (`showEmptyState` still references `hasEverConnected`)
- [ ] Test E8 specifically passes unmodified (base `grid-row: 2 / 4`)
- [ ] `RunState` type in `types.ts` has zero field changes
- [ ] Demo script writes to `~/.team/demo/events.jsonl` and cleanup deletes only `~/.team/demo/`
- [ ] Single-session view has no visible tab bar (layout identical to current)
- [ ] `lib/events.mjs` exports `sessionDir`
- [ ] All 11 skill files reference `~/.team/<topic>/events.jsonl` (no bare `~/.team/events.jsonl`)
- [ ] Both runtime hooks scan subdirectories with flat-file fallback
- [ ] Ship cleanup in `skills/team/SKILL.md`, `skills/team-ship/SKILL.md`, and `skills/team-fix/SKILL.md` deletes `~/.team/<topic>/` not `~/.team/`
- [ ] AGENTS.md documentation updated
- [ ] No new runtime dependencies added to `teamflow/package.json`
