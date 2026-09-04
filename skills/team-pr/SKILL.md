---
name: team-pr
description: 'Opens a pull request after verification. Trigger on "open the PR", "open a draft PR", or "/team-pr" only; never infer the phase from passed verification.'
effort: medium
argument-hint: "[docs/plans/<id>/]"
---

# Team PR — Create the Pull Request

Run the PR phase. Two modes:

- **Resume mode** — Implement passed the aggregate gate. The topic branch
  has slice commits ready. `$ARGUMENTS/1-task.md` and `$ARGUMENTS/6-design.md`
  exist.
- **Standalone mode** — no matching artifact directory, but the working
  tree has commits or staged changes ready to ship. Treat the current
  branch as the work source.

## Core contracts

1. **Update CHANGELOG.md** and commit before opening any PR.
2. **Open a draft PR automatically — do not stop to ask.** Push, then run `gh pr create --draft`.
3. After creation, hand off to `/pr-watch-as-author`.
4. In multi-repo mode, open one draft PR per repo and add `## Companion PRs` links.
5. Call the Skill tool with `tracking-tickets` for the in-review transition and the multi-repo home-only closing rule.
6. After each push, refresh the body. Re-emit exactly one closing line: never duplicated, never dropped.

## PR Body Template

```
## Summary
[What and why]

## Design Decisions
[Key decisions]

## Changes
[Observable changes]

## Screenshots
[Conditional]

## How to Verify
- [Verification performed]

## Pre-merge
[Conditional merge requirements]

## Review notes
[Conditional deferred findings]

## References
- Design: $ARGUMENTS/6-design.md
- Plan: $ARGUMENTS/8-plan.md

Closes #<n>
```

**Prose bar.** The body addresses one busy reader making one decision. Before finalizing, call the Skill tool with `writing-prose` and apply its `## One busy reader` rule and its `## Self-lint`. `## Summary` opens with the recommendation or the observable outcome, never with a sentence describing the PR.

The `Closes` footer is conditional and appears as the final line of the PR body. **Placement rationale:** narrative precedes machine metadata. For `## Review notes`, omit the section entirely when empty; never emit a bare heading. Tag COMMENT findings with their `design-review-<n>` source.

**`## Review notes` (conditional):** copy `cross-model-notes.md` with frontmatter stripped. Its copy replaces the final round's inline `### Cross-model disposition` block; exclude `### Cross-model disposition` from other sweeps so each round appears once.

## Procedure references

Read each reference completely when reaching that stage. Follow them in order; later stages depend on state and gates established earlier.

1. [Input](references/01-input.md)
2. [Execution](references/02-execution.md)
3. [PR Body Template](references/03-pr-body-template.md)
4. [Screenshot Upload](references/04-screenshot-upload.md)
5. [Changelog Update](references/05-changelog-update.md)
6. [Commit Discipline](references/06-commit-discipline.md)

## Applied principles

Load and apply: `principle-optimization-never-dependency`.
