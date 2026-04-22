# Files Catalog — simplify-orchestration

Grouped by conceptual area. Paths are relative to repo root.

## Core Orchestration Library
- `lib/events.mjs` — Shared: `readEventLog()`, `deriveState()`, `EVENT_TO_PHASE`, `projectDir()`, `teamDir()`, `sessionDir()`

## Runtime Hooks
- `hooks/pre-compact-anchor.mjs` — PreCompact; reads event log to build compaction anchor context
- `hooks/session-start-recover.mjs` — SessionStart; reads event log to detect active pipeline and partial work
- `hooks/post-write-validate.mjs` — PostToolUse(Write|Edit); stateless plugin-file validation (no event log)
- `hooks/pre-bash-guard.mjs` — PreToolUse(Bash); regex-pattern guard (no event log)

## Router & Registry
- `skills/team/SKILL.md` — Router loop: read log, dispatch agents, write artifacts, append events
- `skills/team/registry.json` — Single source of truth: 13 agents, 8 phases, 6 gates, 1 join

## Entry-Point Skills (all log-gated)
- `skills/team-resume/SKILL.md` — Replays event log to derive state and resume
- `skills/team-question/SKILL.md`
- `skills/team-research/SKILL.md`
- `skills/team-design/SKILL.md`
- `skills/team-structure/SKILL.md`
- `skills/team-plan/SKILL.md`
- `skills/team-worktree/SKILL.md`
- `skills/team-implement/SKILL.md`
- `skills/team-pr/SKILL.md`
- `skills/team-fix/SKILL.md` — Compressed bug-fix pipeline

## Agents (13)
- `agents/questioner.md`
- `agents/file-finder.md` (blind, parallel)
- `agents/researcher.md` (blind, parallel)
- `agents/design-author.md`
- `agents/structure-planner.md`
- `agents/planner.md`
- `agents/test-architect.md`
- `agents/implementer.md`
- `agents/code-reviewer.md` (parallel)
- `agents/security-reviewer.md` (parallel)
- `agents/technical-writer.md` (parallel)
- `agents/ux-reviewer.md` (parallel)
- `agents/verifier.md` (parallel)

## Plugin Manifest
- `.claude-plugin/plugin.json` — Registers 4 runtime hooks; no Teamflow references

## Teamflow Dashboard (dev sidecar)

### State Engine & Types
- `teamflow/src/state.ts` — In-memory state engine; imports `EVENT_TO_PHASE` from `lib/events.mjs`; loads `registry.json` at init
- `teamflow/src/types.ts` — `AgentStatus`, `GateStatus`, `TimelineEntry`, `RunState`

### Server
- `teamflow/bin/teamflow.mjs` — Launcher
- `teamflow/src/server.ts` — Fastify server; discovers sessions, creates per-session engine/tailer, SSE multiplex
- `teamflow/src/sessions.ts` — Session discovery scanning `~/.team/`
- `teamflow/src/sse.ts` — SSE plugin
- `teamflow/src/api.ts` — REST `GET /api/state`
- `teamflow/src/tail.ts` — File tailer

### Client (Svelte 5)
- `teamflow/src/client/main.ts`
- `teamflow/src/client/App.svelte`
- `teamflow/src/client/components/TabBar.svelte`
- `teamflow/src/client/components/Header.svelte`
- `teamflow/src/client/components/PhaseCards.svelte`
- `teamflow/src/client/components/AgentList.svelte`
- `teamflow/src/client/components/Timeline.svelte`
- `teamflow/src/client/components/EmptyState.svelte`
- `teamflow/src/client/components/ErrorPanel.svelte`
- `teamflow/src/client/styles/theme.css`

### Demo, Tests, Build
- `teamflow/bin/demo.mjs` — Synthetic event generator
- `teamflow/src/__tests__/*.test.ts` — Vitest suite
- `teamflow/package.json`, `teamflow/tsconfig.json`, `teamflow/vite.config.ts`, `teamflow/svelte.config.js`, `teamflow/index.html`

## Documentation
- `docs/architecture.md` — Event-driven design
- `docs/event-catalog.md` — Event schema reference
- `AGENTS.md` — Project router (runtime vs. dev)
- `tests/teamflow-dashboard-tests.sh` — Acceptance tests

## Methodology Skills (loaded by agents, not entry points)
- `skills/test-first-development/`, `skills/technical-design-doc/`, `skills/product-requirements-doc/`
- `skills/adversarial-review/`, `skills/worktree-isolation/`, `skills/test-driven-bug-fix/`
- `skills/qrspi-workflow/`, `skills/engineering-standards/`
- Plus: `git-commit/`, `changelog/`, `documenting-decisions/`, `refactoring-to-patterns/`, `solid-principles/`, `writing-prose/`, `systematic-debugging/`

## Cross-File Coupling Facts
- Only `teamflow/src/state.ts` imports from `lib/events.mjs` outside of `hooks/`
- Only `teamflow/src/` files import `teamflow/src/types.ts` (no external consumers)
- `.claude-plugin/plugin.json` has zero Teamflow references — Teamflow is not distributed
- `findActiveSession()` is duplicated verbatim in `pre-compact-anchor.mjs` and `session-start-recover.mjs`
- `readStateFile()` reads `~/.team/state.json` in both hooks, but no code writes that file
