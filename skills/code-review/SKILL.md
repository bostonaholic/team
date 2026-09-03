---
name: code-review
description: Fresh-context review of a resolved diff. Trigger on "review this diff", "review these changes", "code review this", or "/code-review".
effort: high
argument-hint: "[<diff target>]"
---

# Code Review

Resolve `$ARGUMENTS` once as a PR, branch, commit range, or path. With no
argument, use the working-tree diff against its base.

1. Call the Skill tool with `reviewing-code` and read `## Report Format`.
2. Dispatch `code-reviewer` with fresh context and the resolved target; never
   review inline from the conversation that produced the change.
3. If that agent is unavailable, dispatch a built-in read-only `Explore`
   subagent with the same target and report contract. Never substitute a
   write-capable reviewer.
4. Relay the complete report according to `## Report Format`; do not summarize
   away findings or verdicts.
