---
title: Skills
description: "The Team plugin's skills: one pipeline entry point and standalone utilities (shipit, pr-open-comments, pr-watch-as-author, pr-watch-as-reviewer, groom-backlog, pr-cleanup, pr-verify, pr-screenshots, pr-rebase, retro, why, how, no-comments, agent-prompt), each with the skills it loads."
audience: [user, developer]
nav_order: 5
nav_label: skills
---

# Team Skills

> **The features you use.** Every entry-point skill is a slash command you can
> run (`/team`, `/how`, …). There are no methodology skills: what agents
> used to preload now lives in ordinary playbooks and references they read by
> path. A principle is a guarded command — explicitly invoked, never applied by
> the model on its own — that a consuming procedure reads by installed path.
>
> **Source of truth:** the public `skills/*/SKILL.md` files and internal `skills/team-*/WORKFLOW.md` procedures.
> This page is a hand-maintained reference. When it disagrees with a
> `SKILL.md`, the `SKILL.md` wins.

Each entry starts with one sentence copied from that skill's frontmatter
`description`. `**Uses:**` lists the skills this skill consumes: the ones it
invokes through installed skill dispatch and the ones whose `SKILL.md` its files read by
path. `**Used by:**` lists the skills that consume it. Both use
comma-separated lists, or `None`.
The load form is
``Invoke Team skill `<name>` ``. The path form is a reference to
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

The catalog has 18 registered skills and nine internal pipeline procedures. The six shared principle documents, playbooks, templates, and operational rules are ordinary installed resources.
They are read at the consuming operation and add no picker entries.

## Skills CLI installation

Install a selected command with its complete runtime through the [installation instructions](index.md#skills-cli).
Supported targets are `claude-code`, `codex`, `antigravity-cli`, and `opencode`.
`Invoke Team skill` uses native registration in plugin mode and canonical bundled paths in skills mode.
Recovery invocations appear as catalog edges. Continuation suggestions and self-resume guidance do not execute another command.
Only selected entrypoints register. Bundled siblings retain their intent gates and standalone stops.
Selection, copy/link mode, project/global listing, selected reinstall, and agent-scoped removal are upstream-owned.
Use the tested lifecycle commands in the installation instructions. `skills update` has no additional Team guarantees.
Codex native migration lists installations, removes the intended global selection with explicit `--agent codex`, then runs the native installer.
It never replaces an existing `~/.agents/skills/team` directory automatically.
CLI 1.6.0 unfiltered global removal can affect project selections. Canonical retention depends on detecting remaining hosts.
Shared canonical content can remain while another detected host uses it; resolve those intended selections before native migration.
Generated `runtime/` files belong to `bun run skills:build`; `bun run skills:check` detects stale outputs.
Edit canonical source and reinstall. Local packaged entrypoint edits stop resolution, and `/retro` skips packaged edits.

## Entry-point skills

Install `team` to run the QRSPI pipeline. Its nine phase procedures have no
`SKILL.md` and cannot be installed separately. Invoke one through
`/team phase <name> [arguments]`. Other catalog skills remain individually installable.

### [team](https://github.com/bostonaholic/team/blob/main/skills/team/SKILL.md)

Runs the 8-phase QRSPI feature pipeline, or a leading-argument route.

**Used by:** None

**Uses:** `how`, `team-implement`, `team-pr`, `team-worktree`, `why`

## Internal pipeline procedures

Included with `team`; the names below are procedure names, not installable skills.

### [team-question](https://github.com/bostonaholic/team/blob/main/skills/team-question/WORKFLOW.md)

Decomposes a feature into task and question artifacts.

**Used by:** `team-research`

**Uses:** None

### [team-research](https://github.com/bostonaholic/team/blob/main/skills/team-research/WORKFLOW.md)

Researches a codebase area before changes.

**Used by:** `team-design`

**Uses:** `team-question`

### [team-design](https://github.com/bostonaholic/team/blob/main/skills/team-design/WORKFLOW.md)

Drafts and adversarially reviews a design.

**Used by:** `eng-design-doc-review`, `team-structure`

**Uses:** `team-research`

### [team-structure](https://github.com/bostonaholic/team/blob/main/skills/team-structure/WORKFLOW.md)

Breaks a reviewed design into verified slices.

**Used by:** `team-plan`

**Uses:** `team-design`

### [team-plan](https://github.com/bostonaholic/team/blob/main/skills/team-plan/WORKFLOW.md)

Produces the tactical implementation plan.

**Used by:** `team-implement`, `team-worktree`

**Uses:** `team-structure`

### [team-worktree](https://github.com/bostonaholic/team/blob/main/skills/team-worktree/WORKFLOW.md)

Prepares isolated git worktrees.

**Used by:** `team`, `team-fix`, `team-implement`

**Uses:** `pr-cleanup`, `team-plan`

### [team-implement](https://github.com/bostonaholic/team/blob/main/skills/team-implement/WORKFLOW.md)

Executes and verifies implementation slices.

**Used by:** `team`

**Uses:** `team-plan`, `team-pr`, `team-worktree`

### [team-pr](https://github.com/bostonaholic/team/blob/main/skills/team-pr/WORKFLOW.md)

Opens PRs with project terms, evidence, and risk.

**Used by:** `team`, `team-implement`

**Uses:** `pr-screenshots`

### [team-fix](https://github.com/bostonaholic/team/blob/main/skills/team-fix/WORKFLOW.md)

Runs the compressed bug-fix pipeline.

**Used by:** None

**Uses:** `pr-screenshots`, `principle-fix-root-causes`, `team-worktree`, `why`

## Design review utility

Individually installable.

### [eng-design-doc-review](https://github.com/bostonaholic/team/blob/main/skills/eng-design-doc-review/SKILL.md)

Reviews a technical design document with fresh context.

**Used by:** None

**Uses:** `team-design`

## Standalone utilities

Each carries `argument-hint` (so it is a slash command) but is **not** a
QRSPI phase: a self-contained action a user runs on demand.

### [shipit](https://github.com/bostonaholic/team/blob/main/skills/shipit/SKILL.md)

Lands a reviewed pull request.

**Used by:** None

**Uses:** `pr-cleanup`

### [pr-open-comments](https://github.com/bostonaholic/team/blob/main/skills/pr-open-comments/SKILL.md)

Triages unresolved PR review comments.

**Used by:** `pr-watch-as-author`, `pr-watch-as-reviewer`

**Uses:** `pr-screenshots`

### [pr-watch-as-author](https://github.com/bostonaholic/team/blob/main/skills/pr-watch-as-author/SKILL.md)

Watches an authored PR for feedback.

**Used by:** None

**Uses:** `pr-open-comments`

### [pr-watch-as-reviewer](https://github.com/bostonaholic/team/blob/main/skills/pr-watch-as-reviewer/SKILL.md)

Watches a reviewed PR and approves settled feedback.

**Used by:** None

**Uses:** `pr-open-comments`

### [groom-backlog](https://github.com/bostonaholic/team/blob/main/skills/groom-backlog/SKILL.md)

Grooms a project backlog and proposes tracker changes.

**Used by:** None

**Uses:** None

### [pr-cleanup](https://github.com/bostonaholic/team/blob/main/skills/pr-cleanup/SKILL.md)

Cleans PR state.

**Used by:** `pr-rebase`, `shipit`, `team-worktree`

**Uses:** None

### [pr-verify](https://github.com/bostonaholic/team/blob/main/skills/pr-verify/SKILL.md)

Verifies a PR test plan with evidence-rated verdicts.

**Used by:** None

**Uses:** None

### [pr-screenshots](https://github.com/bostonaholic/team/blob/main/skills/pr-screenshots/SKILL.md)

Attaches local images to a PR body.

**Used by:** `pr-open-comments`, `team-fix`, `team-pr`

**Uses:** None

### [pr-rebase](https://github.com/bostonaholic/team/blob/main/skills/pr-rebase/SKILL.md)

Rebases a branch onto its base.

**Used by:** None

**Uses:** `pr-cleanup`

### [retro](https://github.com/bostonaholic/team/blob/main/skills/retro/SKILL.md)

Mines a session for durable learnings.

**Used by:** None

**Uses:** None

### [why](https://github.com/bostonaholic/team/blob/main/skills/why/SKILL.md)

Investigates design rationale behind code.

**Used by:** `code-review`, `how`, `team`, `team-fix`

**Uses:** `how`

### [how](https://github.com/bostonaholic/team/blob/main/skills/how/SKILL.md)

Explains subsystem architecture and runtime flow.

**Used by:** `team`, `why`

**Uses:** `why`

### [code-review](https://github.com/bostonaholic/team/blob/main/skills/code-review/SKILL.md)

Reviews a diff with fresh context.

**Used by:** None

**Uses:** `why`

### [no-comments](https://github.com/bostonaholic/team/blob/main/skills/no-comments/SKILL.md)

Removes low-value source comments and encodes valid constraints.

**Used by:** None

**Uses:** None

### [agent-prompt](https://github.com/bostonaholic/team/blob/main/skills/agent-prompt/SKILL.md)

Composes an agent-optimized prompt for a task.

**Used by:** None

**Uses:** None

## Principles

Guarded commands: an explicit invocation starts them; the model never applies
them on its own. Consuming procedures read them by installed path.

### [principle-fix-root-causes](https://github.com/bostonaholic/team/blob/main/skills/principle-fix-root-causes/SKILL.md)

Requires diagnosis and repair of root causes.

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
