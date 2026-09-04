### Step 1 — detect the default branch

Run, in order, the first that succeeds — the result is `$DEFAULT`:

1. `git -C "$PRIMARY_ROOT" symbolic-ref --short refs/remotes/origin/HEAD`
   (strip the `origin/` prefix).
2. `git -C "$PRIMARY_ROOT" remote set-head origin --auto`, then retry the
   `symbolic-ref` above.
3. Offline fallback: probe which of `main` or `master` exists locally via
   `git -C "$PRIMARY_ROOT" rev-parse --verify --quiet <name>`.
4. Neither exists → stop and ask the user.

Like the step 0 block, this detection re-runs in every Bash invocation
that consumes `$DEFAULT` (Hard Rule 11) — a fresh invocation that assumed
`$DEFAULT` survived from an earlier one would run its guards against an
empty value.
