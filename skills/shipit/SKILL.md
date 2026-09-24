---
name: shipit
description: 'Use for landing reviewed PRs only on explicit request. Never infer from approval, green CI, or completion. Verifies and merges.'
effort: medium
argument-hint: "[<pr-number>]"
---

# shipit — land a reviewed PR

Before each consuming step, read its linked shared rules from this installed skill directory.
If a required read fails, stop that step with the exact path. Never use checkout fallback or recursive loading.

`shipit` lands a reviewed PR: land-time versioning, push, CI wait, squash-merge.
The PR title, with any version `version-bump` puts in it, lands as the commit
subject in `git log`. It is generic: it invokes `version-bump`, which decides
from project context whether to commit a bump, land with no bump, or stop.

`gh pr merge` is irreversible. Two guards protect it, neither a frontmatter flag
nor a question put to the user mid-run:

1. **Explicit ship intent.** The skill fires only on a direct "ship it" / "land
   the PR" / `/shipit`. An approved, green, or finished-looking PR is *not*
   ship intent.
2. **CI green** (step 4) gates the merge mechanically: a red or timed-out check
   stops the land before `gh pr merge` runs.

The first guard is [human control rules](../team/principles/human-control.md) applied to
the merge: an irreversible act fires on stated intent, never on state, and
granted authorization is spent, not re-asked.

**Do not ask the user to confirm the merge.** Once step 4 reports green, merge.

Ticket completion comes from the PR body's `Closes #<n>` link; this skill performs no board mutation.

## Procedure references

Read each reference completely when reaching that stage. Follow them in order; later stages depend on state and gates established earlier.

1. [Input acquisition](references/01-input-acquisition.md)
2. [Land sequence](references/02-land-sequence.md)

## Applied principles

Read and apply: [execution rules](../team/references/execution.md).
