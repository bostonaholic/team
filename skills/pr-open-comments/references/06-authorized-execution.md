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

- Every item in step 3's open-feedback set appears in the output exactly once
  — under `Auto-applied` or `Needs your decision` — and the punch-list blocks
  are globally numbered. Use GraphQL node ids to prevent duplicates.
- Every auto-applied item cleared the bar. It had confidence above 90%
  assigned after verification, a `STILL RELEVANT` verdict, and no
  exclusion hit. Its change stayed bounded to the anchored file and
  lines, and its report line names its confidence and landing commit SHA.
- Each `Needs your decision` item shows the file path and line, or
  "PR-level" for review summaries and conversation comments. It also shows the author handle, body
  excerpt, URL, and a verification verdict with evidence. It ends with a
  menu of 2–4 tailored options and exactly one recommendation with a
  one-line rationale. Auto-applied items are one-line entries with
  confidence and commit SHA.
- Every item carries a step 4 verdict backed by evidence. Where the claim
  is behavioral, the evidence is a specific named test with its run
  result. Otherwise current code, diff, or a commit SHA. No comment is
  triaged on the assumption that it is still accurate.
- No reaction went out ahead of the decision that picks it. An
  auto-applied item another author wrote carries 👍 on its one-line
  entry. A punch-list item carries none yet, and its menu names the
  reaction each option would place. No item is reacted to twice, and no
  reaction failure stopped the triage.
- Delete throwaway reproduction tests written during verification before
  step 6 (auto-apply) runs, and always before any commit. Leave the
  working tree as you found it.
- Items the current diff already resolves are called out (option **F**) —
  check with `git diff origin/<base>...HEAD -- <path>` before you
  recommend F.
- Nothing is silently dropped. Ambiguous items surface as
  `NEEDS CLARIFICATION`, not guesses.
- In default mode the turn ends with an explicit hand-off prompt. No file
  edits, replies, or thread resolutions occur in that turn for items that
  did not clear the auto-apply bar.

- Do not rely on `gh pr view --json reviews` for resolution state — reviews
  do not expose thread resolution. Follow the shared pull-request comment
  retrieval from step 2 for all three shapes.
- Do not treat `isOutdated` as resolved. An outdated thread can still be
  blocking if the concern survived the rebase.
- `gh api repos/{owner}/{repo}/pulls/{n}/comments` returns every inline
  comment ever made on the PR, including resolved ones. Prefer the GraphQL
  `reviewThreads` query.
- Pagination: any of the three top-level connections, or a thread's comment
  connection, can exceed 100 nodes. Complete every `after:` cursor before
  triage.
- A thread can hold many comments — the first comment is usually the ask.
  Later comments can already answer it. Scan the full thread before you
  classify.
