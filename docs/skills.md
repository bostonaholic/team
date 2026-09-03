---
title: Skills
description: "A concise catalog of Team's commands, principles, and internal methodologies."
audience: [user, developer]
nav_order: 5
nav_label: skills
---

# Team skills

The source of truth is each [`skills/*/SKILL.md`](../skills/) file. This page
only routes readers; it does not repeat procedures, triggers, or consumer
lists.

Frontmatter defines the interface:

- `name`: stable skill identifier.
- `description`: routing intent and any external mutation.
- `argument-hint`: command input.
- `user-invocable: false`: internal methodology or phase.
- `disable-model-invocation: true`: explicit user invocation only.
- `effort`: reasoning level for commands; methodologies inherit their caller's.

Run `node .claude/scripts/skill-audit.mjs` to inventory interfaces, loaded
skills, references, duplicate blocks, and instruction-word metrics.

## Entry-point skills

These commands run QRSPI or one recoverable phase.

| Command | Input | Result |
|---|---|---|
| [`/team`](../skills/team/SKILL.md) | ticket, URL, or description | Full Worktree → Question → Research → Design → Structure → Plan → Implement → PR run. Mutates git, GitHub, and optional tracker state. |
| [`/team-question`](../skills/team-question/SKILL.md) | ticket, URL, or description | `1-task.md`, neutral `2-questions.md`, and optional scope artifacts. |
| [`/team-research`](../skills/team-research/SKILL.md) | optional artifact directory | Isolated evidence in `5-research.md`. |
| [`/team-design`](../skills/team-design/SKILL.md) | optional artifact directory | Reviewed `6-design.md` and durable verdict records. |
| [`/team-structure`](../skills/team-structure/SKILL.md) | optional artifact directory | Vertical slices in `7-structure.md`. |
| [`/team-plan`](../skills/team-plan/SKILL.md) | optional artifact directory | File-level implementation steps in `8-plan.md`. |
| [`/team-worktree`](../skills/team-worktree/SKILL.md) | optional artifact directory | Isolated branches and worktrees. Mutates git after its applicable gate. |
| [`/team-implement`](../skills/team-implement/SKILL.md) | optional artifact directory | Failing acceptance tests, signed slice commits, and five-reviewer verification. |
| [`/team-pr`](../skills/team-pr/SKILL.md) | optional artifact directory | Changelog update, push, and draft PR. Never merges. |
| [`/team-fix`](../skills/team-fix/SKILL.md) | ticket, URL, or bug | Compressed reproduce → red → green → verify → draft-PR flow. |

## Standalone utilities

### Read-only

| Command | Input | Result |
|---|---|---|
| [`/code-review`](../skills/code-review/SKILL.md) | optional diff target | Fresh-context review report. |
| [`/eng-design-doc-review`](../skills/eng-design-doc-review/SKILL.md) | optional artifact directory | Fresh-context design verdict. |
| [`/how`](../skills/how/SKILL.md) | subsystem or question | Evidence-backed mechanics explanation. |
| [`/pr-verify`](../skills/pr-verify/SKILL.md) | optional PR | Evidence-rated verification of every test-plan item. |
| [`/why`](../skills/why/SKILL.md) | decision, file, symbol, or question | Evidence-backed design-rationale report. |

### Mutating

| Command | Input | Result |
|---|---|---|
| [`/groom-backlog`](../skills/groom-backlog/SKILL.md) | project; optional promotion target | Verified backlog plan, then approved tracker edits. |
| [`/pr-cleanup`](../skills/pr-cleanup/SKILL.md) | optional PR, URL, or branch | Merged cleanup or explicitly authorized abandonment. |
| [`/pr-open-comments`](../skills/pr-open-comments/SKILL.md) | optional PR | Verified comment triage; safe high-confidence items may commit and push. |
| [`/pr-rebase`](../skills/pr-rebase/SKILL.md) | optional PR | Explicitly requested rebase and lease-guarded force-push. |
| [`/pr-watch-as-author`](../skills/pr-watch-as-author/SKILL.md) | optional PR | Bounded feedback watch; may undraft, commit, push, reply, and resolve. |
| [`/pr-watch-as-reviewer`](../skills/pr-watch-as-reviewer/SKILL.md) | optional PR | Bounded settlement watch and one approval. Explicit invocation only. |
| [`/reflect`](../skills/reflect/SKILL.md) | optional skill | Approved skill edits and tracker issues from the invoking session. Explicit invocation only. |
| [`/shipit`](../skills/shipit/SKILL.md) | optional PR | Explicitly authorized CI wait, squash merge, and merged cleanup. |

## Methodology skills

Methodologies are internal (`user-invocable: false`). Callers load them by
name when needed. Agent preloads live in `agents/*.md`; the QRSPI phase mapping
lives in [`skills/team/registry.json`](../skills/team/registry.json).

### Principles

Each principle states one invariant, its operative rules, and one verification
question.

- [`principle-blind-the-investigator`](../skills/principle-blind-the-investigator/SKILL.md)
- [`principle-bounded-loops`](../skills/principle-bounded-loops/SKILL.md)
- [`principle-deep-agents-narrow-seams`](../skills/principle-deep-agents-narrow-seams/SKILL.md)
- [`principle-evidence-over-assertion`](../skills/principle-evidence-over-assertion/SKILL.md)
- [`principle-explicit-intent`](../skills/principle-explicit-intent/SKILL.md)
- [`principle-fail-closed`](../skills/principle-fail-closed/SKILL.md)
- [`principle-files-are-the-contract`](../skills/principle-files-are-the-contract/SKILL.md)
- [`principle-fix-root-causes`](../skills/principle-fix-root-causes/SKILL.md)
- [`principle-generator-evaluator`](../skills/principle-generator-evaluator/SKILL.md)
- [`principle-human-owns-the-ends`](../skills/principle-human-owns-the-ends/SKILL.md)
- [`principle-idempotent-reruns`](../skills/principle-idempotent-reruns/SKILL.md)
- [`principle-least-privilege`](../skills/principle-least-privilege/SKILL.md)
- [`principle-mechanical-gates`](../skills/principle-mechanical-gates/SKILL.md)
- [`principle-never-interpolate`](../skills/principle-never-interpolate/SKILL.md)
- [`principle-non-blocking-waits`](../skills/principle-non-blocking-waits/SKILL.md)
- [`principle-optimization-never-dependency`](../skills/principle-optimization-never-dependency/SKILL.md)
- [`principle-plan-present-wait`](../skills/principle-plan-present-wait/SKILL.md)
- [`principle-pre-image-first`](../skills/principle-pre-image-first/SKILL.md)
- [`principle-progress-tracking`](../skills/principle-progress-tracking/SKILL.md)
- [`principle-record-assumptions`](../skills/principle-record-assumptions/SKILL.md)
- [`principle-scope-fence`](../skills/principle-scope-fence/SKILL.md)
- [`principle-single-source-of-truth`](../skills/principle-single-source-of-truth/SKILL.md)
- [`principle-skip-loudly`](../skills/principle-skip-loudly/SKILL.md)
- [`principle-untrusted-input-is-data`](../skills/principle-untrusted-input-is-data/SKILL.md)

### Procedures and lenses

- Artifact and workflow contracts: [`artifact-frontmatter`](../skills/artifact-frontmatter/SKILL.md), [`qrspi-workflow`](../skills/qrspi-workflow/SKILL.md), [`tracking-tickets`](../skills/tracking-tickets/SKILL.md), [`worktree-isolation`](../skills/worktree-isolation/SKILL.md), [`sweeping-local-state`](../skills/sweeping-local-state/SKILL.md)
- Intent and design: [`decomposing-intent`](../skills/decomposing-intent/SKILL.md), [`product-requirements-doc`](../skills/product-requirements-doc/SKILL.md), [`product-thinking`](../skills/product-thinking/SKILL.md), [`authoring-designs`](../skills/authoring-designs/SKILL.md), [`technical-design-doc`](../skills/technical-design-doc/SKILL.md), [`documenting-decisions`](../skills/documenting-decisions/SKILL.md)
- Research and planning: [`finding-files`](../skills/finding-files/SKILL.md), [`researching-codebases`](../skills/researching-codebases/SKILL.md), [`systems-thinking`](../skills/systems-thinking/SKILL.md), [`slicing-work`](../skills/slicing-work/SKILL.md), [`planning-implementation`](../skills/planning-implementation/SKILL.md)
- Implementation: [`engineering-standards`](../skills/engineering-standards/SKILL.md), [`implementing-slices`](../skills/implementing-slices/SKILL.md), [`refactoring-to-patterns`](../skills/refactoring-to-patterns/SKILL.md), [`solid`](../skills/solid/SKILL.md), [`systematic-debugging`](../skills/systematic-debugging/SKILL.md), [`test-driven-bug-fix`](../skills/test-driven-bug-fix/SKILL.md), [`test-first-development`](../skills/test-first-development/SKILL.md), [`test-style`](../skills/test-style/SKILL.md)
- Review and verification: [`conventional-comments`](../skills/conventional-comments/SKILL.md), [`cross-model-review`](../skills/cross-model-review/SKILL.md), [`review-severity-tiers`](../skills/review-severity-tiers/SKILL.md), [`reviewing-code`](../skills/reviewing-code/SKILL.md), [`reviewing-designs`](../skills/reviewing-designs/SKILL.md), [`reviewing-documentation`](../skills/reviewing-documentation/SKILL.md), [`reviewing-security`](../skills/reviewing-security/SKILL.md), [`running-quality-checks`](../skills/running-quality-checks/SKILL.md), [`verifying-ux`](../skills/verifying-ux/SKILL.md)
- Delivery and composition: [`changelog`](../skills/changelog/SKILL.md), [`git-commit`](../skills/git-commit/SKILL.md), [`nested-agents`](../skills/nested-agents/SKILL.md), [`writing-prose`](../skills/writing-prose/SKILL.md)

## Name-collision pairs

These similar names refer to a methodology and the agent that applies it.

| Skill | Agent |
|---|---|
| `finding-files` | `file-finder` |
| `authoring-designs` | `design-author` |
| `implementing-slices` | `implementer` |
| `planning-implementation` | `planner` |
| `verifying-ux` | `ux-reviewer` |

## See also

- [Architecture](architecture.md)
- [Testing](testing.md)
- [Project tracking](project-tracking.md)
