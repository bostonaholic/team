# Cleanup recovery

Load only after a failure or partial rerun.

- Re-derive repository, default branch, branch, PR, and worktree anchors in
  the same shell call as the next action. Never reuse remembered shell state.
- Re-query GitHub and local refs. An absent target is complete, not failure.
- A branch checked out in an external worktree remains for that manager.
- A Mode A identity/containment failure requires a new explicit
  delete-anyway answer before `branch -D`.
- A failed worktree removal preserves the directory; show status and request
  force approval only in Mode A. Mode B's explicit abandon already covers it.
- A failed remote deletion may leave a remote-tracking ref; prune only after
  `scripts/context.mjs remote-head` proves the branch absent at the binding's
  validated push URL.
- Never retry a close or deletion against a newly resolved target without
  showing the changed identity.
