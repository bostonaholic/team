---
name: qrspi-workflow
description: Question-Research-Design-Structure-Plan-Worktree-Implement-PR phase discipline with gate enforcement — loaded by orchestrator to govern pipeline phase transitions, artifact conventions, and anti-patterns
---

# QRSPI Workflow

Phase discipline for the Team pipeline. Every feature flows through eight
sequential phases. No phase may be skipped. Each phase produces artifacts
that downstream phases consume.

## Phase Sequence

```
QUESTION -> RESEARCH -> DESIGN -> STRUCTURE -> PLAN -> WORKTREE -> IMPLEMENT -> PR
```

### QUESTION

Decompose the user's intent into neutral research questions. Capture the
full task for the human; phrase questions so a stranger can answer them
without knowing the goal.

- **Artifacts:**
  - `docs/plans/<id>/task.md` — full description (human-only)
  - `docs/plans/<id>/questions.md` — neutral research questions, plus a
    "Codebase context" section that names files/modules/vocabulary but
    NOT the goal
- **Gate:** HARD — both artifacts must exist on disk before proceeding

### RESEARCH

Explore the codebase to answer the questions. The researcher reads only
`questions.md` — never `task.md` or the user's intent.

- **Artifact:** `docs/plans/<id>/research.md`
- **Gate:** HARD — artifact must exist on disk before proceeding

### DESIGN

Align on approach with the user. The design author MUST present open
questions to the user before writing the design document. The result is
a ~200-line markdown artifact the human reviews carefully.

- **Artifact:** `docs/plans/<id>/design.md`
- **Gate:** HARD — user must explicitly approve the design

### STRUCTURE

Break the approved design into vertical slices with verification checkpoints.
Each slice is end-to-end and independently testable. The result is a ~2-page
markdown artifact the human reviews.

- **Artifact:** `docs/plans/<id>/structure.md`
- **Gate:** HARD — user must explicitly approve the structure

### PLAN

Tactical implementation details for the agent. Read by the implementer.
No human approval gate — the plan is mechanically derived from the
approved structure.

- **Artifact:** `docs/plans/<id>/plan.md`
- **Gate:** SOFT — no human approval; the structure is the contract

### WORKTREE

Router prepares an isolated git worktree for implementation work. No agent;
purely a router responsibility.

For the rationale behind the phase-6 placement, see the "Why late"
subsection in `skills/worktree-isolation/SKILL.md`.

- **Artifact:** git worktree under Claude Code's native worktree directory
- **Gate:** HARD — worktree must exist before tests are written

### IMPLEMENT

Execute the plan slice by slice, making tests pass. Includes test-first
sub-phase and 5-reviewer adversarial verification with hard-gate retry loop.

- **Sub-phases:**
  1. Test-first — `test-architect` writes failing acceptance tests
  2. Mechanical gate — all tests fail with assertion errors (not crashes)
  3. Slice execution — `implementer` works through vertical slices, commits
     each slice when its tests pass
  4. Code review — 5 parallel reviewers (code, security, docs, ux,
     verifier) with typed failure classes that loop back to the
     implementer (max 5 rounds)
- **Artifact:** Production code, passing tests, per-slice commits
- **Gate:** AGGREGATE — security, verifier, and code-review hard gates must
  all pass

### PR

Open the pull request as a draft (no human gate — the orchestrator does
not stop to ask), update the changelog, surface the tracking ticket.

- **Artifact:** GitHub draft PR
- **Gate:** Terminal — orchestrator records the PR URL or final commit, then closes the topic's TodoWrite ledger.

## Artifact Conventions

All phase artifacts live under `docs/plans/<id>/`, where `<id>` is one of:

- **Ticket-prefixed**: `<TICKET>-<kebab-topic>` (e.g.,
  `ENG-1234-add-rate-limiting`)
- **Date-prefixed**: `<YYYY-MM-DD>-<kebab-topic>` (e.g.,
  `2026-05-01-add-rate-limiting`)

| Artifact  | Path                              | Created By              | Required? |
|-----------|-----------------------------------|-------------------------|-----------|
| Task      | `docs/plans/<id>/task.md`         | questioner agent        | yes       |
| Questions | `docs/plans/<id>/questions.md`    | questioner agent        | yes       |
| Repos     | `docs/plans/<id>/repos.md`        | questioner / design-author | when topic spans repos |
| Research  | `docs/plans/<id>/research.md`     | researcher agent        | yes       |
| Design    | `docs/plans/<id>/design.md`       | design-author agent     | yes       |
| Structure | `docs/plans/<id>/structure.md`    | structure-planner agent | yes       |
| Plan      | `docs/plans/<id>/plan.md`         | planner agent           | yes       |

The `<id>` slug should match across every artifact for the same feature.

### Repos artifact (`repos.md`)

When a topic touches **more than one repository**, the questioner or
design-author writes `docs/plans/<id>/repos.md` to enumerate the repos
involved. The presence of this file switches the WORKTREE phase into
multi-repo mode (one worktree per listed repo, see
`skills/worktree-isolation/SKILL.md`). Its absence keeps the pipeline in
single-repo mode — today's default.

`repos.md` schema:

```yaml
---
topic: <kebab-case-topic>
date: <YYYY-MM-DD>
phase: repos
---

# Repos: <topic>

## Home repo
- **name:** <short-slug>
- **path:** <absolute-path>
- **role:** One sentence describing what kind of work happens here.

## Additional repos
- **name:** <short-slug>
  **path:** <absolute-path>
  **role:** One sentence describing what kind of work happens here.
- **name:** <short-slug>
  **path:** <absolute-path>
  **role:** ...

## Worktrees
<written by the orchestrator after WORKTREE phase succeeds>
- home: <home-worktree-path>
- <repo-name>: <repo-path>/.claude/worktrees/<id>
- ...
```

Rules:

- **Names are short slugs** (e.g. `frontend`, `api`, `shared-types`) used
  in slice and plan annotations like `[repo: api]`. Names must be unique
  across `repos.md`.
- **Paths are absolute.** Each must be a git working tree.
- **The home repo is the one the user invoked `/team` from.** Its
  `docs/plans/<id>/` directory is the canonical artifact location;
  other repos' worktrees do not carry duplicate artifacts.
- **The `## Worktrees` section is written by the orchestrator** during
  the WORKTREE phase, not by the questioner or design-author. Until that
  phase runs, `repos.md` lists only the repos to be involved.

### Topic consistency invariant

Every artifact's `topic` frontmatter field MUST be identical across all
artifacts in the same `docs/plans/<id>/` directory. The `topic` value
is the kebab portion of `<id>` — i.e. `<id>` minus the `<TICKET>-` or
`<YYYY-MM-DD>-` prefix:

| `<id>`                                  | `topic`                       |
|-----------------------------------------|-------------------------------|
| `ENG-9876-cache-invalidation`           | `cache-invalidation`          |
| `2026-05-01-add-rate-limiting`          | `add-rate-limiting`           |

Never use the ticket id, the date, or a re-worded description as the
topic. Downstream agents copy the topic verbatim from upstream
artifacts; the questioner is the one place where it is chosen.

### ticketId scope

`ticketId` lives **only on `task.md`**. It does not appear on
`questions.md`, `research.md`, `design.md`, `structure.md`, or
`plan.md`. The rationale: the directory name `<id>` already encodes
the ticket prefix, and `task.md` is the canonical intent record. Re-
encoding `ticketId` on every artifact would be duplication that can
drift out of sync with the directory name.

## Research Isolation

Research is the most-corruptible phase: an LLM that knows what it is being
asked to build will return opinions instead of facts. QRSPI enforces the
invariant in two layers — structural at the dispatch boundary, procedural
at the agent boundary:

1. **Structural** — when the orchestrator dispatches `researcher` or
   `file-finder`, it passes only the path to `questions.md`. The
   orchestrator is forbidden from handing the description (or `task.md`)
   to the research agents at dispatch time.
2. **Procedural** — the `researcher` and `file-finder` agent system prompts
   forbid reading `task.md`. Both have `Read`/`Grep`/`Glob` tools with
   `permissionMode: plan`, so nothing mechanically stops a `Read` of
   `task.md`; enforcement relies on the agent following its prompt.
3. **Procedural** — if a researcher needs context the questions lack, it must
   surface that as an open question rather than guessing the intent.
   The canonical mechanism for surfacing open questions interactively
   from any subagent is `skills/agent-open-questions/SKILL.md` — emit
   the envelope, let the orchestrator render and resume.

A PreToolUse(Read) hook that blocks `*/task.md` reads from the research
agents would convert step 2 from procedural to structural. Treat this as
a follow-up if procedural enforcement proves insufficient in practice.

## Vertical Slices

The Structure phase breaks work into vertical slices: end-to-end deliverables
that exercise every layer of the stack for one piece of functionality, not
horizontal layers (all migrations, then all APIs, then all UI). Each slice:

- Has its own acceptance tests
- Can be implemented and verified independently
- Is committed atomically when complete

This enforces incremental verifiability over big-bang integration.

## Gate Types

### HARD

Blocks phase transition. The pipeline cannot proceed until the gate condition
is satisfied. No override allowed except by explicit user command.

Examples: design approval, structure approval, security review with critical
findings, test failures.

### SOFT

Informational gate. The pipeline presents findings to the user and may proceed
at the user's judgment. The user is expected to read and acknowledge.

Examples: code review suggestions, UX review feedback.

### ADVISORY

Non-blocking. Findings are recorded but do not require acknowledgment. The
pipeline proceeds automatically.

Examples: documentation gap analysis, style suggestions.

## State and Coordination

Pipeline state is reconstructed by scanning artifacts in
`docs/plans/<id>/*.md` and reading their YAML frontmatter. The orchestrator
(the main Claude Code session) tracks in-flight work via TodoWrite — a
session-scoped ledger that mirrors the phase table.

### Frontmatter schema (all artifacts)

Every artifact opens with YAML frontmatter. Common fields:

```yaml
---
topic: <kebab-case>
date: 2026-04-30
phase: design        # task | questions | research | design | structure | plan
---
```

Per-phase additions:

| Phase     | Extra frontmatter                                                                  |
|-----------|------------------------------------------------------------------------------------|
| task      | `ticketId: <id>` (or `null`)                                                       |
| questions | (none)                                                                             |
| research  | (none)                                                                             |
| design    | `approved: false`, `approved_at: null`, `revision: 0`                              |
| structure | `approved: false`, `approved_at: null`, `revision: 0`                              |
| plan      | (none — derived mechanically from the approved structure)                          |

**Approval check** (used by downstream phase entry):

```sh
grep -qE '^approved:[[:space:]]*true[[:space:]]*$' <artifact>
```

**Approval flip** (orchestrator at human gate): edit the file in place
to set `approved: true` and stamp `approved_at: <ISO-8601>`.

**Rejection**: the agent re-drafts the artifact. The orchestrator
increments `revision: <n+1>` in the new draft's frontmatter. Cap at 5;
beyond that, escalate to the user for direction.

### Phase inference from artifacts

The orchestrator infers the current phase by scanning what exists in
`docs/plans/<id>/`:

| Latest artifact present                                | Current phase       |
|--------------------------------------------------------|---------------------|
| `task.md` + `questions.md`                             | RESEARCH (next up)  |
| `research.md`                                          | DESIGN (next up)    |
| `design.md` (frontmatter `approved: false`)            | DESIGN (human gate) |
| `design.md` (frontmatter `approved: true`)             | STRUCTURE (next up) |
| `structure.md` (frontmatter `approved: false`)         | STRUCTURE (gate)    |
| `structure.md` (frontmatter `approved: true`)          | PLAN (next up)      |
| `plan.md`                                              | WORKTREE (next up)  |
| worktree exists for `<id>` branch in every involved repo | IMPLEMENT         |
| topic branch has commits ahead and verifier passed     | PR (next up)        |
| PR(s) opened or commit(s) shipped                      | SHIPPED             |

Worktree presence (single-repo): `git worktree list --porcelain | grep -q <id>`.
Worktree presence (multi-repo): for each repo path in
`docs/plans/<id>/repos.md`, `git -C <repo-path> worktree list --porcelain
| grep -q <id>`.
Verifier passed: latest review artifact in `docs/plans/<id>/review-<n>.md`
shows aggregate gate clean.

### Orchestrator coordination via TodoWrite

When the orchestrator (the main Claude Code session) drives a `/team` or
`/team-*` skill, it MUST seed a TodoWrite ledger that mirrors the phase
table for the topic, then mark each item `in_progress` as it dispatches
the matching agent and `completed` when the artifact lands. TodoWrite is
session-scoped — re-invoking any `/team-*` command rebuilds the todos
by scanning artifacts on entry.

### Phase Transition Protocol

Every transition follows this sequence:

1. **Verify artifacts** — confirm the required artifacts from the
   current phase exist on disk, and for human-gated phases that the
   artifact's frontmatter shows `approved: true`.
2. **Update the ledger** — mark the current TodoWrite item complete and
   the next one `in_progress`.
3. **Dispatch next agent(s)** — the phase table in `skills/team/SKILL.md`
   names the agent(s) to dispatch for the new phase.

Never proceed to the next phase while a Blocking or Major finding remains —
the implementer loops automatically and the user is never consulted about it
(the consult guard; see `skills/code-review/SKILL.md`). Minor-and-below
findings are presented to the user only once Blocking and Major are clean.

## Anti-Patterns

### Skipping Question

Jumping straight to research without decomposing the task means the
researcher inherits the user's framing and produces opinionated findings.
Always run the questioner first.

### Letting Research See Intent

If the researcher reads `task.md` or receives the user's description in any
form, the research-isolation invariant is broken. Treat any leakage as a
critical defect.

### Reviewing the Plan

The plan is a tactical artifact for the agent. Reviewing it duplicates
effort: a 1000-line plan begets ~1000 lines of code, and surprises during
implementation invalidate the review. Review the design (~200 lines) and
the structure (~2 pages) instead — those are where leverage lives.

### Horizontal Layering

Plans that build the entire database, then the entire API, then the entire
UI defer integration risk to the very end. The structure phase exists to
force vertical slicing — reject any structure that flattens into layers.

### Implementing Without Structure Approval

The structure is the human contract. Bypassing its gate removes the user's
ability to course-correct before code is written. Wait for explicit approval.

### Gold-Plating

Adding features, tests, or abstractions beyond what the structure specifies.
The structure defines the scope fence. If scope needs to expand, update the
structure and get re-approval — do not silently add work.

### Backward Skipping

Jumping backward more than one phase. If implementation reveals a structure
flaw, return to STRUCTURE. If the structure reveals a design flaw, return to
DESIGN. Never skip backward multiple phases at once.

### Premature Shipping

Attempting to ship before the aggregate verify gate passes clean. Every HARD
gate in the implement-verify loop must pass. Skipping verification risks
shipping broken or insecure code.
