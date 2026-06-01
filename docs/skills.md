---
title: Skills
description: "The Team plugin's 29 skills — 11 entry-point slash commands and 18 methodology skills loaded by agents, with purpose, arguments, consumers, and behaviors."
---

# Team Plugin — Skills

> **Audience:** Plugin maintainers and contributors. End users only need
> the README + `/team` slash command.
>
> **Source of truth:** the skill bodies themselves, `skills/*/SKILL.md`.
> This page is a hand-maintained reference; when it disagrees with a
> `SKILL.md`, the `SKILL.md` wins.

## Contents

- [Two flavors of skill](#two-flavors-of-skill)
- [Entry-point skills](#entry-point-skills)
- [Methodology skills](#methodology-skills)
- [Skill ↔ agent ↔ phase](#skill--agent--phase)
- [Name-collision pairs](#name-collision-pairs)
- [See also](#see-also)

## Two flavors of skill

Every skill lives under `skills/<name>/SKILL.md` as YAML frontmatter plus a
Markdown body. A single frontmatter field — `argument-hint` — sorts the
catalog into two flavors:

- **Entry-point skills carry `argument-hint`.** Claude Code registers them
  as slash commands (`/team`, `/team-research`, and so on); the
  `argument-hint` documents what to pass as `$ARGUMENTS`.
- **Methodology skills omit `argument-hint`.** They are never invoked
  directly. Agents load them through one of two mechanisms: a `skills:`
  YAML list in the agent's frontmatter (e.g., `agents/design-author.md`
  declares `skills: [product-thinking]`), or an inline prose load
  instruction in the agent body (e.g., `Load skills/<name>/SKILL.md for
  …`).

That `argument-hint` marker is the whole flavor distinction. The split
is **11 entry-point + 18 methodology = 29**.

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
  and the aggregate five-reviewer review gate during Implement — that
  aggregate gate sorts every finding into Blocking / Major / Minor-and-below
  tiers and auto-loops on any Blocking or Major (the consult guard: the
  user is never asked about a Blocking or Major finding), surfacing only
  the Minor-and-below residue. Its body is organized as `## Input`,
  `## Setup`, `## The Phase Loop`, `## Gate Handling`, and `## Rules` —
  not the downstream Input / Execution / Completion template.

### team-question

- **Purpose:** Decompose a raw intent into a task statement plus a neutral
  question set, producing `task.md` and `questions.md`.
- **`$ARGUMENTS`:** `<ticket id, issue URL, or task description>`.
- **Phase:** Question (the pipeline's first phase).
- **Key behaviors:** The only step that sees your original description; it
  emits the neutral `questions.md` so the downstream research sees only
  the questions, not your task framing.

### team-research

- **Purpose:** Run isolated codebase research against the neutral question set.
- **`$ARGUMENTS`:** `[docs/plans/<id>/]` — optional; resolves via the
  shared three-tier chain above.
- **Phase:** Research (isolated).
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
  verify sub-pipeline. The verify loop sorts findings into Blocking / Major
  / Minor-and-below tiers; while any Blocking or Major remains it
  re-dispatches the implementer automatically without consulting the user
  (the consult guard), capped at 5 rounds. Only the Minor-and-below
  residue is surfaced once Blocking and Major are clean.
- **Standalone Mode:** Invoked with no resolvable directory, it bootstraps
  the missing upstream artifacts inline rather than hard-erroring.

### team-pr

- **Purpose:** Update the changelog, commit, and open the pull request.
- **`$ARGUMENTS`:** `[docs/plans/<id>/]` — optional; resolves via the
  shared three-tier chain above.
- **Phase:** PR (the pipeline's final phase).
- **Key behaviors:** Loads `git-commit` for commit discipline and
  `changelog` for the changelog update; adds a PR body from its template.
  Leaves the worktree in place after opening the PR so you can iterate;
  teardown waits until the PR merges or you ask.
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

## Methodology skills

The 18 methodology skills carry no `argument-hint` and are never invoked
directly. Agents load them through one of two mechanisms: a `skills:` YAML
list in the agent's frontmatter, or an inline prose load instruction in
the agent body (see the "Two flavors of skill" section above). The
"Loaded by" line for each skill names its consumers from the per-agent
load manifest; an agent typically loads at most three.

### qrspi-workflow

- **Purpose:** Phase discipline plus the artifact and frontmatter
  conventions every phase follows.
- **Loaded by:** orchestrator skills; questioner (for the artifact schema).
- **Key behaviors:** The structural backbone of the pipeline: defines the
  phase sequence, the artifact/frontmatter schema (including the
  `repos.md` schema), the gate mechanics (severity tiers and the consult
  guard for the aggregate review gate), and an anti-patterns catalog.

### agent-open-questions

- **Purpose:** Protocol a subagent uses to surface multi-choice open
  questions to the user without calling `AskUserQuestion` itself.
- **Loaded by:** questioner, design-author (2).
- **Key behaviors:** The subagent emits a fenced `openQuestions` JSON
  envelope as its final assistant message and STOPs; the orchestrator
  parses it (Decision 5 first-block-wins), renders the prompt via
  `AskUserQuestion`, and resumes the subagent via `SendMessage` with
  the user's selections. Caps envelopes at 4 questions per call,
  documents the free-text escape hatch for collecting additional
  plain-text input, and defines the two-attempt malformed-envelope
  fallback.

### code-review

- **Purpose:** Generator-evaluator separation, Conventional Comments, and
  the gate verdict vocabulary.
- **Loaded by:** code-reviewer, security-reviewer, ux-reviewer,
  technical-writer (4).
- **Key behaviors:** Defines how a reviewer reads with fresh eyes and
  emits a structured verdict. Carries the authoritative severity-tier
  table (Blocking / Major / Minor-and-below) that maps every reviewer
  vocabulary onto one scale, plus the consult guard — the rule that the
  orchestrator never surfaces a Blocking or Major finding to the user and
  loops the implementer automatically until only Minor-and-below remains.
  Reclassifies `ux-reviewer` from a soft user-decides gate to an
  auto-fixed Major.

### engineering-standards

- **Purpose:** The design-first workflow, implementation standards, and the
  quality checklist.
- **Loaded by:** planner, implementer, code-reviewer (3).
- **Key behaviors:** Anchors planning and implementation in a shared
  standard so reviewers check against the same bar.

### test-first-development

- **Purpose:** Treat acceptance tests as the immutable scope fence.
- **Loaded by:** test-architect, code-reviewer; orchestrator.
- **Key behaviors:** Tests are written first and never edited to pass; the
  implementation must satisfy them as the contract.

### test-driven-bug-fix

- **Purpose:** Reproduce-first, red-green bug discipline.
- **Loaded by:** team-fix.
- **Key behaviors:** Write a failing test that reproduces the bug, then make
  it green — no fix lands without a reproducing test.

### solid-principles

- **Purpose:** The five object-oriented design principles.
- **Loaded by:** implementer, code-reviewer (2).
- **Key behaviors:** SRP, OCP, LSP, ISP, and DIP as concrete checkpoints
  for new code and review.

### refactoring-to-patterns

- **Purpose:** Code smells and the safe transformations that resolve them
  (Fowler).
- **Loaded by:** implementer.
- **Key behaviors:** Name the smell, apply the pattern in its own commit,
  and keep tests green at every step.

### systematic-debugging

- **Purpose:** Evidence-first root-cause diagnosis.
- **Loaded by:** any agent that enters a debugging investigation
  (**advisory**). No agent body names it in a static `Load
  skills/<name>/SKILL.md` instruction; agents load it on demand when an
  investigation begins.
- **Key behaviors:** Gather evidence before theorizing, then isolate the
  root cause rather than patching symptoms.

### progress-tracking

- **Purpose:** Todo-first progress convention for multi-step procedures.
- **Loaded by:** every multi-step agent (questioner, design-author,
  structure-planner, planner, test-architect, implementer, code-reviewer,
  security-reviewer, ux-reviewer, technical-writer, researcher, verifier).
- **Key behaviors:** A convention, not a gate — produces no artifact and
  blocks nothing. When a procedure has two or more steps, seed one todo
  item per step before starting and mark each complete as you go. The
  orchestrator owns the phase ledger; an agent tracks its own sub-steps in
  its own context and never merges them up.

### documenting-decisions

- **Purpose:** Creating and managing architecture decision records (ADRs).
- **Loaded by:** planner, orchestrator (per the skill's own self-description;
  no agent body carries an explicit `Load skills/documenting-decisions/SKILL.md`
  instruction and no agent declares it via `skills:` frontmatter).
- **Key behaviors:** Capture the decision, its alternatives, and its
  rationale so later readers understand the "why".

### technical-design-doc

- **Purpose:** Technical-design / architecture-doc methodology.
- **Loaded by:** planner (per the skill's own self-description; the
  `planner` agent body loads `engineering-standards` explicitly but does not
  carry an explicit `Load skills/technical-design-doc/SKILL.md` instruction).
- **Key behaviors:** Structures the design narrative — current state,
  desired end state, patterns to follow, and trade-offs.

### product-requirements-doc

- **Purpose:** Optional product-requirements-document methodology.
- **Loaded by:** questioner (per the skill's own self-description; the
  `questioner` agent body references `qrspi-workflow` for the artifact schema
  but does not carry an explicit `Load
  skills/product-requirements-doc/SKILL.md` instruction).
- **Key behaviors:** Frames the problem, users, and success criteria when a
  request warrants a PRD before design.

### product-thinking

- **Purpose:** Product-need reasoning lens for "make something people
  want" — sharpens framing, design, and slicing so the work serves real
  users.
- **Loaded by:** questioner, design-author, structure-planner.
- **Key behaviors:** A reasoning lens, not a gate — produces no artifact
  of its own and blocks nothing. Four lenses (demand evidence, smallest
  thing people want, named user, talk-to-users mindset) shape the
  pre-implementation phases.

### writing-prose

- **Purpose:** Plain-language documentation quality.
- **Loaded by:** technical-writer.
- **Key behaviors:** Readable, plain prose aimed at someone who has not seen
  the code — clarity over cleverness.

### git-commit

- **Purpose:** Commit discipline — conventional commits, the 50/72 subject
  and body rule, and atomic commits.
- **Loaded by:** team-pr.
- **Key behaviors:** One logical change per commit with a clear, scoped
  message.

### changelog

- **Purpose:** Keep a Changelog methodology.
- **Loaded by:** team, team-pr.
- **Key behaviors:** Record user-facing changes under the standard
  Added / Changed / Fixed headings before the PR opens.

### worktree-isolation

- **Purpose:** Worktree topology for single- and multi-repo work.
- **Loaded by:** orchestrator (team, team-worktree).
- **Key behaviors:** Set up isolated worktrees so implementation never
  touches the main checkout, and tear them down only after the PR merges
  or on explicit request — a branch stays available for iteration while
  its PR is open.

## Skill ↔ agent ↔ phase

This table ties each skill to the agents or orchestrator skills that load
it and the phase where that happens. The `Invoked / loaded by` column
carries two meanings depending on the row: for **entry-point skills** it
names who *invokes* the skill (you directly, or the orchestrator running a
phase); for **methodology skills** it names the agent(s) that *load* the
skill. For the `$ARGUMENTS` shapes and the three-tier discovery, see the
entry-point section above rather than repeating them here.

| Skill | Invoked / loaded by | Phase / context |
|---|---|---|
| `team` | orchestrator (runs the pipeline) | All phases |
| `team-question` | orchestrator | Question |
| `team-research` | orchestrator → researcher, file-finder | Research |
| `team-design` | orchestrator → design-author | Design (human gate) |
| `team-structure` | orchestrator → structure-planner | Structure (human gate) |
| `team-plan` | orchestrator → planner | Plan |
| `team-worktree` | orchestrator | Worktree |
| `team-implement` | orchestrator → implementer + reviewers | Implement |
| `team-pr` | orchestrator | PR |
| `team-fix` | user (direct invocation) | Compressed bug-fix flow (outside QRSPI) |
| `eng-design-doc-review` | user (direct invocation) | Optional pre-Design audit; dispatches a general-purpose subagent |
| `qrspi-workflow` | orchestrator skills; questioner (schema) | All phases |
| `agent-open-questions` | questioner, design-author | Question, Design (subagent → user via orchestrator) |
| `code-review` | code-reviewer, security-reviewer, ux-reviewer, technical-writer | Implement (verify) |
| `engineering-standards` | planner, implementer, code-reviewer | Plan, Implement |
| `test-first-development` | test-architect, code-reviewer; orchestrator | Implement |
| `test-driven-bug-fix` | team-fix | Bug-fix flow |
| `solid-principles` | implementer, code-reviewer | Implement |
| `refactoring-to-patterns` | implementer | Implement |
| `systematic-debugging` | agents when debugging (advisory) | Any (debugging) |
| `progress-tracking` | every multi-step agent (convention) | Any (multi-step procedure) |
| `documenting-decisions` | planner, orchestrator (advisory) | Any (when decisions are recorded) |
| `technical-design-doc` | planner | Plan |
| `product-requirements-doc` | questioner | Question |
| `product-thinking` | questioner, design-author, structure-planner | Question, Design, Structure |
| `writing-prose` | technical-writer | Implement (verify) |
| `git-commit` | team-pr | PR |
| `changelog` | team, team-pr | PR |
| `worktree-isolation` | orchestrator (team, team-worktree) | Worktree |

The `general-purpose` subagent dispatched by `eng-design-doc-review` is an
additional consumer of `technical-design-doc`, `code-review`,
`engineering-standards`, and `documenting-decisions` — it loads all four as
the criteria for the optional pre-Design audit.

## Name-collision pairs

Several skills and agents share a stem, which is an easy trap. The pattern
is consistent: the **skill** is the orchestrator or methodology, while the
**agent** is the specialist that does the work.

| Skill | Agent | How they differ |
|---|---|---|
| `team-research` | `researcher` | Skill dispatches the Research phase; the agent is the doer that runs the research. |
| `code-review` | `code-reviewer` | Skill is the review methodology; the agent is the reviewer that applies it. |
| `team-question` | `questioner` | Skill drives the Question phase; the agent decomposes the intent. |
| `team-design` | `design-author` | Skill drives the Design phase; the agent drafts the alignment doc. |
| `technical-design-doc` | `technical-writer` | Both contain "technical" but differ: the skill is design-doc methodology; the agent writes documentation during verify. |
| `eng-design-doc-review` | `design-author` | The review skill dispatches a `general-purpose` subagent, **not** the `design-author` agent — keeping the audit independent of the author. |

## See also

- **[architecture.md](architecture.md)** — the design rationale behind
  skills (two flavors, three-tier discovery, load limits) in §6.
- **[index.md](index.md)** — the landing page and pipeline overview.
- **`skills/team/registry.json`** — the phase-tagged inventory of the 13
  specialist agents, in the source tree.
