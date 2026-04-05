# Plan: Truncate Long Title in Teamflow UI

## Context

The Teamflow header displays `state.title` sourced from `data.description` -- the
full user-typed feature description, which can be multi-sentence and unwieldy. The
router already derives a concise kebab-case `topic` slug; converting it to sentence
case gives a clean, short title. CSS overflow protection on the header provides a
safety net. Research artifact: `docs/plans/2026-04-05-truncate-long-title-in-teamflow-ui-research.md`.

## Steps

### Phase 1 -- Derive title from topic [atomic]

**Step 1.1** `[sequential]` -- Change title derivation in `applyEvent`
- **File:** `teamflow/src/state.ts` (line 207)
- **What:** Replace `(data.description as string) || null` with logic that converts
  `data.topic` from kebab-case to sentence case (replace hyphens with spaces,
  capitalize first letter). If `data.topic` is absent or empty, set title to `null`.
- **Verification:** Run `npx vitest run teamflow/src/__tests__/tab-title.test.ts` --
  TT-2, TT-3, TT-14 pass with updated assertions.

**Step 1.2** `[parallel]` -- Update test TT-2 assertion
- **File:** `teamflow/src/__tests__/tab-title.test.ts` (line ~114-128)
- **What:** Rename describe/it to reflect topic-derived title. Change the test name
  to `applyEvent_extracts_title_from_topic`. Update the expected value from
  `"Add SSE reconnection with exponential backoff"` to the sentence-cased form of
  the topic `"add-sse-reconnection"` -- which is `"Add sse reconnection"`.
- **Verification:** TT-2 passes.

**Step 1.3** `[parallel]` -- Update test TT-3 assertion
- **File:** `teamflow/src/__tests__/tab-title.test.ts` (line ~136-147)
- **What:** Rename describe/it to reflect topic-derived title. Change the test name
  to `applyEvent_title_from_topic_when_no_description`. The event data has
  `topic: "some-topic"` and no description. Expected title becomes `"Some topic"`.
- **Verification:** TT-3 passes.

**Step 1.4** `[parallel]` -- Update test TT-14 assertion
- **File:** `teamflow/src/__tests__/tab-title.test.ts` (line ~331-342)
- **What:** Rename describe/it to reflect that title derives from topic regardless
  of empty description. The event data has `topic: "some-topic"` and
  `description: ""`. Expected title becomes `"Some topic"` (derived from topic,
  not from the empty description).
- **Verification:** TT-14 passes.

**Step 1.5** `[parallel]` -- Update test file doc comment
- **File:** `teamflow/src/__tests__/tab-title.test.ts` (line ~5)
- **What:** Change the comment from "from feature.requested data.description" to
  "from feature.requested data.topic (kebab-to-sentence-case)".
- **Verification:** Comment matches actual behavior.

### Phase 2 -- CSS overflow protection [atomic]

**Step 2.1** `[sequential]` -- Add overflow styles to Header flex chain
- **File:** `teamflow/src/client/components/Header.svelte`
- **What:** For `text-overflow: ellipsis` to work on a flex child, every
  ancestor in the flex chain must allow shrinking. Apply these changes:
  1. `.header-left` (line ~51): add `min-width: 0; overflow: hidden`
  2. `.title` (line ~63): add `min-width: 0; overflow: hidden`
  3. `.topic` (line ~78): add `overflow: hidden; text-overflow: ellipsis;
     white-space: nowrap; min-width: 0`
  No `max-width` is needed — the flex layout with `justify-content: space-between`
  on `.header` naturally constrains `.header-left` to the space not occupied by
  `.header-right`.
- **Verification:** Visual inspection -- long titles show ellipsis instead of
  overflowing. Existing layout of duration and theme toggle is preserved.

## Tests

| # | Test Name | Verifies | Step |
|---|-----------|----------|------|
| TT-1 | `title_field_exists_on_RunState` | `types.ts` declares `title: string \| null` | N/A (already passes) |
| TT-2 | `applyEvent_extracts_title_from_topic` | `applyEvent` converts `data.topic` to sentence-case title | 1.1, 1.2 |
| TT-3 | `applyEvent_title_from_topic_when_no_description` | Title derived from topic when description absent | 1.1, 1.3 |
| TT-4 | `tab_bar_uses_full_fallback_chain` | TabBar fallback chain unchanged | N/A (already passes) |
| TT-5 | `tab_bar_truncates_long_labels` | TabBar truncation unchanged | N/A (already passes) |
| TT-6 | `header_accepts_title_prop` | Header Props includes optional title | N/A (already passes) |
| TT-7 | `header_renders_title_with_fallback` | Header renders `{title ?? topic}` | N/A (already passes) |
| TT-8 | `header_guard_uses_title_fallback` | Header guard uses `title ?? topic` | N/A (already passes) |
| TT-9 | `app_passes_title_to_header` | App passes title prop to Header | N/A (already passes) |
| TT-10 | `demo_session1_has_description_and_kebab_topic` | Demo data unchanged | N/A (already passes) |
| TT-11 | `demo_session2_has_description_and_kebab_topic` | Demo data unchanged | N/A (already passes) |
| TT-12 | `empty_state_has_null_title` | emptyRunState includes `title: null` | N/A (already passes) |
| TT-13 | `createFreshState_has_null_title` | `state.test.ts` helper includes `title: null` | N/A (already passes) |
| TT-14 | `applyEvent_title_from_topic_ignores_empty_description` | Title derived from topic when description is empty string | 1.1, 1.4 |

## Done Criteria

- [ ] All 14 acceptance tests (TT-1 through TT-14) pass: `npx vitest run teamflow/src/__tests__/tab-title.test.ts`
- [ ] No regressions in existing state tests: `npx vitest run teamflow/src/__tests__/state.test.ts`
- [ ] Header `.topic` span has CSS overflow protection (ellipsis on overflow)
- [ ] Demo pipeline displays sentence-cased topic titles (visual check via `dev demo`)
