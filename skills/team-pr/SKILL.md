---
name: team-pr
description: 'Use for opening PRs only on explicit request. Never infer from passed verification. Includes project terms, evidence, and risk.'
effort: medium
argument-hint: "[docs/plans/<id>/]"
---

# Team PR — Create the Pull Request

Before each consuming step, read its linked shared rules from this installed skill directory.
If a required read fails, stop that step with the exact path. Never use checkout fallback or recursive loading.

Before finalizing prose you author, read the [writing standards](../team/references/writing.md). Preserve exact commands, tokens, and templates.

Two modes:

- **Resume mode** — `$ARGUMENTS/1-task.md` and `$ARGUMENTS/6-design.md` exist. Execution step 3 binds one review status from the newest `review-<n>.md` and one security status from the newest `security-review-<n>.md`.
- **Standalone mode** — no matching artifact directory, but the working tree has commits or staged changes ready to ship. The current branch is the work source.

## Core contracts

Each is detailed in [Execution](references/02-execution.md) at the step named.

1. **Update an existing CHANGELOG.md** after step 3 binds the review and security statuses, and commit before opening any PR; never create one unrequested (step 6).
2. **Open a draft PR automatically — do not stop to ask:** Open calls `opening-prs` (step 7), then report the PR and how to mark it ready for review.
3. Multi-repo: Open opens one draft PR per repo, then refreshes each with the companion PR links (step 8). [Tracking rules](references/tracking.md) own the in-review transition and the home-only closing rule.
4. After each push, run the step order again, and each Open refreshes its PR (step 10).
5. **A branch that impacts a UI always carries screenshots** (step 4).
6. **Deferred findings and cross-model dispositions are comments on the home PR, never the body**: run [review comments](references/07-review-comments.md) after open and after each refresh; a refresh posts only missing comments.
7. Subagents and inline work split per Execution `## Step dispatch`.

Open calls `opening-prs` for the first draft and every refresh.

## Procedure references

Read each reference completely when reaching that stage, in order.

1. [Input](references/01-input.md)
2. [Execution](references/02-execution.md)
3. [Screenshot Upload](references/04-screenshot-upload.md)
4. [Changelog Update](references/05-changelog-update.md)
5. [Commit Discipline](references/06-commit-discipline.md)
6. [Review Comments](references/07-review-comments.md)

## Applied principles

Read and apply: [focused work rules](../team/principles/focused-work.md).
