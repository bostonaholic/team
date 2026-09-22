---
name: team-pr
description: 'Trigger on "/team-pr" or "open the PR" only. Never infer from passed verification. Opens PRs with project terms, evidence, and risk.'
effort: medium
argument-hint: "[docs/plans/<id>/]"
---

# Team PR — Create the Pull Request

Before each consuming step, read its linked shared rules from this installed skill directory.
If a required read fails, stop that step with the exact path. Never use checkout fallback or recursive loading.

Before finalizing prose you author, read the [writing standards](../team/references/writing.md). Preserve exact commands, tokens, and templates.

Run the PR phase. Two modes:

- **Resume mode** — Implement passed the aggregate gate. The topic branch
  has slice commits ready. `$ARGUMENTS/1-task.md` and `$ARGUMENTS/6-design.md`
  exist.
- **Standalone mode** — no matching artifact directory, but the working
  tree has commits or staged changes ready to ship. Treat the current
  branch as the work source.

## Core contracts

1. **Update an existing CHANGELOG.md** and commit before opening any PR. If the
   root file is absent, leave it absent and report the skip unless the user
   explicitly requested a new changelog.
2. **Open a draft PR automatically — do not stop to ask.** Push, then run `gh pr create --draft`.
3. After creation, hand off to `/pr-watch-as-author`.
4. In multi-repo mode, open one draft PR per repo and add `## Companion PRs` links.
5. Read [tracking rules](references/tracking.md) for the in-review transition and the multi-repo home-only closing rule.
6. After each push, refresh the body. Re-emit exactly one closing line: never duplicated, never dropped.
7. **A branch that impacts a UI always carries screenshots.** Apply the ux-reviewer brief's UI-impact gate to the full branch diff. When it holds and no captured manifest exists, capture before rendering the section.

## PR Body Template

```
## Summary
[Observable change, effect, and reason in project terms]

## Design Decisions
[Conditional review-relevant tradeoff]

## Changes
[Conditional detail or representation that adds to Summary]

## Screenshots
[Conditional on UI impact; use the existing capture and upload rules]

## How to Verify
- [Command/action: observed result, scope, and limitations]

## Merge risk
[One-way door or two-way door: supporting facts and concrete recovery]

## Pre-merge
[Conditional merge requirements]

## Review notes
[Conditional deferred findings]

## References
- [Available, reviewer-accessible supporting references; omit unavailable artifacts]

Closes #<n>
```

Apply the detailed [body authoring rules](references/03-pr-body-template.md) to initial drafts and every refresh.

**Prose bar.** The body addresses one busy reader making one decision. Before finalizing, read the [writing standards](../team/references/writing.md) and apply its `## One busy reader` rule and its `## Self-lint`. `## Summary` opens with the recommendation or the observable outcome, never with a sentence describing the PR.

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

Read and apply: [focused work rules](../team/principles/focused-work.md).
