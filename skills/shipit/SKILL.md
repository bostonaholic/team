---
name: shipit
description: 'Trigger on "/shipit" or "ship it" only. Never infer from approval, green CI, or completion. Lands a reviewed PR.'
effort: medium
argument-hint: "[<pr-number>]"
---

# shipit — land a reviewed PR

Before each consuming step, read its linked shared rules from this installed skill directory.
If a required read fails, stop that step with the exact path. Never use checkout fallback or recursive loading.

`shipit` lands a pull request that already passed review. It runs land-time
versioning, pushes any unpushed local commits, waits for CI to go green, and
squash-merges. The PR title then lands as the commit subject on the base branch.
If `version-bump` puts a version in the title, that version shows up in
`git log`. It **finalizes an existing open PR**, and never opens one. It is
generic: it invokes `version-bump`, and `version-bump` decides from project
context whether to commit a bump, land with no bump, or stop.

`gh pr merge` is irreversible, so two things guard it — neither of them a
frontmatter flag, and neither of them a question put to the user mid-run:

1. **Explicit ship intent.** The skill fires only on a direct "ship it" / "land
   the PR" / `/shipit`. An approved, green, or finished-looking PR is *not*
   ship intent — the user decides when to land.
2. **CI green** (step 4), which gates the merge mechanically — a red or timed
   out check stops the land before `gh pr merge` ever runs.

The first guard is [human control rules](../team/principles/human-control.md) applied to
the merge: an irreversible act fires on stated intent, never on state, and
granted authorization is spent, not re-asked.

**Do not ask the user to confirm the merge.** Ship intent already carried the
authorization to merge, so a confirmation re-requests permission the invocation
granted, and every caller that chains into `/shipit` inherits the stop. Once
step 4 reports green, merge. The guard against merging the wrong thing is
refusing to start without ship intent, not stopping halfway through a land the
user asked for.

Ticket completion comes from the PR body's `Closes #<n>` link; this skill performs no board mutation.

## Procedure references

Read each reference completely when reaching that stage. Follow them in order; later stages depend on state and gates established earlier.

1. [Input acquisition](references/01-input-acquisition.md)
2. [Land sequence](references/02-land-sequence.md)

## Applied principles

Read and apply: [execution rules](../team/references/execution.md).
