---
title: Skills
description: "The Team plugin's skills: pipeline entry-point slash commands, standalone utilities (shipit, pr-open-comments, pr-watch-as-author, pr-watch-as-reviewer, groom-backlog, pr-cleanup, pr-verify, pr-screenshots, pr-rebase, reflect, why, how, no-comments), and methodology skills loaded by agents, each with the skills it loads."
audience: [user, developer]
nav_order: 5
nav_label: skills
---

# Team Skills

> **The features you use.** Every entry-point skill is a slash command you can
> run (`/team`, `/team-fix`, …). The methodology skills are the internal
> building blocks the agents load to do their work.
>
> **Source of truth:** the skill bodies themselves, `skills/*/SKILL.md`.
> This page is a hand-maintained reference. When it disagrees with a
> `SKILL.md`, the `SKILL.md` wins.

Each entry starts with one sentence copied from that skill's frontmatter
`description`. `**Uses:**` lists the skills it loads. `**Used by:**` lists
the skills that load it. Both use comma-separated lists, or `None`.
The load form is
``Call the Skill tool with `<name>` ``. Naming a skill another way is a
citation, not an edge. Shared rules use explicit ordinary-resource reads instead of skill registration.

The edges are therefore **directed**, and reading them transitively gives the
graph. `team-implement` loads `team-pr`, which loads `git-commit`, which
loads `writing-prose`. None of the three loads back. `**Uses:** None` marks a
leaf with no further Skill-tool loads.

Loads are collected across every `.md` file in the skill's directory, so a
load written in a `references/` file counts the same as one in `SKILL.md`.
This page carries both directions of each skill-to-skill load edge.
For what separates a load from a citation, and for how a skill is loaded, see
[architecture.md §6](architecture.md#6-skills).

The catalog has 40 registered skills: 25 commands and 15 methodologies. Shared principles, playbooks, templates, and operational rules are ordinary [installed resources](migration-contract.md).
They are read at the consuming operation and add no picker entries.

## Entry-point skills

Each carries `argument-hint`, so it is a slash command, and each either kicks off a
full run or drives one phase of the QRSPI pipeline.

### [team](https://github.com/bostonaholic/team/blob/main/skills/team/SKILL.md)

Runs the 8-phase QRSPI feature pipeline.

**Used by:** None

**Uses:** `changelog`, `cross-model-review`, `git-commit`, `running-quality-checks`, `team-pr`, `team-worktree`, `tracking-tickets`, `unslop`, `worktree-isolation`, `writing-prose`

### [team-question](https://github.com/bostonaholic/team/blob/main/skills/team-question/SKILL.md)

Decomposes a feature into task and question artifacts.

**Used by:** None

**Uses:** `unslop`, `writing-prose`

### [team-research](https://github.com/bostonaholic/team/blob/main/skills/team-research/SKILL.md)

Researches a codebase area before changes.

**Used by:** None

**Uses:** `unslop`, `writing-prose`

### [team-design](https://github.com/bostonaholic/team/blob/main/skills/team-design/SKILL.md)

Drafts and adversarially reviews a design.

**Used by:** None

**Uses:** `cross-model-review`, `unslop`, `writing-prose`

### [team-structure](https://github.com/bostonaholic/team/blob/main/skills/team-structure/SKILL.md)

Breaks a reviewed design into verified slices.

**Used by:** None

**Uses:** `unslop`, `writing-prose`

### [team-plan](https://github.com/bostonaholic/team/blob/main/skills/team-plan/SKILL.md)

Produces the tactical implementation plan.

**Used by:** None

**Uses:** `unslop`, `writing-prose`

### [team-worktree](https://github.com/bostonaholic/team/blob/main/skills/team-worktree/SKILL.md)

Prepares isolated git worktrees.

**Used by:** `team`, `team-fix`, `worktree-isolation`

**Uses:** `unslop`, `writing-prose`

### [team-implement](https://github.com/bostonaholic/team/blob/main/skills/team-implement/SKILL.md)

Executes and verifies implementation slices.

**Used by:** None

**Uses:** `running-quality-checks`, `team-pr`, `unslop`, `writing-prose`

### [team-pr](https://github.com/bostonaholic/team/blob/main/skills/team-pr/SKILL.md)

Opens a pull request after verification.

**Used by:** `team`, `team-implement`

**Uses:** `changelog`, `git-commit`, `pr-screenshots`, `tracking-tickets`, `unslop`, `verifying-ux`, `worktree-isolation`, `writing-prose`

### [team-fix](https://github.com/bostonaholic/team/blob/main/skills/team-fix/SKILL.md)

Runs the compressed bug-fix pipeline.

**Used by:** None

**Uses:** `team-worktree`, `tracking-tickets`, `why`, `worktree-isolation`

### [eng-design-doc-review](https://github.com/bostonaholic/team/blob/main/skills/eng-design-doc-review/SKILL.md)

Reviews a technical design document with fresh context.

**Used by:** None

**Uses:** `cross-model-review`, `engineering-standards`, `unslop`, `writing-prose`

## Standalone utilities

Each carries `argument-hint` (so it is a slash command) but is **not** a
QRSPI phase: a self-contained action a user runs on demand.

### [shipit](https://github.com/bostonaholic/team/blob/main/skills/shipit/SKILL.md)

Lands a reviewed pull request.

**Used by:** None

**Uses:** None

### [pr-open-comments](https://github.com/bostonaholic/team/blob/main/skills/pr-open-comments/SKILL.md)

Triages unresolved PR review comments.

**Used by:** `pr-watch-as-author`

**Uses:** None

### [pr-watch-as-author](https://github.com/bostonaholic/team/blob/main/skills/pr-watch-as-author/SKILL.md)

Watches an authored PR for feedback.

**Used by:** None

**Uses:** `pr-open-comments`, `pr-watch-mechanics`, `tracking-tickets`

### [pr-watch-as-reviewer](https://github.com/bostonaholic/team/blob/main/skills/pr-watch-as-reviewer/SKILL.md)

Watches a reviewed PR and approves settled feedback.

**Used by:** None

**Uses:** `pr-watch-mechanics`

### [groom-backlog](https://github.com/bostonaholic/team/blob/main/skills/groom-backlog/SKILL.md)

Grooms a project backlog and proposes tracker changes.

**Used by:** None

**Uses:** None

### [pr-cleanup](https://github.com/bostonaholic/team/blob/main/skills/pr-cleanup/SKILL.md)

Cleans PR state.

**Used by:** None

**Uses:** None

### [pr-verify](https://github.com/bostonaholic/team/blob/main/skills/pr-verify/SKILL.md)

Verifies a PR test plan with evidence-rated verdicts.

**Used by:** None

**Uses:** `running-quality-checks`

### [pr-screenshots](https://github.com/bostonaholic/team/blob/main/skills/pr-screenshots/SKILL.md)

Attaches local images to a PR body.

**Used by:** `team-pr`

**Uses:** None

### [pr-rebase](https://github.com/bostonaholic/team/blob/main/skills/pr-rebase/SKILL.md)

Rebases a branch onto its base.

**Used by:** None

**Uses:** `running-quality-checks`

### [reflect](https://github.com/bostonaholic/team/blob/main/skills/reflect/SKILL.md)

Mines a session for durable learnings.

**Used by:** None

**Uses:** `running-quality-checks`

### [why](https://github.com/bostonaholic/team/blob/main/skills/why/SKILL.md)

Investigates design rationale behind code.

**Used by:** `code-review`, `how`, `team-fix`

**Uses:** None

### [how](https://github.com/bostonaholic/team/blob/main/skills/how/SKILL.md)

Explains subsystem architecture and runtime flow.

**Used by:** None

**Uses:** `why`

### [code-review](https://github.com/bostonaholic/team/blob/main/skills/code-review/SKILL.md)

Reviews a diff with fresh context.

**Used by:** None

**Uses:** `engineering-standards`, `why`, `writing-prose`

### [no-comments](https://github.com/bostonaholic/team/blob/main/skills/no-comments/SKILL.md)

Removes low-value source comments and encodes valid constraints.

**Used by:** None

**Uses:** `engineering-standards`, `running-quality-checks`

## Methodology skills

These carry no `argument-hint`. They are never invoked directly; agents load
them.

### [cross-model-review](https://github.com/bostonaholic/team/blob/main/skills/cross-model-review/SKILL.md)

Runs second-vendor reviews through machine-only CLI adapters.

**Used by:** `eng-design-doc-review`, `team`, `team-design`

**Uses:** None

### [engineering-standards](https://github.com/bostonaholic/team/blob/main/skills/engineering-standards/SKILL.md)

Defines code design, comment, and review standards.

**Used by:** `code-review`, `eng-design-doc-review`, `no-comments`

**Uses:** None

### [solid](https://github.com/bostonaholic/team/blob/main/skills/solid/SKILL.md)

Defines SOLID design and review rules.

**Used by:** None

**Uses:** None

### [refactoring-to-patterns](https://github.com/bostonaholic/team/blob/main/skills/refactoring-to-patterns/SKILL.md)

Maps code smells to behavior-preserving refactorings.

**Used by:** None

**Uses:** None

### [running-quality-checks](https://github.com/bostonaholic/team/blob/main/skills/running-quality-checks/SKILL.md)

Runs project-native tests, static checks, builds, and linters.

**Used by:** `no-comments`, `pr-rebase`, `pr-verify`, `reflect`, `team`, `team-implement`

**Uses:** None

### [nested-agents](https://github.com/bostonaholic/team/blob/main/skills/nested-agents/SKILL.md)

Defines safe nested-agent dispatch and fallback.

**Used by:** None

**Uses:** None

### [writing-prose](https://github.com/bostonaholic/team/blob/main/skills/writing-prose/SKILL.md)

Defines strict and STE-flavored prose rules.

**Used by:** `changelog`, `code-review`, `eng-design-doc-review`, `git-commit`, `team`, `team-design`, `team-implement`, `team-plan`, `team-pr`, `team-question`, `team-research`, `team-structure`, `team-worktree`

**Uses:** None

### [unslop](https://github.com/bostonaholic/team/blob/main/skills/unslop/SKILL.md)

Use whenever writing or revising prose.

**Used by:** `eng-design-doc-review`, `team`, `team-design`, `team-implement`, `team-plan`, `team-pr`, `team-question`, `team-research`, `team-structure`, `team-worktree`

**Uses:** None

### [verifying-ux](https://github.com/bostonaholic/team/blob/main/skills/verifying-ux/SKILL.md)

Defines live application and screenshot verification.

**Used by:** `team-pr`

**Uses:** None

### [git-commit](https://github.com/bostonaholic/team/blob/main/skills/git-commit/SKILL.md)

Defines Conventional Commit subjects and safe commit procedure.

**Used by:** `team`, `team-pr`

**Uses:** `writing-prose`

### [changelog](https://github.com/bostonaholic/team/blob/main/skills/changelog/SKILL.md)

Defines Keep a Changelog updates.

**Used by:** `team`, `team-pr`

**Uses:** `writing-prose`

### [tracking-tickets](https://github.com/bostonaholic/team/blob/main/skills/tracking-tickets/SKILL.md)

Defines tracker status transitions and closing rules.

**Used by:** `pr-watch-as-author`, `team`, `team-fix`, `team-pr`

**Uses:** None

### [worktree-isolation](https://github.com/bostonaholic/team/blob/main/skills/worktree-isolation/SKILL.md)

Defines Team worktree creation, validation, and teardown.

**Used by:** `team`, `team-fix`, `team-pr`

**Uses:** `team-worktree`

### [sweeping-local-state](https://github.com/bostonaholic/team/blob/main/skills/sweeping-local-state/SKILL.md)

Defines machine-local teardown.

**Used by:** None

**Uses:** None

### [pr-watch-mechanics](https://github.com/bostonaholic/team/blob/main/skills/pr-watch-mechanics/SKILL.md)

Bounded watch-loop mechanics for the pr-watch skills: cycle timing, soft cap, handoff.

**Used by:** `pr-watch-as-author`, `pr-watch-as-reviewer`

**Uses:** None

## Prose composition and evaluation

When both prose skills are loaded, `unslop` protects exact text and semantic
force, scans the untouched draft, and records the applicable checklist before
`writing-prose` edits. It then resolves every recorded match, rescans, and
self-audits meaning and protected text.

The live-model suite covers zero, one, and many matches; exact code, user, and
vendor text; pipeline authors; the technical-writer semantic veto; the fresh
DESIGN reviewer; isolated Research producers and assembly; nested helpers; and
the named-parent fallback. These evals are stochastic, paid, periodic, and
non-gating. Their assertions use required contracts and score floors rather
than expecting identical prose across runs.

## Name-collision pairs

Several skills and agents share a stem, which is an easy trap. The pattern
is consistent: the **skill** is the orchestrator or methodology, while the
**agent** is the specialist that does the work.

| Skill | Agent | How they differ |
|---|---|---|
| `team-research` | `researcher` | Skill dispatches the Research phase. The agent is the doer that runs the research. |
| `team-question` | `questioner` | Skill drives the Question phase. The agent decomposes the intent. |
| `verifying-ux` | `ux-reviewer` | Skill is the live-verification procedure. The agent is the tester that runs it. |
| `team-design` | `design-author` | Skill drives the Design phase. The agent drafts the alignment doc. |
| `eng-design-doc-review` | `design-author` | The review skill dispatches a read-only `Explore` subagent, **not** the `design-author` agent, which keeps the audit independent of the author. |

## See also

- **[Architecture](architecture.md)**: the design rationale behind
  skills (two flavors, three-tier discovery, load limits) in §6.
- **[Vision](vision.md)**: the loop-driven end state Team builds toward.
- **[Ethos](ethos.md)**: the principles behind the pipeline.
- **[Overview](index.md)**: the landing page and pipeline overview.
- **`skills/team/registry.json`**: the phase-tagged inventory of the 13
  specialist agents, in the source tree.

## Shared resources

Read these ordinary documents at their consuming step. They add no registrations or picker entries.

- [bug fix](https://github.com/bostonaholic/team/blob/main/skills/team-fix/playbooks/bug-fix.md)
- [bug diagnosis](https://github.com/bostonaholic/team/blob/main/skills/team-fix/references/diagnosis.md)
- [durable state](https://github.com/bostonaholic/team/blob/main/skills/team/principles/durable-state.md)
- [focused work](https://github.com/bostonaholic/team/blob/main/skills/team/principles/focused-work.md)
- [human control](https://github.com/bostonaholic/team/blob/main/skills/team/principles/human-control.md)
- [independent review](https://github.com/bostonaholic/team/blob/main/skills/team/principles/independent-review.md)
- [verified results](https://github.com/bostonaholic/team/blob/main/skills/team/principles/verified-results.md)
- [feature playbook](https://github.com/bostonaholic/team/blob/main/skills/team/playbooks/feature.md)
- [question playbook](https://github.com/bostonaholic/team/blob/main/skills/team/playbooks/question.md)
- [research playbook](https://github.com/bostonaholic/team/blob/main/skills/team/playbooks/research.md)
- [design playbook](https://github.com/bostonaholic/team/blob/main/skills/team/playbooks/design.md)
- [structure playbook](https://github.com/bostonaholic/team/blob/main/skills/team/playbooks/structure.md)
- [plan playbook](https://github.com/bostonaholic/team/blob/main/skills/team/playbooks/plan.md)
- [implement playbook](https://github.com/bostonaholic/team/blob/main/skills/team/playbooks/implement.md)
- [decisions](https://github.com/bostonaholic/team/blob/main/skills/team/references/decisions.md)
- [dependencies](https://github.com/bostonaholic/team/blob/main/skills/team/references/dependencies.md)
- [design template](https://github.com/bostonaholic/team/blob/main/skills/team/references/design-template.md)
- [structure template](https://github.com/bostonaholic/team/blob/main/skills/team/references/structure-template.md)
- [testing](https://github.com/bostonaholic/team/blob/main/skills/team/references/testing.md)
- [PRD template](https://github.com/bostonaholic/team/blob/main/skills/team/references/prd-template.md)
- [execution](https://github.com/bostonaholic/team/blob/main/skills/team/references/execution.md)
- [external data](https://github.com/bostonaholic/team/blob/main/skills/team/references/external-data.md)
- [code reviewer brief](https://github.com/bostonaholic/team/blob/main/skills/code-review/references/code-reviewer.md)
- [security reviewer brief](https://github.com/bostonaholic/team/blob/main/skills/code-review/references/security-reviewer.md)
- [documentation reviewer brief](https://github.com/bostonaholic/team/blob/main/skills/code-review/references/documentation-reviewer.md)
- [finding format](https://github.com/bostonaholic/team/blob/main/skills/code-review/references/findings.md)
- [design reviewer brief](https://github.com/bostonaholic/team/blob/main/skills/eng-design-doc-review/references/design-reviewer.md)
- [comment reviewer brief](https://github.com/bostonaholic/team/blob/main/skills/no-comments/references/reviewer.md)
