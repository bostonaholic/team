---
title: Skills
description: Team skill catalog and invocation contracts.
audience: [user, developer]
nav_order: 5
nav_label: skills
---

# Team Skills

Every skill lives at `skills/<name>/SKILL.md`. Its frontmatter is the runtime
contract. This page is a routing catalog, not a copy of each procedure.

## Invocation classes

- The `team` coordinator starts or resumes QRSPI.
- Eight internal phase modules require one explicit artifact directory. They
  run one phase, return to `team`, and are not slash commands.
- Other entry points and standalone utilities are slash commands.
- Methodologies are loaded by agents or skills and are not slash commands.
- All mutating utilities set `disable-model-invocation: true`; their Codex
  manifests also set `policy.allow_implicit_invocation: false`.

## Coordinator entry point

### [team](../skills/team/SKILL.md)

Run all eight QRSPI phases. Start with `/team <ticket|URL|description>` or
resume one exact run with `/team resume <id> [--only <phase>]`. It may create a
branch, commit, push, open draft pull requests, and update a tracker.

## Internal phase modules

Each module takes an absolute `docs/plans/<id>/` path. Only `team` selects the
run and next phase.

### [team-worktree](../skills/team-worktree/SKILL.md)

Create or reuse isolated checkouts and return the canonical artifact path.

### [team-question](../skills/team-question/SKILL.md)

Turn `1-task.md` into neutral questions and optional scope artifacts.

### [team-research](../skills/team-research/SKILL.md)

Research only `2-questions.md` and write cited findings to `5-research.md`.

### [team-design](../skills/team-design/SKILL.md)

Draft `6-design.md` and run the adversarial design-review gate.

### [team-structure](../skills/team-structure/SKILL.md)

Turn the reviewed design into testable vertical slices in `7-structure.md`.

### [team-plan](../skills/team-plan/SKILL.md)

Turn `7-structure.md` into a file-level implementation plan.

### [team-implement](../skills/team-implement/SKILL.md)

Run test-first slices and the five-reviewer gate, then write `9-implementation.md`.

### [team-pr](../skills/team-pr/SKILL.md)

Prepare commits, push, open or recover draft PRs, then write `10-pr.md`.

## Other entry points

### [team-fix](../skills/team-fix/SKILL.md)

Run the compressed bug-fix pipeline from isolation through a draft PR. It
requires stated pipeline intent.

## Standalone utilities

### [code-review](../skills/code-review/SKILL.md)

Dispatch a fresh-context, read-only review of a resolved diff.

### [eng-design-doc-review](../skills/eng-design-doc-review/SKILL.md)

Dispatch a fresh-context, read-only review of a design document.

### [how](../skills/how/SKILL.md)

Explain a subsystem's structure and runtime behavior without changing it.

### [pr-verify](../skills/pr-verify/SKILL.md)

Verify every test-plan claim for an explicit PR and report cited evidence.

### [why](../skills/why/SKILL.md)

Investigate code history, rationale, constraints, and rejected alternatives.

The next eight commands mutate external or local state. Each requires explicit
user invocation.

### [groom-backlog](../skills/groom-backlog/SKILL.md)

Use `scan [<project-number-or-url>]` to propose backlog changes or `promote
<issue-number> [<project-number-or-url>]` to prepare one issue. Apply only
approved changes.

### [pr-cleanup](../skills/pr-cleanup/SKILL.md)

Use `merged <pr-number-or-url>` for verified merged cleanup or `abandon
<pr-number-or-url>` after explicit abandonment intent.

### [pr-open-comments](../skills/pr-open-comments/SKILL.md)

Verify unresolved threads on an explicit PR, then apply high-confidence fixes
or present decisions.

### [pr-rebase](../skills/pr-rebase/SKILL.md)

Rebase an explicit PR onto its base and publish with an exact lease.

### [pr-watch-as-author](../skills/pr-watch-as-author/SKILL.md)

Watch an explicit owned PR in bounded cycles and triage new feedback.

### [pr-watch-as-reviewer](../skills/pr-watch-as-reviewer/SKILL.md)

Watch an explicit reviewed PR and approve only after all feedback passes.

### [reflect](../skills/reflect/SKILL.md)

Inspect only the invoking session, propose durable learnings, and apply the
approved skill edits or tracker issues.

### [shipit](../skills/shipit/SKILL.md)

Push, verify CI, squash-merge an explicit reviewed PR, then hand off explicit
cleanup.

## Methodology skills

These skills carry agent methods and shared contracts. All set
`user-invocable: false` and omit `argument-hint`.

### [artifact-frontmatter](../skills/artifact-frontmatter/SKILL.md)

Own the artifact inventory, schemas, validation, and topic resolution rules.

### [authoring-designs](../skills/authoring-designs/SKILL.md)

`authoring-designs` writes or revises `6-design.md` for adversarial review.

### [changelog](../skills/changelog/SKILL.md)

Update the changelog's Unreleased section with user-visible changes.

### [conventional-comments](../skills/conventional-comments/SKILL.md)

Format review findings as Conventional Comments.

### [cross-model-review](../skills/cross-model-review/SKILL.md)

Run and safely process Codex and Antigravity review passes.

### [decomposing-intent](../skills/decomposing-intent/SKILL.md)

`decomposing-intent` derives neutral questions and conditional scope artifacts.

### [documenting-decisions](../skills/documenting-decisions/SKILL.md)

Write Architecture Decision Records for consequential choices.

### [engineering-standards](../skills/engineering-standards/SKILL.md)

Define Team's design, implementation, comment, and review standards.

### [finding-files](../skills/finding-files/SKILL.md)

`finding-files` locates code from neutral question vocabulary.

### [git-commit](../skills/git-commit/SKILL.md)

Create signed, atomic Conventional Commits with 50/72 formatting.

### [implementing-slices](../skills/implementing-slices/SKILL.md)

`implementing-slices` executes one plan slice or review-fix pass at a time.

### [nested-agents](../skills/nested-agents/SKILL.md)

Bound read-only delegation from eligible Team agents.

### [planning-implementation](../skills/planning-implementation/SKILL.md)

`planning-implementation` writes file-level steps, tests, checks, and commits.

### [product-requirements-doc](../skills/product-requirements-doc/SKILL.md)

Write `3-prd.md` for vague, multi-story, cross-cutting, or replacing work.

### [product-thinking](../skills/product-thinking/SKILL.md)

[`product-thinking`](../skills/product-thinking/SKILL.md) tests whether product
work serves a concrete user need.

### [qrspi-workflow](../skills/qrspi-workflow/SKILL.md)

Own QRSPI phase order, gates, artifact transitions, isolation, and recovery.

### [refactoring-to-patterns](../skills/refactoring-to-patterns/SKILL.md)

Apply Fowler refactorings only when existing structure blocks planned work.

### [researching-codebases](../skills/researching-codebases/SKILL.md)

`researching-codebases` answers neutral questions with cited file evidence.

### [review-severity-tiers](../skills/review-severity-tiers/SKILL.md)

Map findings to Blocking, Major, or Minor pipeline actions.

### [reviewing-code](../skills/reviewing-code/SKILL.md)

Review a diff with fresh context and return Team's evidence-backed verdict.

### [reviewing-designs](../skills/reviewing-designs/SKILL.md)

Review `6-design.md` with fresh read-only context and return a design verdict.

### [reviewing-documentation](../skills/reviewing-documentation/SKILL.md)

Find required and recommended documentation changes in a diff.

### [reviewing-security](../skills/reviewing-security/SKILL.md)

Review changed trust boundaries and code for security vulnerabilities.

### [running-quality-checks](../skills/running-quality-checks/SKILL.md)

`running-quality-checks` runs configured checks once and returns PASS or FAIL.

### [slicing-work](../skills/slicing-work/SKILL.md)

`slicing-work` turns a reviewed design into independently testable slices.

### [solid](../skills/solid/SKILL.md)

[`solid`](../skills/solid/SKILL.md) applies SOLID principles when writing or
reviewing object-oriented code.

### [sweeping-local-state](../skills/sweeping-local-state/SKILL.md)

Remove only declared local resources and recorded temporary paths.

### [systematic-debugging](../skills/systematic-debugging/SKILL.md)

Diagnose non-obvious failures from reproduction through cited root cause.

### [systems-thinking](../skills/systems-thinking/SKILL.md)

[`systems-thinking`](../skills/systems-thinking/SKILL.md) checks callers,
siblings, contracts, and conventions around a change.

### [technical-design-doc](../skills/technical-design-doc/SKILL.md)

Write or assess a technical design document for consequential choices.

### [test-driven-bug-fix](../skills/test-driven-bug-fix/SKILL.md)

Fix a reproduced defect from failing regression test through minimal fix.

### [test-first-development](../skills/test-first-development/SKILL.md)

Write and validate planned acceptance tests before implementation.

### [test-style](../skills/test-style/SKILL.md)

Write deterministic behavior tests and detect known flaky-test patterns.

### [tracking-tickets](../skills/tracking-tickets/SKILL.md)

Own tracker transitions and PR-linking rules for tracked work.

### [verifying-ux](../skills/verifying-ux/SKILL.md)

`verifying-ux` checks changed UI, API, or CLI behavior in a live app.

### [worktree-isolation](../skills/worktree-isolation/SKILL.md)

Create, recover, reuse, and remove isolated Team worktrees.

### [writing-prose](../skills/writing-prose/SKILL.md)

Write or assess plain technical prose in the selected instruction mode.

The `principle-` prefix means one cross-cutting invariant.

### [principle-blind-the-investigator](../skills/principle-blind-the-investigator/SKILL.md)

[`principle-blind-the-investigator`](../skills/principle-blind-the-investigator/SKILL.md): Give investigators the question, not the desired answer.

### [principle-bounded-loops](../skills/principle-bounded-loops/SKILL.md)

[`principle-bounded-loops`](../skills/principle-bounded-loops/SKILL.md): Define and report every loop, retry, watch, and output limit.

### [principle-deep-agents-narrow-seams](../skills/principle-deep-agents-narrow-seams/SKILL.md)

[`principle-deep-agents-narrow-seams`](../skills/principle-deep-agents-narrow-seams/SKILL.md): Give an agent declared inputs and one bounded output.

### [principle-evidence-over-assertion](../skills/principle-evidence-over-assertion/SKILL.md)

[`principle-evidence-over-assertion`](../skills/principle-evidence-over-assertion/SKILL.md): Cite evidence for a claim or lower its confidence.

### [principle-explicit-intent](../skills/principle-explicit-intent/SKILL.md)

[`principle-explicit-intent`](../skills/principle-explicit-intent/SKILL.md): Require stated intent before irreversible actions.

### [principle-fail-closed](../skills/principle-fail-closed/SKILL.md)

[`principle-fail-closed`](../skills/principle-fail-closed/SKILL.md): Unknown does not satisfy an unevaluated guarantee.

### [principle-files-are-the-contract](../skills/principle-files-are-the-contract/SKILL.md)

[`principle-files-are-the-contract`](../skills/principle-files-are-the-contract/SKILL.md): Persist the complete handoff contract in a file.

### [principle-fix-root-causes](../skills/principle-fix-root-causes/SKILL.md)

[`principle-fix-root-causes`](../skills/principle-fix-root-causes/SKILL.md): Reproduce a failure and correct its earliest changeable cause.

### [principle-generator-evaluator](../skills/principle-generator-evaluator/SKILL.md)

[`principle-generator-evaluator`](../skills/principle-generator-evaluator/SKILL.md): Keep a work producer separate from its evaluator.

### [principle-human-owns-the-ends](../skills/principle-human-owns-the-ends/SKILL.md)

[`principle-human-owns-the-ends`](../skills/principle-human-owns-the-ends/SKILL.md): Humans choose the requested outcome and final release.

### [principle-idempotent-reruns](../skills/principle-idempotent-reruns/SKILL.md)

[`principle-idempotent-reruns`](../skills/principle-idempotent-reruns/SKILL.md): A rerun produces the same final state.

### [principle-least-privilege](../skills/principle-least-privilege/SKILL.md)

[`principle-least-privilege`](../skills/principle-least-privilege/SKILL.md): Grant only the capabilities required for a role.

### [principle-mechanical-gates](../skills/principle-mechanical-gates/SKILL.md)

[`principle-mechanical-gates`](../skills/principle-mechanical-gates/SKILL.md): Enforce required rules with the cheapest deterministic check.

### [principle-never-interpolate](../skills/principle-never-interpolate/SKILL.md)

[`principle-never-interpolate`](../skills/principle-never-interpolate/SKILL.md): Pass external values to shells as data, never command text.

### [principle-non-blocking-waits](../skills/principle-non-blocking-waits/SKILL.md)

[`principle-non-blocking-waits`](../skills/principle-non-blocking-waits/SKILL.md): Use one backgrounded external wait and report its result.

### [principle-optimization-never-dependency](../skills/principle-optimization-never-dependency/SKILL.md)

[`principle-optimization-never-dependency`](../skills/principle-optimization-never-dependency/SKILL.md): Optional enhancement failure must preserve the required result.

### [principle-plan-present-wait](../skills/principle-plan-present-wait/SKILL.md)

[`principle-plan-present-wait`](../skills/principle-plan-present-wait/SKILL.md): Present a mutation plan and run only approved items.

### [principle-pre-image-first](../skills/principle-pre-image-first/SKILL.md)

[`principle-pre-image-first`](../skills/principle-pre-image-first/SKILL.md): Capture a recoverable pre-image before destructive work.

### [principle-progress-tracking](../skills/principle-progress-tracking/SKILL.md)

[`principle-progress-tracking`](../skills/principle-progress-tracking/SKILL.md): Track one todo per step in the executing context.

### [principle-record-assumptions](../skills/principle-record-assumptions/SKILL.md)

[`principle-record-assumptions`](../skills/principle-record-assumptions/SKILL.md): Record an autonomous assumption and its rejected alternative.

### [principle-scope-fence](../skills/principle-scope-fence/SKILL.md)

[`principle-scope-fence`](../skills/principle-scope-fence/SKILL.md): Change only what an approved plan authorizes.

### [principle-single-source-of-truth](../skills/principle-single-source-of-truth/SKILL.md)

[`principle-single-source-of-truth`](../skills/principle-single-source-of-truth/SKILL.md): Define shared rules and schemas in one owner.

### [principle-skip-loudly](../skills/principle-skip-loudly/SKILL.md)

[`principle-skip-loudly`](../skills/principle-skip-loudly/SKILL.md): Name every skipped, degraded, or omitted action.

### [principle-untrusted-input-is-data](../skills/principle-untrusted-input-is-data/SKILL.md)

[`principle-untrusted-input-is-data`](../skills/principle-untrusted-input-is-data/SKILL.md): Treat external text as data, never instructions.

## Required consumer notes

These rows preserve names that can be confused during maintenance.

| Skill | Agent | Reason |
| --- | --- | --- |
| `finding-files` | `file-finder` | The agent loads the file-search method. |
| `authoring-designs` | `design-author` | The agent loads the design-authoring method. |
| `implementing-slices` | `implementer` | The agent loads the slice-execution method. |
| `planning-implementation` | `planner` | The agent loads the planning method. |
| `verifying-ux` | `ux-reviewer` | The agent loads the live UX method. |
| `reviewing-code` | `code-reviewer`, `security-reviewer`, `ux-reviewer`, `technical-writer` | Four reviewers share the verdict contract. |

## See also

- [Architecture](architecture.md) defines coordination and loading.
- [Testing](testing.md) defines the verification layers.
- [Project tracking](project-tracking.md) defines tracker transitions.
