## Authorized Execution

This path runs in two cases:

- **Automatically, per item,** for a default-mode item that clears the
  auto-apply bar (Hard Rule 2).
- **For the whole batch, whatever the confidence,** when the user
  explicitly directs you to apply changes for the PR comments. Examples
  are "apply the changes for these comments", "address comments 3, 5, 7",
  and "fix the PR feedback".

In both cases the exclusions below stay absolute.

After you finish the code changes for a given feedback item, complete the loop
automatically — do not ask for permission to reply or, for an inline thread,
resolve:

1. **Push the changes.** Stage only the anchored file(s) the change
   touched — never `git add -A` or `git commit -a` — then commit and
   push, so the reply references landed code.
2. **Reply to the item.** For an inline comment, reply on its review thread.
   For a review summary or conversation comment, post a top-level reply that
   links the item. Describe the change and cite the exact commit SHA that
   contains it as bare text (no backticks).
3. **Resolve inline threads only.** Call the `resolveReviewThread` mutation
   only for a `reviewThreads` item. Review summaries and conversation comments
   have no resolve operation; their handling ends after the reply.

Do this per item as each one finishes — reply and, where supported, resolve
immediately without a confirmation prompt. The user already authorized it.

Exclusions (still pause and ask):

- The comment was **declined / will-not-fix** — make sure of the
  rationale before you reply. Do not auto-resolve a disagreement.
- The comment is `NEEDS CLARIFICATION` — ask the reviewer when the ask
  itself is unclear, present the choice to the user when the user owns
  it, instead of resolving.
- You could not make the requested change — report it. Never reply "done"
  or resolve the thread without landed code.
- The change would introduce a new security-sensitive construct —
  exec/eval-like code, a network call, or credential handling. Never
  auto-push it — present it for explicit review instead.

### Reply + resolve mechanics

Reply to a review comment thread (use the thread's first comment id as
`in_reply_to`). Pass the body on stdin (`-F body=@-`) so reply text is
never interpolated into the shell command:

```bash
gh api --method POST "repos/$OWNER/$REPO/pulls/$NUMBER/comments" \
  -F body=@- -F "in_reply_to=$FIRST_COMMENT_DATABASE_ID" <<'GH_REPLY_EOF'
<what changed> — landed in <bare-sha>
GH_REPLY_EOF
```

Resolve the thread (needs the thread's GraphQL node id, available as `id`
on each `reviewThreads` node):

```bash
gh api graphql -f query='
mutation($threadId: ID!) {
  resolveReviewThread(input: {threadId: $threadId}) {
    thread { isResolved }
  }
}' -F threadId="<thread-node-id>"
```

The shared step 2 query supplies the thread node `id` and every inline
comment's `databaseId`.

- Every item in step 3's open-feedback set appears in the output exactly
  once — under `Auto-applied` or `Needs your decision`. Use GraphQL node ids
  to prevent duplicates.
- A `Needs your decision` item from a review summary or conversation comment
  shows "PR-level" in place of the file path and line.
- An auto-applied item another author wrote carries 👍 on its one-line
  entry.
- Leave the working tree as you found it.
- Items the current diff already resolves are called out (option **F**) —
  check with `git diff origin/<base>...HEAD -- <path>` before you
  recommend F.
- Nothing is silently dropped. Ambiguous items surface as
  `NEEDS CLARIFICATION`, not guesses.

- Do not treat `isOutdated` as resolved. An outdated thread can still be
  blocking if the concern survived the rebase.
- `gh api repos/{owner}/{repo}/pulls/{n}/comments` also returns resolved
  inline comments. Prefer the GraphQL `reviewThreads` query.
- Pagination: any of the three top-level connections, or a thread's comment
  connection, can exceed 100 nodes. Complete every `after:` cursor before
  triage.
- The first comment of a thread is usually the ask, but later comments can
  already answer it. Scan the full thread before you classify.
