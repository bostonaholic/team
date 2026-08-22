---
name: principle-fail-loudly
description: Surface a failure where a reader will see it; silence is not success — pointed to by engineering-standards and code-review when error handling is written or reviewed.
user-invocable: false
---

# Surface The Failure

A principle, not a gate. Surface a failure where a reader will see it: the
caller, the log, the test output, the exit code. Silence is not success — a
path that swallows an error reports exactly what a path that worked reports,
and the difference shows up later, further away, and in someone else's hands.
Report it at the level that can act on it.

## What it rules out

- **A catch that swallows an error** and hands back a default, an empty list,
  or a null, leaving the caller to continue as though the call had succeeded.
- **A failure that only whispers** — logged at debug level, logged to a stream
  nobody reads, or reduced to a code with no condition named.
- **A test that passes when its subject never ran.** A skipped assertion, a
  swallowed setup error, or a negative check that could never find a positive
  all report green for the wrong reason.
- **A zero exit code on a failed step**, or a summary that reports success
  while an inner step reported nothing at all.
- **A partial write left unreported.** Half the work landing counts as a
  failure of the whole, and reporting the successful half alone is silence
  about the rest.

## Boundary

- It governs the primary path. A step that a skill declares **best-effort** is
  not a swallowed error when it is skipped, and that carve-out belongs to
  `degrade-never-block`. This rule does not override it.
- It requires the failure to be surfaced, not that everything come to a halt.
  A run that reports and then carries on has satisfied this rule; what the run
  does afterward is its own decision.
- Loudness is not volume. One clearly addressed failure beats a wall of
  warnings, and `principle-make-findings-actionable` governs what the report
  has to contain.

## Where it applies

- `skills/engineering-standards/SKILL.md`
- `skills/code-review/SKILL.md`
