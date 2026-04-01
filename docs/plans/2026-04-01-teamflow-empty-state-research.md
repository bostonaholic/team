# Research: Teamflow Empty State Screen

**Topic:** teamflow-empty-state
**Date:** 2026-04-01
**Beads:** team-uss

## Tech Stack

- Svelte 5 (runes: `$state`, `$effect`, `$props`) + TypeScript, Vite 6
- Fastify 5 server with SSE (`/api/events`) and REST (`/api/state`)
- Vitest 3 for tests; no Svelte component tests — only state engine unit tests
- Standalone Fastify+Svelte app (no Next.js)

## Relevant Files

### State Management
- `teamflow/src/state.ts` — State engine; `createEmptyState()` produces `RunState` with `phase: null`, `topic: null`, `events: []`, `lastSeq: 0`, all agents `"idle"`, all gates `"pending"`
- `teamflow/src/types.ts` — `RunState` interface; `phase` and `topic` can be null

### Main App
- `teamflow/src/client/App.svelte` — Root component; receives SSE updates; currently renders Header, PhaseCards, Timeline unconditionally with no empty state check. Has `connected` (false until first snapshot) and `reconnecting` flags.

### Components
- `teamflow/src/client/components/PhaseCards.svelte` — Phase pipeline cards with agents and gates
- `teamflow/src/client/components/Timeline.svelte` — Event timeline display
- `teamflow/src/client/components/Header.svelte` — Title with optional topic/duration; handles null topic
- `teamflow/src/client/components/ErrorPanel.svelte` — Conditional rendering pattern: `{#if errors.length > 0}`

### Server/SSE
- `teamflow/src/server.ts` — Fastify server
- `teamflow/src/sse.ts` — Sends `snapshot` on connect, `update` on new events
- `teamflow/src/tail.ts` — File tailer; handles missing events.jsonl (polls every 300ms)

### Styling
- `teamflow/src/client/styles/theme.css` — CSS variables: `--bg-primary`, `--bg-secondary`, `--text-primary`, `--text-secondary`, `--border-color`, `--color-accent`, `--space-sm/md/lg`

### Entry Points
- `teamflow/index.html` — HTML entry with `<div id="app">`
- `teamflow/src/client/main.ts` — Client bootstrap

## Current Behavior (Empty State)

- Header shows no topic, no duration
- PhaseCards render all 12 agents as idle
- Timeline is empty (shows header + empty list)
- No guidance for the user

## Empty State Detection

**Reliable signal:** `state.phase === null && state.events.length === 0`

**Important distinction:** `connected === false` means "not yet connected to SSE" — must not be confused with "connected but no pipeline." Both have `phase: null`.

## Constraints

- `RunState.gates` is always populated (from registry) even when empty — not a reliable discriminator
- All agents are `"idle"` in empty state — also not reliable alone
- App grid layout: `grid-template-rows: auto auto 1fr auto` — empty state replaces the `1fr` region

## Patterns to Follow

- Svelte 5 runes: `$state()`, `$effect()`, `$props()`
- Conditional rendering: `{#if condition}` blocks (see ErrorPanel)
- Scoped `<style>` per component
- CSS variables from `theme.css`
- New components go in `teamflow/src/client/components/`

## Open Questions

1. Should empty state replace PhaseCards + Timeline, or overlay entire dashboard below header?
2. Should "not yet connected" have a different message than "no pipeline"?
3. `EmptyState.svelte` component vs inline `{#if}` block in App.svelte?
4. Should empty state auto-dismiss when first event arrives?

## Recommendation

Create a new `EmptyState.svelte` component. Show it when `connected && state.phase === null && state.events.length === 0`. Replace PhaseCards + Timeline region. Keep Header visible. Auto-dismiss reactively when state changes (Svelte reactivity handles this). Use existing theme CSS variables. Distinguish loading (not connected) from empty (connected, no pipeline) with different messages.
