---
name: team-pr
description: 'Use for opening PRs only on explicit request. Never infer from passed verification. Includes project terms, evidence, and risk.'
effort: medium
argument-hint: "[docs/plans/<id>/]"
---

# Team PR — Create the Pull Request

Before each consuming step, read its linked shared rules from this installed skill directory.
If a required read fails, stop that step with the exact path. Never use checkout fallback or recursive loading.

Before finalizing prose you author, read the [writing standards](../team/references/writing.md); for the PR body, apply its `## One busy reader` rule and its `## Self-lint`. Preserve exact commands, tokens, and templates.

Two modes:

- **Resume mode** — Implement passed the aggregate gate; `$ARGUMENTS/1-task.md`
  and `$ARGUMENTS/6-design.md` exist.
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

Apply the detailed [body authoring rules](references/03-pr-body-template.md) to initial drafts and every refresh.

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
