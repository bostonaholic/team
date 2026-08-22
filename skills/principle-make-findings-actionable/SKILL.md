---
name: principle-make-findings-actionable
description: A finding names the condition, the evidence, and the consequence — pointed to by conventional-comments, solid-principles, and engineering-standards when a problem is reported.
user-invocable: false
---

# Make Every Finding Actionable

A principle, not a gate. A finding names the condition, carries or cites the
evidence, and states the consequence — what breaks, or what the reader gives
up by leaving it alone. A finding without a reason loses the rationale for
whoever reads it next, who has neither the context that produced it nor a way
to weigh it against everything else competing for attention. This holds
wherever one party reports a problem to another: a review comment, a commit
body, an assertion message, an error a user reads.

## What it rules out

- **A verdict with no reason.** "This is wrong" and "do not do this" name a
  conclusion and withhold the finding.
- **Evidence withheld.** An assertion that prints a boolean where it could
  print both values, or a log line that reports a failure without the input
  that caused it, forces the reader to reproduce what the reporter already
  had.
- **A finding with no address.** No file and line, no named rule, no named
  checklist item — the reader is left to guess which of several candidates is
  meant.
- **A consequence left implied.** Naming a violation without saying what it
  costs *here, now* leaves the reader unable to rank it, and unranked findings
  get answered in arrival order rather than in severity order.

## Boundary

- It governs the content of a finding, never its severity or its tone. Tone is
  `principle-critique-the-code-not-the-coder`, and the severity vocabulary
  belongs to whichever review format is in use.
- It does not require a fix. Naming the condition, the evidence, and the
  consequence is the bar; proposing the remedy is welcome but is often not the
  reporter's call to make.
- Evidence too large to carry is cited, not pasted. A path, a line, or a run
  identifier satisfies this rule.

## Where it applies

- `skills/conventional-comments/SKILL.md`
- `skills/solid-principles/SKILL.md`
- `skills/engineering-standards/SKILL.md`
