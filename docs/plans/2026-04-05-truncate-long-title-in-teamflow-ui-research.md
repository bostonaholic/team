# Research: Truncate Long Title in Teamflow UI

## Problem

The Teamflow header displays `state.title` which is set from `data.description` — the full user-typed feature description. This can be multiple sentences, making the header unwieldy. The tab bar truncates at 40 chars but the header has no truncation.

## Data Flow

1. Router derives kebab-case `topic` from description (short slug, 5-8 words)
2. Router emits `feature.requested` with `{ topic, description }` in event data
3. `state.ts:applyEvent` sets `state.title = data.description || null` (line 207)
4. `Header.svelte` renders `{title ?? topic}` — no truncation
5. `TabBar.svelte` renders `truncate(state.title ?? state.topic ?? sessionId)` — 40-char limit

## Root Cause

`state.title` is set to the raw `data.description`, which is the full feature description (can be multi-sentence). The `topic` slug is already a concise identifier but is kebab-case, not human-readable.

## Relevant Files

| File | Role |
|------|------|
| `teamflow/src/state.ts:207` | Sets `title = data.description` |
| `teamflow/src/types.ts:31` | `RunState.title: string \| null` |
| `teamflow/src/client/components/Header.svelte:26` | Renders title, no truncation |
| `teamflow/src/client/components/TabBar.svelte:14-16` | `truncate()` at 40 chars |
| `teamflow/src/client/App.svelte:182-188` | Passes title to Header |
| `teamflow/bin/demo.mjs:27,56` | Demo event data |
| `teamflow/src/__tests__/tab-title.test.ts` | TT-1 through TT-14 |

## Fix Options

### Option A: Derive title from topic (kebab-to-human)
Change `applyEvent` to convert topic slug to sentence case instead of using description.
- `"add-sse-reconnection-exponential-backoff"` → `"Add SSE reconnection exponential backoff"`
- Pros: Always short, consistent
- Cons: Loses some readability (missing prepositions like "with", "in")

### Option B: CSS truncation in Header
Add `text-overflow: ellipsis` + `max-width` to Header `.topic`.
- Pros: No logic changes, preserves full title on hover
- Cons: Truncated text is hard to read, doesn't solve the root cause

### Option C: Derive title from topic (recommended)
Same as A but the conversion is simple: replace hyphens with spaces, capitalize first letter. The topic slug is already a good summary — it's what the router derived as the concise identifier.

## Existing Test Impact

- TT-2 asserts `state.title === "Add SSE reconnection with exponential backoff"` (from description)
- TT-3 asserts `state.title === "Fix off-by-one in billing calculation"` (from description)
- TT-14 asserts empty string description → `null`
- These tests will need updating if title is derived from topic instead of description

## Recommendation

Derive `title` from `topic` in `applyEvent` (Option C). The topic slug is purpose-built to be a concise identifier. Converting it to human-readable text gives clean, short titles. Also add CSS overflow protection in Header as a safety net.
