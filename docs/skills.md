---
title: Skills
description: "The Team plugin's skills: the pipeline entry-point slash commands, the bug-fix pipeline, and the setup migration, each with the skills it loads."
audience: [user, developer]
nav_order: 5
nav_label: skills
---

# Team Skills

> **The features you use.** Every entry-point skill is a slash command you can
> run (`/team`, `/team-fix`, …). There are no methodology skills: what agents
> used to preload now lives in ordinary playbooks and references they read by
> path.
>
> **Source of truth:** the skill bodies themselves, `skills/*/SKILL.md`.
> This page is a hand-maintained reference. When it disagrees with a
> `SKILL.md`, the `SKILL.md` wins.

Each entry starts with a short user-facing description of what the skill
does, maintained separately from its invocation metadata. `**Uses:**` lists
the skills this skill consumes: the ones it
loads through the Skill tool and the ones whose `SKILL.md` its files read by
path. `**Used by:**` lists the skills that consume it. Both use
comma-separated lists, or `None`.
The load form is
``Call the Skill tool with `<name>` ``. The path form is a reference to
`<name>/SKILL.md`, relative or root-relative. A reference to any other file in
a skill's directory is neither a load nor a use, and neither is a reference
that only locates a skill's install directory — "the directory containing
`skills/<name>/SKILL.md`" names a location, not the skill.

The edges are therefore **directed**, and reading them transitively gives the
graph. `team-implement` loads `team-pr`. Neither loads back.
`**Uses:** None` marks a
leaf with no further consumption.

References are collected across every `.md` file in the skill's directory, so a
reference written in a `references/` file counts the same as one in `SKILL.md`.
This page carries both directions of each skill-to-skill edge.
For what separates a load from a citation, and for how a skill is loaded, see
[architecture.md §6](architecture.md#6-skills).

The catalog has 11 registered skills, all commands. The six shared principle documents, playbooks, templates, and operational rules are ordinary installed resources.
They are read at the consuming operation and add no picker entries.

Skills outside the pipeline moved out of Team; see [Skills that moved](index.md#skills-that-moved).

## Entry-point skills

Each carries `argument-hint`, so it is a slash command, and each either kicks off a
full run or drives one phase of the QRSPI pipeline.

### [team](https://github.com/bostonaholic/team/blob/main/skills/team/SKILL.md)

Runs the 8-phase QRSPI feature pipeline, or a leading-argument route.

**Used by:** None

**Uses:** `team-implement`, `team-pr`, `team-worktree`

### [team-question](https://github.com/bostonaholic/team/blob/main/skills/team-question/SKILL.md)

Decomposes a feature into task and question artifacts.

**Used by:** None

**Uses:** None

### [team-research](https://github.com/bostonaholic/team/blob/main/skills/team-research/SKILL.md)

Researches a codebase area before changes.

**Used by:** None

**Uses:** None

### [team-design](https://github.com/bostonaholic/team/blob/main/skills/team-design/SKILL.md)

Drafts and adversarially reviews a design.

**Used by:** None

**Uses:** None

### [team-structure](https://github.com/bostonaholic/team/blob/main/skills/team-structure/SKILL.md)

Breaks a reviewed design into verified slices.

**Used by:** None

**Uses:** None

### [team-plan](https://github.com/bostonaholic/team/blob/main/skills/team-plan/SKILL.md)

Produces the tactical implementation plan.

**Used by:** None

**Uses:** None

### [team-worktree](https://github.com/bostonaholic/team/blob/main/skills/team-worktree/SKILL.md)

Prepares isolated git worktrees.

**Used by:** `team`, `team-fix`

**Uses:** None

### [team-implement](https://github.com/bostonaholic/team/blob/main/skills/team-implement/SKILL.md)

Executes and verifies implementation slices.

**Used by:** `team`

**Uses:** `team-pr`

### [team-pr](https://github.com/bostonaholic/team/blob/main/skills/team-pr/SKILL.md)

Opens PRs with project terms, evidence, and risk.

**Used by:** `team`, `team-implement`

**Uses:** None

### [team-fix](https://github.com/bostonaholic/team/blob/main/skills/team-fix/SKILL.md)

Runs the compressed bug-fix pipeline.

**Used by:** None

**Uses:** `team-worktree`

## Setup migration

An explicit-only command that changes the user's agent setup rather than a
repository.

### [team-migrate](https://github.com/bostonaholic/team/blob/main/skills/team-migrate/SKILL.md)

Moves a machine set up before v0.147.0 onto the Team and bostonaholic/skills
plugins in every harness, with no moved skill missing or shown twice.

**Used by:** None

**Uses:** None

## Prose composition and evaluation

The [writing standards](https://github.com/bostonaholic/team/blob/main/skills/team/references/writing.md)
reference protects exact text and semantic force, scans the untouched draft,
and records the applicable checklist before style edits. It then resolves every
recorded match, rescans, and self-audits meaning and protected text.

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
| `team-design` | `design-author` | Skill drives the Design phase. The agent drafts the alignment doc. |

## See also

- **[Architecture](architecture.md)**: the design rationale behind
  skills (two flavors, three-tier discovery, load limits) in §6.
- **[Vision](vision.md)**: the loop-driven end state Team builds toward.
- **[Ethos](ethos.md)**: the principles behind the pipeline.
- **[Overview](index.md)**: the landing page and pipeline overview.
- **`skills/team/registry.json`**: the phase-tagged inventory of the 13
  specialist agents, in the source tree.

## Shared principle resources

Read these ordinary documents at their consuming step. They add no registrations or picker entries.

- [bug fix](https://github.com/bostonaholic/team/blob/main/skills/team-fix/playbooks/bug-fix.md)
- [bug diagnosis](https://github.com/bostonaholic/team/blob/main/skills/team-fix/references/diagnosis.md)
- [boil the ocean](https://github.com/bostonaholic/team/blob/main/skills/team/principles/boil-the-ocean.md)
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
- [verify playbook](https://github.com/bostonaholic/team/blob/main/skills/team/playbooks/verify.md)
- [decisions](https://github.com/bostonaholic/team/blob/main/skills/team/references/decisions.md)
- [dependencies](https://github.com/bostonaholic/team/blob/main/skills/team/references/dependencies.md)
- [code standards](https://github.com/bostonaholic/team/blob/main/skills/team/references/code-standards.md)
- [writing standards](https://github.com/bostonaholic/team/blob/main/skills/team/references/writing.md)
- [design template](https://github.com/bostonaholic/team/blob/main/skills/team/references/design-template.md)
- [structure template](https://github.com/bostonaholic/team/blob/main/skills/team/references/structure-template.md)
- [testing](https://github.com/bostonaholic/team/blob/main/skills/team/references/testing.md)
- [PRD template](https://github.com/bostonaholic/team/blob/main/skills/team/references/prd-template.md)
- [execution](https://github.com/bostonaholic/team/blob/main/skills/team/references/execution.md)
- [external data](https://github.com/bostonaholic/team/blob/main/skills/team/references/external-data.md)
- [code reviewer brief](https://github.com/bostonaholic/team/blob/main/skills/team/references/code-reviewer.md)
- [security reviewer brief](https://github.com/bostonaholic/team/blob/main/skills/team/references/security-reviewer.md)
- [documentation reviewer brief](https://github.com/bostonaholic/team/blob/main/skills/team/references/documentation-reviewer.md)
- [ux reviewer brief](https://github.com/bostonaholic/team/blob/main/skills/team/references/ux-reviewer.md)
- [finding format](https://github.com/bostonaholic/team/blob/main/skills/team/references/findings.md)
- [design reviewer brief](https://github.com/bostonaholic/team/blob/main/skills/team/references/design-reviewer.md)
- [cross-model review](https://github.com/bostonaholic/team/blob/main/skills/team/references/cross-model-review.md)
- [agent dispatch](https://github.com/bostonaholic/team/blob/main/skills/team/references/agent-dispatch.md)
- [commit discipline](https://github.com/bostonaholic/team/blob/main/skills/team-pr/references/commit.md)
- [changelog rules](https://github.com/bostonaholic/team/blob/main/skills/team-pr/references/changelog.md)
- [tracking rules](https://github.com/bostonaholic/team/blob/main/skills/team-pr/references/tracking.md)
- [worktree playbook](https://github.com/bostonaholic/team/blob/main/skills/team-worktree/playbooks/worktree.md)
- [provisioned-resource teardown](https://github.com/bostonaholic/team/blob/main/skills/team-worktree/playbooks/provisioned-teardown.md)
- [screenshot upload rules](https://github.com/bostonaholic/team/blob/main/skills/team-pr/references/screenshot-rules.md)
