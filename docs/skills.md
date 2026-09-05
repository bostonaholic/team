---
title: Skills
description: "The Team plugin's skills: pipeline entry-point slash commands, standalone utilities (shipit, pr-open-comments, pr-watch-as-author, pr-watch-as-reviewer, groom-backlog, pr-cleanup, pr-verify, pr-rebase, reflect, why, how), and methodology skills loaded by agents, each with the skills it mentions."
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

Each entry is one sentence, copied from that skill's frontmatter
`description`. A `**Mentions:**` list follows it when the skill's own `.md`
files name other skills — a load, a citation, and a passing mention alike.
For what separates a load from a citation, and for how a skill is loaded at
all, see [architecture.md §6](architecture.md#6-skills).

## Entry-point skills

Each carries `argument-hint`, so it is a slash command, and each either kicks off a
full run or drives one phase of the QRSPI pipeline.

### [team](https://github.com/bostonaholic/team/blob/main/skills/team/SKILL.md)

Runs the 8-phase QRSPI feature pipeline.

**Mentions:**

- `artifact-frontmatter`
- `changelog`
- `cross-model-review`
- `principle-deep-agents-narrow-seams`
- `principle-fail-closed`
- `principle-files-are-the-contract`
- `principle-idempotent-reruns`
- `principle-progress-tracking`
- `qrspi-workflow`
- `review-severity-tiers`
- `reviewing-designs`
- `running-quality-checks`
- `team-implement`
- `team-pr`
- `team-worktree`
- `tracking-tickets`
- `worktree-isolation`

### [team-question](https://github.com/bostonaholic/team/blob/main/skills/team-question/SKILL.md)

Decomposes a feature into task and question artifacts.

**Mentions:**

- `decomposing-intent`
- `product-requirements-doc`
- `qrspi-workflow`

### [team-research](https://github.com/bostonaholic/team/blob/main/skills/team-research/SKILL.md)

Researches a codebase area before changes.

**Mentions:**

- `team`

### [team-design](https://github.com/bostonaholic/team/blob/main/skills/team-design/SKILL.md)

Drafts and adversarially reviews a design.

**Mentions:**

- `artifact-frontmatter`
- `cross-model-review`
- `principle-fail-closed`
- `principle-idempotent-reruns`
- `reviewing-designs`
- `team`

### [team-structure](https://github.com/bostonaholic/team/blob/main/skills/team-structure/SKILL.md)

Breaks a reviewed design into verified slices.

**Mentions:**

- `principle-fail-closed`
- `team`

### [team-plan](https://github.com/bostonaholic/team/blob/main/skills/team-plan/SKILL.md)

Produces the tactical implementation plan.

**Mentions:**

- `team`

### [team-worktree](https://github.com/bostonaholic/team/blob/main/skills/team-worktree/SKILL.md)

Prepares isolated git worktrees.

**Mentions:**

- `qrspi-workflow`
- `team`
- `worktree-isolation`

### [team-implement](https://github.com/bostonaholic/team/blob/main/skills/team-implement/SKILL.md)

Executes and verifies implementation slices.

**Mentions:**

- `artifact-frontmatter`
- `principle-progress-tracking`
- `review-severity-tiers`
- `running-quality-checks`
- `team`
- `team-pr`

### [team-pr](https://github.com/bostonaholic/team/blob/main/skills/team-pr/SKILL.md)

Opens a pull request after verification.

**Mentions:**

- `changelog`
- `git-commit`
- `principle-optimization-never-dependency`
- `team`
- `tracking-tickets`
- `verifying-ux`
- `worktree-isolation`
- `writing-prose`

### [team-fix](https://github.com/bostonaholic/team/blob/main/skills/team-fix/SKILL.md)

Runs the compressed bug-fix pipeline.

**Mentions:**

- `principle-explicit-intent`
- `principle-fix-root-causes`
- `principle-progress-tracking`
- `systematic-debugging`
- `team-worktree`
- `test-driven-bug-fix`
- `tracking-tickets`
- `why`
- `worktree-isolation`

### [eng-design-doc-review](https://github.com/bostonaholic/team/blob/main/skills/eng-design-doc-review/SKILL.md)

Reviews a technical design document with fresh context.

**Mentions:**

- `cross-model-review`
- `principle-generator-evaluator`
- `principle-least-privilege`
- `reviewing-designs`
- `team`
- `writing-prose`

## Standalone utilities

Each carries `argument-hint` (so it is a slash command) but is **not** a
QRSPI phase: a self-contained action a user runs on demand.

### [shipit](https://github.com/bostonaholic/team/blob/main/skills/shipit/SKILL.md)

Lands a reviewed pull request.

**Mentions:**

- `principle-explicit-intent`
- `principle-non-blocking-waits`

### [pr-open-comments](https://github.com/bostonaholic/team/blob/main/skills/pr-open-comments/SKILL.md)

Triages unresolved PR review comments.

**Mentions:**

- `principle-evidence-over-assertion`
- `principle-plan-present-wait`

### [pr-watch-as-author](https://github.com/bostonaholic/team/blob/main/skills/pr-watch-as-author/SKILL.md)

Watches an authored PR for feedback.

**Mentions:**

- `pr-open-comments`
- `principle-bounded-loops`
- `principle-idempotent-reruns`
- `principle-non-blocking-waits`
- `principle-untrusted-input-is-data`
- `tracking-tickets`

### [pr-watch-as-reviewer](https://github.com/bostonaholic/team/blob/main/skills/pr-watch-as-reviewer/SKILL.md)

Watches a reviewed PR and approves settled feedback.

**Mentions:**

- `conventional-comments`
- `pr-open-comments`
- `pr-watch-as-author`
- `principle-bounded-loops`
- `principle-generator-evaluator`
- `principle-non-blocking-waits`

### [groom-backlog](https://github.com/bostonaholic/team/blob/main/skills/groom-backlog/SKILL.md)

Grooms a project backlog and proposes tracker changes.

**Mentions:**

- `pr-open-comments`
- `principle-evidence-over-assertion`
- `principle-explicit-intent`
- `principle-idempotent-reruns`
- `principle-never-interpolate`
- `principle-plan-present-wait`
- `principle-pre-image-first`
- `principle-skip-loudly`
- `principle-untrusted-input-is-data`

### [pr-cleanup](https://github.com/bostonaholic/team/blob/main/skills/pr-cleanup/SKILL.md)

Cleans PR state.

**Mentions:**

- `principle-explicit-intent`
- `principle-idempotent-reruns`
- `principle-never-interpolate`
- `principle-untrusted-input-is-data`
- `sweeping-local-state`

### [pr-verify](https://github.com/bostonaholic/team/blob/main/skills/pr-verify/SKILL.md)

Verifies a PR test plan with evidence-rated verdicts.

**Mentions:**

- `nested-agents`
- `principle-evidence-over-assertion`
- `principle-least-privilege`
- `principle-optimization-never-dependency`
- `running-quality-checks`

### [pr-rebase](https://github.com/bostonaholic/team/blob/main/skills/pr-rebase/SKILL.md)

Rebases a branch onto its base.

**Mentions:**

- `artifact-frontmatter`
- `pr-cleanup`
- `principle-explicit-intent`
- `principle-never-interpolate`
- `principle-pre-image-first`
- `principle-untrusted-input-is-data`
- `running-quality-checks`

### [reflect](https://github.com/bostonaholic/team/blob/main/skills/reflect/SKILL.md)

Mines a session for durable learnings.

**Mentions:**

- `finding-files`
- `nested-agents`
- `principle-explicit-intent`
- `principle-least-privilege`
- `principle-optimization-never-dependency`
- `principle-plan-present-wait`
- `principle-pre-image-first`
- `principle-untrusted-input-is-data`
- `running-quality-checks`

### [why](https://github.com/bostonaholic/team/blob/main/skills/why/SKILL.md)

Investigates design rationale behind code.

**Mentions:**

- `documenting-decisions`
- `how`
- `principle-blind-the-investigator`
- `principle-evidence-over-assertion`
- `principle-optimization-never-dependency`
- `principle-skip-loudly`
- `principle-untrusted-input-is-data`
- `systematic-debugging`

### [how](https://github.com/bostonaholic/team/blob/main/skills/how/SKILL.md)

Explains subsystem architecture and runtime flow.

**Mentions:**

- `code-review`
- `principle-generator-evaluator`
- `principle-optimization-never-dependency`
- `researching-codebases`
- `why`

### [code-review](https://github.com/bostonaholic/team/blob/main/skills/code-review/SKILL.md)

Reviews a diff with fresh context.

**Mentions:**

- `reviewing-code`

## Methodology skills

These carry no `argument-hint`. They are never invoked directly; agents load
them.

### [qrspi-workflow](https://github.com/bostonaholic/team/blob/main/skills/qrspi-workflow/SKILL.md)

Defines QRSPI phases, artifacts, gates, and state transitions.

**Mentions:**

- `artifact-frontmatter`
- `principle-blind-the-investigator`
- `principle-files-are-the-contract`
- `principle-human-owns-the-ends`
- `principle-mechanical-gates`
- `principle-scope-fence`
- `principle-single-source-of-truth`
- `review-severity-tiers`
- `slicing-work`
- `team`
- `worktree-isolation`

### [artifact-frontmatter](https://github.com/bostonaholic/team/blob/main/skills/artifact-frontmatter/SKILL.md)

Defines pipeline artifact schemas.

**Mentions:**

- `principle-files-are-the-contract`
- `principle-single-source-of-truth`
- `product-requirements-doc`
- `qrspi-workflow`
- `worktree-isolation`

### [researching-codebases](https://github.com/bostonaholic/team/blob/main/skills/researching-codebases/SKILL.md)

Defines evidence-only codebase research and `5-research.md`.

**Mentions:**

- `principle-blind-the-investigator`
- `principle-evidence-over-assertion`

### [finding-files](https://github.com/bostonaholic/team/blob/main/skills/finding-files/SKILL.md)

Locates files by naming, structure, and imports.

### [decomposing-intent](https://github.com/bostonaholic/team/blob/main/skills/decomposing-intent/SKILL.md)

Defines task and question artifacts plus multi-repo detection.

**Mentions:**

- `artifact-frontmatter`
- `principle-blind-the-investigator`
- `principle-never-interpolate`
- `principle-record-assumptions`
- `product-requirements-doc`

### [authoring-designs](https://github.com/bostonaholic/team/blob/main/skills/authoring-designs/SKILL.md)

Defines the design-document procedure.

**Mentions:**

- `artifact-frontmatter`
- `how`
- `principle-record-assumptions`
- `product-requirements-doc`
- `systems-thinking`
- `why`
- `writing-prose`

### [slicing-work](https://github.com/bostonaholic/team/blob/main/skills/slicing-work/SKILL.md)

Defines vertical slices and verification checkpoints.

### [planning-implementation](https://github.com/bostonaholic/team/blob/main/skills/planning-implementation/SKILL.md)

Defines the tactical plan schema.

### [reviewing-code](https://github.com/bostonaholic/team/blob/main/skills/reviewing-code/SKILL.md)

Defines adversarial code review and evidence-based findings.

**Mentions:**

- `conventional-comments`
- `cross-model-review`
- `engineering-standards`
- `principle-generator-evaluator`
- `principle-least-privilege`
- `principle-skip-loudly`
- `review-severity-tiers`
- `reviewing-security`
- `solid`
- `test-style`
- `why`
- `writing-prose`

### [reviewing-designs](https://github.com/bostonaholic/team/blob/main/skills/reviewing-designs/SKILL.md)

Defines adversarial design review and verdicts.

**Mentions:**

- `conventional-comments`
- `cross-model-review`
- `documenting-decisions`
- `eng-design-doc-review`
- `engineering-standards`
- `reviewing-code`
- `team`
- `technical-design-doc`
- `writing-prose`

### [conventional-comments](https://github.com/bostonaholic/team/blob/main/skills/conventional-comments/SKILL.md)

Defines review labels and decorations.

### [reviewing-security](https://github.com/bostonaholic/team/blob/main/skills/reviewing-security/SKILL.md)

Defines threat and OWASP review with evidence-rated findings.

### [cross-model-review](https://github.com/bostonaholic/team/blob/main/skills/cross-model-review/SKILL.md)

Runs second-vendor reviews through machine-only CLI adapters.

**Mentions:**

- `artifact-frontmatter`
- `nested-agents`
- `principle-least-privilege`
- `principle-never-interpolate`
- `principle-non-blocking-waits`
- `principle-optimization-never-dependency`
- `principle-single-source-of-truth`
- `principle-skip-loudly`
- `principle-untrusted-input-is-data`
- `review-severity-tiers`
- `reviewing-code`
- `team`

### [review-severity-tiers](https://github.com/bostonaholic/team/blob/main/skills/review-severity-tiers/SKILL.md)

Maps reviewer findings to Blocking, Major, or Minor actions.

**Mentions:**

- `principle-human-owns-the-ends`
- `reviewing-code`

### [engineering-standards](https://github.com/bostonaholic/team/blob/main/skills/engineering-standards/SKILL.md)

Defines code design, comment, and review standards.

**Mentions:**

- `conventional-comments`
- `solid`

### [test-first-development](https://github.com/bostonaholic/team/blob/main/skills/test-first-development/SKILL.md)

Defines acceptance tests as the implementation scope contract.

**Mentions:**

- `principle-mechanical-gates`
- `principle-scope-fence`
- `test-style`

### [test-style](https://github.com/bostonaholic/team/blob/main/skills/test-style/SKILL.md)

Defines deterministic behavioral tests and flaky-test red flags.

**Mentions:**

- `reviewing-code`
- `test-first-development`

### [test-driven-bug-fix](https://github.com/bostonaholic/team/blob/main/skills/test-driven-bug-fix/SKILL.md)

Defines reproduce-red-green-refactor bug fixes.

**Mentions:**

- `principle-fix-root-causes`
- `systematic-debugging`

### [solid](https://github.com/bostonaholic/team/blob/main/skills/solid/SKILL.md)

Defines SOLID design and review rules.

### [refactoring-to-patterns](https://github.com/bostonaholic/team/blob/main/skills/refactoring-to-patterns/SKILL.md)

Maps code smells to behavior-preserving refactorings.

### [implementing-slices](https://github.com/bostonaholic/team/blob/main/skills/implementing-slices/SKILL.md)

Defines test-first slice execution, commits, and review fixes.

**Mentions:**

- `git-commit`
- `principle-fix-root-causes`
- `principle-scope-fence`
- `systematic-debugging`

### [systematic-debugging](https://github.com/bostonaholic/team/blob/main/skills/systematic-debugging/SKILL.md)

Defines reproduce, hypothesize, isolate, and fix workflow.

**Mentions:**

- `principle-fix-root-causes`
- `test-driven-bug-fix`
- `why`

### [running-quality-checks](https://github.com/bostonaholic/team/blob/main/skills/running-quality-checks/SKILL.md)

Runs project-native tests, static checks, builds, and linters.

### [principle-progress-tracking](https://github.com/bostonaholic/team/blob/main/skills/principle-progress-tracking/SKILL.md)

Requires one live ledger for ordered procedures.

**Mentions:**

- `qrspi-workflow`
- `team-fix`

### [nested-agents](https://github.com/bostonaholic/team/blob/main/skills/nested-agents/SKILL.md)

Defines safe nested-agent dispatch and fallback.

**Mentions:**

- `cross-model-review`
- `principle-blind-the-investigator`
- `principle-deep-agents-narrow-seams`
- `principle-fail-closed`
- `principle-generator-evaluator`
- `principle-optimization-never-dependency`
- `principle-record-assumptions`
- `systems-thinking`

### [documenting-decisions](https://github.com/bostonaholic/team/blob/main/skills/documenting-decisions/SKILL.md)

Defines ADR structure and lifecycle.

**Mentions:**

- `writing-prose`

### [technical-design-doc](https://github.com/bostonaholic/team/blob/main/skills/technical-design-doc/SKILL.md)

Defines technical design sections and decision content.

**Mentions:**

- `writing-prose`

### [product-requirements-doc](https://github.com/bostonaholic/team/blob/main/skills/product-requirements-doc/SKILL.md)

Defines when and how to write `3-prd.md`.

**Mentions:**

- `writing-prose`

### [product-thinking](https://github.com/bostonaholic/team/blob/main/skills/product-thinking/SKILL.md)

Defines product-need lenses.

### [systems-thinking](https://github.com/bostonaholic/team/blob/main/skills/systems-thinking/SKILL.md)

Defines system-boundary, feedback, and dependency analysis.

**Mentions:**

- `reviewing-code`

### [writing-prose](https://github.com/bostonaholic/team/blob/main/skills/writing-prose/SKILL.md)

Defines plain-language prose rules.

**Mentions:**

- `conventional-comments`
- `reviewing-documentation`

### [reviewing-documentation](https://github.com/bostonaholic/team/blob/main/skills/reviewing-documentation/SKILL.md)

Defines documentation-gap review and REQUIRED/RECOMMENDED findings.

**Mentions:**

- `writing-prose`

### [verifying-ux](https://github.com/bostonaholic/team/blob/main/skills/verifying-ux/SKILL.md)

Defines live application and screenshot verification.

**Mentions:**

- `team-pr`

### [git-commit](https://github.com/bostonaholic/team/blob/main/skills/git-commit/SKILL.md)

Defines Conventional Commit subjects and safe commit procedure.

**Mentions:**

- `writing-prose`

### [changelog](https://github.com/bostonaholic/team/blob/main/skills/changelog/SKILL.md)

Defines Keep a Changelog updates.

**Mentions:**

- `writing-prose`

### [tracking-tickets](https://github.com/bostonaholic/team/blob/main/skills/tracking-tickets/SKILL.md)

Defines tracker status transitions and closing rules.

### [worktree-isolation](https://github.com/bostonaholic/team/blob/main/skills/worktree-isolation/SKILL.md)

Defines Team worktree creation, validation, and teardown.

**Mentions:**

- `pr-cleanup`
- `sweeping-local-state`
- `team-worktree`

### [sweeping-local-state](https://github.com/bostonaholic/team/blob/main/skills/sweeping-local-state/SKILL.md)

Defines machine-local teardown.

**Mentions:**

- `pr-cleanup`
- `principle-never-interpolate`
- `principle-skip-loudly`
- `worktree-isolation`

### [pr-watch-mechanics](https://github.com/bostonaholic/team/blob/main/skills/pr-watch-mechanics/SKILL.md)

- **Purpose:** Bounded watch-loop mechanics shared by the two PR watch
  skills — cycle timing, the soft cap, and the handoff. A consuming skill
  owns what each cycle *does*; this skill owns how the loop is paced,
  bounded, and ended.
- **Loaded by:** `pr-watch-as-author` (bounded-cycle-mechanics reference)
  and `pr-watch-as-reviewer` (bounded-cycle-mechanics reference).
- **Key behaviors:** A consumer binds three slots and nothing else: its
  poll command, its cycle-0 subject (what an already-satisfied condition
  at arm time means for it), and its handoff state (the fields its
  handoff prints). Cycle 0 polls immediately. Each later cycle is one
  backgrounded Bash call — `sleep 1860; <the poll command>`, run with
  `run_in_background: true` per `principle-non-blocking-waits` — so the
  cycle costs one turn. **Soft cap: 3 cycles (~90 minutes).** At cycle 3,
  if nothing has stopped the loop already, the interactive session ends
  rather than sleeping again, printing a handoff — the consumer's handoff
  state plus the exact command to resume the watch as the scheduled
  `~/dotfiles/bin/pr-watch.sh` launchd job. Re-arming the interactive loop
  happens only on explicit user request; the loop never re-arms itself.
  The bound is the invariant, not the interval, per
  `principle-bounded-loops`: a harness with no background execution
  chunks the wait into foreground sleeps under its own ceiling, holding
  the cycle count. Three stop conditions are loop mechanics this skill
  owns, each reported by name — user interrupt, the 3-cycle soft cap, and
  3 consecutive poll failures — and a consumer adds its own terminal
  conditions (an approval, a merge or close, a gate-specific state)
  without restating these three.

### [principle-blind-the-investigator](https://github.com/bostonaholic/team/blob/main/skills/principle-blind-the-investigator/SKILL.md)

Keeps desired outcomes out of research prompts.

**Mentions:**

- `principle-generator-evaluator`

### [principle-bounded-loops](https://github.com/bostonaholic/team/blob/main/skills/principle-bounded-loops/SKILL.md)

Requires explicit retry and watch limits.

### [principle-deep-agents-narrow-seams](https://github.com/bostonaholic/team/blob/main/skills/principle-deep-agents-narrow-seams/SKILL.md)

Keeps agent interfaces narrow and internal work deep.

### [principle-evidence-over-assertion](https://github.com/bostonaholic/team/blob/main/skills/principle-evidence-over-assertion/SKILL.md)

Requires evidence for claims and verdicts.

### [principle-explicit-intent](https://github.com/bostonaholic/team/blob/main/skills/principle-explicit-intent/SKILL.md)

Requires stated intent for irreversible actions.

### [principle-fail-closed](https://github.com/bostonaholic/team/blob/main/skills/principle-fail-closed/SKILL.md)

Treats unknown guarantees as failures.

**Mentions:**

- `principle-optimization-never-dependency`

### [principle-files-are-the-contract](https://github.com/bostonaholic/team/blob/main/skills/principle-files-are-the-contract/SKILL.md)

Requires durable files for cross-step state.

### [principle-fix-root-causes](https://github.com/bostonaholic/team/blob/main/skills/principle-fix-root-causes/SKILL.md)

Requires diagnosis and repair of root causes.

### [principle-generator-evaluator](https://github.com/bostonaholic/team/blob/main/skills/principle-generator-evaluator/SKILL.md)

Separates producers from evaluators.

**Mentions:**

- `reviewing-code`

### [principle-human-owns-the-ends](https://github.com/bostonaholic/team/blob/main/skills/principle-human-owns-the-ends/SKILL.md)

Reserves goals and shipping decisions for the user.

### [principle-idempotent-reruns](https://github.com/bostonaholic/team/blob/main/skills/principle-idempotent-reruns/SKILL.md)

Requires reruns to converge without duplicate effects.

### [principle-least-privilege](https://github.com/bostonaholic/team/blob/main/skills/principle-least-privilege/SKILL.md)

Limits tools, credentials, and environment to the task.

### [principle-mechanical-gates](https://github.com/bostonaholic/team/blob/main/skills/principle-mechanical-gates/SKILL.md)

Requires deterministic enforcement for reliable rules.

### [principle-never-interpolate](https://github.com/bostonaholic/team/blob/main/skills/principle-never-interpolate/SKILL.md)

Keeps external text out of shell syntax.

### [principle-non-blocking-waits](https://github.com/bostonaholic/team/blob/main/skills/principle-non-blocking-waits/SKILL.md)

Requires resumable waits for external state.

**Mentions:**

- `principle-bounded-loops`

### [principle-optimization-never-dependency](https://github.com/bostonaholic/team/blob/main/skills/principle-optimization-never-dependency/SKILL.md)

Keeps optional enhancements off the correctness path.

**Mentions:**

- `principle-fail-closed`
- `principle-skip-loudly`

### [principle-plan-present-wait](https://github.com/bostonaholic/team/blob/main/skills/principle-plan-present-wait/SKILL.md)

Requires a written plan and user approval before mutations.

### [principle-pre-image-first](https://github.com/bostonaholic/team/blob/main/skills/principle-pre-image-first/SKILL.md)

Requires a recoverable baseline before destructive changes.

**Mentions:**

- `principle-idempotent-reruns`

### [principle-record-assumptions](https://github.com/bostonaholic/team/blob/main/skills/principle-record-assumptions/SKILL.md)

Records autonomous resolutions as assumptions.

### [principle-scope-fence](https://github.com/bostonaholic/team/blob/main/skills/principle-scope-fence/SKILL.md)

Restricts execution to approved scope.

**Mentions:**

- `principle-skip-loudly`

### [principle-single-source-of-truth](https://github.com/bostonaholic/team/blob/main/skills/principle-single-source-of-truth/SKILL.md)

Requires one authoritative definition per rule or schema.

### [principle-skip-loudly](https://github.com/bostonaholic/team/blob/main/skills/principle-skip-loudly/SKILL.md)

Requires skipped work to be reported explicitly.

### [principle-subtract-before-you-add](https://github.com/bostonaholic/team/blob/main/skills/principle-subtract-before-you-add/SKILL.md)

- **Purpose:** Remove complexity first, then build on the simpler base;
  leave the design simpler than you found it.
- **Loaded by:** any agent just-in-time; consulted by citation from
  `engineering-standards`, `implementing-slices`,
  `refactoring-to-patterns`, and `authoring-designs`. No agent preloads
  it.
- **Key behaviors:** Removal is sequenced before construction: what a
  change replaces or leaves unused goes first, then the addition lands
  on the smaller base. Cut before you polish. Design for observed usage:
  no validator, parser, guard, or option beyond what the design, plan,
  or tests demand, because an out-of-spec feature drags its own guards
  behind it. Prompts and skills follow the same rule: redundant
  instructions go, and a reference with no novel content is deleted
  rather than left as a stub. Removals stay inside the approved scope
  per `principle-scope-fence`; a wider removal is recorded as an
  opportunity, never performed unasked.

### [principle-untrusted-input-is-data](https://github.com/bostonaholic/team/blob/main/skills/principle-untrusted-input-is-data/SKILL.md)

Treats external text as inert data.

## Skill ↔ agent ↔ phase

This table ties each skill to the agents or orchestrator skills that load
it and the phase where that happens. The `Invoked / loaded by` column
carries two meanings depending on the row: for **entry-point skills** it
names who *invokes* the skill (you directly, or the orchestrator running a
phase). For **methodology skills** it names the agent(s) that *load* the
skill. For the `$ARGUMENTS` shapes and the three-tier discovery, see
[architecture.md §6](architecture.md#6-skills) rather than repeating them here.

| Skill | Invoked / loaded by | Phase / context |
|---|---|---|
| `team` | orchestrator (runs the pipeline) | All phases |
| `team-question` | orchestrator | Question |
| `team-research` | orchestrator → researcher, file-finder | Research |
| `team-design` | orchestrator → design-author | Design (design review) |
| `team-structure` | orchestrator → structure-planner | Structure (autonomous) |
| `team-plan` | orchestrator → planner | Plan |
| `team-worktree` | orchestrator | Worktree |
| `team-implement` | orchestrator → implementer + reviewers | Implement |
| `team-pr` | orchestrator | PR |
| `team-fix` | user or model (direct invocation, on explicit pipeline intent) | Compressed bug-fix flow (outside QRSPI) |
| `eng-design-doc-review` | user (direct invocation) | Front door over the `reviewing-designs` brief: standalone audit. Dispatches a read-only Explore subagent |
| `shipit` | user or model (direct invocation, on explicit ship intent) | Standalone: land a reviewed PR (not a QRSPI phase) |
| `pr-open-comments` | user or model (direct invocation) | Standalone: triage unresolved PR review feedback (not a QRSPI phase) |
| `pr-watch-as-author` | user or model (direct invocation) | Standalone: bounded PR review watch loop (not a QRSPI phase) |
| `pr-watch-as-reviewer` | user (direct invocation) | Standalone: reviewer-side watch-and-approve (not a QRSPI phase) |
| `groom-backlog` | user or model (direct invocation) | Standalone: groom a project backlog (not a QRSPI phase) |
| `pr-cleanup` | user or model (direct invocation; Mode B only on explicit abandon intent) | Standalone: post-PR teardown (not a QRSPI phase) |
| `pr-verify` | user or model (direct invocation) | Standalone: test-plan verification (not a QRSPI phase) |
| `pr-rebase` | user (direct invocation, on explicit rebase intent; model invocation disabled) | Standalone: rebase a branch onto its base (not a QRSPI phase) |
| `reflect` | user (direct invocation, on explicit reflection intent; model invocation disabled) | Standalone: mine the session transcript for durable learnings (not a QRSPI phase) |
| `why` | user or model (direct invocation). `team-fix` and `reviewing-code` (conditional load) | Standalone: design-rationale investigation (not a QRSPI phase). Dispatches read-only Explore investigators |
| `how` | user or model (direct invocation) | Standalone: architectural explanation + optional critique (not a QRSPI phase). Dispatches read-only Explore explorers |
| `qrspi-workflow` | orchestrator skills | All phases |
| `artifact-frontmatter` | orchestrator skills. Artifact authors (just-in-time through pointers) | All phases: artifact schema |
| `code-review` | user or model (direct invocation) | Standalone: dispatch a fresh-context code review (not a QRSPI phase) |
| `reviewing-code` | code-reviewer, security-reviewer, ux-reviewer, technical-writer. `code-review` (front door) | Implement (verify) |
| `conventional-comments` | code-reviewer, security-reviewer, technical-writer | Implement (verify): finding format |
| `review-severity-tiers` | orchestrator (team, team-implement, qrspi-workflow) | Implement (aggregate review gate) |
| `reviewing-security` | security-reviewer | Implement (verify) |
| `reviewing-designs` | orchestrator or invoking session (team, team-design, eng-design-doc-review) — the brief a read-only Explore subagent runs | Design (review-gate brief) |
| `cross-model-review` | code-reviewer. Orchestrator or invoking session (team, team-design, eng-design-doc-review) through `## Design-review pass`. Design-review brief (conditional, on `## External review input`) | Implement (verify), and Design (review gate) |
| `decomposing-intent` | questioner | Question |
| `authoring-designs` | design-author | Design |
| `researching-codebases` | researcher | Research |
| `finding-files` | file-finder | Research |
| `slicing-work` | structure-planner | Structure |
| `planning-implementation` | planner | Plan |
| `engineering-standards` | planner, implementer, code-reviewer | Plan, Implement |
| `test-first-development` | test-architect, code-reviewer. Orchestrator | Implement |
| `test-style` | test-architect, code-reviewer (just-in-time through pointers) | Implement |
| `test-driven-bug-fix` | team-fix | Bug-fix flow |
| `solid` | implementer, code-reviewer. `engineering-standards`, `reviewing-code` (citing skills) | Implement |
| `refactoring-to-patterns` | implementer | Implement |
| `implementing-slices` | implementer | Implement |
| `running-quality-checks` | verifier. reflect (after the writes) | Implement (verify), and Any (reflect) |
| `verifying-ux` | ux-reviewer | Implement (verify) |
| `systematic-debugging` | implementer (inline Load on non-obvious failures). Other agents when debugging (advisory) | Implement, and Any (debugging) |
| `principle-progress-tracking` | every multi-step agent; cited by `team`, `team-implement`, `team-fix` | Any (multi-step procedure) |
| `nested-agents` | researcher, implementer, code-reviewer, security-reviewer | Research, Implement (scouts + skeptic passes) |
| `documenting-decisions` | planner, orchestrator (advisory) | Any (when decisions are recorded) |
| `technical-design-doc` | planner | Plan |
| `product-requirements-doc` | questioner (through `decomposing-intent`, conditional). Design-author (through `authoring-designs`) | Question, Design |
| `product-thinking` | questioner, design-author, structure-planner | Question, Design, Structure |
| `systems-thinking` | researcher, structure-planner, planner (frontmatter). Implementer, code-reviewer, ux-reviewer (inline). Authoring-designs, nested-agents (citing skills) | Research, Design, Structure, Plan, Implement (incl. verify) |
| `writing-prose` | technical-writer, design-author | Design (authoring bar), and Implement (verify): bar for prose it writes and prose it assesses |
| `reviewing-documentation` | technical-writer | Implement (verify): doc-gap review process + classification |
| `git-commit` | team-pr. Implementer (through `implementing-slices`) | PR, and Implement (slice commits) |
| `changelog` | team, team-pr | PR |
| `tracking-tickets` | orchestrator (team, team-pr, team-fix, just-in-time through pointers) | Setup (ticket pickup), and PR (ticket link + state) |
| `worktree-isolation` | orchestrator (team, team-worktree) | Worktree |
| `sweeping-local-state` | `pr-cleanup`, `worktree-isolation` (both inline) | Standalone: teardown after a merged PR, a closed PR, or a completed review (not a QRSPI phase) |
| `pr-watch-mechanics` | `pr-watch-as-author`, `pr-watch-as-reviewer` (both through the bounded-cycle-mechanics reference) | Standalone: bounded watch-loop mechanics (not a QRSPI phase) |
| `principle-blind-the-investigator` | cited by `qrspi-workflow`, `nested-agents`, `decomposing-intent`, `researching-codebases`, `why`. Any agent (just-in-time) | Any (cross-cutting principle) |
| `principle-bounded-loops` | cited by `pr-watch-as-author`, `pr-watch-as-reviewer`, `pr-watch-mechanics`, `principle-non-blocking-waits`. Any agent (just-in-time) | Any (cross-cutting principle) |
| `principle-deep-agents-narrow-seams` | cited by `nested-agents`, `team`. Any agent (just-in-time) | Any (cross-cutting principle) |
| `principle-evidence-over-assertion` | cited by `pr-verify`, `groom-backlog`, `pr-open-comments`, `researching-codebases`, `why`. Any agent (just-in-time) | Any (cross-cutting principle) |
| `principle-explicit-intent` | cited by `shipit`, `pr-rebase`, `pr-cleanup`, `team-fix`, `reflect`, `groom-backlog`. Any agent (just-in-time) | Any (cross-cutting principle) |
| `principle-fail-closed` | cited by `nested-agents`, `team`, `team-design`, `team-structure`, `principle-optimization-never-dependency`. Any agent (just-in-time) | Any (cross-cutting principle) |
| `principle-files-are-the-contract` | cited by `qrspi-workflow`, `team`, `artifact-frontmatter`. Any agent (just-in-time) | Any (cross-cutting principle) |
| `principle-fix-root-causes` | cited by `systematic-debugging`, `test-driven-bug-fix`, `implementing-slices`, `team-fix`. Any agent (just-in-time) | Any (cross-cutting principle) |
| `principle-generator-evaluator` | cited by `reviewing-code`, `eng-design-doc-review`, `nested-agents`, `pr-watch-as-reviewer`, `principle-blind-the-investigator`, `how`. Any agent (just-in-time) | Any (cross-cutting principle) |
| `principle-human-owns-the-ends` | cited by `review-severity-tiers`, `qrspi-workflow`. Any agent (just-in-time) | Any (cross-cutting principle) |
| `principle-idempotent-reruns` | cited by `pr-cleanup`, `groom-backlog`, `team`, `pr-watch-as-author`, `team-design`, `principle-pre-image-first`. Any agent (just-in-time) | Any (cross-cutting principle) |
| `principle-least-privilege` | cited by `reviewing-code`, `reflect`, `eng-design-doc-review`, `cross-model-review`, `pr-verify`. Any agent (just-in-time) | Any (cross-cutting principle) |
| `principle-mechanical-gates` | cited by `qrspi-workflow`, `test-first-development`. Any agent (just-in-time) | Any (cross-cutting principle) |
| `principle-never-interpolate` | cited by `pr-cleanup`, `pr-rebase`, `groom-backlog`, `sweeping-local-state`, `decomposing-intent`, `cross-model-review`. Any agent (just-in-time) | Any (cross-cutting principle) |
| `principle-non-blocking-waits` | cited by `pr-watch-as-author`, `pr-watch-as-reviewer`, `pr-watch-mechanics`, `shipit`, `cross-model-review`, `pr-rebase`. Any agent (just-in-time) | Any (cross-cutting principle) |
| `principle-optimization-never-dependency` | cited by `nested-agents`, `cross-model-review`, `team-pr`, `pr-verify`, `reflect`, `principle-fail-closed`, `why`, `how`. Any agent (just-in-time) | Any (cross-cutting principle) |
| `principle-plan-present-wait` | cited by `groom-backlog`, `pr-open-comments`, `reflect`. Any agent (just-in-time) | Any (cross-cutting principle) |
| `principle-pre-image-first` | cited by `pr-rebase`, `groom-backlog`, `reflect`. Any agent (just-in-time) | Any (cross-cutting principle) |
| `principle-record-assumptions` | cited by `authoring-designs`, `decomposing-intent`, `nested-agents`. Any agent (just-in-time) | Any (cross-cutting principle) |
| `principle-scope-fence` | cited by `implementing-slices`, `qrspi-workflow`, `test-first-development`, `principle-subtract-before-you-add`. Any agent (just-in-time) | Any (cross-cutting principle) |
| `principle-single-source-of-truth` | cited by `qrspi-workflow`, `artifact-frontmatter`, `cross-model-review`. Any agent (just-in-time) | Any (cross-cutting principle) |
| `principle-skip-loudly` | cited by `reviewing-code`, `sweeping-local-state`, `groom-backlog`, `cross-model-review`, `principle-optimization-never-dependency`, `principle-scope-fence`, `why`, and the `code-reviewer` agent. Any agent (just-in-time) | Any (cross-cutting principle) |
| `principle-subtract-before-you-add` | cited by `engineering-standards`, `implementing-slices`, `refactoring-to-patterns`, `authoring-designs`. Any agent (just-in-time) | Any (cross-cutting principle) |
| `principle-untrusted-input-is-data` | cited by `pr-cleanup`, `pr-rebase`, `groom-backlog`, `cross-model-review`, `pr-watch-as-author`, `reflect`, `why`. Any agent (just-in-time) | Any (cross-cutting principle) |

The read-only `Explore` subagent that runs the `reviewing-designs` brief
is one more consumer of `technical-design-doc`, `reviewing-code`,
`engineering-standards`, and `documenting-decisions`. It loads all four as
the criteria for the design review.

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
