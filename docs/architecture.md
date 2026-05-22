---
title: Architecture
description: "Team plugin architecture — agents as microservices, the QRSPI pipeline, artifact frontmatter, and phase-inference rules."
---

# Team Plugin — Architecture
{:.no_toc}

> **Audience:** Plugin maintainers and contributors. End users only need
> the README + `/team` slash command.
>
> **Source of truth:** the artifacts in `docs/plans/<id>/*.md` and the
> in-session TodoWrite ledger.

## Contents
{:.no_toc}

* TOC
{:toc}

## 1. Design Philosophy

Agents are **decoupled microservices**. Each agent consumes a predecessor
artifact on disk, does work, and produces its own artifact under
`docs/plans/<id>/`. The orchestrator is the main Claude Code session: it
walks a linear phase table, dispatches the right specialist for each phase,
seeds and updates a TodoWrite ledger, and runs the human gates.

**Principles:**

- **Files on disk are the durable record.** Every artifact under
  `docs/plans/<id>/` carries YAML frontmatter that describes its phase
  and, for human-gated phases, the approval state. Phase progression is
  inferred by scanning artifacts.
- **TodoWrite is the live coordination ledger.** It is session-scoped.
  Re-invoking any `/team-*` command rebuilds the ledger by scanning
  artifacts on entry.
- **Registry is a phase-tagged inventory.** `skills/team/registry.json`
  lists the 15 specialist agents and the QRSPI phase each serves. The
  orchestrator dispatches via the phase table in `skills/team/SKILL.md`,
  not via the registry.
- **File artifacts survive compaction.** Agents communicate through
  files in `docs/plans/<id>/`. These survive context-window compaction,
  can be re-read by any agent in any session, and live in git history.
- **Blind research.** The researcher and file-finder never receive the
  user's original task description. Enforcement is two-layer:
  *structural* — the orchestrator only passes the `questions.md` path to
  the blind agents; *procedural* — the blind agents' system prompts
  forbid reading `task.md`.
- **Two human touchpoints.** Design approval (~200-line alignment doc)
  and Structure approval (~2-page vertical-slice breakdown). Approval
  is recorded by flipping `approved: true` (and stamping `approved_at`)
  in the gated artifact's own YAML frontmatter — the artifact is
  self-describing. The Plan is not human-gated; humans review the
  structure, which is the real contract.
- **Hooks enforce discipline mechanically.** LLMs forget instructions
  ~20% of the time; hooks are deterministic.

## 2. Artifact Layout & Frontmatter

All phase artifacts live in `docs/plans/<id>/`, where `<id>` is one of:

- **Ticket-prefixed**: `<TICKET>-<kebab-topic>` (e.g.,
  `ENG-1234-add-rate-limiting`)
- **Date-prefixed**: `<YYYY-MM-DD>-<kebab-topic>` (e.g.,
  `2026-05-01-add-rate-limiting`)

Every artifact opens with YAML frontmatter. Common fields:

```yaml
---
topic: <kebab-case>
date: 2026-04-30
phase: design        # task | questions | research | design | structure | plan
---
```

Per-phase additions:

| Phase     | Extra frontmatter                                                       |
|-----------|-------------------------------------------------------------------------|
| task      | `ticketId: <id>` (or `null`)                                            |
| questions | (none)                                                                  |
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
| `task.md` + `questions.md` only                        | RESEARCH (next up)  |
| `research.md`                                          | DESIGN (next up)    |
| `design.md` (frontmatter `approved: false`)            | DESIGN (human gate) |
| `design.md` (frontmatter `approved: true`)             | STRUCTURE (next up) |
| `structure.md` (frontmatter `approved: false`)         | STRUCTURE (gate)    |
| `structure.md` (frontmatter `approved: true`)          | PLAN (next up)      |
| `plan.md`                                              | WORKTREE (next up)  |
| worktree exists for the `<id>` branch                  | IMPLEMENT           |
| topic branch has slice commits + verifier passed       | PR (next up)        |
| PR opened or commit shipped                            | SHIPPED             |

Worktree presence: `git worktree list --porcelain | grep -q <id>`.

## 3. Pipeline (QRSPI)

The pipeline has eight phases. The orchestrator walks them in order;
each phase requires the prior phase's artifact on disk.

```
QUESTION → RESEARCH → DESIGN → STRUCTURE → PLAN → WORKTREE → IMPLEMENT → PR → SHIPPED
```

### Phase 1: Question

**Agent:** `questioner`
**Predecessor:** (none — description in `$ARGUMENTS`)
**Artifacts:** `docs/plans/<id>/{task,questions}.md`

Decomposes the user's intent into two artifacts. Only the questioner
ever sees the user's description. There is no separate `brief.md`;
neutral codebase context lives in a "Codebase context" section at the top
of `questions.md`.

### Phase 2: Research

**Agents:** `file-finder` and `researcher` (parallel, blind)
**Predecessor:** `questions.md` (orchestrator passes only the
`questions.md` path to the blind agents)
**Artifact:** `docs/plans/<id>/research.md`

Orchestrator waits for both agents to return, then writes the combined
research artifact (with the required frontmatter).

### Phase 3: Design

**Agent:** `design-author` (MUST ask open questions interactively before
drafting)
**Predecessor:** `research.md`
**Artifact:** `docs/plans/<id>/design.md`
**Gate:** HUMAN — on approval the orchestrator edits `design.md`'s
frontmatter to set `approved: true` and `approved_at: <ISO-8601>`; on
rejection the agent re-drafts and increments `revision`.

### Phase 4: Structure

**Agent:** `structure-planner`
**Predecessor:** `design.md` with frontmatter `approved: true`
**Artifact:** `docs/plans/<id>/structure.md`
**Gate:** HUMAN — same flip-frontmatter mechanics as Design.

### Phase 5: Plan

**Agent:** `planner`
**Predecessor:** `structure.md` with frontmatter `approved: true`
**Artifact:** `docs/plans/<id>/plan.md`

No human gate. The plan is mechanically derived from the approved
structure.

### Phase 6: Worktree

**Action:** orchestrator-emit
**Predecessor:** `plan.md` (and optionally `repos.md`)

The orchestrator creates an isolated git worktree per involved repo. The
branch name is `<id>` in every repo. Worktree paths and branches are
discoverable via `git -C <repo-path> worktree list --porcelain` per repo
— for multi-repo topics the orchestrator also writes a `## Worktrees`
section to `repos.md` so any later `/team-*` invocation can rediscover
all paths from one file.

**Single-repo (default):** `repos.md` is absent. The orchestrator uses
Claude Code's native worktree support to create one worktree at
`<repo>/.claude/worktrees/<id>` and copies `docs/plans/<id>/` into it
(untracked files don't propagate automatically).

**Multi-repo:** `repos.md` is present. The orchestrator iterates over
the listed repos, creating one worktree per repo with:

```sh
git -C <repo-path> worktree add .claude/worktrees/<id> -b <id> origin/HEAD
```

Only the home repo's worktree carries `docs/plans/<id>/`; other repos'
worktrees do not duplicate the artifacts. See
`skills/worktree-isolation/SKILL.md` for full topology.

### Phase 7: Implement

**Sub-pipeline (per-slice R-G-R trio, repeated for every slice in the
`structure.md` order):**

1. **Red — Test-architect (per slice)** — `red-author` is dispatched
   once per slice and writes only that slice's failing acceptance tests,
   then commits as `test: <slice>`.
2. **Mechanical red gate** — the orchestrator runs the suite. The current
   slice's tests must fail with assertion errors (not crashes), and any
   prior slices' tests must still pass. On the first slice the prior-
   slices set is empty, so the gate only checks the current slice's
   tests fail cleanly.
3. **Green — Greener (per slice)** — `green-author` is dispatched once per
   slice and writes the minimum code that turns the slice's failing
   tests green, then commits as `feat: <slice>`.
4. **Mechanical green gate** — the orchestrator re-runs the suite. The
   slice advances only if the current slice's acceptance tests pass
   **and** all prior slices' tests still pass. On failure, the
   orchestrator re-dispatches `green-author` with the typed `green failed`
   class and the failing-test names. The gate is capped at **3
   attempts** per slice (`maxRetries: 3`); at the cap, the orchestrator
   escalates. The prior-slices regression check is what catches a slice
   N green attempt that breaks slice N-1.
5. **Refactor — Refactorer (per slice, optional commit)** — `refactor-author`
   is dispatched once per slice, loads
   `skills/refactoring-to-patterns/SKILL.md`, performs the smallest
   structural change at a time, re-runs the full test suite after each
   change, and commits as `refactor: <slice>` only if the suite is still
   green. **The commit is optional**: when there is no refactoring
   opportunity, or when the refactor cannot leave the suite green, the
   agent reverts its changes and reports `no-op`. A no-op produces no
   commit. The refactor-author self-verifies; there is no separate mechanical
   gate after it (a regression that slipped past would be caught by the
   next slice's red gate or the final aggregate reviewer gate).

After every slice has completed its trio:

6. **Code review** — 5 reviewers in parallel: `code-reviewer`,
   `security-reviewer`, `technical-writer`, `ux-reviewer`, `verifier`.
7. **Aggregate gate** — orchestrator evaluates hard gates (security +
   verifier + code-reviewer). On failure, the orchestrator dispatches
   the `implementer` agent with the typed failure class (security,
   lint, typecheck, build, test, review) to fix the findings, then
   re-runs all 5 reviewers for a fresh review. Cap at 5 rounds; beyond
   that, escalate. **`implementer` is reserved for this review-fix loop
   on aggregate-gate failure** — it is no longer the per-slice green
   agent (that role belongs to `green-author`).

The orchestrator tracks the round count by appending "Review round N"
items to the TodoWrite ledger.

### Phase 8: PR

**Action:** orchestrator-emit
**Predecessor:** aggregate gate passed

Update CHANGELOG.md (filter for user-facing commits since last release),
present shipping options to the user, execute the chosen action, surface
the tracking ticket (if `task.md` carries `ticketId`), clean up the worktree.

## 4. Agent Roster

15 specialist agents, organized by phase:

| Phase     | Agents                                                                            |
|-----------|-----------------------------------------------------------------------------------|
| QUESTION  | `questioner`                                                                      |
| RESEARCH  | `file-finder`, `researcher` (parallel)                                            |
| DESIGN    | `design-author`                                                                   |
| STRUCTURE | `structure-planner`                                                               |
| PLAN      | `planner`                                                                         |
| IMPLEMENT | `red-author` (per slice), `green-author` (per slice), `refactor-author` (per slice),    |
|           | `implementer` (review-fix only), `code-reviewer`, `security-reviewer`,            |
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
  resolve $ARGUMENTS (issue URL → gh issue view; ticket → use as prefix).
  derive <id> = "<TICKET>-<topic>" or "<YYYY-MM-DD>-<topic>".
  create docs/plans/<id>/ if needed.
  seed TodoWrite ledger with one item per phase.
  on resume: scan docs/plans/<id>/, fast-forward the ledger.

loop:
  1. Inspect TodoWrite. If all phases completed → exit.
  2. Identify the in_progress phase. Look up agent(s) and predecessor
     artifact path(s) in the phase table.
  3. Verify predecessors exist on disk and (for human-gated phases)
     carry `approved: true` in frontmatter. If missing → desync;
     suggest re-invoking the same /team-* command with docs/plans/<id>/.
  4. Dispatch the agent(s) — pass them the artifact directory
     `docs/plans/<id>/`.
  5. Write returned artifacts to docs/plans/<id>/<name>.md with the
     YAML frontmatter the agent specifies.
  6. Run the gate for this phase (HUMAN | MECHANICAL | ORCHESTRATOR-EMIT
     | AGGREGATE).
  7. Mark current TodoWrite item complete and the next one in_progress.
  8. Goto loop.
```

## 6. Skills

Skills live under `skills/`. There are two flavors:

### Entry-point skills (slash commands)

| Skill            | Command                            | Description                              |
|------------------|------------------------------------|------------------------------------------|
| `team`           | `/team <desc>`                     | Full 8-phase QRSPI pipeline              |
| `team-fix`       | `/team-fix <bug>`                  | Compressed bug-fix pipeline              |
| `team-question`  | `/team-question <desc>`            | Decompose intent (runs alone)            |
| `team-research`  | `/team-research docs/plans/<id>/`  | Blind research                           |
| `team-design`    | `/team-design docs/plans/<id>/`    | Design alignment (human gate)            |
| `team-structure` | `/team-structure docs/plans/<id>/` | Vertical-slice structure (human gate)    |
| `team-plan`      | `/team-plan docs/plans/<id>/`      | Tactical plan from approved structure    |
| `team-worktree`  | `/team-worktree docs/plans/<id>/`  | Prepare isolated worktree                |
| `team-implement` | `/team-implement docs/plans/<id>/` | Test-first + slice exec + 5-reviewer     |
| `team-pr`        | `/team-pr docs/plans/<id>/`        | Commit + PR                              |

Every entry-point skill carries an `argument-hint` field in its
frontmatter (Claude Code [skills frontmatter](https://code.claude.com/docs/en/skills#frontmatter-reference))
that documents the expected `$ARGUMENTS` shape.

Each downstream skill (`team-research` and beyond) treats `$ARGUMENTS` as
an artifact directory — typically the path printed by the previous
phase's completion message. Standalone modes still exist: a partial
skill invoked without an artifact directory (or with a free-form
description) bootstraps the missing upstream artifacts inline.

### Methodology skills (loaded by agents, not directly invoked)

| Skill                    | Description                                    | Consumers                                                    |
|--------------------------|------------------------------------------------|--------------------------------------------------------------|
| `qrspi-workflow`         | Phase discipline, artifact conventions, gates  | Loaded by orchestrator skills                                |
| `test-first-development` | Acceptance tests as scope fence                | Loaded by red-author, orchestrator                       |
| `code-review`            | Generator-evaluator separation, review method  | Loaded by code-reviewer, security-reviewer, ux-reviewer, technical-writer |
| `engineering-standards`  | Engineering standards, implementation methodology, quality checklist | Loaded by planner, implementer, code-reviewer |
| `refactoring-to-patterns`| Code smells and safe refactoring procedures    | Loaded by refactor-author                                         |
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
| `pre-compact-anchor.mjs`   | PreCompact               | Scan docs/plans/<id>/ for active topic; inject 4-line anchor |
| `session-start-recover.mjs`| SessionStart             | Scan docs/plans/<id>/ for active topic; emit recovery notice |
| `post-write-validate.mjs`  | PostToolUse(Write\|Edit) | Structural validation of plugin component files            |

Both `pre-compact-anchor.mjs` and `session-start-recover.mjs` work the
same way: list `docs/plans/*/` directories, pick the most recent
artifact directory by mtime of any contained artifact, infer the
current phase from artifact presence + frontmatter, and emit a short
context message naming the phase, `<id>`, and the suggested next
`/team-*` command. Both are stateless, exit 0 on any error, and return
within the 5000ms hook budget.

Development hook (`.claude/hooks/` — not distributed):

| Hook                     | Event                    | Purpose                                                              |
|--------------------------|--------------------------|----------------------------------------------------------------------|
| `check-registry-sync.mjs`| PostToolUse(Write\|Edit) | Verify the agents/ directory and registry.json agree by agent name   |

## 8. State Management

**Primary state:** the artifacts in `docs/plans/<id>/*.md`. Each
artifact's YAML frontmatter is the source of truth for "did this phase
finish?" and "was the human gate passed?"

**Live coordination:** TodoWrite (session-scoped). The orchestrator
seeds the ledger at the start of `/team`, marks each item `in_progress`
when dispatching, and `completed` when the artifact lands. Any `/team-*`
command rebuilds the ledger by scanning artifacts on entry, so an
interrupted run can be resumed by re-invoking any of them with
`docs/plans/<id>/`.

**Approval markers:** the gated artifact's own YAML frontmatter
(`approved: true`, `approved_at: <ISO-8601>`) records human gate passes
durably. The artifact is self-describing.

**Compaction defense:** the PreCompact hook scans `docs/plans/<id>/`
directories for the active topic and injects a 4-line anchor (phase,
`<id>`, suggested next `/team-*` command). The SessionStart hook does
the same for new sessions.

**Artifact persistence:** files in `docs/plans/<id>/` are committed to
git and survive across sessions, compaction events, and context resets.
They are the durable communication protocol between agents and the
source of truth for "did phase N finish?"
