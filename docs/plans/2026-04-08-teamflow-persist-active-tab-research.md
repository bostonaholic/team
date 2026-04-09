# Research: Teamflow — Persist Active Tab Across Page Refresh

## Tech Stack
- Svelte 5 (`^5.23.0`), TypeScript, Vite 6, Fastify 5, Vitest 3
- Client: Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`)
- Server: Fastify with SSE push and `@fastify/static` for built assets
- No router library; single-page SPA with no URL routing

## Relevant Files

| File | Role |
|------|------|
| `teamflow/src/client/App.svelte` | Main dashboard — manages `activeSessionId` state, SSE handling, dismissed sessions localStorage |
| `teamflow/src/client/components/TabBar.svelte` | Presentational tab bar — renders tabs, calls `onSelect(id)` on click |
| `teamflow/src/types.ts` | Shared TypeScript types (`RunState`, `AgentStatus`, `GateStatus`, `TimelineEntry`) |
| `teamflow/src/state.ts` | Server-side state engine deriving pipeline state from events |
| `teamflow/src/server.ts` | Fastify entry point, SSE plugin init, per-session state engines |
| `teamflow/src/sse.ts` | SSE plugin broadcasting snapshots/updates with multiplexed `sessionId` envelopes |
| `teamflow/src/api.ts` | REST API plugin (`/api/state` endpoint) |
| `teamflow/src/sessions.ts` | Session discovery — scans `~/.team/` for subdirectories with `events.jsonl` |
| `teamflow/src/client/main.ts` | Client entry point mounting Svelte App |
| `teamflow/src/__tests__/multi-session.test.ts` | Acceptance tests (T1–T22), including T8 for `teamflow:dismissed-sessions` localStorage |

## Current Tab State Management

All tab/session state lives in `App.svelte`:

```ts
let sessions = $state(new Map<string, RunState>());
let sessionCount = $state(0);
let activeSessionId: string | null = $state(null);  // never persisted

const activeState: RunState = $derived(sessions.get(activeSessionId ?? "") ?? emptyRunState);
const showTabs = $derived(sessionCount >= 1);
```

### Auto-selection logic

On `snapshot` SSE event:
```ts
if (activeSessionId === null || !sessions.has(activeSessionId)) {
  activeSessionId = sessionId;  // picks first arriving session
}
```

On `update` SSE event:
```ts
if (activeSessionId === null) {
  activeSessionId = sessionId;
}
```

### Tab switching handler
```ts
function handleSelect(id: string) {
  activeSessionId = id;  // pure in-memory, no persistence
}
```

### Existing localStorage pattern (dismissed sessions)
```ts
function getDismissedSessions(): string[] {
  const raw = localStorage.getItem("teamflow:dismissed-sessions");
  return raw ? JSON.parse(raw) : [];
}
function saveDismissedSessions(ids: string[]) {
  localStorage.setItem("teamflow:dismissed-sessions", JSON.stringify(ids));
}
```

## Findings

1. **`activeSessionId` is never persisted.** Initialized to `null`, set by auto-selection on first SSE snapshot. A refresh always resets to whatever session arrives first.
2. **localStorage is already used** for dismissed sessions with `teamflow:` namespace and try/catch guard — established pattern to replicate.
3. **Session IDs are filesystem directory names** (e.g., `add-sse-reconnection`) — stable across refreshes as long as `~/.team/<topic>/` exists.
4. **SSE reconnection replays snapshots** for all active sessions on connect. The stored ID must be validated against arriving snapshots before applying.

## Constraints

### Hard
- Session IDs can disappear if `~/.team/<topic>/` is deleted between refresh and SSE reconnect
- The `snapshot` handler guard must be extended (not replaced) to conditionally skip auto-select when a valid stored ID is present
- Multiple `snapshot` events arrive on connect — restore logic must handle the case where the stored session hasn't arrived yet

### Soft
- localStorage key must use `teamflow:` namespace
- Try/catch guard required on all localStorage reads
- New `$effect` should mirror existing dismiss-session pattern

## Open Questions for Planner

1. **localStorage vs URL hash:** localStorage is the established pattern. URL hash would allow bookmarking but no such use case exists. Recommend localStorage.
2. **Race condition:** Multiple snapshots arrive on connect. Must defer auto-select until stored session arrives (or timeout/fallback).
3. **Dismissed session edge case:** If stored active session is also in dismissed list, what takes priority? Recommend clearing stored ID when dismissing.
4. **Test file:** New `persist-tab.test.ts` or append to `multi-session.test.ts`? Convention suggests new file per feature.
