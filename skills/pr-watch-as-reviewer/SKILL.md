---
name: pr-watch-as-reviewer
description: 'Watches a reviewed PR and approves settled feedback. Trigger on "approve the PR when my comments are resolved", "watch and approve", or "/pr-watch-as-reviewer"; user-invoked only.'
effort: medium
argument-hint: "[<pr-number-or-url>]"
disable-model-invocation: true
---

# pr-watch-as-reviewer — reviewer-side watch-and-approve loop

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

Feedback comes in two shapes, and the watch tracks both:

- a **review thread** — an inline comment anchored to a diff line, which
  GitHub gives a resolved/unresolved bit.
- a **plain PR comment** — a top-level issue comment on the
  conversation tab, which GitHub gives **no resolution bit at all**. A
  whole-PR review posted as one comment body (the common shape for an
  automated or summary review) lands here.

That asymmetry drives the whole design below. A thread has an explicit
author action — resolving it — that says "I am done with this". A plain
comment has no such affordance: there is nothing for the author to
click.

Neither is trusted on its own. **The only thing that settles either is
the state of the branch, read as it now stands.** A resolve is a claim
by the person whose code you are approving; it can be clicked over a
concern that was never addressed. So every item is verified against the
current code, always. The two shapes differ only in which way an unclear
read falls:

- a **plain comment** requires that the head advanced after it — no push
  since the comment means nothing could have addressed it — and an
  unclear read leaves it unsettled.
- a **resolved thread** is verified too, but the author's explicit
  assertion earns deference: overturning it takes very high confidence
  and strong disagreement, not a quibble.

The approval body discloses how many approved items were of each shape,
so a reader can see which evidence the approval rested on.

**Every verdict is published where the author will see it.** A reply
that meets the concern resolves the thread. A reply that does not draws
a rebuttal naming the specific gap. A reply that is read, judged, and
then left sitting is the failure mode this skill exists to avoid: the
author cannot tell a considered acceptance from an unread one, and a
thread that stays open with no answer reads as a reviewer who
disappeared. Silence is not an answer.

## Procedure references

Read each reference completely when reaching that stage. Follow them in order; later stages depend on state and gates established earlier.

1. [Hard rules](references/01-hard-rules.md)
2. [Input](references/02-input.md)
3. [Execution](references/03-execution.md)
4. [1. Arm](references/04-1-arm.md)
5. [2. Tracked set and gate](references/05-2-tracked-set-and-gate.md)
6. [3. Bounded cycle mechanics](references/06-3-bounded-cycle-mechanics.md)
7. [4. Poll](references/07-4-poll.md)
8. [5. Stop conditions](references/08-5-stop-conditions.md)
9. [6. Approve](references/09-6-approve.md)
10. [Compaction defense](references/10-compaction-defense.md)

## Applied principles

Load and apply: `principle-bounded-loops`, `principle-generator-evaluator`,
`principle-non-blocking-waits`.
