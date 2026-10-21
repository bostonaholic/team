# Tracking tickets

## Best-effort, tracker-agnostic, never blocking

If the project defines no tracker-move mechanism (no ticket, or an unreachable tracker), skip silently and continue. Never block the pipeline on a tracker update.

## Pickup: move the ticket to in-progress

When a run resolves its input to a ticket id or issue, move that ticket to its tracker's in-progress state as the run's first action, before any other work.

## PR open: link the PR to the ticket

When the PR phase opens a pull request and `1-task.md`'s frontmatter has `ticketId` set, **link the PR to the ticket**. On GitHub, render the link as a closing line, **the first line of the PR body** (`Closes #<n>`). For another tracker, use its PR↔issue link mechanism.

### Interpreting `ticketId`

At PR-open time:

- A bare number → `Closes #<n>` (a GitHub issue in the origin repo).
- A qualified reference (`owner/repo#<n>`) or an issue URL → `Closes` plus that value, e.g. `Closes https://github.com/owner/repo/issues/42`.
- Any other non-null shape → still `Closes` plus the value verbatim. Note the unrecognized shape in the completion report, and never block on it. On GitHub such a value (e.g. `Closes ENG-1234`) auto-closes nothing; the tracker-move rules here advance the ticket.
- Null, absent, empty, or whitespace-only → omit the closing line entirely. No placeholder, no empty line.

### Multi-repo: the home PR alone closes the ticket

In multi-repo mode, only the **home** repo's PR carries the closing keyword (`Closes #<n>`), so the ticket closes exactly once, when the home PR merges. Companion PRs carry a **non-closing** reference in the same first-line position, in the qualified form (`owner/repo#<n>` or the issue URL):

```
Part of owner/repo#<n>
```

Never a bare `#<n>` (it names a companion-repo issue) or a qualified closing form (it closes on the first companion merge).

## Ready for review: in-review only when the draft is promoted

**Never move the ticket to in-review while the PR is a draft.** At open time the ticket keeps its in-progress state. Move it to the tracker's in-review state **only once the PR is marked ready for review** (non-draft — on GitHub, `gh pr view --json isDraft`).

## Merge: never close tickets by hand

The PR link auto-closes the ticket on merge, so the orchestrator never closes tickets by hand. Surface the `ticketId` in the completion report.
