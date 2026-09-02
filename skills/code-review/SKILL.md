---
name: code-review
description: Dispatches a fresh-context code review of a diff and prints the reviewer's report in full; the review methodology itself lives in `reviewing-code`, which the review agents load. Trigger on "review this diff", "review these changes", "code review this", or "/code-review".
---

# Code Review

## When Invoked Directly

When a user asks for a review in the main session ("review this diff",
`/code-review`), the session itself is not a valid reviewer — it holds the
conversation history `reviewing-code` forbids. Do not review inline.
Dispatch the `code-reviewer` agent (or, if unavailable, a fresh read-only
subagent instructed to follow `reviewing-code`) against the requested diff,
then present its report in full, in the shape `reviewing-code`'s
`## Report Format` pins — never a summary of it. The methodology
`reviewing-code` carries is what that dispatched reviewer applies.

## Methodology

Call the Skill tool with `reviewing-code`.
