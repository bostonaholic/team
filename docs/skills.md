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
`description`. `**Calls:**` lists the skills it loads. `**Callers:**` lists
the inverse: skills that load it. `None` means no skill does. The load form is
``Call the Skill tool with `<name>` ``. Naming a skill another way is a
citation, not an edge. For example, `team-structure` restates a
`principle-fail-closed` rule inline but does not load it.

The edges are therefore **directed**, and reading them transitively gives the
graph. `team-implement` loads `team-pr`, which loads `git-commit`, which
loads `writing-prose`. None of the three loads back. An entry with no
`**Calls:**` block is a leaf: it loads nothing, which is the normal shape for
a `principle-*` skill and for a methodology skill that states one rule and
stops.

Loads are collected across every `.md` file in the skill's directory, so a
load written in a `references/` file counts the same as one in `SKILL.md`.
This page carries both directions of each skill-to-skill load edge.
For what separates a load from a citation, and for how a skill is loaded, see
[architecture.md §6](architecture.md#6-skills).

## Entry-point skills

Each carries `argument-hint`, so it is a slash command, and each either kicks off a
full run or drives one phase of the QRSPI pipeline.

### [team](https://github.com/bostonaholic/team/blob/main/skills/team/SKILL.md)

Runs the 8-phase QRSPI feature pipeline.

**Callers:** None

**Calls:**

- `changelog`
- `cross-model-review`
- `review-severity-tiers`
- `reviewing-designs`
- `running-quality-checks`
- `team-pr`
- `team-worktree`
- `tracking-tickets`
- `worktree-isolation`

### [team-question](https://github.com/bostonaholic/team/blob/main/skills/team-question/SKILL.md)

Decomposes a feature into task and question artifacts.

**Callers:** None

### [team-research](https://github.com/bostonaholic/team/blob/main/skills/team-research/SKILL.md)

Researches a codebase area before changes.

**Callers:** None

### [team-design](https://github.com/bostonaholic/team/blob/main/skills/team-design/SKILL.md)

Drafts and adversarially reviews a design.

**Callers:** None

**Calls:**

- `cross-model-review`
- `reviewing-designs`

### [team-structure](https://github.com/bostonaholic/team/blob/main/skills/team-structure/SKILL.md)

Breaks a reviewed design into verified slices.

**Callers:** None

### [team-plan](https://github.com/bostonaholic/team/blob/main/skills/team-plan/SKILL.md)

Produces the tactical implementation plan.

**Callers:** None

### [team-worktree](https://github.com/bostonaholic/team/blob/main/skills/team-worktree/SKILL.md)

Prepares isolated git worktrees.

**Callers:** `team`, `team-fix`, `worktree-isolation`

### [team-implement](https://github.com/bostonaholic/team/blob/main/skills/team-implement/SKILL.md)

Executes and verifies implementation slices.

**Callers:** None

**Calls:**

- `review-severity-tiers`
- `running-quality-checks`
- `team-pr`

### [team-pr](https://github.com/bostonaholic/team/blob/main/skills/team-pr/SKILL.md)

Opens a pull request after verification.

**Callers:** `team`, `team-implement`

**Calls:**

- `changelog`
- `git-commit`
- `pr-screenshots`
- `tracking-tickets`
- `verifying-ux`
- `worktree-isolation`
- `writing-prose`

### [team-fix](https://github.com/bostonaholic/team/blob/main/skills/team-fix/SKILL.md)

Runs the compressed bug-fix pipeline.

**Callers:** None

**Calls:**

- `systematic-debugging`
- `team-worktree`
- `test-driven-bug-fix`
- `tracking-tickets`
- `why`
- `worktree-isolation`

### [eng-design-doc-review](https://github.com/bostonaholic/team/blob/main/skills/eng-design-doc-review/SKILL.md)

Reviews a technical design document with fresh context.

**Callers:** None

**Calls:**

- `cross-model-review`
- `reviewing-designs`
- `writing-prose`

## Standalone utilities

Each carries `argument-hint` (so it is a slash command) but is **not** a
QRSPI phase: a self-contained action a user runs on demand.

### [shipit](https://github.com/bostonaholic/team/blob/main/skills/shipit/SKILL.md)

Lands a reviewed pull request.

**Callers:** None

### [pr-open-comments](https://github.com/bostonaholic/team/blob/main/skills/pr-open-comments/SKILL.md)

Triages unresolved PR review comments.

**Callers:** `pr-watch-as-author`

**Calls:**

- `decision-making`

### [pr-watch-as-author](https://github.com/bostonaholic/team/blob/main/skills/pr-watch-as-author/SKILL.md)

Watches an authored PR for feedback.

**Callers:** None

**Calls:**

- `pr-open-comments`
- `pr-watch-mechanics`
- `tracking-tickets`

### [pr-watch-as-reviewer](https://github.com/bostonaholic/team/blob/main/skills/pr-watch-as-reviewer/SKILL.md)

Watches a reviewed PR and approves settled feedback.

**Callers:** None

**Calls:**

- `pr-watch-mechanics`

### [groom-backlog](https://github.com/bostonaholic/team/blob/main/skills/groom-backlog/SKILL.md)

Grooms a project backlog and proposes tracker changes.

**Callers:** None

**Calls:**

- `decision-making`

### [pr-cleanup](https://github.com/bostonaholic/team/blob/main/skills/pr-cleanup/SKILL.md)

Cleans PR state.

**Callers:** None

### [pr-verify](https://github.com/bostonaholic/team/blob/main/skills/pr-verify/SKILL.md)

Verifies a PR test plan with evidence-rated verdicts.

**Callers:** None

**Calls:**

- `running-quality-checks`

### [pr-screenshots](https://github.com/bostonaholic/team/blob/main/skills/pr-screenshots/SKILL.md)

Attaches local images to a PR body.

**Callers:** `team-pr`

### [pr-rebase](https://github.com/bostonaholic/team/blob/main/skills/pr-rebase/SKILL.md)

Rebases a branch onto its base.

**Callers:** None

**Calls:**

- `running-quality-checks`

### [reflect](https://github.com/bostonaholic/team/blob/main/skills/reflect/SKILL.md)

Mines a session for durable learnings.

**Callers:** None

**Calls:**

- `running-quality-checks`

### [why](https://github.com/bostonaholic/team/blob/main/skills/why/SKILL.md)

Investigates design rationale behind code.

**Callers:** `how`, `reviewing-code`, `team-fix`

**Calls:**

- `systematic-debugging`

### [how](https://github.com/bostonaholic/team/blob/main/skills/how/SKILL.md)

Explains subsystem architecture and runtime flow.

**Callers:** None

**Calls:**

- `why`

### [code-review](https://github.com/bostonaholic/team/blob/main/skills/code-review/SKILL.md)

Reviews a diff with fresh context.

**Callers:** None

**Calls:**

- `reviewing-code`

### [no-comments](https://github.com/bostonaholic/team/blob/main/skills/no-comments/SKILL.md)

Removes low-value source comments and encodes valid constraints.

**Callers:** None

**Calls:**

- `principle-fix-root-causes`
- `principle-progress-tracking`
- `reviewing-comments`
- `running-quality-checks`

## Methodology skills

These carry no `argument-hint`. They are never invoked directly; agents load
them.

### [qrspi-workflow](https://github.com/bostonaholic/team/blob/main/skills/qrspi-workflow/SKILL.md)

Defines QRSPI phases, artifacts, gates, and state transitions.

**Callers:** None

### [artifact-frontmatter](https://github.com/bostonaholic/team/blob/main/skills/artifact-frontmatter/SKILL.md)

Defines pipeline artifact schemas.

**Callers:** None

### [researching-codebases](https://github.com/bostonaholic/team/blob/main/skills/researching-codebases/SKILL.md)

Defines evidence-only codebase research and `5-research.md`.

**Callers:** None

### [finding-files](https://github.com/bostonaholic/team/blob/main/skills/finding-files/SKILL.md)

Locates files by naming, structure, and imports.

**Callers:** None

### [decomposing-intent](https://github.com/bostonaholic/team/blob/main/skills/decomposing-intent/SKILL.md)

Defines task and question artifacts plus multi-repo detection.

**Callers:** None

**Calls:**

- `product-requirements-doc`

### [authoring-designs](https://github.com/bostonaholic/team/blob/main/skills/authoring-designs/SKILL.md)

Defines the design-document procedure.

**Callers:** None

**Calls:**

- `decision-making`
- `systems-thinking`
- `writing-prose`

### [slicing-work](https://github.com/bostonaholic/team/blob/main/skills/slicing-work/SKILL.md)

Defines vertical slices and verification checkpoints.

**Callers:** None

**Calls:**

- `decision-making`

### [planning-implementation](https://github.com/bostonaholic/team/blob/main/skills/planning-implementation/SKILL.md)

Defines the tactical plan schema.

**Callers:** None

### [reviewing-code](https://github.com/bostonaholic/team/blob/main/skills/reviewing-code/SKILL.md)

Defines adversarial code review and evidence-based findings.

**Callers:** `code-review`, `reviewing-designs`

**Calls:**

- `engineering-standards`
- `review-severity-tiers`
- `test-style`
- `why`
- `writing-prose`

### [reviewing-comments](https://github.com/bostonaholic/team/blob/main/skills/reviewing-comments/SKILL.md)

Defines fresh-context source-comment review and findings.

**Callers:** `no-comments`

**Calls:**

- `engineering-standards`

### [reviewing-designs](https://github.com/bostonaholic/team/blob/main/skills/reviewing-designs/SKILL.md)

Defines adversarial design review and verdicts.

**Callers:** `eng-design-doc-review`, `team`, `team-design`

**Calls:**

- `conventional-comments`
- `cross-model-review`
- `documenting-decisions`
- `engineering-standards`
- `reviewing-code`
- `technical-design-doc`
- `writing-prose`

### [conventional-comments](https://github.com/bostonaholic/team/blob/main/skills/conventional-comments/SKILL.md)

Defines review labels and decorations.

**Callers:** `reviewing-designs`

### [reviewing-security](https://github.com/bostonaholic/team/blob/main/skills/reviewing-security/SKILL.md)

Defines threat and OWASP review with evidence-rated findings.

**Callers:** None

### [cross-model-review](https://github.com/bostonaholic/team/blob/main/skills/cross-model-review/SKILL.md)

Runs second-vendor reviews through machine-only CLI adapters.

**Callers:** `eng-design-doc-review`, `reviewing-designs`, `team`, `team-design`

### [review-severity-tiers](https://github.com/bostonaholic/team/blob/main/skills/review-severity-tiers/SKILL.md)

Maps reviewer findings to Blocking, Major, or Minor actions.

**Callers:** `reviewing-code`, `team`, `team-implement`

### [engineering-standards](https://github.com/bostonaholic/team/blob/main/skills/engineering-standards/SKILL.md)

Defines code design, comment, and review standards.

**Callers:** `reviewing-code`, `reviewing-comments`, `reviewing-designs`

### [test-first-development](https://github.com/bostonaholic/team/blob/main/skills/test-first-development/SKILL.md)

Defines acceptance tests as the implementation scope contract.

**Callers:** None

### [test-style](https://github.com/bostonaholic/team/blob/main/skills/test-style/SKILL.md)

Defines deterministic behavioral tests and flaky-test red flags.

**Callers:** `reviewing-code`

### [test-driven-bug-fix](https://github.com/bostonaholic/team/blob/main/skills/test-driven-bug-fix/SKILL.md)

Defines reproduce-red-green-refactor bug fixes.

**Callers:** `team-fix`

**Calls:**

- `systematic-debugging`

### [solid](https://github.com/bostonaholic/team/blob/main/skills/solid/SKILL.md)

Defines SOLID design and review rules.

**Callers:** None

### [refactoring-to-patterns](https://github.com/bostonaholic/team/blob/main/skills/refactoring-to-patterns/SKILL.md)

Maps code smells to behavior-preserving refactorings.

**Callers:** None

### [implementing-slices](https://github.com/bostonaholic/team/blob/main/skills/implementing-slices/SKILL.md)

Defines test-first slice execution, commits, and review fixes.

**Callers:** None

**Calls:**

- `git-commit`
- `principle-fix-root-causes`
- `systematic-debugging`

### [systematic-debugging](https://github.com/bostonaholic/team/blob/main/skills/systematic-debugging/SKILL.md)

Defines reproduce, hypothesize, isolate, and fix workflow.

**Callers:** `implementing-slices`, `team-fix`, `test-driven-bug-fix`, `why`

### [running-quality-checks](https://github.com/bostonaholic/team/blob/main/skills/running-quality-checks/SKILL.md)

Runs project-native tests, static checks, builds, and linters.

**Callers:** `no-comments`, `pr-rebase`, `pr-verify`, `reflect`, `team`, `team-implement`

### [principle-progress-tracking](https://github.com/bostonaholic/team/blob/main/skills/principle-progress-tracking/SKILL.md)

Requires one live ledger for ordered procedures.

**Callers:** `no-comments`

### [nested-agents](https://github.com/bostonaholic/team/blob/main/skills/nested-agents/SKILL.md)

Defines safe nested-agent dispatch and fallback.

**Callers:** None

### [decision-making](https://github.com/bostonaholic/team/blob/main/skills/decision-making/SKILL.md)

Defines a decision method based on reversibility and risk.

**Callers:** `authoring-designs`, `documenting-decisions`, `groom-backlog`, `pr-open-comments`, `slicing-work`, `technical-design-doc`

### [documenting-decisions](https://github.com/bostonaholic/team/blob/main/skills/documenting-decisions/SKILL.md)

Defines ADR structure and lifecycle.

**Callers:** `reviewing-designs`

**Calls:**

- `decision-making`
- `writing-prose`

### [technical-design-doc](https://github.com/bostonaholic/team/blob/main/skills/technical-design-doc/SKILL.md)

Defines technical design sections and decision content.

**Callers:** `reviewing-designs`

**Calls:**

- `decision-making`
- `writing-prose`

### [product-requirements-doc](https://github.com/bostonaholic/team/blob/main/skills/product-requirements-doc/SKILL.md)

Defines when and how to write `3-prd.md`.

**Callers:** `decomposing-intent`

**Calls:**

- `writing-prose`

### [product-thinking](https://github.com/bostonaholic/team/blob/main/skills/product-thinking/SKILL.md)

Defines product-need lenses.

**Callers:** None

### [systems-thinking](https://github.com/bostonaholic/team/blob/main/skills/systems-thinking/SKILL.md)

Defines system-boundary, feedback, and dependency analysis.

**Callers:** `authoring-designs`

### [writing-prose](https://github.com/bostonaholic/team/blob/main/skills/writing-prose/SKILL.md)

Defines plain-language prose rules.

**Callers:** `authoring-designs`, `changelog`, `documenting-decisions`, `eng-design-doc-review`, `git-commit`, `product-requirements-doc`, `reviewing-code`, `reviewing-designs`, `team-pr`, `technical-design-doc`

### [reviewing-documentation](https://github.com/bostonaholic/team/blob/main/skills/reviewing-documentation/SKILL.md)

Defines documentation-gap review and REQUIRED/RECOMMENDED findings.

**Callers:** None

### [verifying-ux](https://github.com/bostonaholic/team/blob/main/skills/verifying-ux/SKILL.md)

Defines live application and screenshot verification.

**Callers:** `team-pr`

### [git-commit](https://github.com/bostonaholic/team/blob/main/skills/git-commit/SKILL.md)

Defines Conventional Commit subjects and safe commit procedure.

**Callers:** `implementing-slices`, `team-pr`

**Calls:**

- `writing-prose`

### [changelog](https://github.com/bostonaholic/team/blob/main/skills/changelog/SKILL.md)

Defines Keep a Changelog updates.

**Callers:** `team`, `team-pr`

**Calls:**

- `writing-prose`

### [tracking-tickets](https://github.com/bostonaholic/team/blob/main/skills/tracking-tickets/SKILL.md)

Defines tracker status transitions and closing rules.

**Callers:** `pr-watch-as-author`, `team`, `team-fix`, `team-pr`

### [worktree-isolation](https://github.com/bostonaholic/team/blob/main/skills/worktree-isolation/SKILL.md)

Defines Team worktree creation, validation, and teardown.

**Callers:** `team`, `team-fix`, `team-pr`

**Calls:**

- `team-worktree`

### [sweeping-local-state](https://github.com/bostonaholic/team/blob/main/skills/sweeping-local-state/SKILL.md)

Defines machine-local teardown.

**Callers:** None

### [pr-watch-mechanics](https://github.com/bostonaholic/team/blob/main/skills/pr-watch-mechanics/SKILL.md)

Bounded watch-loop mechanics for the pr-watch skills: cycle timing, soft cap, handoff.

**Callers:** `pr-watch-as-author`, `pr-watch-as-reviewer`

### [principle-blind-the-investigator](https://github.com/bostonaholic/team/blob/main/skills/principle-blind-the-investigator/SKILL.md)

Keeps desired outcomes out of research prompts.

**Callers:** None

### [principle-bounded-loops](https://github.com/bostonaholic/team/blob/main/skills/principle-bounded-loops/SKILL.md)

Requires explicit retry and watch limits.

**Callers:** None

### [principle-deep-agents-narrow-seams](https://github.com/bostonaholic/team/blob/main/skills/principle-deep-agents-narrow-seams/SKILL.md)

Keeps agent interfaces narrow and internal work deep.

**Callers:** None

### [principle-evidence-over-assertion](https://github.com/bostonaholic/team/blob/main/skills/principle-evidence-over-assertion/SKILL.md)

Requires evidence for claims and verdicts.

**Callers:** None

### [principle-explicit-intent](https://github.com/bostonaholic/team/blob/main/skills/principle-explicit-intent/SKILL.md)

Requires stated intent for irreversible actions.

**Callers:** None

### [principle-fail-closed](https://github.com/bostonaholic/team/blob/main/skills/principle-fail-closed/SKILL.md)

Treats unknown guarantees as failures.

**Callers:** None

### [principle-files-are-the-contract](https://github.com/bostonaholic/team/blob/main/skills/principle-files-are-the-contract/SKILL.md)

Requires durable files for cross-step state.

**Callers:** None

### [principle-fix-root-causes](https://github.com/bostonaholic/team/blob/main/skills/principle-fix-root-causes/SKILL.md)

Requires diagnosis and repair of root causes.

**Callers:** `implementing-slices`, `no-comments`

### [principle-generator-evaluator](https://github.com/bostonaholic/team/blob/main/skills/principle-generator-evaluator/SKILL.md)

Separates producers from evaluators.

**Callers:** None

### [principle-human-owns-the-ends](https://github.com/bostonaholic/team/blob/main/skills/principle-human-owns-the-ends/SKILL.md)

Reserves goals and shipping decisions for the user.

**Callers:** None

### [principle-idempotent-reruns](https://github.com/bostonaholic/team/blob/main/skills/principle-idempotent-reruns/SKILL.md)

Requires reruns to converge without duplicate effects.

**Callers:** None

### [principle-least-privilege](https://github.com/bostonaholic/team/blob/main/skills/principle-least-privilege/SKILL.md)

Limits tools, credentials, and environment to the task.

**Callers:** None

### [principle-mechanical-gates](https://github.com/bostonaholic/team/blob/main/skills/principle-mechanical-gates/SKILL.md)

Requires deterministic enforcement for reliable rules.

**Callers:** None

### [principle-never-interpolate](https://github.com/bostonaholic/team/blob/main/skills/principle-never-interpolate/SKILL.md)

Keeps external text out of shell syntax.

**Callers:** None

### [principle-non-blocking-waits](https://github.com/bostonaholic/team/blob/main/skills/principle-non-blocking-waits/SKILL.md)

Requires resumable waits for external state.

**Callers:** None

### [principle-optimization-never-dependency](https://github.com/bostonaholic/team/blob/main/skills/principle-optimization-never-dependency/SKILL.md)

Keeps optional enhancements off the correctness path.

**Callers:** None

### [principle-plan-present-wait](https://github.com/bostonaholic/team/blob/main/skills/principle-plan-present-wait/SKILL.md)

Requires a written plan and user approval before mutations.

**Callers:** None

### [principle-pre-image-first](https://github.com/bostonaholic/team/blob/main/skills/principle-pre-image-first/SKILL.md)

Requires a recoverable baseline before destructive changes.

**Callers:** None

### [principle-record-assumptions](https://github.com/bostonaholic/team/blob/main/skills/principle-record-assumptions/SKILL.md)

Records autonomous resolutions as assumptions.

**Callers:** None

### [principle-scope-fence](https://github.com/bostonaholic/team/blob/main/skills/principle-scope-fence/SKILL.md)

Restricts execution to approved scope.

**Callers:** None

### [principle-single-source-of-truth](https://github.com/bostonaholic/team/blob/main/skills/principle-single-source-of-truth/SKILL.md)

Requires one authoritative definition per rule or schema.

**Callers:** None

### [principle-skip-loudly](https://github.com/bostonaholic/team/blob/main/skills/principle-skip-loudly/SKILL.md)

Requires skipped work to be reported explicitly.

**Callers:** None

### [principle-subtract-before-you-add](https://github.com/bostonaholic/team/blob/main/skills/principle-subtract-before-you-add/SKILL.md)

Requires removal before addition.

**Callers:** None

### [principle-untrusted-input-is-data](https://github.com/bostonaholic/team/blob/main/skills/principle-untrusted-input-is-data/SKILL.md)

Treats external text as inert data.

**Callers:** None

## Name-collision pairs

Several skills and agents share a stem, which is an easy trap. The pattern
is consistent: the **skill** is the orchestrator or methodology, while the
**agent** is the specialist that does the work.

| Skill | Agent | How they differ |
|---|---|---|
| `team-research` | `researcher` | Skill dispatches the Research phase. The agent is the doer that runs the research. |
| `reviewing-code` | `code-reviewer` | Skill is the review methodology. The agent is the reviewer that applies it. |
| `reviewing-security` | `security-reviewer` | Skill is the security review methodology and severity ladder. The agent is the reviewer that applies it. |
| `reviewing-documentation` | `technical-writer` | Skill is the doc-gap review methodology and classification. The agent is the reviewer that applies it. |
| `team-question` | `questioner` | Skill drives the Question phase. The agent decomposes the intent. |
| `implementing-slices` | `implementer` | Skill is the slice-execution procedure. The agent is the specialist that executes it. |
| `verifying-ux` | `ux-reviewer` | Skill is the live-verification procedure. The agent is the tester that runs it. |
| `authoring-designs` | `design-author` | Skill is the authoring procedure and template. The agent is the author that drafts the design. |
| `finding-files` | `file-finder` | Skill is the search strategy. The agent is the locator that executes it. |
| `planning-implementation` | `planner` | Skill is the plan template and tactical rules. The agent is the engineer that writes the plan. |
| `team-design` | `design-author` | Skill drives the Design phase. The agent drafts the alignment doc. |
| `technical-design-doc` | `technical-writer` | Both contain "technical" but differ: the skill is design-doc methodology. The agent writes documentation during verify. |
| `eng-design-doc-review` | `design-author` | The review skill dispatches a read-only `Explore` subagent, **not** the `design-author` agent, which keeps the audit independent of the author. |

## See also

- **[Architecture](architecture.md)**: the design rationale behind
  skills (two flavors, three-tier discovery, load limits) in §6.
- **[Vision](vision.md)**: the loop-driven end state Team builds toward.
- **[Ethos](ethos.md)**: the principles behind the pipeline.
- **[Overview](index.md)**: the landing page and pipeline overview.
- **`skills/team/registry.json`**: the phase-tagged inventory of the 13
  specialist agents, in the source tree.
