### Step 3 — refuse a dirty tree

Run `git -C "$PRIMARY_ROOT" status --porcelain` — and when the target
branch lives in a linked worktree, run
`git -C "$WORKTREE_PATH" status --porcelain` there too, deriving
`$WORKTREE_PATH` with the `worktree list --porcelain` read loop shown in
Mode A step 2 (Mode B step 2 uses the same derivation) — never invent
another lookup. Untracked generated reports are disposable in
Mode B only; tracked modifications always stop the run. Surface them — do
not discard work.
