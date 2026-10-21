## Execution

Read the [bug-fix playbook](playbooks/bug-fix.md) and follow it.

For a non-obvious failure, read the [diagnosis reference](references/diagnosis.md)
and drill its **Root Cause Analysis (5 Whys)** chain to the root before
proposing a fix.

When buggy behavior looks deliberate (a guard, a threshold, a workaround),
trace its rationale before changing it: find the introducing commit with
`git log -S '<line>'`, `git blame` on the parent revision, or
`git log -- <path>`, and read its message and any linked PR or issue. A
deliberate trade-off keeps its constraint.

## Step dispatch

Read [step delegation](../team/references/step-delegation.md) before the
first dispatch. Worktree, ticket moves, the Red gate, and the abort decision
stay inline. Each other step runs in its own fresh subagent, one at a time.
Every brief carries the artifact directory, `1-task.md`, the
[bug-fix playbook](playbooks/bug-fix.md), and the paths earlier steps
returned.

| Step | Brief adds | Edits | Returns |
| --- | --- | --- | --- |
| Reproduce | playbook `Triage` and `Step 1`; the [diagnosis reference](references/diagnosis.md) | none; writes only `docs/plans/<id>/reproduction.md` | triage class, exact inputs, actual and expected behavior, affected `file:line`, the `reproduction.md` path |
| Red | `reproduction.md`; playbook `Step 2`; the [testing rules](../team/references/testing.md) | test files only; no commit | test path, run command, failing assertion line, static-check results |
| Green | `reproduction.md`; the Red return; playbook `Step 3`; the rationale-tracing rule above | production code only; never the new test; no commit | changed files, root cause in one line, the test command's passing output |
| Verify | the Red and Green returns; playbook `Step 4` | temporary mutation-check revert, restored before return | full-suite result, original-input rerun, mutation-check result, related instances |
| Ship | the Red, Green, and Verify returns; [Ship](references/07-ship.md) | the two commits, push, draft PR, screenshots | commit SHAs, PR URL, screenshot status |

**Red gate (inline, between Red and Green).** Rerun the Red command yourself.
Advance only when the new test fails through the reported assertion, not a
crash, and the project's static checks (typecheck, lint, build) pass.
Otherwise re-dispatch Red with the gate's output.

A `BLOCKED` return reporting no reproduction, or a fix larger than expected,
follows [Aborting](references/08-aborting.md) without a retry.
