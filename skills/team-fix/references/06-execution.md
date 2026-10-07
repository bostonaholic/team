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

## Step dispatch

Read [step delegation](../team/references/step-delegation.md) before the
first dispatch. Worktree, ticket moves, the Red gate, and the abort decision
stay inline. Each other step runs in its own fresh subagent, one at a time.
Every brief carries the artifact directory, `1-task.md`, the
[bug-fix playbook](playbooks/bug-fix.md), and the paths the earlier steps
returned.

| Step | Brief adds | Edits | Returns |
| --- | --- | --- | --- |
| Reproduce | playbook `Triage` and `Step 1`; the [diagnosis reference](references/diagnosis.md) | none; writes only `docs/plans/<id>/reproduction.md` | triage class, exact inputs, actual and expected behavior, affected `file:line`, the `reproduction.md` path |
| Red | `reproduction.md`; playbook `Step 2`; the [testing rules](../team/references/testing.md) | test files only; no commit | test path, run command, failing assertion line, static-check results |
| Green | `reproduction.md`; the Red return; playbook `Step 3`; the rationale-tracing rule above | production code only; never the new test; no commit | changed files, root cause in one line, the test command's passing output |
| Verify | the Red and Green returns; playbook `Step 4` | temporary mutation-check revert, restored before return | full-suite result, original-input rerun, mutation-check result, related instances |
| Ship | the Red, Green, and Verify returns; [Ship](references/07-ship.md) | the two commits, push, draft PR, screenshots | commit SHAs, PR URL, screenshot status |

**Red gate (inline).** Rerun the Red command yourself. Advance only when it
fails through the reported assertion, not a crash, and the reported static
checks pass. Otherwise re-dispatch Red with the gate's output.

A `BLOCKED` return that reports no reproduction, or a fix larger than
expected, follows [Aborting](references/08-aborting.md) without a retry.
