---
name: tracking-tickets
description: Ticket-lifecycle discipline for tracker-linked pipeline runs — when a ticket moves to in-progress and in-review, how the PR links to the ticket with a conditional closing footer (including the multi-repo home-only rule), and why tickets are never closed by hand. Load when picking up a ticketed task, opening a PR for a ticketed topic, or deciding a ticket's tracker-state transition.
user-invocable: false
---

# Tracking Tickets

The single rule set for how a pipeline run interacts with a tracking
ticket (a GitHub issue, or any other tracker the project uses). The
entry-point skills that pick up tickets or open PRs point here for the
rules and keep only their own procedural glue.

## Best-effort, tracker-agnostic, never blocking

Every tracker interaction below is best-effort and tracker-agnostic: if
the project defines no tracker-move mechanism (e.g. a free-form
description with no ticket, or a tracker the environment can't reach),
skip silently and continue. Never block the pipeline on a tracker
update.

## Pickup: move the ticket to in-progress

When a run resolves its input to a ticket id or issue, move that ticket
to its tracker's in-progress state — this is the first action of the
run, before any other work begins.

## PR open: link the PR to the ticket

When the PR phase opens a pull request and `task.md`'s frontmatter has
`ticketId` set, **link the PR to the ticket** so the tracker closes the
ticket — and any board automation moves it to its done state — when the
PR merges. On GitHub, render the link as a closing line emitted **as
the final line of the PR body** (`Closes #<n>`); for another tracker
use its PR↔issue link mechanism.

### Interpreting `ticketId`

`ticketId` is interpreted where it is consumed — at PR-open time:

- A bare number → `Closes #<n>` (a GitHub issue in the origin repo).
- A qualified reference (`owner/repo#<n>`) or an issue URL → `Closes`
  followed by that value substituted in — e.g.
  `Closes https://github.com/owner/repo/issues/42`.
- Any other non-null shape still goes in verbatim as the footer text
  (`Closes` plus the value), but note the unrecognized shape in the
  completion report — never block on it. On GitHub such a value (e.g.
  `Closes ENG-1234`) auto-closes nothing — the footer is then a legible
  reference only, and the tracker-move rules on this page are what
  advance the ticket.
- Null, absent, empty, or whitespace-only → omit the closing line
  entirely; no placeholder, no empty footer.

### Multi-repo: the home PR alone closes the ticket

In multi-repo mode, only the **home** repo's PR carries the closing
keyword (`Closes #<n>`) — so the ticket closes exactly once, when the
home PR merges. Companion PRs carry a **non-closing** reference to the
issue in the same footer position, using the unambiguous qualified form
(`owner/repo#<n>` or the issue URL) — for example:

```
Part of owner/repo#<n>
```

A bare `#<n>` is repo-scoped — in a companion repo it names a
*different* issue — and even a qualified *closing* form would close the
ticket on the first companion merge, before the full change set lands.

## Ready for review: in-review only when the draft is promoted

**Never move the ticket to in-review while the PR is a draft.** A draft
is not under review, and the pipeline opens PRs as drafts — at open
time the ticket keeps its in-progress state. Move the ticket to the
tracker's in-review state **only once the PR is marked ready for
review** (non-draft — on GitHub, `gh pr view --json isDraft`).

## Merge: never close tickets by hand

Because the PR link auto-closes the ticket on merge, the orchestrator
never closes tickets by hand. Surface the `ticketId` in the completion
report.
