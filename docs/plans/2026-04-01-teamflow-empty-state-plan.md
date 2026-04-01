# Plan: Teamflow Empty State Screen

**Beads:** team-uss
**Date:** 2026-04-01
**Research:** `docs/plans/2026-04-01-teamflow-empty-state-research.md`

## Context

When the Teamflow dashboard starts with no active pipeline (events.jsonl missing or empty), users see blank idle cards and an empty timeline with no guidance. This plan adds an `EmptyState.svelte` component that shows a contextual message -- "Connecting to Teamflow..." before SSE has ever connected, or "No pipeline running" once connected with no events -- replacing PhaseCards and Timeline until pipeline activity begins. Auto-dismisses via Svelte reactivity.

## Steps

### Phase 1: EmptyState Component [atomic commit]

**Step 1.1** `[parallel]` Create `teamflow/src/client/components/EmptyState.svelte`
- New Svelte 5 component with `$props()` accepting `connected: boolean`
- Two visual states: (a) not connected -- "Connecting to Teamflow..." with subdued styling, (b) connected but empty -- "No pipeline running" heading with "/team" call-to-action text
- Use `{#if}` / `{:else}` for the two messages (pattern from ErrorPanel)
- Scoped `<style>` block using theme CSS variables: `--bg-secondary`, `--text-primary`, `--text-secondary`, `--border-color`, `--color-accent`, `--space-sm/md/lg`
- Root element must include `grid-row: 2 / 4` in its style to span the PhaseCards (auto) and main-content (1fr) grid rows of the parent dashboard grid, leaving row 4 for ErrorPanel
- Center content vertically and horizontally (flexbox) within the spanned grid area
- **Verify:** File exists, imports compile (checked by test E1)

**Step 1.2** `[parallel]` Create `teamflow/src/__tests__/empty-state.test.ts`
- Structural/source-code tests following the gate-visualization.test.ts pattern
- Use `readSource()` and `extractStyleBlock()` from `./helpers.js`
- All test cases listed in the Tests section below (E1-E8)
- **Verify:** `cd teamflow && npx vitest run src/__tests__/empty-state.test.ts` -- all tests fail (test-first)

### Phase 2: App Integration [atomic commit]

**Step 2.1** `[sequential, after 1.1]` Modify `teamflow/src/client/App.svelte`
- Add import for `EmptyState` component alongside existing imports
- Add a `hasEverConnected` flag: `let hasEverConnected = $state(false);` -- set to `true` inside the `snapshot` event handler (same place `connected = true` is set), never reset to false
- Add a `$derived` binding: `const showEmptyState = $derived(!hasEverConnected || (connected && state.phase === null && state.events.length === 0));`
- This formula distinguishes three states:
  - **Never connected** (`!hasEverConnected`): show EmptyState with "Connecting..." -- the reconnecting banner may also be in the DOM but EmptyState visually supersedes it
  - **Connected, empty pipeline** (`connected && phase === null && events empty`): show EmptyState with "No pipeline running"
  - **Mid-session disconnect** (`hasEverConnected && !connected`): keep pipeline visible, existing reconnecting banner handles this case -- no changes needed to reconnecting logic
- Wrap PhaseCards and `.main-content` (Timeline) in `{#if !showEmptyState}` / `{:else}` block rendering `<EmptyState {connected} />` in the else branch
- Keep Header and ErrorPanel always in the template (not inside the conditional)
- Leave the existing `{#if reconnecting}` banner unchanged -- it covers mid-session disconnects when `showEmptyState` is false
- **Verify:** `cd teamflow && npx vitest run src/__tests__/empty-state.test.ts` -- all tests pass

**Step 2.2** `[sequential, after 2.1]` Manual smoke test
- Run `TEAMFLOW_NO_OPEN=1 node teamflow/bin/teamflow.mjs`, open browser to `http://127.0.0.1:7425`
- Confirm empty state message appears centered, filling the PhaseCards + Timeline region
- Run `node teamflow/bin/demo.mjs` -- confirm empty state auto-dismisses and pipeline renders
- **Verify:** Visual confirmation only (no automated test)

## Tests

All tests in `teamflow/src/__tests__/empty-state.test.ts`. Structural source-code tests reading files as plain text (no DOM/browser), consistent with `animation.test.ts` and `gate-visualization.test.ts`.

| ID | Test Name | Verifies | Step |
|----|-----------|----------|------|
| E1 | `empty_state_component_exists` | `EmptyState.svelte` exists and has `<script lang="ts">`, `$props()`, and `<style>` sections | 1.1 |
| E2 | `empty_state_accepts_connected_prop` | Props interface includes `connected: boolean` and destructures it from `$props()` | 1.1 |
| E3 | `empty_state_shows_connecting_message` | Template contains "Connecting" text in an `{#if !connected}` branch | 1.1 |
| E4 | `empty_state_shows_no_pipeline_message` | Template contains "No pipeline running" and "/team" text in the else branch | 1.1 |
| E5 | `empty_state_uses_theme_variables` | Scoped style block references `--bg-secondary` and `--text-secondary` | 1.1 |
| E6 | `app_imports_empty_state` | `App.svelte` imports `EmptyState` from components | 2.1 |
| E7 | `app_uses_has_ever_connected_for_empty_state` | `App.svelte` declares `hasEverConnected` as a `$state` and the `showEmptyState` derived binding references `hasEverConnected` (not bare `!connected`) | 2.1 |
| E8 | `empty_state_spans_grid_rows` | `EmptyState.svelte` style block contains `grid-row` property with value spanning rows 2 through 4 (e.g., `grid-row: 2 / 4`) | 1.1 |

## Done Criteria

- [ ] All 8 acceptance tests (E1-E8) pass: `cd teamflow && npx vitest run src/__tests__/empty-state.test.ts`
- [ ] No regressions in existing tests: `cd teamflow && npx vitest run`
- [ ] `EmptyState.svelte` component exists at `teamflow/src/client/components/EmptyState.svelte`
- [ ] Dashboard shows "Connecting to Teamflow..." before SSE has ever connected
- [ ] Dashboard shows "No pipeline running" when connected with empty state
- [ ] Mid-session SSE disconnect keeps pipeline visible (reconnecting banner shown, not EmptyState)
- [ ] Empty state auto-dismisses when first pipeline event arrives (Svelte reactivity)
- [ ] Header and ErrorPanel are not conditionally removed from the template
- [ ] EmptyState fills the PhaseCards + Timeline grid region (rows 2-3), not just the auto-sized row
- [ ] No backend changes required
