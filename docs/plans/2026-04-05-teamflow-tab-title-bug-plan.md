# Plan: Teamflow Tab Title Bug

## Context

The Teamflow dashboard displays raw kebab-case slugs (e.g. `suppress-intermediate-gate-noise`) in tab labels and the header instead of human-readable titles. The `feature.requested` event already carries a `data.description` field with the readable string, but `state.ts` only extracts `data.topic` (the slug). This plan adds a `title` field to `RunState`, populates it from the event description, and uses it in the UI with appropriate fallbacks and truncation. Research artifact: `docs/plans/2026-04-05-teamflow-tab-title-bug-research.md`.

## Steps

### Phase 1: State model and engine [atomic commit]

**Step 1.1** `[sequential]` -- Add `title` field to `RunState`
- **File:** `teamflow/src/types.ts`
- **What:** Add `title: string | null` to the `RunState` interface, after the `topic` field (line 31)
- **Verification:** TypeScript compilation succeeds; existing tests still pass

**Step 1.2** `[sequential]` -- Initialize `title` in `createEmptyState` and extract from event
- **File:** `teamflow/src/state.ts`
- **What:**
  - In `createEmptyState()` (line 162-174): add `title: null` to the returned object
  - In the `feature.requested` handler (lines 204-207): add `newState.title = (data.description as string) || null` -- use `||` (not `??`) so empty strings fall back to null
- **Verification:** `applyEvent` with a `feature.requested` event containing `data.description` populates `state.title`; empty string description yields `null`

**Step 1.3** `[parallel]` -- Update `emptyRunState` in `App.svelte`
- **File:** `teamflow/src/client/App.svelte`
- **What:** Add `title: null` to the `emptyRunState` literal (lines 10-21) so it matches the updated `RunState` interface
- **Verification:** TypeScript compilation succeeds

**Step 1.4** `[parallel]` -- Update `createFreshState()` in `state.test.ts`
- **File:** `teamflow/src/__tests__/state.test.ts`
- **What:** Add `title: null` to the object returned by `createFreshState()` helper (line 49-61) so existing tests compile against the updated `RunState` interface
- **Verification:** Existing state tests pass without type errors

### Phase 2: UI rendering [atomic commit]

**Step 2.1** `[parallel]` -- Update TabBar label with title and truncation
- **File:** `teamflow/src/client/components/TabBar.svelte`
- **What:** On line 26, replace `{state.topic ?? sessionId}` with a truncated display using the fallback chain `state.title ?? state.topic ?? sessionId`. Truncate at 40 characters with trailing ellipsis. The truncation logic should be inline in the template or a small local helper within the `<script>` block. **Important:** The full fallback expression `state.title ?? state.topic ?? sessionId` must remain visible in the template markup (not absorbed entirely into a helper), because existing test MS-T2 asserts that `.topic` appears in the TabBar source.
- **Verification:** Tab label shows the human-readable description when available, falls back to slug, then to sessionId; existing MS-T2 test still passes

**Step 2.2** `[parallel]` -- Update Header to accept and prefer title over topic
- **File:** `teamflow/src/client/components/Header.svelte`
- **What:**
  - Add `title` prop as `title?: string | null` (optional) to the `Props` interface (lines 2-7)
  - On line 25, update the `{#if topic}` guard to `{#if title ?? topic}` and render `{title ?? topic}` instead of `{topic}` in the breadcrumb span
- **Verification:** Header shows description text when title prop is provided; shows topic when title is null; hides breadcrumb segment when both are null

**Step 2.3** `[sequential]` -- Pass title prop from App.svelte to Header
- **File:** `teamflow/src/client/App.svelte`
- **What:** On the `<Header>` element (lines 181-186), add `title={activeState.title}` prop
- **Verification:** Header receives title from active session state

### Phase 3: Demo script [atomic commit]

**Step 3.1** `[parallel]` -- Fix demo to use real kebab slugs and add descriptions
- **File:** `teamflow/bin/demo.mjs`
- **What:**
  - Line 27 (session 1 `feature.requested`): change `topic` from `"Add SSE reconnection with exponential backoff"` to a kebab slug like `"add-sse-reconnection-exponential-backoff"` and add `description: "Add SSE reconnection with exponential backoff"` to the `data` object
  - Line 56 (session 2 `feature.requested`): change `topic` from `"Fix off-by-one in billing calculation"` to a kebab slug like `"fix-off-by-one-billing-calculation"` and add `description: "Fix off-by-one in billing calculation"` to the `data` object
- **Verification:** Running `dev demo` shows human-readable titles (from description) in tabs and header, not slugs. The demo faithfully demonstrates the bug fix.

### Phase 4: Tests [atomic commit]

**Step 4.1** `[sequential]` -- Write acceptance tests
- **File:** `teamflow/src/__tests__/tab-title.test.ts` (new file)
- **What:** Create test file with the acceptance tests enumerated below. Use `applyEvent` from `../state.js` for behavioral tests and `readSource` from `./helpers.js` for structural tests. Follow the existing conventions in `state.test.ts` and `multi-session.test.ts`.
- **Verification:** All tests pass with `npx vitest run teamflow/src/__tests__/tab-title.test.ts`

## Tests

| # | Test Name | Verifies | Step |
|---|-----------|----------|------|
| TT-1 | `title_field_exists_on_RunState` | `types.ts` declares `title: string \| null` on `RunState` | 1.1 |
| TT-2 | `applyEvent_extracts_title_from_description` | `applyEvent` with `feature.requested` containing `data.description` sets `state.title` to the description string | 1.2 |
| TT-3 | `applyEvent_title_null_when_no_description` | `applyEvent` with `feature.requested` missing `data.description` leaves `state.title` as `null` | 1.2 |
| TT-4 | `tab_bar_uses_full_fallback_chain` | `TabBar.svelte` template contains the expression pattern `state.title ?? state.topic ?? sessionId` (full three-level fallback) | 2.1 |
| TT-5 | `tab_bar_truncates_long_labels` | `TabBar.svelte` source contains truncation logic (40 char limit or equivalent) | 2.1 |
| TT-6 | `header_accepts_title_prop` | `Header.svelte` `Props` interface includes `title` as optional (`title?`) | 2.2 |
| TT-7 | `header_renders_title_with_fallback` | `Header.svelte` template uses `title ?? topic` in the breadcrumb content | 2.2 |
| TT-8 | `header_guard_uses_title_fallback` | `Header.svelte` template `{#if}` guard uses `title ?? topic` (not just `topic`) so title renders when topic is null | 2.2 |
| TT-9 | `app_passes_title_to_header` | `App.svelte` `<Header>` element includes `title={activeState.title}` | 2.3 |
| TT-10 | `demo_session1_has_description_and_kebab_topic` | `demo.mjs` session 1 `feature.requested` data includes `description` field and `topic` is a kebab-case slug (contains hyphens, no spaces) | 3.1 |
| TT-11 | `demo_session2_has_description_and_kebab_topic` | `demo.mjs` session 2 `feature.requested` data includes `description` field and `topic` is a kebab-case slug (contains hyphens, no spaces) | 3.1 |
| TT-12 | `empty_state_has_null_title` | `App.svelte` `emptyRunState` includes `title: null` | 1.3 |
| TT-13 | `createFreshState_has_null_title` | `state.test.ts` `createFreshState()` helper includes `title: null` | 1.4 |
| TT-14 | `applyEvent_title_null_when_empty_string_description` | `applyEvent` with `feature.requested` containing `data.description: ""` (empty string) leaves `state.title` as `null` | 1.2 |

## Done Criteria

- [ ] All 14 acceptance tests (TT-1 through TT-14) pass
- [ ] No regressions in existing test suites (`npx vitest run`)
- [ ] TypeScript compilation succeeds (`npx tsc --noEmit` in teamflow/)
- [ ] `dev demo` shows human-readable titles in tab labels and header instead of slugs
- [ ] Demo `topic` values are actual kebab-case slugs, not human-readable strings
- [ ] Tab labels truncate at 40 characters with ellipsis for long descriptions
- [ ] Slug fallback works when description is absent (no Title Case conversion)
- [ ] Header breadcrumb renders title when topic is null (guard updated)
- [ ] Empty string descriptions treated as null (falsy coercion)
