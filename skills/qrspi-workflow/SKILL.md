---
name: qrspi-workflow
description: Worktree-Question-Research-Design-Structure-Plan-Implement-PR phase discipline with gate enforcement — loaded by orchestrator to govern pipeline phase transitions, artifact conventions, and anti-patterns
user-invocable: false
---

# QRSPI Workflow

Phase discipline for the Team pipeline. Every feature flows through eight
sequential phases. No phase may be skipped. Each phase produces artifacts
that downstream phases consume.

## Phase Sequence

```
WORKTREE -> QUESTION -> RESEARCH -> DESIGN -> STRUCTURE -> PLAN -> IMPLEMENT -> PR
```

### WORKTREE

The **leading** phase. Before QUESTION, the router creates the home worktree
on branch `<id>` off `origin/HEAD` and authors `docs/plans/<id>/` inside it,
so the home checkout's `git status` stays clean for the whole run. No agent;
purely a router responsibility.

For the rationale behind the leading placement, see the "Why first"
subsection in `skills/worktree-isolation/SKILL.md`.

- **Artifact:** git worktree under Claude Code's native worktree directory,
  with `docs/plans/<id>/` authored inside it
- **Gate:** HARD — the worktree must exist before QUESTION authors artifacts

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
markdown artifact, produced autonomously.

- **Artifact:** `docs/plans/<id>/structure.md`
- **Gate:** NONE — autonomous; once `structure.md` exists the pipeline
  advances to PLAN. Design is the only human gate.

### PLAN

Tactical implementation details for the agent. Read by the implementer.
No human approval gate — the plan is mechanically derived from the
structure.

- **Artifact:** `docs/plans/<id>/plan.md`
- **Gate:** SOFT — no human approval; design is the human contract

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

All phase artifacts live under `docs/plans/<id>/`. The artifact schema
is canonical in `skills/artifact-frontmatter/SKILL.md` — the `<id>`
forms, the artifact inventory, the `repos.md` and `prd.md` schemas, the
topic-consistency invariant, and the `ticketId` scope. Consult that
skill rather than restating the schema here. What matters for phase
discipline:

- The `<id>` slug and the `topic` frontmatter field match across every
  artifact for the same feature.
- `repos.md` (when present) switches the pipeline into multi-repo mode;
  its absence keeps single-repo mode — today's default.
- `prd.md` (when present) rides the autonomous Question phase and is
  not human-gated.

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

Examples: design approval, security review with critical findings, test
failures.

### SOFT

Informational gate. The pipeline presents findings to the user and may proceed
at the user's judgment. The user is expected to read and acknowledge.

Which review findings actually gate — and which auto-fix rather than wait on the
user — is defined in exactly one place: `skills/review-severity-tiers/SKILL.md` →
"Severity Tiers and the Auto-Fix Boundary". Only findings below the auto-fix
boundary surface to the user as a SOFT acknowledgment; consult that table rather
than restating it here.

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

Every artifact opens with YAML frontmatter. The schema — common fields,
the phase enum, the per-phase additions, and the approval
check/flip/rejection mechanics — is canonical in
`skills/artifact-frontmatter/SKILL.md`. Phase transitions verify
approval by re-reading the gated artifact's frontmatter per that skill.

### Phase inference from artifacts

The orchestrator infers the current phase by scanning what exists in
`docs/plans/<id>/`:

| Latest artifact present                                | Current phase       |
|--------------------------------------------------------|---------------------|
| worktree exists for `<id>`, no `task.md` yet           | WORKTREE (next up)  |
| `task.md` + `questions.md`                             | RESEARCH (next up)  |
| `research.md`                                          | DESIGN (next up)    |
| `design.md` (frontmatter `approved: false`)            | DESIGN (human gate) |
| `design.md` (frontmatter `approved: true`)             | STRUCTURE (next up) |
| `structure.md`                                         | PLAN (next up)      |
| `plan.md` + ≥1 commit on `<id>` since merge-base       | IMPLEMENT           |
| `plan.md` (no commit on `<id>` yet)                    | PLAN (next up)      |
| topic branch has commits ahead and verifier passed     | PR (next up)        |
| PR(s) opened or commit(s) shipped                      | SHIPPED             |

Worktree presence (single-repo): `git worktree list --porcelain | grep -q <id>`.
Worktree presence (multi-repo): for each repo path in
`docs/plans/<id>/repos.md`, `git -C <repo-path> worktree list --porcelain
| grep -q <id>`.
IMPLEMENT signal: a worktree alone is not enough — IMPLEMENT is confirmed
only once there is **≥1 commit on `<id>` since merge-base** with the default
branch (`git log <merge-base>..<id>` non-empty). Before that, `plan.md`
present with no commit means the run is still pre-IMPLEMENT.
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
(the consult guard; see `skills/review-severity-tiers/SKILL.md`). Minor-and-below
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
implementation invalidate the review. Review the design (~200 lines)
instead — that is where leverage lives. The structure and plan are
autonomous artifacts.

### Horizontal Layering

Plans that build the entire database, then the entire API, then the entire
UI defer integration risk to the very end. The structure phase exists to
force vertical slicing — reject any structure that flattens into layers.

### Implementing Without a Structure

The structure is the scope fence for implementation. Jumping from design
straight to code skips the vertical-slice breakdown the planner and
implementer rely on. Always produce the structure — even though it now
advances autonomously, design remains the human contract behind it.

### Gold-Plating

Adding features, tests, or abstractions beyond what the structure specifies.
The structure defines the scope fence. If scope needs to expand, update the
structure (and, for a material change, return to the DESIGN gate) — do not
silently add work.

### Backward Skipping

Jumping backward more than one phase. If implementation reveals a structure
flaw, return to STRUCTURE. If the structure reveals a design flaw, return to
DESIGN. Never skip backward multiple phases at once.

### Premature Shipping

Attempting to ship before the aggregate verify gate passes clean. Every HARD
gate in the implement-verify loop must pass. Skipping verification risks
shipping broken or insecure code.
