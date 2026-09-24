---
name: pr-watch-as-author
description: 'Use for watching authored PRs only on explicit request. Never infer from an open PR. Monitors feedback and CI.'
effort: medium
argument-hint: "[<pr-number-or-url>]"
---

# pr-watch-as-author — bounded PR review watch loop

Before each consuming step, read its linked shared rules from this installed skill directory.
If a required read fails, stop that step with the exact path. Never use checkout fallback or recursive loading.

Feedback arrives in three disjoint shapes, all triaged: an **inline review
thread** (anchored to a diff line, with a resolved/unresolved bit), a **plain
PR comment**, and a **review summary** (separate from its inline comments).
Only the thread carries a resolution bit. A review summary or conversation
comment is triaged **once**, keyed by its id, and never joins a gate waiting
to be resolved.

## Procedure references

Read each reference completely when reaching that stage. Follow them in order; later stages depend on state and gates established earlier.

1. [Input](references/01-input.md)
2. [1. Arm](references/03-1-arm.md)
3. [2. Bounded cycle mechanics](references/04-2-bounded-cycle-mechanics.md)
4. [3. Poll and change detection](references/05-3-poll-and-change-detection.md)
5. [4. On new feedback — run the triage procedure](references/06-4-on-new-feedback-run-the-triage-procedure.md)
6. [Authorized mode — apply, resolve, resume](references/07-authorized-mode-apply-resolve-resume.md)
7. [5. Edge cases](references/08-5-edge-cases.md)
8. [6. Stop conditions](references/09-6-stop-conditions.md)
9. [7. On approval — hand off, never land](references/10-7-on-approval-hand-off-never-land.md)
10. [Compaction defense](references/11-compaction-defense.md)

## Applied principles

Read and apply: [execution rules](../team/references/execution.md),
[durable state rules](../team/principles/durable-state.md), and
[external data rules](../team/references/external-data.md).
