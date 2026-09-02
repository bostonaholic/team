---
name: code-review
description: Dispatches a fresh-context code review of a diff and prints the reviewer's report in full; the review methodology itself lives in `reviewing-code`, which the review agents load. Trigger on "review this diff", "review these changes", "code review this", or "/code-review".
effort: high
argument-hint: "[<diff target>]"
---

# Code Review

## Input

`$ARGUMENTS` names the diff to review — a PR number or URL, a branch, a
commit range, or a path. It is optional: with no argument, review the
working tree's diff against the base branch. Resolve it once and pass the
resolved target to the reviewer; never ask the user to restate it.

## When Invoked Directly

When a user asks for a review in the main session ("review this diff",
`/code-review`), the session itself is not a valid reviewer — it holds the
conversation history `reviewing-code` forbids. Do not review inline.
Dispatch the `code-reviewer` agent (or, if unavailable, a fresh read-only
subagent instructed to follow `reviewing-code`) against the resolved diff,
then present its report in full, in the shape `reviewing-code`'s
`## Report Format` pins — never a summary of it. The methodology
`reviewing-code` carries is what that dispatched reviewer applies.

## Methodology

Call the Skill tool with `reviewing-code`.
