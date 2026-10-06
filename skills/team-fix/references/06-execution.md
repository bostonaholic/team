## Execution

Read [bug-fix playbook](playbooks/bug-fix.md) before proceeding, and follow it.

When the failure is non-obvious, read the [diagnosis reference](references/diagnosis.md) and drill its
**Root Cause Analysis (5 Whys)** causal chain to the root before proposing a
fix.

When the buggy behavior looks deliberate (a guard, a threshold, a
workaround), trace its rationale before changing it: find the introducing
commit with `git log -S '<line>'`, `git blame` on the parent revision, or
`git log -- <path>`, then read that commit's message and any PR or issue
it links, as the `System Fit` item of the
[code reviewer brief](../team/references/code-reviewer.md) does. A
"bug" that was a deliberate trade-off needs its constraint preserved, not
deleted.

**Mechanical gate between Red and Green:** the new test must fail with an
assertion failure, not a crash, and the project's static checks (typecheck,
lint, build) must pass. Do not proceed to the fix until both are confirmed.
