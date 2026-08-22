---
name: principle-targeted-exception-scopes
description: Wrap exactly the call that can throw, catch the specific subclass, chain the cause — pointed to by engineering-standards when error handling is written or reviewed.
user-invocable: false
---

# Wrap Only What Can Throw

A principle, not a gate. A try block wraps exactly the call that can throw,
the catch names the specific exception subclass, and the rethrow carries the
original cause chained. A wide scope with a broad catch is where unrelated
failures go to be forgotten: the handler was written for one error and now
absorbs every error, including the ones nobody has thought about yet.

## What it rules out

- **A broad catch around a large block** — `catch (Exception e)` over a
  dozen statements answers for failures the author never considered.
- **A try block that spans setup, the risky call, and the work that follows.**
  Only the risky call belongs inside; a bug in the follow-up work then reads
  as a failure of the call.
- **A rethrow that drops the cause**, throwing a fresh exception with a
  summary message and discarding the stack that explains it.
- **A catch that logs and continues**, leaving the caller to proceed on a
  half-built value as though nothing happened.

## Boundary

- It governs the shape of a handler, not whether to handle at all. Letting an
  exception propagate to the caller that can act on it is frequently the right
  answer, and this rule says nothing against it.
- A process boundary legitimately catches broadly. A request handler, a CLI
  entry point, or a worker loop exists to keep the process alive and report,
  so the narrow-scope rule targets handlers in the middle, not the edge.
- It says nothing about what the handler then does with the failure. Whether
  the failure is surfaced or absorbed is the `Explicit Error Handling`
  checklist item in `engineering-standards`.

## Where it applies

- `skills/engineering-standards/SKILL.md`
