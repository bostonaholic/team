# Behind-base recovery

Use this only when the post-CI `mergeStateStatus` is `BEHIND`.

1. Record the base branch reported by the PR.
2. Fetch that branch and rebase the current feature branch onto it.
3. If the rebase conflicts, leave it intact, report `git status`, and stop.
   The user may resolve and continue or run `git rebase --abort`.
4. Publish with an explicit `--force-with-lease=<branch>:<pre-rebase-push-SHA>`;
   never use a tracking-ref-only lease or bare `--force`.
5. Restart settling and the full CI gate. The old result covered the old
   history.

If the lease rejects, fetch and report the remote change. Do not retry a
history rewrite against a new remote value without renewed explicit intent.
