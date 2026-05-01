---
name: qrspi-workflow
description: Question-Research-Design-Structure-Plan-Worktree-Implement-PR phase discipline with gate enforcement — loaded by orchestrator to govern pipeline phase transitions, artifact conventions, and anti-patterns
---

# QRSPI Workflow

Phase discipline for the TEAM pipeline. Every feature flows through eight
sequential phases. No phase may be skipped. Each phase produces artifacts
that downstream phases consume.

## Phase Sequence

```
QUESTION -> RESEARCH -> DESIGN -> STRUCTURE -> PLAN -> WORKTREE -> IMPLEMENT -> PR
```

### QUESTION

Decompose the user's intent into neutral research questions. Capture the
full task for the human, write a sanitized brief that downstream phases use.

- **Artifacts:**
  - `docs/plans/YYYY-MM-DD-<topic>-task.md` — full description (human-only)
  - `docs/plans/YYYY-MM-DD-<topic>-questions.md` — neutral research questions
  - `docs/plans/YYYY-MM-DD-<topic>-brief.md` — sanitized brief (no intent, no opinions)
- **Gate:** HARD — all three artifacts must exist on disk before proceeding

### RESEARCH

Explore the codebase to answer the questions. Researcher is **BLIND** to
intent: it never reads `task.md`, only `questions.md` + `brief.md`.

- **Artifact:** `docs/plans/YYYY-MM-DD-<topic>-research.md`
- **Gate:** HARD — artifact must exist on disk before proceeding

### DESIGN

Align on approach with the user. The design author MUST present open
questions to the user before writing the design document. The result is
a ~200-line markdown artifact the human reviews carefully.

- **Artifact:** `docs/plans/YYYY-MM-DD-<topic>-design.md`
- **Gate:** HARD — user must explicitly approve the design

### STRUCTURE

Break the approved design into vertical slices with verification checkpoints.
Each slice is end-to-end and independently testable. The result is a ~2-page
markdown artifact the human reviews.

- **Artifact:** `docs/plans/YYYY-MM-DD-<topic>-structure.md`
- **Gate:** HARD — user must explicitly approve the structure

### PLAN

Tactical implementation details for the agent. Read by the implementer.
No human approval gate — the plan is mechanically derived from the
approved structure.

- **Artifact:** `docs/plans/YYYY-MM-DD-<topic>-plan.md`
- **Gate:** SOFT — no human approval; the structure is the contract

### WORKTREE

Router prepares an isolated git worktree for implementation work. No agent;
purely a router responsibility.

- **Artifact:** git worktree under `.claude/worktrees/<topic>/`
- **Gate:** HARD — worktree must exist before tests are written

### IMPLEMENT

Execute the plan slice by slice, making tests pass. Includes test-first
sub-phase and 5-reviewer adversarial verification with hard-gate retry loop.

- **Sub-phases:**
  1. Test-first — `test-architect` writes failing acceptance tests
  2. Mechanical gate — all tests fail with assertion errors (not crashes)
  3. Slice execution — `implementer` works through vertical slices, commits
     each slice when its tests pass
  4. Adversarial review — 5 parallel reviewers (code, security, docs, ux,
     verifier) with typed failure classes that loop back to the
     implementer (max 5 rounds)
- **Artifact:** Production code, passing tests, per-slice commits
- **Gate:** AGGREGATE — security, verifier, and code-review hard gates must
  all pass

### PR

Open the pull request, update the changelog, close any tracking tracking ticket.

- **Artifact:** GitHub PR (or local commit per user choice)
- **Gate:** Terminal — orchestrator records the PR URL or final commit, then closes the topic's TodoWrite ledger.

## Artifact Conventions

All phase artifacts live in `docs/plans/`:

| Artifact  | Pattern                                       | Created By         |
|-----------|-----------------------------------------------|--------------------|
| Task      | `YYYY-MM-DD-<topic>-task.md`                  | questioner agent   |
| Questions | `YYYY-MM-DD-<topic>-questions.md`             | questioner agent   |
| Brief     | `YYYY-MM-DD-<topic>-brief.md`                 | questioner agent   |
| Research  | `YYYY-MM-DD-<topic>-research.md`              | researcher agent   |
| Design    | `YYYY-MM-DD-<topic>-design.md`                | design-author agent|
| Structure | `YYYY-MM-DD-<topic>-structure.md`             | structure-planner agent |
| Plan      | `YYYY-MM-DD-<topic>-plan.md`                  | planner agent      |

Use today's date. The `<topic>` slug should be lowercase, hyphen-separated,
and match across every artifact for the same feature.

## Blind Research

Research is the most-corruptible phase: an LLM that knows what it is being
asked to build will return opinions instead of facts. QRSPI enforces the
invariant in two layers — structural at the dispatch boundary, procedural
at the agent boundary:

1. **Structural** — when the orchestrator dispatches `researcher` or
   `file-finder`, it passes only the paths to `questions.md` and
   `brief.md`. The orchestrator is forbidden from handing the
   description (or `task.md`) to blind agents at dispatch time.
2. **Procedural** — the `researcher` and `file-finder` agent system prompts
   forbid reading `task.md`. Both have `Read`/`Grep`/`Glob` tools with
   `permissionMode: plan`, so nothing mechanically stops a `Read` of
   `task.md`; enforcement relies on the agent following its prompt.
3. **Procedural** — if a researcher needs context the brief lacks, it must
   surface that as an open question rather than guessing the intent.

A PreToolUse(Read) hook that blocks `*-task.md` reads from blind agents
would convert step 2 from procedural to structural. Treat this as a
follow-up if procedural enforcement proves insufficient in practice.

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
`docs/plans/<today>-<topic>-*.md` and reading their YAML frontmatter.
The orchestrator (the main Claude Code session) tracks in-flight work
via TodoWrite — a session-scoped ledger that mirrors the phase table.

### Frontmatter schema (all artifacts)

Every artifact opens with YAML frontmatter. Common fields:

```yaml
---
topic: <kebab-case>
date: 2026-04-30
phase: design        # task | research | design | structure | plan
---
```

Per-phase additions:

| Phase     | Extra frontmatter                                                                  |
|-----------|------------------------------------------------------------------------------------|
| task      | `ticketId: <id>` (or `null`)                                                    |
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

The orchestrator infers the current phase by scanning what exists on
disk for the topic:

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
| topic branch has commits ahead and verifier passed     | PR (next up)        |
| PR opened or commit shipped                            | SHIPPED             |

Worktree presence: `git worktree list --porcelain | grep -q <branch>`.
Verifier passed: latest review artifact in `docs/plans/<today>-<topic>-review-<n>.md`
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

Never proceed to the next phase while a HARD gate is failing. SOFT gates
require user acknowledgment before proceeding.

## Anti-Patterns

### Skipping Question

Jumping straight to research without decomposing the task means the
researcher inherits the user's framing and produces opinionated findings.
Always run the questioner first.

### Letting Research See Intent

If the researcher reads `task.md` or receives the user's description in any
form, the blindness invariant is broken. Treat any leakage as a critical
defect.

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
