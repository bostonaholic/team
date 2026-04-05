# Research: Teamflow Tab Title Bug (team-awk)

## Bug Summary

When multiple sessions are open in the Teamflow dashboard, the second tab displays the raw topic slug (e.g. `suppress-intermediate-gate-noise`) instead of a human-readable title. The first tab also shows a slug — the "title" and slug are identical.

## Root Cause

**There is no human-readable title anywhere in the pipeline.** The `topic` field in `RunState` is populated from `data.topic` in the `feature.requested` event, which IS the kebab-case slug. The TabBar fallback `state.topic ?? sessionId` is redundant because both values are the same slug.

### Data Flow

1. Router derives kebab-case `topic` from description → e.g. `suppress-intermediate-gate-noise`
2. Event `feature.requested` stores `data.topic` = `"suppress-intermediate-gate-noise"` and `data.description` = `"Suppress intermediate gate noise in review output"`
3. `state.ts:205` extracts `newState.topic = data.topic` — the slug
4. `TabBar.svelte:26` renders `{state.topic ?? sessionId}` — slug either way
5. `Header.svelte` also displays the topic slug

### Secondary Issue: Race Condition

`createTailer` calls `startWatching()` without `await` (tail.ts:108). For sessions discovered at runtime (not at server boot), the async initial read may not complete before `getAllSnapshots()` is called for new SSE clients. This means `state.topic` is `null` briefly, but since the slug shows either way, the visual impact is the same.

## Key Files

| File | Relevance |
|------|-----------|
| `teamflow/src/client/components/TabBar.svelte:26` | Renders tab label with `state.topic ?? sessionId` |
| `teamflow/src/client/components/Header.svelte` | Renders header with topic |
| `teamflow/src/state.ts:204-206` | Extracts topic from `feature.requested` event |
| `teamflow/src/types.ts:33` | `RunState.topic: string \| null` |
| `teamflow/src/server.ts:57-68` | Session initialization, tailer startup |
| `teamflow/src/sessions.ts` | Session discovery (returns raw directory names) |
| `teamflow/src/tail.ts:79-83,108` | Tailer async startup (race condition) |
| `teamflow/src/sse.ts:37-39` | SSE snapshot on connect |
| `teamflow/src/client/App.svelte:117-131` | Client session tracking |
| `teamflow/bin/demo.mjs` | Demo creates two sessions with topic+description |
| `lib/events.mjs` | Shared event library |

## Available Data in `feature.requested`

```json
{
  "data": {
    "topic": "suppress-intermediate-gate-noise",
    "description": "Suppress intermediate gate noise in review output",
    "today": "2026-04-05",
    "beadsId": "team-p3t"
  }
}
```

The `description` field contains a human-readable string that could serve as the tab title.

## Suggested Fix Direction

1. Extract `data.description` from `feature.requested` into a new `title` field on `RunState`
2. Use `title` (or a truncated version) in `TabBar.svelte` and `Header.svelte`
3. Optionally: convert kebab slug to Title Case as a fallback when description is missing
