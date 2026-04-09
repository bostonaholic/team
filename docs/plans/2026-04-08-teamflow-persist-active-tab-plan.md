# Plan: Teamflow — Persist Active Tab Across Page Refresh

## Context

When a user refreshes the Teamflow dashboard, the active session tab resets to
whichever session's SSE snapshot arrives first, losing the user's selection.
This plan adds localStorage persistence so the previously selected tab is
restored after refresh. Based on research at
`docs/plans/2026-04-08-teamflow-persist-active-tab-research.md`.

## Steps

### Phase 1: Add persistence logic to App.svelte `[single file]`

All changes target `teamflow/src/client/App.svelte`.

**Step 1.1 — Add localStorage helpers and tracking flag** `[parallel]`

Add two functions following the existing `getDismissedSessions`/`saveDismissedSessions`
pattern (lines 78-89):

- `getStoredActiveSession(): string | null` — reads `teamflow:active-session`
  from localStorage with try/catch guard, returns the value or null.
- `saveActiveSession(id: string | null)` — writes or removes the key. When
  `id` is null, calls `removeItem`; otherwise calls `setItem`. Wrap in
  try/catch to handle QuotaExceededError and SecurityError (private browsing).
  Note: unlike `saveDismissedSessions`, `saveActiveSession` must wrap its
  write in try/catch because localStorage writes can throw in private
  browsing mode or when quota is exceeded.

Add a boolean tracking variable:

- `let activeSetByUser = false;` — tracks whether the current `activeSessionId`
  was set by an explicit user action (tab click) vs auto-selected by an SSE
  handler. Initialized to `false`. Set to `true` only in `handleSelect`.

**Verification:** PT-T1, PT-T2, PT-T12 structural tests pass.

**Step 1.2 — Persist on explicit tab selection** `[sequential, after 1.1]`

Modify `handleSelect(id: string)` (lines 91-93) to:
1. Call `saveActiveSession(id)` after setting `activeSessionId`.
2. Set `activeSetByUser = true`.

**Verification:** PT-T3 structural test passes.

**Step 1.3 — Restore on snapshot arrival** `[sequential, after 1.1]`

Modify the `snapshot` event handler (lines 118-133). Replace the auto-select
guard with the following logic:

1. If `activeSetByUser` is true AND `activeSessionId` exists in sessions: do
   nothing (user made an explicit choice — never override it).
2. Read stored ID via `getStoredActiveSession()`. If stored ID exists in the
   sessions map: set `activeSessionId` to stored ID, set `activeSetByUser = true`
   (treat restored selection as equivalent to user choice).
3. Otherwise: fall through to existing auto-select (`activeSessionId = sessionId`).
   Do NOT set `activeSetByUser` (leave it false so a later-arriving stored
   session can still override this auto-selection).

This resolves the race condition where session A arrives before stored session B:
auto-selecting A leaves `activeSetByUser = false`, so when B's snapshot arrives
and matches the stored ID, branch 2 fires and overrides the auto-selection.

**Verification:** PT-T4, PT-T5, PT-T9 structural tests pass.

**Step 1.4 — Extend update handler with stored-session check** `[sequential, after 1.1]`

Modify the `update` SSE handler (lines 135-149). The existing auto-select guard
(`if (activeSessionId === null)`) must also respect stored sessions. Apply the
same three-branch logic as Step 1.3:

1. If `activeSetByUser` is true AND `activeSessionId` is non-null: do nothing.
2. If `getStoredActiveSession()` exists in sessions map: use stored ID, set
   `activeSetByUser = true`.
3. Otherwise: fall through to `activeSessionId = sessionId` (do not set
   `activeSetByUser`).

**Verification:** PT-T10 structural test passes.

**Step 1.5 — Clear stored ID on dismiss** `[sequential, after 1.1]`

Modify `handleDismiss(id: string)` (lines 95-107). When the dismissed session
matches `getStoredActiveSession()` (compare against the stored value, NOT
against `activeSessionId` — the two can differ), call `saveActiveSession(null)`
to clear the stored value. Also reset `activeSetByUser = false`. Place this
before the existing `if (activeSessionId === id)` block.

**Verification:** PT-T6 structural test passes.

**Step 1.6 — Clear stored ID on session-removed SSE event** `[sequential, after 1.1]`

Modify the `session-removed` event handler (lines 151-162). When the removed
session ID matches `getStoredActiveSession()` (compare against the stored
value, NOT against `activeSessionId`), call `saveActiveSession(null)` and
reset `activeSetByUser = false`.

**Verification:** PT-T7 structural test passes.

### Phase 2: Add acceptance tests `[single file]`

**Step 2.1 — Create test file** `[parallel]`

Create `teamflow/src/__tests__/persist-tab.test.ts` with structural tests
PT-T1 through PT-T12 (see Tests section). Follow the convention from
`multi-session.test.ts`: import `readSource` from `./helpers.js`, use
`describe`/`it`/`expect` from Vitest, and use source-code pattern matching.

**Verification:** `npx vitest run teamflow/src/__tests__/persist-tab.test.ts`
passes with all 12 tests green.

## Tests

All tests in `teamflow/src/__tests__/persist-tab.test.ts`.

| Test ID | Name | Verifies | Step |
|---------|------|----------|------|
| PT-T1 | `active_session_key_exists` | App.svelte contains `teamflow:active-session` localStorage key string | 1.1 |
| PT-T2 | `get_stored_has_try_catch_guard` | `getStoredActiveSession` wraps localStorage read in try/catch | 1.1 |
| PT-T3 | `handle_select_persists_to_storage` | `handleSelect` body references both `saveActiveSession` and `activeSetByUser = true` | 1.2 |
| PT-T4 | `snapshot_handler_reads_stored_session` | Snapshot event handler references `getStoredActiveSession` | 1.3 |
| PT-T5 | `snapshot_checks_stored_session_in_map` | Snapshot handler contains a `sessions.has(...)` guard conditioned on the stored active session value (match pattern: `sessions.has` near `getStoredActiveSession` within the snapshot handler block) | 1.3 |
| PT-T6 | `dismiss_clears_stored_session` | `handleDismiss` body calls `saveActiveSession(null)`, compares against `getStoredActiveSession()` (not `activeSessionId`), and assigns `activeSetByUser = false` | 1.5 |
| PT-T7 | `session_removed_clears_stored_session` | `session-removed` handler calls `saveActiveSession(null)`, compares against `getStoredActiveSession()` (not `activeSessionId`), and assigns `activeSetByUser = false` | 1.6 |
| PT-T8 | `auto_select_fallback_unchanged` | Snapshot handler still contains the assignment `activeSessionId = sessionId` as a fallback path (match the literal assignment, not just a reference to sessionId) | 1.3 |
| PT-T9 | `snapshot_handler_does_not_persist_auto_selection` | Snapshot handler's auto-select fallback path (`activeSessionId = sessionId`) does NOT call `saveActiveSession` — confirms auto-selections are not written to storage | 1.3 |
| PT-T10 | `update_handler_checks_stored_session` | The `update` event handler references `getStoredActiveSession` for stored-session restoration | 1.4 |
| PT-T11 | `active_set_by_user_flag_exists` | App.svelte declares `activeSetByUser` variable | 1.1 |
| PT-T12 | `save_active_has_try_catch_guard` | `saveActiveSession` wraps localStorage write in try/catch | 1.1 |

## Done Criteria

- [ ] All 12 PT-T tests pass: `npx vitest run teamflow/src/__tests__/persist-tab.test.ts`
- [ ] All existing tests still pass: `npx vitest run` (no regressions in multi-session, state, empty-state, etc.)
- [ ] `teamflow:active-session` key is written on explicit tab click only, not on auto-selection
- [ ] Stored session is restored when its snapshot arrives after refresh, even if other sessions arrive first
- [ ] `activeSetByUser` flag prevents auto-selected sessions from blocking later-arriving stored sessions
- [ ] Both `snapshot` and `update` handlers check stored session before auto-selecting
- [ ] Stored session is cleared on dismiss and on session-removed SSE event (compared against stored value, not activeSessionId)
- [ ] Both localStorage read AND write are wrapped in try/catch (privacy mode / quota errors)
- [ ] No changes to any file other than `App.svelte` and the new test file
