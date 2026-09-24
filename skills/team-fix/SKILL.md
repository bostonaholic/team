---
name: team-fix
description: 'Use for the full bug-fix pipeline only on explicit request. Never infer from an ordinary bug fix. Runs the compressed pipeline.'
effort: high
argument-hint: "<ticket id, issue URL, or bug description>"
---

# Team Fix — Bug Fix Pipeline

Before each consuming step, read its linked shared rules from this installed skill directory.
If a required read fails, stop that step with the exact path. Never use checkout fallback or recursive loading.

Invocation is guarded per [human control rules](../team/principles/human-control.md): the
pipeline fires only on stated pipeline intent — a plain "fix this bug" asks
for an inline fix, not this pipeline.

## Core contracts

- Run `WORKTREE → REPRODUCE → RED → GREEN → VERIFY → SHIP` in order.
- For a ticket, read [tracking rules](../team-pr/references/tracking.md); move the ticket to in-progress before work and in-review only after its draft PR becomes ready.
- When behavior looks deliberate, call the Skill tool with `why` before changing it.

## Procedure references

Read each reference completely when reaching that stage. Follow them in order.

1. [Input](references/01-input.md)
2. [When to Use](references/02-when-to-use.md)
3. [Pipeline](references/03-pipeline.md)
4. [Setup](references/04-setup.md)
5. [Worktree](references/05-worktree.md)
6. [Execution](references/06-execution.md)
7. [Ship](references/07-ship.md)
8. [Aborting](references/08-aborting.md)

## Applied principles

Read and apply: [bug fix rules](playbooks/bug-fix.md) and [execution rules](../team/references/execution.md).
