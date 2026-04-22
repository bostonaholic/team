# TEAM Architecture

> **Task Execution Agent Mesh** — A Claude Code plugin that orchestrates
> specialized agents to autonomously implement entire features end-to-end,
> driven by a `state.json` snapshot, artifact files on disk, and the QRSPI
> methodology.

## 1. Design Philosophy

Agents are **decoupled microservices**. Each agent consumes a predecessor
artifact on disk, does work, and produces its own artifact under
`docs/plans/`. No agent knows about any other agent. The pipeline emerges
from artifact flow driven by the router's phase table.

The `team` skill is a **phase-table router**. It reads
`~/.team/<topic>/state.json`, looks up the current phase in a linear table,
verifies predecessor artifacts exist on disk, dispatches the next agent(s),
persists their output artifacts, runs the gate for that phase, updates the
snapshot, and advances. It contains zero agent-specific logic.

**Principles:**

- **State is a `state.json` snapshot + artifact presence.** The router and
  hooks read `~/.team/<topic>/state.json` (~10 fields) and stat files under
  `docs/plans/`. Phase completion is signaled by the presence of an artifact
  file (or a zero-byte `.approved` sidecar for human-gated phases).
- **Registry is documentation.** `skills/team/registry.json` lists the 13
  agents and their historical event vocabulary as reference material. The
  router no longer consults `consumes`/`produces` for dispatch; those live
  in `skills/team/SKILL.md` as a phase table.
- **File artifacts survive compaction.** Agents communicate through files in
  `docs/plans/`. These survive context window compaction and can be re-read
  by any agent in any session.
- **Blind research.** The researcher and file-finder never receive the
  user's original task description. Enforcement is two-layer: *structural* —
  the router only passes `brief.md` + `questions.md` paths to the blind
  agents; *procedural* — the blind agents' system prompts forbid reading
  `task.md`.
- **Two human touchpoints.** Design approval (~200-line alignment doc) and
  Structure approval (~2-page vertical-slice breakdown). Each produces a
  zero-byte `<artifact>.md.approved` sidecar as the durable approval
  record. The Plan is not human-gated — humans review the structure, which
  is the real contract.
- **Hooks enforce discipline mechanically.** LLMs forget instructions ~20%
  of the time; hooks are deterministic.

## 2. State Snapshot

**File:** `~/.team/<topic>/state.json` (single JSON object, overwritten in
place via atomic rename)

The snapshot is the only runtime state the router needs. All pipeline
history is reconstructed from the files under `docs/plans/<today>-<topic>-*.md`
plus their `.approved` sidecars.

```json
{
  "topic": "simplify-orchestration",
  "today": "2026-04-22",
  "beadsId": "team-x7z",
  "phase": "DESIGN",
  "startedAt": "2026-04-22T14:03:11Z",
  "lastUpdated": "2026-04-22T14:47:02Z",
  "designRevisionCount": 0,
  "structureRevisionCount": 0,
  "verificationRetryCount": 0,
  "currentSlice": null
}
```

| Field                    | Type            | Description                                           |
|--------------------------|-----------------|-------------------------------------------------------|
| `topic`                  | string          | Kebab-case slug                                       |
| `today`                  | string          | `YYYY-MM-DD` from start                               |
| `beadsId`                | string \| null  | Tracking beads issue, if present                      |
| `phase`                  | enum            | `QUESTION` … `SHIPPED`                                |
| `startedAt`              | ISO-8601        | Pipeline start                                        |
| `lastUpdated`            | ISO-8601        | Last `writeState` call                                |
| `designRevisionCount`    | integer         | Human-gate rejections (design)                        |
| `structureRevisionCount` | integer         | Human-gate rejections (structure)                     |
| `verificationRetryCount` | integer         | Aggregate-gate retries (max 5)                        |
| `currentSlice`           | string \| null  | Latest slice the implementer is working on           |

Optional observability fields `worktreePath` and `branch` may also appear
once the WORKTREE phase completes (written by the router-emit WORKTREE
gate). They are not load-bearing — downstream phases do not depend on them.

**Invariants:**

- `state.json` is the single source of pipeline state. Updates go through
  `lib/state.mjs` (`writeState` performs atomic tmp-file + rename).
- `.approved` sidecars are the durable record of human gate passes. They
  are zero-byte files at `docs/plans/<today>-<topic>-{design,structure}.md.approved`.
- On `SHIPPED`, the router deletes `~/.team/<topic>/` — the `docs/plans/`
  artifacts remain as the only record.

## 3. Pipeline (QRSPI)

The pipeline has eight phases. The router walks them in order; each phase
requires the prior phase's artifact on disk.

```
QUESTION → RESEARCH → DESIGN → STRUCTURE → PLAN → WORKTREE → IMPLEMENT → PR → SHIPPED
```

### Phase 1: Question

**Agent:** `questioner`
**Predecessor:** (none — description in `$ARGUMENTS`)
**Artifacts:** `docs/plans/YYYY-MM-DD-<topic>-{task,questions,brief}.md`

Decomposes the user's intent into three artifacts. Only the questioner ever
sees the user's description.

### Phase 2: Research (blind)

**Parallel agents:** `file-finder`, `researcher` (both BLIND to `task.md`)
**Predecessor:** `task.md`
**Artifact:** `docs/plans/YYYY-MM-DD-<topic>-research.md`

Router waits for both agents to return, then persists the combined research
artifact.

### Phase 3: Design

**Agent:** `design-author` (MUST ask open questions interactively before
drafting)
**Predecessor:** `research.md`
**Artifact:** `docs/plans/YYYY-MM-DD-<topic>-design.md`
**Gate:** HUMAN — on approval the router touches `design.md.approved`; on
rejection the router increments `designRevisionCount` and re-dispatches
`design-author` with the feedback.

### Phase 4: Structure

**Agent:** `structure-planner`
**Predecessor:** `design.md.approved` sidecar
**Artifact:** `docs/plans/YYYY-MM-DD-<topic>-structure.md`
**Gate:** HUMAN — on approval the router touches `structure.md.approved`;
on rejection it increments `structureRevisionCount` and re-dispatches.

### Phase 5: Plan

**Agent:** `planner`
**Predecessor:** `structure.md.approved` sidecar
**Artifact:** `docs/plans/YYYY-MM-DD-<topic>-plan.md`

No human gate. Humans reviewed the structure; the plan is tactical.

### Phase 6: Worktree

**Producer:** router (no agent)
**Predecessor:** `plan.md`
**Artifact:** isolated git worktree under `.claude/worktrees/<topic>/`.
**Gate:** ROUTER-EMIT. On success the router advances `phase` to
`IMPLEMENT` and records `worktreePath`/`branch` in `state.json`.

### Phase 7: Implement

**Sequential sub-agents:**
1. `test-architect` writes failing acceptance tests.
2. Mechanical gate: confirm all tests fail with assertion errors (not
   crashes).
3. `implementer` executes vertical slices with per-slice commits.
4. 5 parallel reviewers: `code-reviewer`, `security-reviewer`,
   `technical-writer`, `ux-reviewer`, `verifier`.
5. Aggregate gate evaluates hard gates (security + verifier + code-review).

On hard-gate failure the router increments `verificationRetryCount` in
`state.json`, dispatches the implementer with the typed failure class to
address (security, lint, typecheck, build, test, review), and re-runs the
5 reviewers from scratch. At `verificationRetryCount >= 5` the router
escalates to the team lead.

On clean pass the router advances `phase` to `PR`.

### Phase 8: PR

**Producer:** router (no agent)
**Actions:** update `CHANGELOG.md`, commit + open PR (or commit locally /
leave uncommitted per user choice), close beads issue if present, advance
`phase` to `SHIPPED`, delete `~/.team/<topic>/`, clean up worktree.

## 4. Agent Roster

| Agent              | Model   | Mode        | Tools                              | Phase      |
|--------------------|---------|-------------|------------------------------------|------------|
| `questioner`       | sonnet  | acceptEdits | Read, Write, Grep, Glob            | QUESTION   |
| `file-finder`      | haiku   | plan        | Read, Grep, Glob                   | RESEARCH   |
| `researcher`       | sonnet  | plan        | Read, Grep, Glob                   | RESEARCH   |
| `design-author`    | opus    | acceptEdits | Read, Write, Edit, Grep, Glob      | DESIGN     |
| `structure-planner`| opus    | acceptEdits | Read, Write, Edit, Grep, Glob      | STRUCTURE  |
| `planner`          | opus    | acceptEdits | Read, Write, Edit, Grep, Glob      | PLAN       |
| `test-architect`   | inherit | acceptEdits | Read, Write, Edit, Grep, Glob, Bash| IMPLEMENT  |
| `implementer`      | opus    | acceptEdits | Read, Write, Edit, Grep, Glob, Bash| IMPLEMENT  |
| `code-reviewer`    | sonnet  | plan        | Read, Grep, Glob, Bash             | IMPLEMENT  |
| `security-reviewer`| sonnet  | plan        | Read, Grep, Glob, Bash             | IMPLEMENT  |
| `technical-writer` | sonnet  | plan        | Read, Grep, Glob, Bash             | IMPLEMENT  |
| `ux-reviewer`      | sonnet  | plan        | Read, Grep, Glob, Bash             | IMPLEMENT  |
| `verifier`         | haiku   | plan        | Read, Grep, Glob, Bash             | IMPLEMENT  |

**Model tiering:** haiku for mechanical tasks, sonnet for judgment, opus
for design + structure + planning + implementation.

Agents carry `consumes`/`produces` fields in their frontmatter and in
`skills/team/registry.json`. After the state.json migration these fields
are documentation — they describe the agent inventory and the historical
event vocabulary. The dev hook `.claude/hooks/check-registry-sync.mjs`
still enforces that agent frontmatter matches the registry listing.

## 5. Phase-Table Router

The `team` skill implements a linear phase-table loop:

```
setup:
  1. Parse $ARGUMENTS → topic, today, beadsId.
  2. If ~/.team/<topic>/state.json exists → load it, resume from phase.
     Else initState(topic, beadsId, today) with phase=QUESTION.

loop:
  1. Read state.json. If phase == SHIPPED → cleanup and exit.
  2. Look up the phase in the phase table.
  3. Verify predecessor artifact(s) exist on disk (stat).
  4. Dispatch the agent(s) — parallel if the phase marks them so.
  5. Write each returned artifact to docs/plans/<today>-<topic>-<name>.md.
  6. Run the phase's gate (HUMAN / MECHANICAL / ROUTER-EMIT / AGGREGATE).
  7. writeState with new phase, refreshed lastUpdated, updated counters.
  8. Goto loop.
```

**The router has no agent-specific logic.** It knows only the phase
table, the snapshot schema, and the artifact layout. To add or reorder
agents, edit the phase table in `skills/team/SKILL.md` and (for
documentation) `registry.json`.

## 6. Skills

### Entry Points (slash commands)

| Skill            | Command                    | Description                              |
|------------------|----------------------------|------------------------------------------|
| `team`           | `/team <desc>`             | Full 8-phase QRSPI pipeline              |
| `team-fix`       | `/team-fix <bug>`          | Compressed bug-fix pipeline              |
| `team-question`  | `/team-question <desc>`    | Decompose intent (runs alone)            |
| `team-research`  | `/team-research`           | Blind research (runs Question if missing)|
| `team-design`    | `/team-design`             | Design alignment (human gate)            |
| `team-structure` | `/team-structure`          | Vertical-slice structure (human gate)    |
| `team-plan`      | `/team-plan`               | Tactical plan from approved structure    |
| `team-worktree`  | `/team-worktree`           | Prepare isolated worktree                |
| `team-implement` | `/team-implement`          | Test-first + slice exec + 5-reviewer     |
| `team-pr`        | `/team-pr`                 | Commit + PR                              |
| `team-resume`    | `/team-resume`             | Resume from state.json + docs/plans/     |

Each partial skill gates on artifact presence: it stats
`docs/plans/<today>-<topic>-<predecessor>.md` (or a `.approved` sidecar,
or `state.json.phase`) and either runs the prerequisite phase first or
delegates to the phase dispatcher in `/team`.

### Methodology (loaded by agents, not directly invoked)

| Skill                    | Description                                    | Consumers                                                    |
|--------------------------|------------------------------------------------|--------------------------------------------------------------|
| `qrspi-workflow`         | Phase discipline, artifact conventions, gates  | Loaded by router/orchestrator skills                         |
| `test-first-development` | Acceptance tests as scope fence                | Loaded by test-architect, orchestrator                       |
| `adversarial-review`     | Generator-evaluator separation, review method  | Loaded by code-reviewer, security-reviewer, ux-reviewer, technical-writer |
| `engineering-standards`  | Engineering standards, implementation methodology, quality checklist | Loaded by planner, implementer, code-reviewer |
| `refactoring-to-patterns`| Code smells and safe refactoring procedures    | Loaded by implementer                                        |
| `solid-principles`       | SOLID design principles                        | Loaded by implementer, code-reviewer                         |
| `systematic-debugging`   | Root cause investigation                       | Loaded by agents when debugging                              |
| `documenting-decisions`  | ADR creation and management                    | Loaded by design-author, structure-planner                   |
| `writing-prose`          | Clear documentation and readable explanation   | Loaded by technical-writer                                   |
| `worktree-isolation`     | Worktree setup + cleanup                       | Loaded by router during Worktree phase                       |

### Design Guidelines

1. **Methodology skill load limit:** Soft limit of 3 methodology skills per
   agent invocation. At ~143 lines average per skill, 3 skills add ~430 lines
   (~6K-10K tokens, under 6% of 200K context). A fourth skill signals the
   agent's responsibility may be too broad. This is a design convention, not a
   hard constraint.

2. **Extraction threshold:** Extract methodology to a separate skill file when
   it forms a coherent, independently maintainable body of knowledge --
   regardless of consumer count. Extraction is justified by swappability,
   independent versioning, and file size (inlining would meaningfully grow the
   consuming file). Do not require 2+ consumers as a prerequisite. The
   threshold is about cohesion and maintainability, not reuse count.

## 7. Hooks

| Hook                       | Event                    | Purpose                                                  |
|----------------------------|--------------------------|----------------------------------------------------------|
| `pre-bash-guard.mjs`       | PreToolUse(Bash)         | Block dangerous commands                                 |
| `pre-compact-anchor.mjs`   | PreCompact               | Read state.json; inject 4-line anchor into context       |
| `session-start-recover.mjs`| SessionStart             | Read state.json; emit a recovery notice                  |
| `post-write-validate.mjs`  | PostToolUse(Write\|Edit) | Validate plugin structure                                |

Both runtime state hooks (`pre-compact-anchor.mjs`,
`session-start-recover.mjs`) are stateless: they scan
`~/.team/<topic>/state.json` under the home directory, pick the most
recently modified snapshot, and format a short status line. No event-log
replay, no shared library.

## 8. State Helper

**File:** `lib/state.mjs`

Pure functions for the snapshot substrate. Imported by the router
(conceptually, via SKILL.md pseudocode) and optionally by future tools.

- `PHASE` — frozen enum of phase strings.
- `statePath(topic)` — `~/.team/<topic>/state.json`.
- `readState(topic)` — returns the parsed snapshot or `null`. Never
  throws on ENOENT.
- `writeState(topic, patch)` — shallow merges `patch`, refreshes
  `lastUpdated`, writes atomically (tmp-file + rename).
- `initState(topic, beadsId, today)` — writes a fresh 10-field snapshot
  with `phase: 'QUESTION'`.

The module follows the `hooks/pre-bash-guard.mjs` discipline: only
imports from `node:fs/promises`, `node:path`, `node:os`; no
module-level side effects; pure function exports.

## 9. State Management

**Primary state:** `~/.team/<topic>/state.json` — the single JSON
snapshot updated in place via atomic rename.

**Approval markers:** `.approved` sidecars under `docs/plans/` record
human gate passes durably.

**Compaction defense:** The PreCompact hook reads `state.json` directly
and injects a 4-line anchor (phase, topic, counters, "run
/team-resume"). The SessionStart hook does the same, adding the start
timestamp. Both are within the 5000ms hook budget and require no event
replay.

**Artifact persistence:** File artifacts in `docs/plans/` are committed
to git and survive across sessions, compaction events, and context
resets. They are the durable communication protocol between agents and
the source of truth for "did phase N finish?"
