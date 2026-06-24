---
title: Project Tracking
description: "How work on the Team plugin is tracked — the GitHub Project board is the single source of truth for features, bugs, and chores, moved across a Backlog → Ready → In progress → In review → Done kanban."
audience: [developer]
nav_order: 7
nav_label: project-tracking
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
the existing labels; do not invent new ones casually.

These are the **only** labels in the repository. The "Definition" column is the
label's own GitHub description; the "Assign when" column is the rule an agent
follows to decide whether the label applies. They fall into four groups: pick
**exactly one Type label** for every issue, then add other labels only when
their "Assign when" rule is satisfied.

### Type — what the work is (assign exactly one)

Every issue gets exactly one type label. This is the primary axis for filtering
the board. If none of the three fits, the item is almost certainly a
`question`, not work.

| Label | Definition | Assign when |
|-------|------------|-------------|
| `bug` | Something isn't working | Existing behavior is broken, incorrect, or crashes — a defect in shipped functionality. Reproduction steps belong in the issue. |
| `enhancement` | New feature or request | New capability, or an improvement to existing behavior that works but should do more or do it better. **This is the "feature" label — there is no separate `feature` label.** |
| `documentation` | Improvements or additions to documentation | The change is to docs only (`README`, `docs/`, `AGENTS.md`, code comments) with no behavior change. If code *and* docs change, use the code label (`bug`/`enhancement`), not this. |

### Resolution — why a card was closed (assign only while closing)

These are *close reasons*, not work to be done. Assign one **at the moment you
close the issue**; never leave a resolution label on an open card. They do not
replace the Type label — an invalid bug keeps `bug` and gains `invalid`.

| Label | Definition | Assign when |
|-------|------------|-------------|
| `duplicate` | This issue or pull request already exists | Closing because the same item is already tracked elsewhere. Link the original in a comment. |
| `invalid` | This doesn't seem right | Closing because the report doesn't hold up — not reproducible, misfiled, or out of scope for this repo. |
| `wontfix` | This will not be worked on | Closing by deliberate decision not to act, even though the item may be valid. State the reasoning in a comment. |

### Discussion — not committed work

| Label | Definition | Assign when |
|-------|------------|-------------|
| `question` | Further information is requested | The item is a request for information or a discussion, not a unit of work. Keep it in **Backlog** (or close once answered); never pull a `question` into *In progress*. Drop it once it converts into a `bug`/`enhancement`. |

### Contributor signals — additive, layered on a Type label

These help humans find work; they never replace a Type label and an agent
rarely needs to apply them on its own.

| Label | Definition | Assign when |
|-------|------------|-------------|
| `good first issue` | Good for newcomers | The work is self-contained, well-scoped, and needs little repo context — a safe entry point for a first-time contributor. |
| `help wanted` | Extra attention is needed | Maintainers are explicitly inviting someone else to pick this up. |

### Area — mostly automated

These mark *what part of the codebase* a change touches. Dependabot applies
them automatically to the PRs it opens; an agent should hand-apply one only
when a PR genuinely fits the area and the bot missed it.

| Label | Definition | Assign when |
|-------|------------|-------------|
| `dependencies` | Pull requests that update a dependency file | A PR bumps or changes a dependency manifest/lockfile. Normally set by Dependabot. |
| `ruby` | Pull requests that update ruby code | A PR changes Ruby code. Normally set by Dependabot. |

### Decision procedure for an agent

1. **Pick the one Type label** — `bug` if existing behavior is broken,
   `enhancement` if it's new/better capability, `documentation` if it's docs
   only. Can't pick one? It's a `question`.
2. **Stop there for a normal open issue.** Type label (or `question`) is
   usually the whole answer.
3. **Add `good first issue` / `help wanted`** only if that signal is true — and
   only on top of a Type label, never instead of one.
4. **Add an Area label** (`dependencies` / `ruby`) only for a PR that fits it
   and only if automation missed it.
5. **Add a Resolution label** (`duplicate` / `invalid` / `wontfix`) *only* in
   the same action that closes the issue, with a one-line reason in a comment.
6. **Never** add a status-like label (no "wip", "in review", "blocked") — the
   board's **Status** field owns progress. And never invent a label that isn't
   in the tables above; if one is genuinely missing, raise it with the
   maintainer first — label sprawl makes the board harder to filter, not
   easier.

```sh
# Apply or change labels from the CLI:
gh issue edit <number> --repo bostonaholic/team --add-label enhancement
gh issue edit <number> --repo bostonaholic/team --add-label "good first issue"

# The authoritative list always lives here:
gh label list --repo bostonaholic/team
```

## The kanban flow

Cards move left to right through the status columns. The column *is* the status
of the work.

| Column | Meaning | Move here when… |
|--------|---------|-----------------|
| **Backlog** | Captured but not started. Not yet committed to. | The card is created. |
| **Bugs** | A **Backlog for `bug`-labeled issues only** — a convenience view so open bugs are easy to spot. Treated exactly like **Backlog**: captured, not started, not committed to. Not a separate stage in the flow. | A `bug` issue is captured. Use this instead of **Backlog** so it shows in the bugs view; it is picked up into **In progress** the same way. |
| **Ready** | Shaped and ready to be picked up. Has enough detail to start. | The work is well-understood and prioritized. |
| **In progress** | Actively being worked on. | You start work — open a worktree, run `/team`, or begin coding. |
| **In review** | Implementation complete; a PR is open and under review. | A pull request is opened for the card. |
| **Done** | Merged and complete. | The PR is merged. |

> **The Bugs column.** `Bugs` is an entry bucket, not a stage. It is the same as
> `Backlog` (captured-but-not-started) but reserved for `bug` issues so they are
> easy to find at a glance. Everything that treats `Backlog` as "not started yet"
> treats `Bugs` identically — a bug issue is groomed to `Ready` and/or picked up
> into `In progress` from `Bugs` exactly as a non-bug issue is from `Backlog`.

**Move the card as the work moves.** Pull a card into **In progress** when
you start, not after — from `Ready`, `Backlog`, or `Bugs`, whichever it sits in.
When the PR opens, move it to **In review**. When the PR merges, move it to
**Done**.

Dragging the card on the board UI is the simplest way. From the CLI, two small
helper scripts in `.claude/scripts/` compose over a pipe — one resolves an
issue number to its board item ID, the other sets a Status column by name:

```sh
# Move issue #42's card to "In review":
.claude/scripts/project-item-id.sh 42 | .claude/scripts/project-set-status.sh "In review"
```

`project-item-id.sh <issue-number>` prints the board item ID to stdout (and
nothing else, so it pipes cleanly). `project-set-status.sh <status> [item-id]`
takes the column name (case-insensitive: `Backlog` / `Bugs` / `Ready` /
`In progress` / `In review` / `Done`) and reads the item ID from stdin or a
second argument.
Both resolve every GitHub node ID at runtime, so they keep working if a field
or option is recreated. They are dev-only helpers (under `.claude/`), not part
of the distributed plugin.

## How it ties to the QRSPI pipeline

A Team run (`/team`, or the individual `/team-*` phases) maps onto the board
like this:

- **Picking up work** → the card moves to **In progress** **automatically** as
  the first action of the run, from whichever entry column it sits in (**Ready**,
  **Backlog**, or **Bugs**). When `/team` or `/team-fix`
  is given a ticket id or issue, its Setup step performs the generic,
  best-effort "move to in-progress" defined in `skills/team/SKILL.md` and
  `skills/team-fix/SKILL.md`. The runtime stays tracker-agnostic; **this repo's
  concrete binding** is the board scripts under `.claude/scripts/`. For an
  issue number `<N>`:
  ```sh
  .claude/scripts/project-item-id.sh <N> | .claude/scripts/project-set-status.sh "In progress"
  ```
  Best-effort: if the card can't be resolved (no board item, free-form
  description), the run continues without it — the move never blocks the
  pipeline. You no longer need to pre-move the card by hand before launching.
- **Opening the PR** → the card moves to **In review** **automatically**. The PR
  phase (`/team-pr`, the `/team` PR gate, and `/team-fix` Ship) performs the
  generic, best-effort "move to in-review" defined in those skills, and links
  the PR to the issue (`Closes #<N>` in the PR body) so the issue closes on
  merge. **This repo's concrete binding** is the same board scripts. For an
  issue number `<N>`:
  ```sh
  .claude/scripts/project-item-id.sh <N> | .claude/scripts/project-set-status.sh "In review"
  ```
  Best-effort: if the card can't be resolved, the run continues — the move never
  blocks opening the PR.
- **Merge** → the card moves to **Done** **automatically**. Because the PR
  carries `Closes #<N>`, merging it closes the issue, and the board's built-in
  "an item is closed → Done" automation moves the card. No manual move and no
  `/shipit` board logic is involved — `/shipit` stays tracker-agnostic. (A PR
  added to the board as its own item is likewise moved to **Done** by the
  built-in "pull request merged → Done" automation.)

The pipeline persists its own intermediate state as artifacts in
`docs/plans/<id>/` and tracks live in-session progress with TodoWrite — see
[Architecture § State Management](architecture.md#9-state-management). Those
are *execution* state; the board is *work* state. The board answers "what are
we doing and where is it?"; the artifacts answer "how is this specific feature
being built?"

## Read next

- **[Overview](index.md)** — what Team is and how the pipeline runs.
- **[Architecture](architecture.md)** — full design and artifact conventions.
