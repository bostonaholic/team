# Research — simplify-orchestration

## Tech Stack
- Node.js ESM (`*.mjs`) for hooks and shared library
- TypeScript (tsx runtime) for Teamflow server and state engine
- Fastify + SSE for dashboard server; Svelte 5 for client UI
- Skills are Markdown files with YAML frontmatter; `registry.json` is the pipeline wiring

## Directory Conventions
- `lib/` — shared runtime library (`events.mjs`)
- `hooks/` — 4 distributed runtime hooks (PreToolUse, PostToolUse, PreCompact, SessionStart)
- `skills/team/` — router SKILL.md + registry.json; `skills/team-*/SKILL.md` — phase entry points
- `teamflow/src/` — server.ts, state.ts, types.ts, sse.ts, sessions.ts, tail.ts
- `teamflow/bin/` — teamflow.mjs launcher shim + demo.mjs
- `docs/plans/` — artifact files written per pipeline phase
- `~/.team/<topic>/events.jsonl` — runtime event log per pipeline session

## Answers to Questions

### Q1: What directories and files make up the Teamflow subsystem, and which are imported by components outside `teamflow/`?
Files: `teamflow/src/{server,state,types,sse,sessions,tail,api}.ts`, `teamflow/src/client/main.ts`, `teamflow/src/__tests__/`, `teamflow/bin/{teamflow,demo}.mjs`.
Outside imports: `teamflow/src/state.ts:12` imports `../../lib/events.mjs`. No file outside `teamflow/` imports from `teamflow/src/`. `teamflow/src/state.ts:60-65` reads `skills/team/registry.json` at module load.

### Q2: Which runtime files import from `lib/events.mjs`, and for what purpose?
- `hooks/pre-compact-anchor.mjs:14` — imports `EVENT_TO_PHASE, deriveState, readEventLog, teamDir` to scan active session and format compaction anchor context
- `hooks/session-start-recover.mjs:14` — imports same 4 symbols to detect active pipeline and format recovery notice
- `teamflow/src/state.ts:12` — imports only `EVENT_TO_PHASE` to drive phase transitions in the in-memory state engine
- `teamflow/src/__tests__/multi-session.test.ts:369` — imports `sessionDir` for test assertions

### Q3: Which runtime hooks read or write `~/.team/<topic>/events.jsonl`, and what fields do they depend on?
- `hooks/pre-compact-anchor.mjs` — reads via `readEventLog(subdir)`. Depends on `e.ts` for session selection, plus `deriveState` fields: `phase`, `topic`, `planPath`, `currentStep`, `backwardTransitions`, `testFiles`. Also reads raw events for `e.seq`, `e.event`, `e.ts` (lines 34-38).
- `hooks/session-start-recover.mjs` — reads via same pattern. Same `deriveState` fields, plus raw event array for `lastEvent.event`, `lastEvent.seq`, and full events for `detectPartialWork` (lines 34-70).
- `hooks/post-write-validate.mjs` — does NOT read or write `~/.team/`.
- `hooks/pre-bash-guard.mjs` — does NOT read or write `~/.team/`.

### Q4: What does `skills/team/SKILL.md` do step-by-step with the event log — file reads vs. writes?
**Reads**: loop step 1 (`Read ~/.team/<topic>/events.jsonl`); human gate step 1 (`Read the design/structure artifact from disk`); router-emit gate (worktree skill); PR gate (changelog skill).
**Writes**: setup step 6 (first event); loop step 7b (output event); human gate step 4/5 (approval/rejection); mechanical gate (`tests.confirmed-failing`); aggregate gate (typed failure events or `verification.passed`); PR gate (`feature.shipped`, `CHANGELOG.md`).
**Artifact writes by router**: step 7a — router persists agent output to `docs/plans/` before appending the event; `researcher` and `file-finder` are explicitly read-only and cannot write files themselves.

### Q5: Does `skills/team-resume/SKILL.md` have any logic that cannot function without the JSONL event log?
Yes — entirely. Step 1 reads `~/.team/<topic>/events.jsonl`; step 2 halts with an error if the file does not exist. Steps 3-5 replay the log to derive phase, find partial work, and resume the event loop. The partial-work table defines 7 signal conditions as event-presence patterns. There is no fallback to artifact files alone.

### Q6: What is the existing pattern for persisting durable state across compaction events (outside the event log)?
`hooks/pre-compact-anchor.mjs:16-25` defines a `readStateFile()` that reads `~/.team/state.json` as a fallback when no subdirectory sessions are found (lines 122-124). The `state.json` file is NOT written anywhere in the current codebase — it is a legacy read path that falls through silently. The primary pattern is event log derivation via `deriveState()`.

### Q7: How does `hooks/pre-compact-anchor.mjs` construct its `additionalContext` payload?
`formatAnchorContext(state, events)` (lines 41-68) extracts: `state.phase`, `state.topic`, `state.planPath`, `state.currentStep` (always `undefined` — not populated by `deriveState`), `state.backwardTransitions`, `state.testFiles`. From raw events: total count, and last 3 events formatted as `seq=N event (ts)`. `planPath` is also in `docs/plans/` artifacts; `topic` is derivable from the session dir name; `phase` is derivable from `EVENT_TO_PHASE[lastEvent.event]`.

### Q8: How does `hooks/session-start-recover.mjs` determine whether a pipeline is active and at what phase?
`findActiveSession()` (lines 127-165): scans `~/.team/` subdirectories, reads each `events.jsonl`, selects the one with the latest `e.ts`. Calls `deriveState(eventLog)` which walks events and sets `state.phase = EVENT_TO_PHASE[event.event]` (lib/events.mjs:92-95). A pipeline is "active" if `state.phase` is non-null and not `"SHIPPED"`. Minimal state needed: the set of event names that have fired.

### Q9: Conventions for agent-to-router communication — do agents write files, or does the router always persist?
Router always persists. SKILL.md loop step 7a: "If the result includes an artifact path, write the agent's output to that path BEFORE appending the event. Some agents (e.g., researcher, file-finder) have read-only tools and cannot write files themselves — the router is responsible for persisting their artifacts to disk."

### Q10: What types in `teamflow/src/types.ts` and `teamflow/src/state.ts` are referenced outside `teamflow/`?
None. `types.ts` exports `AgentStatus`, `GateStatus`, `TimelineEntry`, `RunState` — consumed only within `teamflow/src/`. `state.ts` exports `applyEvent`, `createStateEngine`, re-exports types — consumed only by `teamflow/src/server.ts`.

### Q11: What does `skills/team/registry.json` define, and which definitions presuppose an append-only event log?
Defines: 8 phases with artifact filenames; 13 agents with `consumes`/`produces`; 6 gates (2 human, 1 mechanical, 2 router-emit, 1 aggregate); 1 join. ALL agent dispatch logic presupposes an event log: the router reads the log to find unconsumed events, skips agents whose `produces` event already exists, checks join satisfaction by scanning for `wait` events. The aggregate gate's `maxRetries: 5` is enforced by counting `hard-gate.*-failed` events. No gate or join condition has an alternative non-log path.

### Q12: Invariants the router enforces about event sequencing — structural vs. conventional.
From SKILL.md Rules section:
- **Append-only** — documented convention; no structural enforcement.
- **Single writer** — convention only; agents with write tools could physically write to the log.
- **Gapless monotonic seq** — convention only; no validation at write time.
- **No duplication** — structural: loop step 4 skips agents whose `produces` event already exists.

### Q13: Are there any `.claude-plugin/` manifest references to Teamflow (server, port, startup command)?
No. `.claude-plugin/plugin.json` defines 4 hook entries only. No mention of Teamflow, port 7425, or `teamflow.mjs`. Teamflow is a development-only sidecar with zero presence in the distributed plugin manifest.

### Q14: What is the most minimal hook, and how does it avoid relying on the event log?
`hooks/pre-bash-guard.mjs` — imports nothing external (no `lib/events.mjs`, no `fs`). Reads JSON from stdin, pattern-matches the `command` field against 8 regex patterns, outputs a `permissionDecision` or exits 0. Zero `~/.team/` interaction.

### Q15: Pattern `hooks/post-write-validate.mjs` uses for stateless structural validation.
Reads tool name and file path from stdin JSON. Resolves path relative to `CLAUDE_PROJECT_DIR`. Checks whether the path falls under `agents/`, `skills/`, `hooks/`, or `.claude-plugin/`. Dispatches to a per-directory validator: YAML frontmatter presence (`.md`), JSON parseability (`.json`), ESM syntax via dynamic `import()` (`.mjs`). No state, no `~/.team/` access, no `lib/events.mjs` import. Exits 1 to block on failure.

### Q16: What state does `deriveState()` return, and which fields are consumed by hooks vs. only by Teamflow?
Returns (lib/events.mjs:73-89): `phase`, `topic`, `beadsId`, `startedAt`, `taskPath`, `questionsPath`, `briefPath`, `researchPath`, `designPath`, `structurePath`, `planPath`, `worktreePath`, `currentSlice`, `testFiles`, `backwardTransitions`.

Consumed by hooks: `phase`, `topic`, `planPath`, `currentStep` (undefined — not populated), `backwardTransitions`, `testFiles`, `beadsId`, `startedAt`.

NOT consumed by hooks: `taskPath`, `questionsPath`, `briefPath`, `researchPath`, `designPath`, `structurePath`, `worktreePath`, `currentSlice`.

Teamflow's `state.ts` does NOT call `deriveState()` at all — it imports only `EVENT_TO_PHASE` and maintains its own `RunState` via `applyEvent()`. So `deriveState()` is consumed only by the two hooks and transitively by `team-resume/SKILL.md` (via the router loop).

### Q17: Which partial-skill entry points scan `events.jsonl`, and which operate solely from `docs/plans/` artifact presence?
All partial-skill entry points scan `events.jsonl` for prerequisite events:
- `team-question` — appends first event; requires the directory
- `team-research` — scans for `task.captured`
- `team-design` — scans for `research.completed`
- `team-structure` — scans for `design.approved`
- `team-plan` — scans for `structure.approved`
- `team-worktree` — scans for `plan.drafted`
- `team-implement` — scans for `worktree.prepared`
- `team-pr` — scans for `verification.passed`

None operate solely from artifact presence in `docs/plans/`. All prerequisites are gated on event names.

## Patterns Observed
- Agent-to-router communication is text output only; router writes all files and appends all events
- `findActiveSession()` is duplicated verbatim between `pre-compact-anchor.mjs` and `session-start-recover.mjs` (identical 38-line function)
- `readStateFile()` fallback to `~/.team/state.json` exists in both hooks but that file is never written
- Gates are enforced by the router reading the log before each dispatch (structural), not by write-time locking
- All entry-point skills follow the same pattern: read log → check for prerequisite event → run sub-loop → stop after specific event

## Reusable Components
- `lib/events.mjs` exports: `projectDir()`, `teamDir()`, `sessionDir(topic)`, `readEventLog(dir?)`, `EVENT_TO_PHASE`, `deriveState(events)`
- `teamflow/src/state.ts` exports: `applyEvent(state, event)`, `createStateEngine()`, and re-exports types
- `teamflow/src/sessions.ts` exports: `discoverSessions(baseDir)`, `createSessionPoller(baseDir, onChange, interval)`
- `teamflow/src/tail.ts` exports: `createTailer(filePath, onEvents)`

## Constraints
- All partial-skill prerequisites are event-log-gated; removing the log breaks all phase entry points without substitution
- `teamflow/src/state.ts` reads `skills/team/registry.json` synchronously at module load; registry and state engine are coupled
- `EVENT_TO_PHASE` is the single source of truth for phase mapping across hooks, state engine, and derived state
- `plugin.json` timeout for PreCompact and SessionStart hooks is 5000ms — any replacement state lookup must complete within that budget
- `seq` gaplessness and single-writer invariants are conventions only (no structural enforcement)
- `currentStep` field is referenced in both hook formatters but never populated by `deriveState()` — always renders as `undefined`

## Open Questions (from research, not for design)
- The `readStateFile()` fallback reads `~/.team/state.json` but no code writes it. Intentional dead code or planned future path? Not determinable from the code.
- `state.currentStep` is formatted in hook output but never set by `deriveState()`. Dropped intentionally or bug? Unclear.
