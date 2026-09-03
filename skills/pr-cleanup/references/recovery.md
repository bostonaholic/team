# Cleanup recovery

Load only after a failure or partial rerun.

- Re-derive repository, default branch, branch, PR, and worktree anchors in
  the same shell call as the next action. Never reuse remembered shell state.
- Re-query GitHub and local refs. An absent target is complete, not failure.
- A branch checked out in an external worktree remains for that manager.
- A `merged` identity/containment failure requires a new explicit
  delete-anyway answer before `branch -D`.
- A failed worktree removal preserves the directory; show status and request
  force approval only in `merged`. Explicit `abandon` already covers it.
- A failed remote deletion may leave `refs/remotes/origin/<branch>`; prune only
  after `ls-remote` proves the remote branch absent.
- Never retry a close or deletion against a newly resolved target without
  showing the changed identity.
