# Teamflow Dashboard — Research

**Date:** 2026-03-28
**Topic:** teamflow-dashboard

---

## 1. Existing Event System

### Event Envelope Schema
```typescript
interface TeamEvent {
  seq: number;            // monotonically increasing, gapless
  event: string;          // event name from catalog
  producer: string;       // agent name or "router"
  ts: string;             // ISO-8601
  data: object;           // event-specific payload
  artifact: string | null; // file path if produced
  causedBy: number | null; // seq of triggering event
  gate: object | null;    // gate result metadata
}
```

### Complete Event Taxonomy (22 events)
1. `feature.requested` — entry, data: `{description, topic, today}`
2. `files.found` — data: `{files[], summary}`
3. `research.completed` — data: `{researchPath, openQuestions, patterns[], constraints[]}`
4. `ambiguity.resolved` — data: `{decisions[], researchPath}`
5. `plan.drafted` — data: `{planPath, steps, testCount}`
6. `plan.critiqued` — data: `{verdict, issues[], planPath}`
7. `plan.approved` — data: `{planPath, userFeedback}`
8. `plan.revision-requested` — data: `{planPath, feedback, revisionNumber}`
9. `tests.written` — data: `{testFiles[], testCount, planPath}`
10. `tests.confirmed-failing` — data: `{testFiles[], testCount, planPath}`
11. `step.completed` — data: `{step, testsPassingBefore, testsPassingAfter, totalTests}`
12. `implementation.completed` — data: `{testFiles[], testsTotal, testsPassing, changedFiles[]}`
13. `review.completed` — data: `{verdict, comments[]}`
14. `security-review.completed` — data: `{verdict, findings[]}`
15. `docs-review.completed` — data: `{verdict, gaps[]}`
16. `ux-review.completed` — data: `{verdict, findings[]}`
17. `verification.completed` — data: `{verdict, checks{}, failures[]}`
18. `reviews.aggregated` — data: `{reviewEvents[], hardGatesPassed, summary}`
19. `hard-gate.failed` — data: `{failedGates[], findings[], retryCount, maxRetries:3}`
20. `verification.passed` — data: `{reviewSummary, softGateWarnings[]}`
21. `feature.shipped` — data: `{method, branch, prUrl, commitSha, duration}` (terminal)
22. `step.completed` — intermediate implementer progress events

### Phase Mapping
```javascript
const EVENT_TO_PHASE = {
  "feature.requested": "RESEARCH",
  "research.completed": "PLAN",
  "plan.drafted": "PLAN",
  "plan.approved": "TEST-FIRST",
  "plan.revision-requested": "PLAN",
  "tests.confirmed-failing": "IMPLEMENT",
  "implementation.completed": "VERIFY",
  "hard-gate.failed": "IMPLEMENT",
  "verification.passed": "SHIP",
  "feature.shipped": "SHIPPED",
}
```

---

## 2. Existing Infrastructure

### Hook System
- Hooks are `node "<path>"` commands invoked by Claude Code at lifecycle points
- Input: JSON on stdin; Output: JSON on stderr
- Types registered in `plugin.json`: PreToolUse(Bash), PostToolUse(Write|Edit), PreCompact, SessionStart
- All hooks fail open (exit 0 on error)
- Pattern: `async function main()` with no classes, Node.js built-ins only

### State Derivation Pattern (duplicated in 2 hooks)
```javascript
// Read event log
const raw = await readFile(logPath, "utf-8");
const lines = raw.trim().split("\n").filter(Boolean);
const events = lines.map(line => JSON.parse(line));

// Derive state by linear scan
function deriveState(events) {
  // returns {phase, topic, startedAt, planPath, researchPath, currentStep, testFiles, backwardTransitions}
}
```

### Reusable Code (currently duplicated)
- `deriveState(events)` — in `pre-compact-anchor.mjs` and `session-start-recover.mjs`
- `readEventLog()` — same 2 hooks
- `EVENT_TO_PHASE` map — same 2 hooks
- `readStdin()` — 3 of 4 hooks
- `process.env.CLAUDE_PROJECT_DIR || process.cwd()` — all hooks

---

## 3. Project Structure

### Current Layout
```
hooks/                    — runtime hook scripts (.mjs)
agents/                   — agent definition markdown (12 agents)
skills/*/SKILL.md         — skill files (24 skills)
skills/team/registry.json — pipeline wiring source of truth
.claude-plugin/plugin.json — plugin manifest
docs/                     — architecture, event catalog
docs/plans/               — pipeline artifacts
.team/events.jsonl        — runtime event log (gitignored)
tests/                    — shell-based acceptance tests
script/                   — dev install/uninstall
```

### Key Observations
- **No package.json** — zero npm dependencies currently
- **No TypeScript** — all code is plain `.mjs` ESM
- **No frontend code** — entirely CLI/plugin tooling
- **No HTTP server** — hooks are short-lived one-shot scripts
- **No test framework** — tests are shell scripts with grep assertions

---

## 4. Integration Design Considerations

### Where Teamflow Lives
Teamflow needs its own subdirectory (e.g., `teamflow/`) with its own `package.json` because:
- It introduces npm dependencies (Fastify, Svelte, Vite, open)
- It needs TypeScript compilation
- It has a build step (Vite for frontend)
- It runs as a long-lived process (not a one-shot hook)

### How Teamflow Gets Events
Two complementary mechanisms:
1. **File tailing** — watch `.team/events.jsonl` with `fs.watch`, read new lines on change
2. **HTTP POST from hook** — a new PostToolUse hook could POST to Teamflow's HTTP server when `events.jsonl` is written

File tailing is simpler and sufficient for MVP. The event log is append-only, so offset-based reading is safe.

### How Teamflow Starts
Options:
- Manual: `node teamflow/server.js` or `npx teamflow`
- Automatic: A SessionStart hook detects `.team/` and starts the server as a background process
- Semi-automatic: The `/team` skill prints a message suggesting to run the dashboard

### Server Architecture
- Fastify HTTP server bound to `127.0.0.1:<port>`
- `/api/events` — SSE endpoint (snapshot + stream)
- `/api/state` — current state snapshot (for late joins)
- `/*` — serve built Svelte frontend
- File watcher on `.team/events.jsonl` triggers SSE push

---

## 5. Constraints

### Hard Constraints
- No modification to event log (append-only)
- `seq` values gapless and monotonically increasing
- Router is the only writer to the event log
- All hooks must exit(0) on errors (fail open)
- Plugin hooks use `"type": "command"` only

### Soft Constraints
- New server/frontend code should live in a separate subdirectory
- Hook files should be `.mjs` with Node built-ins only
- `CLAUDE_PROJECT_DIR` env var for project root resolution
- Port must be configurable to avoid conflicts

---

## 6. Open Questions

1. **Server lifecycle**: Should Teamflow run as a standalone sidecar or be managed by the plugin?
2. **Distribution**: Is Teamflow part of the distributed plugin or a dev-only tool?
3. **Build artifacts**: Should the built frontend be committed or built on install?
4. **Port selection**: Fixed default with override, or auto-select available port?
5. **Package management**: Own `package.json` in subdirectory, or root-level?
6. **Event notification**: File watching alone, or also hook-initiated HTTP POST?
7. **Process management**: How to cleanly start/stop the server alongside pipeline runs?

---

## 7. Relevant Files

### Event & State
- `docs/event-catalog.md` — all 21 events with schemas
- `docs/architecture.md` — event-driven architecture design
- `skills/team/registry.json` — pipeline wiring
- `hooks/session-start-recover.mjs` — event log parsing + state derivation
- `hooks/pre-compact-anchor.mjs` — same state derivation pattern

### Plugin Infrastructure
- `.claude-plugin/plugin.json` — hook registration
- `.claude/settings.json` — dev settings
- `dev.yml` — development environment setup

### Agent Definitions
- `agents/*.md` — 12 agents with consumes/produces frontmatter

### Documentation
- `AGENTS.md` — project router, design philosophy
- `docs/beads-workflow.md` — issue tracking
