## Execution

Read [bug-fix playbook](playbooks/bug-fix.md) before proceeding, and follow it.

When the failure is non-obvious, read the [diagnosis reference](references/diagnosis.md) and drill its
**Root Cause Analysis (5 Whys)** causal chain to the root before proposing a
fix.

When the buggy behavior looks deliberate — a guard, a threshold, a
workaround, anything an author plausibly wrote on purpose — call the
Skill tool with `why` on that code before changing it. A "bug" that was a
deliberate trade-off needs its constraint preserved, not deleted; the `why`
findings become inputs to the minimal fix.

**Mechanical gate between Red and Green:** the new test must fail with an
assertion failure, not a crash, and the project's static checks (typecheck,
lint, build) must pass. Do not proceed to the fix until both are confirmed.
