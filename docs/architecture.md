# TEAM Plugin — Architecture

> **Audience:** Plugin maintainers and contributors. End users only need
> the README + `/team` slash command.
>
> **Source of truth:** the artifacts in `docs/plans/<today>-<topic>-*.md`
> and the in-session TodoWrite ledger.

## 1. Design Philosophy

Agents are **decoupled microservices**. Each agent consumes a predecessor
artifact on disk, does work, and produces its own artifact under
`docs/plans/`. The orchestrator is the main Claude Code session: it walks
a linear phase table, dispatches the right specialist for each phase,
seeds and updates a TodoWrite ledger, and runs the human gates.

**Principles:**

- **Files on disk are the durable record.** Every artifact under
  `docs/plans/` carries YAML frontmatter that describes its phase and,
  for human-gated phases, the approval state. Phase progression is
  inferred by scanning artifacts.
- **TodoWrite is the live coordination ledger.** It is session-scoped.
  `/team-resume` rebuilds the ledger by scanning artifacts.
- **Registry is a phase-tagged inventory.** `skills/team/registry.json`
  lists the 13 specialist agents and the QRSPI phase each serves. The
  orchestrator dispatches via the phase table in `skills/team/SKILL.md`,
  not via the registry.
- **File artifacts survive compaction.** Agents communicate through
  files in `docs/plans/`. These survive context-window compaction, can
  be re-read by any agent in any session, and live in git history.
- **Blind research.** The researcher and file-finder never receive the
  user's original task description. Enforcement is two-layer:
  *structural* — the orchestrator only passes `brief.md` + `questions.md`
  paths to the blind agents; *procedural* — the blind agents' system
  prompts forbid reading `task.md`.
- **Two human touchpoints.** Design approval (~200-line alignment doc)
  and Structure approval (~2-page vertical-slice breakdown). Approval
  is recorded by flipping `approved: true` (and stamping `approved_at`)
  in the gated artifact's own YAML frontmatter — the artifact is
  self-describing. The Plan is not human-gated; humans review the
  structure, which is the real contract.
- **Hooks enforce discipline mechanically.** LLMs forget instructions
  ~20% of the time; hooks are deterministic.

## 2. Artifact Frontmatter

Every artifact under `docs/plans/` opens with YAML frontmatter. Common
fields:

```yaml
---
topic: <kebab-case>
date: 2026-04-30
phase: design        # task | questions | brief | research | design | structure | plan
---
```

Per-phase additions:

| Phase     | Extra frontmatter                                                       |
|-----------|-------------------------------------------------------------------------|
| task      | `beadsId: team-89z` (or `null`)                                         |
| questions | (none)                                                                  |
| brief     | (none)                                                                  |
| research  | (none)                                                                  |
| design    | `approved: false`, `approved_at: null`, `revision: 0`                   |
| structure | `approved: false`, `approved_at: null`, `revision: 0`                   |
| plan      | (none — derived mechanically from the approved structure)               |

**Approval check** (used by downstream phase entry):

```sh
grep -qE '^approved:[[:space:]]*true[[:space:]]*$' <artifact>
```

**Approval flip** (orchestrator at human gate): edit the file in place to
set `approved: true` and stamp `approved_at: <ISO-8601>`.

**Rejection** (revision dispatch): the agent re-drafts the artifact. The
orchestrator increments `revision: <n+1>` in the new draft's frontmatter.
Cap at 5; beyond that, escalate to the user.

**Phase inference** (orchestrator + hooks):

| Latest artifact present                                | Current phase       |
|--------------------------------------------------------|---------------------|
| `task.md` only                                         | RESEARCH (next up)  |
| `research.md`                                          | DESIGN (next up)    |
| `design.md` (frontmatter `approved: false`)            | DESIGN (human gate) |
| `design.md` (frontmatter `approved: true`)             | STRUCTURE (next up) |
| `structure.md` (frontmatter `approved: false`)         | STRUCTURE (gate)    |
| `structure.md` (frontmatter `approved: true`)          | PLAN (next up)      |
| `plan.md`                                              | WORKTREE (next up)  |
| worktree exists for the topic branch                   | IMPLEMENT           |
| topic branch has slice commits + verifier passed       | PR (next up)        |
| PR opened or commit shipped                            | SHIPPED             |

Worktree presence: `git worktree list --porcelain | grep -q <branch>`.

## 3. Pipeline (QRSPI)

The pipeline has eight phases. The orchestrator walks them in order;
each phase requires the prior phase's artifact on disk.

```
QUESTION → RESEARCH → DESIGN → STRUCTURE → PLAN → WORKTREE → IMPLEMENT → PR → SHIPPED
```

### Phase 1: Question

**Agent:** `questioner`
**Predecessor:** (none — description in `$ARGUMENTS`)
**Artifacts:** `docs/plans/YYYY-MM-DD-<topic>-{task,questions,brief}.md`

Decomposes the user's intent into three artifacts. Only the questioner
ever sees the user's description.

### Phase 2: Research

**Agents:** `file-finder` and `researcher` (parallel, blind)
**Predecessor:** `task.md` (orchestrator passes only `questions.md` and
`brief.md` paths to the blind agents)
**Artifact:** `docs/plans/YYYY-MM-DD-<topic>-research.md`

Orchestrator waits for both agents to return, then writes the combined
research artifact (with the required frontmatter).

### Phase 3: Design

**Agent:** `design-author` (MUST ask open questions interactively before
drafting)
**Predecessor:** `research.md`
**Artifact:** `docs/plans/YYYY-MM-DD-<topic>-design.md`
**Gate:** HUMAN — on approval the orchestrator edits `design.md`'s
frontmatter to set `approved: true` and `approved_at: <ISO-8601>`; on
rejection the agent re-drafts and increments `revision`.

### Phase 4: Structure

**Agent:** `structure-planner`
**Predecessor:** `design.md` with frontmatter `approved: true`
**Artifact:** `docs/plans/YYYY-MM-DD-<topic>-structure.md`
**Gate:** HUMAN — same flip-frontmatter mechanics as Design.

### Phase 5: Plan

**Agent:** `planner`
**Predecessor:** `structure.md` with frontmatter `approved: true`
**Artifact:** `docs/plans/YYYY-MM-DD-<topic>-plan.md`

No human gate. The plan is mechanically derived from the approved
structure.

### Phase 6: Worktree

**Action:** orchestrator-emit
**Predecessor:** `plan.md`

The orchestrator creates an isolated git worktree using Claude Code's
native worktree support. Worktree path and branch are discoverable via
`git worktree list --porcelain` — no need to persist them.

### Phase 7: Implement

**Sub-pipeline:**
1. **Test-first** — `test-architect` writes failing acceptance tests.
2. **Mechanical gate** — orchestrator runs the suite; all tests must
   fail with assertion errors, not crashes.
3. **Slice execution** — `implementer` works through the plan one slice
   at a time, committing each atomically.
4. **Adversarial review** — 5 reviewers in parallel: `code-reviewer`,
   `security-reviewer`, `technical-writer`, `ux-reviewer`, `verifier`.
5. **Aggregate gate** — orchestrator evaluates hard gates (security +
   verifier + code-reviewer). On failure, dispatches the implementer
   to fix the typed failure class, then re-runs all 5 reviewers. Cap
   at 5 rounds; beyond that, escalate.

The orchestrator tracks the round count by appending "Review round N"
items to the TodoWrite ledger.

### Phase 8: PR

**Action:** orchestrator-emit
**Predecessor:** aggregate gate passed

Update CHANGELOG.md (filter for user-facing commits since last release),
present shipping options to the user, execute the chosen action, close
the beads issue (if `task.md` carries `beadsId`), clean up the worktree.

## 4. Agent Roster

13 specialist agents, organized by phase:

| Phase     | Agents                                                                            |
|-----------|-----------------------------------------------------------------------------------|
| QUESTION  | `questioner`                                                                      |
| RESEARCH  | `file-finder`, `researcher` (parallel)                                            |
| DESIGN    | `design-author`                                                                   |
| STRUCTURE | `structure-planner`                                                               |
| PLAN      | `planner`                                                                         |
| IMPLEMENT | `test-architect`, `implementer`, `code-reviewer`, `security-reviewer`,            |
|           | `technical-writer`, `ux-reviewer`, `verifier` (last 5 parallel)                   |

Each agent's QRSPI phase is recorded in `skills/team/registry.json`.
Agent frontmatter uses only Claude Code's [supported fields](https://code.claude.com/docs/en/agents#supported-frontmatter-fields).
The dev hook `.claude/hooks/check-registry-sync.mjs` validates that
the inventory in registry.json and the files under `agents/` agree by
name.

Model tiering: `haiku` (mechanical), `sonnet` (judgment), `opus`
(planning + implementation).

## 5. Phase-Table Orchestrator

The orchestrator (the main Claude Code session) drives `/team` by
walking the phase table in `skills/team/SKILL.md`. Pseudocode:

```
setup:
  derive topic + today, create docs/plans/ if needed.
  seed TodoWrite ledger with one item per phase.
  on resume: scan docs/plans/ for the topic, fast-forward the ledger.

loop:
  1. Inspect TodoWrite. If all phases completed → exit.
  2. Identify the in_progress phase. Look up agent(s) and predecessor
     artifact path(s) in the phase table.
  3. Verify predecessors exist on disk and (for human-gated phases)
     carry `approved: true` in frontmatter. If missing → desync;
     suggest /team-resume.
  4. Dispatch the agent(s).
  5. Write returned artifacts to docs/plans/<today>-<topic>-<name>.md
     with the YAML frontmatter the agent specifies.
  6. Run the gate for this phase (HUMAN | MECHANICAL | ORCHESTRATOR-EMIT
     | AGGREGATE).
  7. Mark current TodoWrite item complete and the next one in_progress.
  8. Goto loop.
```

## 6. Skills

Skills live under `skills/`. There are two flavors:

### Entry-point skills (slash commands)

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
| `team-resume`    | `/team-resume`             | Rebuild TodoWrite ledger from artifacts  |

Each partial skill works in two modes:

- **Resume mode** — predecessor artifact (`docs/plans/<today>-<topic>-<predecessor>.md`,
  with `approved: true` in its frontmatter for human-gated artifacts) is
  present. The skill picks up where `/team` left off.
- **Standalone mode** — no predecessor on disk. The skill accepts a
  beads ID or free-form description in `$ARGUMENTS` and bootstraps the
  missing upstream artifacts inline (or, for `/team-implement`,
  synthesizes a `task.md` and dispatches the implement loop directly).
  `/team-implement` also asks the user about creating a worktree when
  invoked outside one.

Standalone mode skips alignment gates the user did not run — the user is
explicitly opting into a faster, less ceremonious path.

### Methodology skills (loaded by agents, not directly invoked)

| Skill                    | Description                                    | Consumers                                                    |
|--------------------------|------------------------------------------------|--------------------------------------------------------------|
| `qrspi-workflow`         | Phase discipline, artifact conventions, gates  | Loaded by orchestrator skills                                |
| `test-first-development` | Acceptance tests as scope fence                | Loaded by test-architect, orchestrator                       |
| `adversarial-review`     | Generator-evaluator separation, review method  | Loaded by code-reviewer, security-reviewer, ux-reviewer, technical-writer |
| `engineering-standards`  | Engineering standards, implementation methodology, quality checklist | Loaded by planner, implementer, code-reviewer |
| `refactoring-to-patterns`| Code smells and safe refactoring procedures    | Loaded by implementer                                        |
| `solid-principles`       | SOLID design principles                        | Loaded by implementer, code-reviewer                         |
| `systematic-debugging`   | Root cause investigation                       | Loaded by agents when debugging                              |
| `documenting-decisions`  | ADR creation and management                    | Loaded by design-author, structure-planner                   |
| `writing-prose`          | Clear documentation and readable explanation   | Loaded by technical-writer                                   |
| `worktree-isolation`     | Worktree setup + cleanup                       | Loaded by orchestrator during Worktree phase                 |

### Design Guidelines

1. **Methodology skill load limit:** Soft limit of 3 methodology skills
   per agent invocation. At ~143 lines average per skill, 3 skills add
   ~430 lines (~6K-10K tokens, under 6% of 200K context). A fourth
   skill signals the agent's responsibility may be too broad. This is a
   design convention, not a hard constraint.

2. **Extraction threshold:** Extract methodology to a separate skill
   file when it forms a coherent, independently maintainable body of
   knowledge — regardless of consumer count. Extraction is justified by
   swappability, independent versioning, and file size (inlining would
   meaningfully grow the consuming file). Do not require 2+ consumers
   as a prerequisite. The threshold is about cohesion and
   maintainability, not reuse count.

## 7. Hooks

Runtime hooks (`hooks/` — distributed with the plugin):

| Hook                       | Event                    | Purpose                                                    |
|----------------------------|--------------------------|------------------------------------------------------------|
| `pre-bash-guard.mjs`       | PreToolUse(Bash)         | Block dangerous shell commands                             |
| `pre-compact-anchor.mjs`   | PreCompact               | Scan docs/plans/ for active topic; inject 4-line anchor    |
| `session-start-recover.mjs`| SessionStart             | Scan docs/plans/ for active topic; emit recovery notice    |
| `post-write-validate.mjs`  | PostToolUse(Write\|Edit) | Structural validation of plugin component files            |

Both `pre-compact-anchor.mjs` and `session-start-recover.mjs` work the
same way: list `docs/plans/*.md`, pick the most recent topic by file
mtime, infer the current phase from artifact presence + frontmatter,
emit a short context message naming the phase, topic, and the
`/team-resume` command. Both are stateless, exit 0 on any error, and
return within the 5000ms hook budget.

Development hook (`.claude/hooks/` — not distributed):

| Hook                     | Event                    | Purpose                                                  |
|--------------------------|--------------------------|----------------------------------------------------------|
| `check-registry-sync.mjs`| PostToolUse(Write\|Edit) | Verify agents/*.md `phase` field matches registry.json   |

## 8. State Management

**Primary state:** the artifacts in `docs/plans/<today>-<topic>-*.md`.
Each artifact's YAML frontmatter is the source of truth for "did this
phase finish?" and "was the human gate passed?"

**Live coordination:** TodoWrite (session-scoped). The orchestrator
seeds the ledger at the start of `/team`, marks each item `in_progress`
when dispatching, and `completed` when the artifact lands. On
`/team-resume`, the ledger is rebuilt by scanning artifacts.

**Approval markers:** the gated artifact's own YAML frontmatter
(`approved: true`, `approved_at: <ISO-8601>`) records human gate passes
durably. The artifact is self-describing.

**Compaction defense:** the PreCompact hook scans `docs/plans/` for the
active topic and injects a 4-line anchor (phase, topic, date, "run
/team-resume"). The SessionStart hook does the same for new sessions.

**Artifact persistence:** files in `docs/plans/` are committed to git
and survive across sessions, compaction events, and context resets.
They are the durable communication protocol between agents and the
source of truth for "did phase N finish?"
