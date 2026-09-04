---
name: groom-backlog
description: 'Grooms a project backlog and proposes tracker changes. Trigger on "groom the backlog", "groom the board", "clean up the backlog", or "/groom-backlog"; changes require user approval.'
effort: high
argument-hint: "[<project-number-or-url>] [--promote <issue-number>]"
---

# groom-backlog — plan, ask, wait, then execute

Grooming mutates shared state that a whole team reads. Placement, dates, and ticket rewrites
are judgment calls with no mechanical ground truth. A wrong one stays invisible until someone
acts on a board that now lies. So this skill plans, asks the consequential questions, and
waits. It acts only on approval. That is the shape `pr-open-comments` takes for an item below
its auto-apply bar. That checkpoint is the ethos applied, not a hole in it. The pipeline's
autonomous middle earns its autonomy from mechanical gates. A grooming judgment has none, so
the user's answer stays this skill's one gate until a loop-driven controller replaces it.

The shape is `principle-plan-present-wait`: plan the mutations to a file,
present each consequential choice with one recommendation, and execute only the answered
subset.

## Procedure references

Read each reference completely when reaching that stage. Follow them in order; later stages depend on state and gates established earlier.

1. [Vocabulary](references/01-vocabulary.md)
2. [Input](references/02-input.md)
3. [The board-level pass](references/03-the-board-level-pass.md)
4. [Step 1 — Load once, in bulk](references/04-step-1-load-once-in-bulk.md)
5. [Step 2 — Compute the gap inventory, do not eyeball it](references/05-step-2-compute-the-gap-inventory-do-not-eyeball-it.md)
6. [Step 3 — Verify claims against the code](references/06-step-3-verify-claims-against-the-code.md)
7. [Step 4 — Rank the verified candidates](references/07-step-4-rank-the-verified-candidates.md)
8. [Step 5 — Cluster by outcome, not by component](references/08-step-5-cluster-by-outcome-not-by-component.md)
9. [Step 6 — Find the dependencies, then propose the links](references/09-step-6-find-the-dependencies-then-propose-the-links.md)
10. [Step 7 — Write the plan to a file](references/10-step-7-write-the-plan-to-a-file.md)
11. [Step 8 — Present the consequential choices and wait](references/11-step-8-present-the-consequential-choices-and-wait.md)
12. [Step 9 — Execute in dependency order](references/12-step-9-execute-in-dependency-order.md)
13. [Step 10 — Verify by re-querying, never by memory](references/13-step-10-verify-by-re-querying-never-by-memory.md)
14. [Step 11 — Report, including what you did not change](references/14-step-11-report-including-what-you-did-not-change.md)
15. [The promotion standard](references/15-the-promotion-standard.md)
16. [Tracker recipes](references/16-tracker-recipes.md)
17. [Hard rules](references/17-hard-rules.md)

## Applied principles

Load and apply: `principle-evidence-over-assertion`, `principle-explicit-intent`,
`principle-idempotent-reruns`, `principle-never-interpolate`,
`principle-pre-image-first`, `principle-skip-loudly`, and
`principle-untrusted-input-is-data`.
