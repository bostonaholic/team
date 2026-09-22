---
title: Skills
description: "The Team plugin's skills: pipeline entry-point slash commands and standalone utilities (shipit, pr-open-comments, pr-watch-as-author, pr-watch-as-reviewer, groom-backlog, pr-cleanup, pr-verify, pr-screenshots, pr-rebase, retro, why, how, no-comments, agent-prompt), each with the skills it loads."
audience: [user, developer]
nav_order: 5
nav_label: skills
---

# Team Skills

> **The features you use.** Every entry-point skill is a slash command you can
> run (`/team`, `/team-fix`, …). There are no methodology skills: what agents
> used to preload now lives in ordinary playbooks and references they read by
> path. A principle is a guarded command — explicitly invoked, never applied by
> the model on its own — that a consuming procedure reads by installed path.
>
> **Source of truth:** the skill bodies themselves, `skills/*/SKILL.md`.
> This page is a hand-maintained reference. When it disagrees with a
> `SKILL.md`, the `SKILL.md` wins.

Each entry starts with one sentence copied from that skill's frontmatter
`description`. `**Uses:**` lists the skills this skill consumes: the ones it
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
graph. `team-implement` loads `team-pr`, which loads `pr-screenshots`. None of
the three loads back. `**Uses:** None` marks a
leaf with no further consumption.

References are collected across every `.md` file in the skill's directory, so a
reference written in a `references/` file counts the same as one in `SKILL.md`.
This page carries both directions of each skill-to-skill edge.
For what separates a load from a citation, and for how a skill is loaded, see
[architecture.md §6](architecture.md#6-skills).

The catalog has 27 registered skills, all commands. The six shared principle documents, playbooks, templates, and operational rules are ordinary installed resources.
They are read at the consuming operation and add no picker entries.

## Entry-point skills

Each carries `argument-hint`, so it is a slash command, and each either kicks off a
full run or drives one phase of the QRSPI pipeline.

### [team](https://github.com/bostonaholic/team/blob/main/skills/team/SKILL.md)

Trigger on "/team" or "hey team" only.

**Used by:** None

**Uses:** `how`, `team-implement`, `team-pr`, `team-worktree`, `why`

### [team-question](https://github.com/bostonaholic/team/blob/main/skills/team-question/SKILL.md)

Trigger on "/team-question" or "decompose this task".

**Used by:** None

**Uses:** None

### [team-research](https://github.com/bostonaholic/team/blob/main/skills/team-research/SKILL.md)

Trigger on "/team-research" or "explore the codebase".

**Used by:** None

**Uses:** None

### [team-design](https://github.com/bostonaholic/team/blob/main/skills/team-design/SKILL.md)

Trigger on "/team-design" or "design this".

**Used by:** None

**Uses:** None

### [team-structure](https://github.com/bostonaholic/team/blob/main/skills/team-structure/SKILL.md)

Trigger on "/team-structure" or "break the design into steps".

**Used by:** None

**Uses:** None

### [team-plan](https://github.com/bostonaholic/team/blob/main/skills/team-plan/SKILL.md)

Trigger on "/team-plan" or "plan the implementation".

**Used by:** None

**Uses:** None

### [team-worktree](https://github.com/bostonaholic/team/blob/main/skills/team-worktree/SKILL.md)

Trigger on "/team-worktree" or "set up the worktree" only.

**Used by:** `team`, `team-fix`

**Uses:** `pr-cleanup`

### [team-implement](https://github.com/bostonaholic/team/blob/main/skills/team-implement/SKILL.md)

Trigger on "/team-implement" or "implement this" only.

**Used by:** `team`

**Uses:** `team-pr`

### [team-pr](https://github.com/bostonaholic/team/blob/main/skills/team-pr/SKILL.md)

Trigger on "/team-pr" or "open the PR" only.

**Used by:** `team`, `team-implement`

**Uses:** `pr-screenshots`

### [team-fix](https://github.com/bostonaholic/team/blob/main/skills/team-fix/SKILL.md)

Trigger on "/team-fix" or "run the bug-fix pipeline" only.

**Used by:** None

**Uses:** `pr-screenshots`, `principle-fix-root-causes`, `team-worktree`, `why`

### [eng-design-doc-review](https://github.com/bostonaholic/team/blob/main/skills/eng-design-doc-review/SKILL.md)

Trigger on "/eng-design-doc-review" or "review the design doc".

**Used by:** None

**Uses:** None

## Standalone utilities

Each carries `argument-hint` (so it is a slash command) but is **not** a
QRSPI phase: a self-contained action a user runs on demand.

### [shipit](https://github.com/bostonaholic/team/blob/main/skills/shipit/SKILL.md)

Trigger on "/shipit" or "ship it" only.

**Used by:** None

**Uses:** `version-bump`

### [version-bump](https://github.com/bostonaholic/team/blob/main/skills/version-bump/SKILL.md)

Invoke ONLY on "/version-bump" or "bump the version", including during "/shipit".

**Used by:** `shipit`

**Uses:** None

### [pr-open-comments](https://github.com/bostonaholic/team/blob/main/skills/pr-open-comments/SKILL.md)

Trigger on "/pr-open-comments" or "address PR comments" only.

**Used by:** `pr-watch-as-author`, `pr-watch-as-reviewer`

**Uses:** `pr-screenshots`

### [pr-watch-as-author](https://github.com/bostonaholic/team/blob/main/skills/pr-watch-as-author/SKILL.md)

Trigger on "/pr-watch-as-author" or "watch the PR" only.

**Used by:** None

**Uses:** `pr-open-comments`

### [pr-watch-as-reviewer](https://github.com/bostonaholic/team/blob/main/skills/pr-watch-as-reviewer/SKILL.md)

Invoke ONLY on "/pr-watch-as-reviewer" or "watch and approve".

**Used by:** None

**Uses:** `pr-open-comments`

### [groom-backlog](https://github.com/bostonaholic/team/blob/main/skills/groom-backlog/SKILL.md)

Trigger on "/groom-backlog" or "groom the backlog".

**Used by:** None

**Uses:** None

### [pr-cleanup](https://github.com/bostonaholic/team/blob/main/skills/pr-cleanup/SKILL.md)

Invoke ONLY on "/pr-cleanup", "the PR was merged", or "abandon this".

**Used by:** `pr-rebase`, `team-worktree`

**Uses:** None

### [pr-verify](https://github.com/bostonaholic/team/blob/main/skills/pr-verify/SKILL.md)

Trigger on "/pr-verify" or "verify the test plan".

**Used by:** None

**Uses:** None

### [pr-screenshots](https://github.com/bostonaholic/team/blob/main/skills/pr-screenshots/SKILL.md)

Invoke ONLY on "/pr-screenshots" or "add screenshots to a PR".

**Used by:** `pr-open-comments`, `team-fix`, `team-pr`

**Uses:** None

### [pr-rebase](https://github.com/bostonaholic/team/blob/main/skills/pr-rebase/SKILL.md)

Invoke ONLY on "/pr-rebase" or "rebase onto main".

**Used by:** None

**Uses:** `pr-cleanup`

### [retro](https://github.com/bostonaholic/team/blob/main/skills/retro/SKILL.md)

Invoke ONLY on "/retro" or "run a retro".

**Used by:** None

**Uses:** None

### [why](https://github.com/bostonaholic/team/blob/main/skills/why/SKILL.md)

Trigger on "/why" or "why does X work this way".

**Used by:** `code-review`, `how`, `team`, `team-fix`

**Uses:** `how`

### [how](https://github.com/bostonaholic/team/blob/main/skills/how/SKILL.md)

Trigger on "/how" or "how does X work".

**Used by:** `team`, `why`

**Uses:** `why`

### [code-review](https://github.com/bostonaholic/team/blob/main/skills/code-review/SKILL.md)

Trigger on "/code-review" or "review this diff".

**Used by:** None

**Uses:** `why`

### [no-comments](https://github.com/bostonaholic/team/blob/main/skills/no-comments/SKILL.md)

Invoke ONLY on "/no-comments" or "remove unnecessary comments".

**Used by:** None

**Uses:** None

### [agent-prompt](https://github.com/bostonaholic/team/blob/main/skills/agent-prompt/SKILL.md)

Trigger on "/agent-prompt" or "write an agent prompt".

**Used by:** None

**Uses:** None

## Principles

Guarded commands: an explicit invocation starts them; the model never applies
them on its own. Consuming procedures read them by installed path.

### [principle-fix-root-causes](https://github.com/bostonaholic/team/blob/main/skills/principle-fix-root-causes/SKILL.md)

Invoke ONLY on "/principle-fix-root-causes" or "find the root cause".

**Used by:** `team-fix`

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
- [code reviewer brief](https://github.com/bostonaholic/team/blob/main/skills/code-review/references/code-reviewer.md)
- [security reviewer brief](https://github.com/bostonaholic/team/blob/main/skills/code-review/references/security-reviewer.md)
- [documentation reviewer brief](https://github.com/bostonaholic/team/blob/main/skills/code-review/references/documentation-reviewer.md)
- [ux reviewer brief](https://github.com/bostonaholic/team/blob/main/skills/code-review/references/ux-reviewer.md)
- [finding format](https://github.com/bostonaholic/team/blob/main/skills/code-review/references/findings.md)
- [design reviewer brief](https://github.com/bostonaholic/team/blob/main/skills/eng-design-doc-review/references/design-reviewer.md)
- [comment reviewer brief](https://github.com/bostonaholic/team/blob/main/skills/no-comments/references/reviewer.md)
- [cross-model review](https://github.com/bostonaholic/team/blob/main/skills/team/references/cross-model-review.md)
- [agent dispatch](https://github.com/bostonaholic/team/blob/main/skills/team/references/agent-dispatch.md)
- [commit discipline](https://github.com/bostonaholic/team/blob/main/skills/team-pr/references/commit.md)
- [changelog rules](https://github.com/bostonaholic/team/blob/main/skills/team-pr/references/changelog.md)
- [tracking rules](https://github.com/bostonaholic/team/blob/main/skills/team-pr/references/tracking.md)
- [watch loop](https://github.com/bostonaholic/team/blob/main/skills/pr-watch-as-author/references/watch-loop.md)
- [worktree playbook](https://github.com/bostonaholic/team/blob/main/skills/team-worktree/playbooks/worktree.md)
- [cleanup playbook](https://github.com/bostonaholic/team/blob/main/skills/pr-cleanup/playbooks/cleanup.md)
