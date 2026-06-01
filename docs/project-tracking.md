---
title: Project Tracking
description: "How work on the Team plugin is tracked — the GitHub Project board is the single source of truth for features, bugs, and chores, moved across a Backlog → Ready → In progress → In review → Done kanban."
---

# Project Tracking

> **Audience:** Plugin maintainers and contributors. End users do not need
> this — it describes how work on the Team plugin *itself* is tracked.

All work on the Team plugin is tracked on a single GitHub Project board:

**→ [🤖 Team — Project Board](https://github.com/users/bostonaholic/projects/5/views/1)**

This board is the **single source of truth** for what is planned, in
flight, and done. Features, bugs, and chores all live here. If a piece of
work is not on the board, it is not tracked.

> **Note:** This board replaces the previous `bd` (beads) tracker. The
> `.beads/` directory remains in the repo for historical reference, but new
> work should be created and tracked on the GitHub Project, not in beads.

## The board

The board is backed by issues in the
[`bostonaholic/team`](https://github.com/bostonaholic/team) repository. Each
card is a GitHub issue (or a draft item that gets converted to one). Cards
carry a few fields beyond title:

| Field | Purpose |
|-------|---------|
| **Status** | Which kanban column the card is in (see below). |
| **Priority** | `P0` (drop everything) … `P2` (eventually). |
| **Size** | Rough effort estimate. |
| **Labels** | What kind of work this is and how it should be handled — see [Labels](#labels). |
| **Linked pull requests** | The PR(s) that implement the card. |

## Creating work

Create a card for every distinct piece of work — one card per feature, bug,
or chore.

1. **Open an issue** in `bostonaholic/team` describing the work. Use a clear,
   action-oriented title (e.g. "Add rate limiting to API endpoints", "Fix
   stale cache after profile update").
   ```sh
   gh issue create --repo bostonaholic/team \
     --title "Fix stale cache after profile update" \
     --label bug
   ```
2. **Add it to the board** and set its fields:
   ```sh
   gh issue edit <number> --repo bostonaholic/team \
     --add-project "🤖 Team"
   ```
   Then set **Status**, **Priority**, **Size**, and its **type label** (see
   [Labels](#labels)) from the board or the issue sidebar.
3. **Quick capture** — for an idea you have not fully shaped yet, add a
   *draft item* directly on the board (the "+ Add item" row). Convert it to a
   real issue before anyone starts work on it.

## Labels

Labels classify *what a card is* and *how it should be handled* — the kanban
column already tracks *where it is*, so labels never duplicate status. Reuse
the existing labels; do not invent new ones casually. They fall into four
groups.

### Type — what the work is (apply exactly one)

Every issue gets exactly one type label. This is the primary axis for
filtering the board.

| Label | Use it for |
|-------|------------|
| `bug` | Something isn't working — a defect in existing behavior. |
| `enhancement` | A new feature or improvement to existing behavior. *(This is the "feature" label — there is no separate `feature` label.)* |
| `documentation` | Improvements or additions to docs only — no behavior change. |

### Resolution — why a card was closed (apply when closing)

These are *close reasons*, not work to be done. Apply one **and close the
issue** at the same time; never leave a resolution label on an open card.

| Label | Apply when closing because… |
|-------|------------------------------|
| `duplicate` | The same issue or PR already exists. Link the original. |
| `invalid` | The report doesn't hold up — not reproducible or out of scope. |
| `wontfix` | A deliberate decision not to act on it. Say why in a comment. |

### Discussion — not committed work

| Label | Use it for |
|-------|------------|
| `question` | A request for information or a discussion, not a unit of work. Keep these in **Backlog** (or close once answered); don't pull them into *In progress*. |

### Contributor signals — layer on top of a type label

These help others find work; they never replace a type label.

| Label | Meaning |
|-------|---------|
| `good first issue` | Self-contained and well-scoped — a good entry point for a newcomer. |
| `help wanted` | Maintainers are actively looking for someone to take this. |

### Area labels — mostly automated

`dependencies` and `ruby` are applied automatically by Dependabot to the PRs
it opens (dependency-file updates, and Ruby code updates respectively). Don't
hand-apply them unless a PR genuinely fits and the bot missed it.

### Rules of thumb

- **One type label, always.** `bug`, `enhancement`, or `documentation` — pick
  the one that fits. If it's none of these, it's probably a `question`.
- **Resolution labels travel with a close.** `duplicate` / `invalid` /
  `wontfix` on an *open* issue is a contradiction.
- **Labels describe the work; the board column describes its progress.** Don't
  add a "wip" or "in review" label — that's what Status is for.
- **`good first issue` / `help wanted` are additive**, layered onto a type
  label, never a substitute for one.
- **Stick to the existing set.** Need a label that doesn't exist? Raise it
  with the maintainer before creating one — label sprawl makes the board
  harder to filter, not easier.

```sh
# Apply or change labels from the CLI:
gh issue edit <number> --repo bostonaholic/team --add-label enhancement
gh issue edit <number> --repo bostonaholic/team --add-label "good first issue"
```

## The kanban flow

Cards move left to right through five columns. The column *is* the status of
the work.

| Column | Meaning | Move here when… |
|--------|---------|-----------------|
| **Backlog** | Captured but not started. Not yet committed to. | The card is created. |
| **Ready** | Shaped and ready to be picked up. Has enough detail to start. | The work is well-understood and prioritized. |
| **In progress** | Actively being worked on. | You start work — open a worktree, run `/team`, or begin coding. |
| **In review** | Implementation complete; a PR is open and under review. | A pull request is opened for the card. |
| **Done** | Merged and complete. | The PR is merged. |

**Move the card as the work moves.** Pull a card into **In progress** when
you start, not after. When the PR opens, move it to **In review**. When the
PR merges, move it to **Done**.

```sh
# Update an item's Status field from the CLI (see `gh project --help`),
# or just drag the card on the board UI.
```

## How it ties to the QRSPI pipeline

A Team run (`/team`, or the individual `/team-*` phases) maps onto the board
like this:

- **Picking up work** → move the card from **Ready** to **In progress** before
  you launch the pipeline.
- **The PR phase** (`/team-pr`) opens a draft pull request. Link that PR to the
  card and move the card to **In review**.
- **Merge** → move the card to **Done**.

The pipeline persists its own intermediate state as artifacts in
`docs/plans/<id>/` and tracks live in-session progress with TodoWrite — see
[Architecture § State Management](architecture.md#9-state-management). Those
are *execution* state; the board is *work* state. The board answers "what are
we doing and where is it?"; the artifacts answer "how is this specific feature
being built?"

## Read next

- **[Overview](index.md)** — what Team is and how the pipeline runs.
- **[Architecture](architecture.md)** — full design and artifact conventions.
