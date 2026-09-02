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

Run the four steps below **in this order**. This skill carries the report
template by reference, not by value, so a step that shapes the report needs a
template this session has already read. Out of order, the shape of the report
becomes a per-call choice, and two runs on the same diff come back different.

1. **Load the format first.** Call the Skill tool with `reviewing-code` and
   read its `## Report Format` section. It lists every heading the report
   carries, and the order they are emitted in.
2. **Dispatch the review.** Dispatch the `code-reviewer` agent against the
   resolved target. That agent preloads `reviewing-code`, so it already holds
   the format. When the agent is unavailable, dispatch the built-in read-only
   `Explore` subagent instead, and put the format in its prompt: tell it to
   call the Skill tool with `reviewing-code`, review the resolved target by
   that methodology, and return its report in the exact shape that skill's
   `## Report Format` pins. A brief that names no format gets back a shape the
   subagent invented.
3. **Relay the report in full.** Print what the reviewer returned, in the
   shape `## Report Format` pins — the verdict line, then every one of its
   `###` headings, in the template's order. Never a summary, never a subset.
4. **Report a deviation. Never repair it.** When the returned report drops a
   heading, adds one the template does not list, or reorders them, print the
   report as returned and name the deviation on a line of its own. A relay
   that quietly reshapes the report makes itself a second place the format is
   decided, which is what this order exists to prevent.

The methodology `reviewing-code` carries is what that dispatched reviewer
applies.

## Methodology

Call the Skill tool with `reviewing-code`.
