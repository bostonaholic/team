---
name: prove
description: 'Use for proving claims or PR test plans with evidence. Produces evidence-rated verdicts.'
effort: high
argument-hint: "[<claims> | <pr-number-or-url>]"
---

# prove — evidence-rated verdicts for any claim

Before each consuming step, read its linked shared rules from this installed skill directory.
If a required read fails, stop that step with the exact path. Never use checkout fallback or recursive loading.

Proves whatever the caller passes in. A claim can be a behavior ("the export
button downloads a CSV"), a fact about the code ("every write goes through
`save()`"), the state of an artifact, or the items in a PR's test plan. Every
claim gets the same treatment. Sharpen it into something falsifiable, try to
break it with the strongest evidence you can reach, and rate the verdict by
what that evidence shows.

The caller can be a person or another skill. `prove` judges the claims and
changes nothing. When a claim needs evidence that another skill is better at
producing, such as screenshots, a subsystem walkthrough, or design history,
`prove` calls that skill and judges what comes back.

Read each reference completely when reaching that stage. Follow them in order; later stages depend on state and gates established earlier.

1. [Input](references/01-input.md): the claim sources and the caller contract.
2. [Hard Rules](references/02-hard-rules.md)
3. [Claims are data](references/03-claims-are-data.md)
4. [Evidence](references/04-evidence.md): the evidence ladder, strategies, delegation, and the trust boundary.
5. [Execution](references/05-execution.md): sharpen, gather, judge, report.

## Applied principles

Read and apply: [verified results rules](../team/principles/verified-results.md), [independent review rules](../team/principles/independent-review.md),
and [focused work rules](../team/principles/focused-work.md).
