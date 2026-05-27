---
title: Skills
description: "The Team plugin's 26 skills — 11 entry-point slash commands and 15 methodology skills loaded by agents, with purpose, arguments, consumers, and behaviors."
---

# Team Plugin — Skills
{:.no_toc}

> **Audience:** Plugin maintainers and contributors. End users only need
> the README + `/team` slash command.
>
> **Source of truth:** the skill bodies themselves, `skills/*/SKILL.md`.
> This page is a hand-maintained reference; when it disagrees with a
> `SKILL.md`, the `SKILL.md` wins.

## Contents
{:.no_toc}

* TOC
{:toc}

## Two flavors of skill

Every skill lives under `skills/<name>/SKILL.md` as YAML frontmatter plus a
Markdown body. A single frontmatter field — `argument-hint` — sorts the
catalog into two flavors:

- **Entry-point skills carry `argument-hint`.** Claude Code registers them
  as slash commands (`/team`, `/team-research`, and so on); the
  `argument-hint` documents what to pass as `$ARGUMENTS`.
- **Methodology skills omit `argument-hint`.** They are never invoked
  directly. Agents load them at runtime through inline prose in the agent
  body, such as `Load skills/<name>/SKILL.md for …`.

That binary marker is the whole distinction. There is no `skills:`
frontmatter key and no other flavor. The split is **11 entry-point + 15
methodology = 26**.

For *why* the system is shaped this way — the three-tier argument-discovery
design, the discovery-duplication rationale, and the skill load limits — see
[architecture.md §6](architecture.md#6-skills). The architecture page
explains the design; the full per-skill enumeration now lives here.

## Entry-point skills

Each entry-point skill either kicks off a full run (`team`, `team-fix`) or
drives one phase of the QRSPI pipeline (Question, Research, Design,
Structure, Plan, Worktree, Implement, PR). What ties most of them together
is a shared argument-resolution chain and a common body template.

The **downstream phase skills** — `team-question` through `team-pr`, plus
the optional `eng-design-doc-review` — share a consistent body template: an
`## Input` section describing `$ARGUMENTS`, an `## Execution` section of
numbered steps, and a `## Completion` section listing what to report plus
the `Next: run /team-…` handoff to the next phase. The `team` orchestrator
does not follow that template; it walks a Phase Loop instead (see its entry
below).

**Shared argument resolution (three-tier discovery).** Eight of these
skills consume an artifact directory rather than a free-form description:
`team-research`, `team-design`, `team-structure`, `team-plan`,
`team-worktree`, `team-implement`, `team-pr`, and `eng-design-doc-review`.
For all eight, the `docs/plans/<id>/` argument is **optional** and resolves
through the same three-tier chain:

1. **Tier 1 — explicit `$ARGUMENTS`.** If you pass a directory path, it is
   used directly.
2. **Tier 2 — newest-mtime convention discovery.** With no argument, the
   skill scans `docs/plans/` for the most recently modified topic directory
   that holds the predecessor artifact it needs.
3. **Tier 3 — `AskUserQuestion`.** If discovery is ambiguous, the skill
   asks you which topic to operate on.

The entries below say "resolves `$ARGUMENTS` via the shared three-tier
chain above" instead of repeating these tiers. The two skills that take a
free-form description (`team`, `team-question`, `team-fix`) state their own
argument shape.

### team

- **Purpose:** Run the full eight-phase QRSPI pipeline end to end, from a
  raw request to an opened pull request.
- **`$ARGUMENTS`:** `<ticket id, issue URL, or feature description>`.
- **Phase:** Drives all phases (Question → Research → Design → Structure →
  Plan → Worktree → Implement → PR).
- **Key behaviors:** Walks a linear Phase Loop, dispatching the specialist
  agent(s) for each phase per its phase table, then running that phase's
  gate before advancing. Enforces the two human gates (Design, Structure)
  and the aggregate five-reviewer review gate during Implement. Its body is
  organized as `## Input`, `## Setup`, `## The Phase Loop`, `## Gate
  Handling`, and `## Rules` — not the downstream Input / Execution /
  Completion template.

### team-question

- **Purpose:** Decompose a raw intent into a task statement plus a neutral
  question set, producing `task.md` and `questions.md`.
- **`$ARGUMENTS`:** `<ticket id, issue URL, or task description>`.
- **Phase:** Question (the pipeline's first phase).
- **Key behaviors:** The only step that sees your original description; it
  emits the neutral `questions.md` that keeps the downstream research blind.

### team-research

- **Purpose:** Run blind codebase research against the neutral question set.
- **`$ARGUMENTS`:** `[docs/plans/<id>/]` — optional; resolves via the
  shared three-tier chain above.
- **Phase:** Research (blind).
- **Key behaviors:** Reads only `questions.md`, never the task, so the
  research carries no opinion-bias. Writes `research.md`.

### team-design

- **Purpose:** Align with you on the approach and draft the alignment doc.
- **`$ARGUMENTS`:** `[docs/plans/<id>/]` — optional; resolves via the
  shared three-tier chain above.
- **Phase:** Design (human gate).
- **Key behaviors:** Runs an interactive interview, then writes a ~200-line
  `design.md`. This is the first of the two human approval gates.

### team-structure

- **Purpose:** Break the approved design into vertical slices with
  per-slice verification checkpoints.
- **`$ARGUMENTS`:** `[docs/plans/<id>/]` — optional; resolves via the
  shared three-tier chain above.
- **Phase:** Structure (human gate).
- **Key behaviors:** Produces the ~2-page `structure.md`. This is the
  second human approval gate.

### team-plan

- **Purpose:** Turn the approved structure into a tactical, file-level
  implementation plan.
- **`$ARGUMENTS`:** `[docs/plans/<id>/]` — optional; resolves via the
  shared three-tier chain above.
- **Phase:** Plan.
- **Key behaviors:** Writes `plan.md` for the implementer. The plan is a
  tactical artifact, not a human-reviewed gate.

### team-worktree

- **Purpose:** Prepare an isolated git worktree for the implementation.
- **`$ARGUMENTS`:** `[docs/plans/<id>/]` — optional; resolves via the
  shared three-tier chain above.
- **Phase:** Worktree.
- **Key behaviors:** Creates the branch and worktree so implementation
  never touches the main checkout. Loads `worktree-isolation` for the
  single- and multi-repo topology.

### team-implement

- **Purpose:** Implement the plan: write tests first, execute slice by
  slice, then run the adversarial reviewer loop.
- **`$ARGUMENTS`:** `[docs/plans/<id>/]` — optional; resolves via the
  shared three-tier chain above.
- **Phase:** Implement.
- **Key behaviors:** Runs the test-first → slice-execution → five-reviewer
  verify sub-pipeline with a typed hard-gate retry loop.
- **Standalone Mode:** Invoked with no resolvable directory, it bootstraps
  the missing upstream artifacts inline rather than hard-erroring.

### team-pr

- **Purpose:** Update the changelog, commit, and open the pull request.
- **`$ARGUMENTS`:** `[docs/plans/<id>/]` — optional; resolves via the
  shared three-tier chain above.
- **Phase:** PR (the pipeline's final phase).
- **Key behaviors:** Loads `git-commit` for commit discipline and
  `changelog` for the changelog update; adds a PR body from its template.
- **Standalone Mode:** Invoked with no resolvable directory, it bootstraps
  the missing upstream artifacts inline rather than hard-erroring.

### team-fix

- **Purpose:** Run a compressed bug-fix pipeline that skips the QRSPI
  ceremony.
- **`$ARGUMENTS`:** `<ticket id, issue URL, or bug description>`.
- **Phase:** Standalone fix flow (not a QRSPI phase). Runs the compressed
  pipeline `REPRODUCE → RED → GREEN → VERIFY → SHIP`.
- **Key behaviors:** Loads `test-driven-bug-fix` for reproduce-first,
  red-green discipline — a failing test that reproduces the bug, then the
  fix that turns it green.

### eng-design-doc-review

- **Purpose:** Run an optional adversarial, fresh-context audit of
  `design.md` before the human design gate.
- **`$ARGUMENTS`:** `[docs/plans/<id>/]` — optional; resolves via the
  shared three-tier chain above.
- **Phase:** Optional pre-gate audit (sits before the Design gate).
- **Key behaviors:** Dispatches a `general-purpose` subagent (not the
  `design-author` agent) so the audit reads the design with fresh eyes.
  That subagent loads four methodology skills as its review criteria —
  `technical-design-doc`, `code-review`, `engineering-standards`, and
  `documenting-decisions` — making this an additional consumer of all four.
