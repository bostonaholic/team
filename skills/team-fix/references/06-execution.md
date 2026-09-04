## Execution

Call the Skill tool with `test-driven-bug-fix` before proceeding, and follow that
methodology.

When the failure is non-obvious, call the Skill tool with
`systematic-debugging` and drill its
**Root Cause Analysis (5 Whys)** causal chain to the root before proposing a
fix. The fix lands at the root, never at the symptom, per
`principle-fix-root-causes`.

When the buggy behavior looks deliberate — a guard, a threshold, a
workaround, anything an author plausibly wrote on purpose — call the
Skill tool with `why` on that code before changing it. A "bug" that was a
deliberate trade-off needs its constraint preserved, not deleted; the
rationale findings become inputs to the minimal fix.

Mark each TodoWrite item `in_progress` when you begin and `completed`
when it finishes.

**Mechanical gate between Red and Green:** the new test must fail with an
assertion failure, not a crash, and the project's static checks (typecheck,
lint, build) must pass. Do not proceed to the fix until both are confirmed. A
runner that executes tests without type-checking them leaves a red type checker
behind a green suite.
