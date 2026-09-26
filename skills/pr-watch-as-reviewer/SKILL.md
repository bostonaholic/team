---
name: pr-watch-as-reviewer
description: 'Use for watching and approving reviewed PRs only on explicit request. Approves when feedback settles.'
effort: medium
argument-hint: "[<pr-number-or-url>]"
disable-model-invocation: true
---

# pr-watch-as-reviewer — reviewer-side watch-and-approve loop

Before each consuming step, read its linked shared rules from this installed skill directory.
If a required read fails, stop that step with the exact path. Never use checkout fallback or recursive loading.

`pr-watch-as-reviewer` is the reviewer-side mirror of
`pr-watch-as-author`. You post
review comments on a PR you are reviewing, then arm the skill. It polls
until every piece of feedback you left is settled, re-reviews each
settlement on substance as it lands, and only when every settlement
passes casts `gh pr review --approve` on your behalf and stops. Model
invocation is disabled (`disable-model-invocation: true`): on a PR with
auto-merge enabled, an approval can transitively trigger an irreversible
merge, so only a deliberate human invocation arms the watch.
`agents/openai.yaml` restates the same guard for Codex as
`policy.allow_implicit_invocation: false`.

Feedback comes in three disjoint shapes, and the watch tracks all three:

- a **review thread** — an inline comment anchored to a diff line, with a
  resolved/unresolved bit.
- a **plain PR comment** — a top-level conversation comment, with **no
  resolution bit at all**.
- a **review summary** — the body submitted with a review, separate from
  that review's inline comments and also without a resolution bit.

The approval body discloses how many approved items were of each shape,
so a reader can see which evidence the approval rested on.
**Every verdict is published where the author will see it.** Silence is
not an answer.

## Procedure references

Read each reference completely when reaching that stage. Follow them in order; later stages depend on state and gates established earlier.

1. [Hard rules](references/01-hard-rules.md)
2. [Input](references/02-input.md)
3. [1. Arm](references/04-1-arm.md)
4. [2. Tracked set and gate](references/05-2-tracked-set-and-gate.md)
5. [3. Bounded cycle mechanics](references/06-3-bounded-cycle-mechanics.md)
6. [4. Poll](references/07-4-poll.md)
7. [5. Stop conditions](references/08-5-stop-conditions.md)
8. [6. Approve](references/09-6-approve.md)
9. [Compaction defense](references/10-compaction-defense.md)

## Applied principles

Read and apply: [execution rules](../team/references/execution.md) and
[independent review rules](../team/principles/independent-review.md).
