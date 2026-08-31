---
name: qrspi-workflow
description: Worktree-Question-Research-Design-Structure-Plan-Implement-PR phase discipline with gate enforcement — loaded by orchestrator to govern pipeline phase transitions, artifact conventions, and anti-patterns
user-invocable: false
---

# QRSPI Workflow

Phase discipline for the Team pipeline. Eight sequential phases, none
skippable. Each produces artifacts the next consumes.

## Phase Sequence

```
WORKTREE -> QUESTION -> RESEARCH -> DESIGN -> STRUCTURE -> PLAN -> IMPLEMENT -> PR
```

| Phase | Produces | Gate |
|-------|----------|------|
| **WORKTREE** | git worktree on branch `<id>` off `origin/HEAD`, with `docs/plans/<id>/` authored inside it | HARD — the worktree must exist before QUESTION authors artifacts |
| **QUESTION** | `task.md` (full description, human-only) and `questions.md` (neutral questions plus a "Codebase context" section naming files, modules, and vocabulary but NOT the goal) | HARD — both on disk |
| **RESEARCH** | `research.md` | HARD — artifact on disk |
| **DESIGN** | `design.md` (~200 lines) plus one `design-review-<n>.md` per round | REVIEW — adversarial design review. APPROVE/COMMENT advance; REQUEST CHANGES re-drafts and a fresh round reviews the new draft |
| **STRUCTURE** | `structure.md` (~2 pages of vertical slices) | NONE — autonomous |
| **PLAN** | `plan.md` | SOFT — no approval. The reviewed design is the contract |
| **IMPLEMENT** | production code, passing tests, per-slice commits | AGGREGATE — security, verifier, and code-review hard gates |
| **PR** | GitHub draft PR | Terminal — record the PR URL, close the ledger |

WORKTREE is the leading phase and has no agent — purely a router
responsibility. For why it leads, see "Why first" in
`skills/worktree-isolation/SKILL.md`.

IMPLEMENT runs four sub-phases: `test-architect` writes failing acceptance
tests; a mechanical gate confirms all tests fail with assertion errors (not
crashes) *and* every static check the project defines passes; `implementer`
works through vertical slices, committing each when its tests pass; then 5
parallel reviewers (code, security, docs, ux, verifier) return typed failure
classes that loop back to the implementer, until no Blocking or Major finding
remains.

## Artifact Conventions

All phase artifacts live under `docs/plans/<id>/`. The schema is canonical in
`skills/artifact-frontmatter/SKILL.md` — the `<id>` forms, the artifact
inventory, the `repos.md` and `prd.md` schemas, the topic-consistency
invariant, and the `ticketId` scope. Consult that skill rather than restating
it. What matters for phase discipline:

- The `<id>` slug and the `topic` frontmatter field match across every
  artifact for the same feature.
- `repos.md` (when present) switches the pipeline into multi-repo mode. Its
  absence keeps single-repo mode — today's default.
- `prd.md` (when present) rides the autonomous Question phase and is not
  gated.

## Research Isolation

Research is the most-corruptible phase; it runs blind per
`skills/principle-blind-the-investigator/SKILL.md`, enforced in two layers:

1. **Structural** — the orchestrator passes `researcher` and `file-finder`
   only the path to `questions.md`. It is forbidden from handing them the
   description or `task.md` at dispatch time.
2. **Procedural** — the `researcher` and `file-finder` system prompts forbid
   reading `task.md`. Both hold `Read`/`Grep`/`Glob` with
   `permissionMode: plan`, so nothing mechanically stops such a read.
   Enforcement relies on the agent following its prompt. A researcher missing
   context never pauses the run to ask.

## Gate Types

Where a rule must hold, a deterministic check enforces it — never prompt memory alone (`skills/principle-mechanical-gates/SKILL.md`).

### HARD

Blocks the phase transition until satisfied. No override except by explicit
user command. Examples: a REQUEST CHANGES design-review verdict, security
findings that gate, test failures.

### SOFT

Informational. SOFT findings land in the PR body's `## Review notes` for the
human's PR review and are never acknowledged mid-run. The pipeline proceeds.
The human owns the ends, not the middle: `skills/principle-human-owns-the-ends/SKILL.md`.

Which findings gate, and which auto-fix rather than land as recorded notes, is
defined in exactly one place: `skills/review-severity-tiers/SKILL.md` →
"Severity Tiers and the Auto-Fix Boundary". Only findings below the auto-fix
boundary are recorded for the PR body. Consult that table rather than
restating it here.
Defined once, consulted everywhere: `skills/principle-single-source-of-truth/SKILL.md`.

### ADVISORY

Non-blocking, no acknowledgment required. Examples: documentation gap
analysis, style suggestions.

## State and Coordination

Pipeline state is reconstructed by scanning `docs/plans/<id>/*.md` and reading
YAML frontmatter. The orchestrator tracks in-flight work through TodoWrite — a
session-scoped ledger mirroring the phase table, rebuilt on entry to any
`/team-*` command.
The files-are-the-contract rule (`skills/principle-files-are-the-contract/SKILL.md`): the artifact on disk, never conversation memory, is the interface between phases.

### Phase inference from artifacts

| Latest artifact present                                | Current phase       |
|--------------------------------------------------------|---------------------|
| worktree exists for `<id>`, no `task.md` yet           | WORKTREE (next up)  |
| `task.md` + `questions.md`                             | RESEARCH (next up)  |
| `research.md`                                          | DESIGN (next up)    |
| `design.md` alone (no passing design review)           | DESIGN (review next)|
| `design.md` + passing `design-review-<n>.md`           | STRUCTURE (next up) |
| `structure.md`                                         | PLAN (next up)      |
| `plan.md` + ≥1 commit on `<id>` since merge-base       | IMPLEMENT           |
| `plan.md` (no commit on `<id>` yet)                    | PLAN (next up)      |
| topic branch has commits ahead and verifier passed     | PR (next up)        |
| PR(s) opened or commit(s) shipped                      | SHIPPED             |

Worktree presence (single-repo): `git worktree list --porcelain | grep -q <id>`.
Multi-repo: the same per repo path in `docs/plans/<id>/repos.md`.
**IMPLEMENT signal:** a worktree alone is not enough — IMPLEMENT is confirmed
only once `git log <merge-base>..<id>` is non-empty. Before that, `plan.md`
present with no commit means the run is still pre-IMPLEMENT.
Verifier passed: the latest `docs/plans/<id>/review-<n>.md` shows the
aggregate gate clean.

### Phase Transition Protocol

1. **Verify artifacts** exist on disk for the current phase. For DESIGN →
   STRUCTURE that includes a `design-review-<n>.md` with a passing verdict.
2. **Update the ledger** — current TodoWrite item complete, next `in_progress`.
3. **Dispatch next agent(s)** — the phase table in `skills/team/SKILL.md`
   names them.

Never proceed while a Blocking or Major finding remains. The implementer loops
automatically and the user is never consulted about it — the no-consult rule
in `skills/review-severity-tiers/SKILL.md`. Minor-and-below findings are
recorded for the PR body's `## Review notes`, never presented mid-run.

## Anti-Patterns

- **Skipping Question.** The researcher then inherits the user's framing and
  produces opinionated findings. Always run the questioner first.
- **Letting research see intent.** A researcher that reads `task.md` or
  receives the description in any form breaks the isolation invariant. Treat
  any leakage as a critical defect: stop and report.
- **Reviewing the plan.** A 1000-line plan begets ~1000 lines of code, and
  surprises during implementation invalidate the review. Review the design
  (~200 lines) instead — that is where leverage lives. The structure and plan
  are autonomous tactical artifacts.
- **Horizontal layering.** A structure that builds the entire database, then
  the entire API, then the entire UI defers integration risk to the end.
  Reject any structure that flattens into layers — slices are end-to-end,
  independently testable, and atomically committable
  (`skills/slicing-work/SKILL.md`).
- **Implementing without a structure.** The structure is the scope fence.
  Always produce it, even though it advances autonomously.
- **Gold-plating.** Adding features, tests, or abstractions beyond what the
  structure specifies. If scope must expand, update the structure; for a
  material change, return to DESIGN for a fresh design review.
  Scope expands by changing the artifact, never by quietly exceeding it (`skills/principle-scope-fence/SKILL.md`).
- **Backward skipping.** Jump back one phase, never several. A structure flaw
  returns to STRUCTURE; a design flaw returns to DESIGN.
- **Premature shipping.** Every HARD gate in the implement-verify loop must
  pass before the PR phase.
