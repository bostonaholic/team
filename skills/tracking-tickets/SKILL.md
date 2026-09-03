---
name: tracking-tickets
description: Apply Team's ticket lifecycle and PR-linking rules for tracker-backed work.
user-invocable: false
---

# Tracking Tickets

## Input

Use the ticket resolved by the caller or `1-task.md`'s `ticketId`. Every
tracker action is best-effort, tracker-agnostic, and must never block the
pipeline. If no mechanism or ticket exists, skip silently.

## Required lifecycle

1. **Pickup:** move the ticket to in-progress before other work.
2. **PR open:** link the PR to the ticket.
3. **Ready:** move to in-review only after the PR is non-draft. Never move a
   draft PR's ticket to in-review.
4. **Merge:** never close the ticket by hand; the PR link closes it.

For GitHub, emit the closing line as the final line of the PR body:

- Bare number: `Closes #<n>`.
- Qualified `owner/repo#<n>` or issue URL: `Closes <value>`.
- Other non-null value: emit `Closes <value>`, note that it may not
  auto-close, and continue.
- Null, absent, empty, or whitespace-only: omit the line entirely; no placeholder.

In multi-repo mode, only the home PR carries the closing keyword. Companion
PRs use a non-closing, qualified final-line reference:

```
Part of owner/repo#<n>
```

Never use a bare companion `#<n>`; it refers to that repo's issue.

## Done

Report `ticketId` and any unrecognized shape. Tracker failure never changes
the pipeline verdict.
