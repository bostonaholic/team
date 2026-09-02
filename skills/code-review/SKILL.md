---
name: code-review
description: Dispatches a fresh-context code review of a diff and prints the reviewer's report in full; the review methodology itself lives in `reviewing-code`, which the review agents load. Trigger on "review this diff", "review these changes", "code review this", or "/code-review".
effort: high
argument-hint: "[<diff target>]"
---

# Code Review

## Input

`$ARGUMENTS` names the diff — a PR number or URL, a branch, a commit range,
or a path. With no argument, review the working tree's diff against the base
branch. Resolve it once and pass the resolved target to the reviewer; never
ask the user to restate it.

## When Invoked Directly

The main session holds the conversation history `reviewing-code` forbids, so
it is not a valid reviewer. Do not review inline. Run these in order:

1. **Load the format.** Call the Skill tool with `reviewing-code` and read
   its `## Report Format`. Order matters: a relay cannot hold a shape it has
   not read, and loading it after the dispatch is the defect this sequence
   fixes.
2. **Dispatch.** Dispatch the `code-reviewer` agent, which preloads
   `reviewing-code`, against the resolved target. When it is unavailable,
   dispatch the built-in read-only `Explore` subagent and write the same
   `## Report Format` requirement into its prompt.
3. **Relay.** Print what the reviewer returned. `## Report Format` states
   what a relay owes, and what to do with a report that does not match it.
