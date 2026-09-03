---
title: Project Tracking
description: "How the project tracks work on the Team plugin. The GitHub Project board is the single source of truth for features, bugs, and chores. Cards move across a Backlog → Ready → In progress → In review → Done kanban."
audience: [developer]
nav_order: 7
nav_label: project-tracking
---

# Project Tracking

> **Audience:** Plugin maintainers and contributors. End users do not need
> this. It describes how work on the Team plugin *itself* is tracked.

All work on the Team plugin is tracked on a single GitHub Project board:

**→ [🤖 Team Project Board](https://github.com/users/bostonaholic/projects/5/views/1)**

This board is the **single source of truth** for what is planned, in
flight, and done. Features, bugs, and chores all live here. If a piece of
work is not on the board, it is not tracked.

> **Note:** This board replaces the previous `bd` (beads) tracker, which
> has been removed from the repo. Historical beads issues are preserved in
> git history (`.beads/issues.jsonl`).

## The board

The board is backed by issues in the
[`bostonaholic/team`](https://github.com/bostonaholic/team) repository. Each
card is a GitHub issue, or a draft item that someone converts to one. Cards
carry a few fields beyond the title:

| Field | Purpose |
|-------|---------|
| **Status** | Which kanban column the card is in (see below). |
| **Priority** | `P0` (drop everything) … `P2` (eventually). **Necessary on every card.** Every `bug` is `P0` (see [Creating work](#creating-work)). |
| **Size** | Rough effort estimate. |
| **Labels** | What kind of work this is, and how to handle it (see [Labels](#labels)). |
| **Linked pull requests** | The pull requests that implement the card. |

## Creating work

Create a card for every distinct piece of work: one card per feature, bug,
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
   Then set **Status**, **Priority** (**necessary**, see below), **Size**, and
   its **type label** (see [Labels](#labels)) from the board or the issue
   sidebar.
3. **Quick capture.** For an idea you have not fully shaped yet, add a
   *draft item* directly on the board (the "+ Add item" row). Convert it to a
   real issue before anyone starts work on it.

> **Rule: every issue carries a `Priority`.** A card is not fully created until
> it has a `P0`, `P1`, or `P2` set. An issue with no priority is untriaged. Set
> the priority when you file the issue, or the moment you add it to the board.
> Do not leave it blank.

> **Rule: every `bug` is `P0`.** When you file or triage a bug, set its
> **Priority** to `P0`. Bugs take precedence over features and enhancements.
> There is no lower-priority bug. A defect that is not worth other work dropped
> for it is usually an `enhancement`, not a `bug`.

## Labels

Labels classify *what a card is* and *how to handle it*. The kanban column
already tracks *where it is*, so labels never duplicate status. Reuse the
existing labels. Do not invent new ones casually.

These are the **only** labels in the repository. The "Definition" column is the
label's own GitHub description. The "Assign when" column is the rule an agent
obeys to decide if the label applies. The labels fall into four groups. Pick
**exactly one Type label** for every issue. Then add other labels only when
their "Assign when" rule holds.

### Type: what the work is (assign exactly one)

Every issue gets exactly one type label. This is the primary axis for filtering
the board. If none of the three fits, the item is almost certainly a
`question`, not work.

| Label | Definition | Assign when |
|-------|------------|-------------|
| `bug` | Something isn't working | Existing behavior is broken or incorrect, or it crashes. It is a defect in shipped functionality. Reproduction steps belong in the issue. **Always set Priority `P0`** (see [Creating work](#creating-work)). |
| `enhancement` | New feature or request | A new capability. It can also be an improvement to behavior that works but must do more. **This is the "feature" label. There is no separate `feature` label.** |
| `documentation` | Improvements or additions to documentation | The change touches docs only (`README`, `docs/`, `AGENTS.md`, code comments), with no behavior change. If code *and* docs change, use the code label (`bug` or `enhancement`) instead. |

### Resolution: why a card was closed (assign only while closing)

These are *close reasons*, not work to do. Assign one
**at the moment you close the issue**. Never leave a resolution label on an
open card. They do not replace the Type label. An invalid bug keeps `bug` and
gains `invalid`. On a card that reached **Done** without a merged PR, the
resolution label is what distinguishes it from merged work.

| Label | Definition | Assign when |
|-------|------------|-------------|
| `duplicate` | This issue or pull request already exists | You close the issue because the same item is already tracked elsewhere. Link the original in a comment. |
| `invalid` | This doesn't seem right | You close the issue because the report does not hold up. It is not reproducible, it is misfiled, or it is out of scope for this repo. |
| `wontfix` | This will not be worked on | You close the issue by a deliberate decision not to act. The item can still be valid. State the reasoning in a comment. |

### Discussion: not committed work

| Label | Definition | Assign when |
|-------|------------|-------------|
| `question` | Further information is requested | The item is a request for information or a discussion, not a unit of work. Keep it in **Backlog**, or close it after someone answers it. Never pull a `question` into *In progress*. Drop the label after the item converts into a `bug` or an `enhancement`. |

### Contributor signals: additive, layered on a Type label

These help humans find work. They never replace a Type label, and an agent
rarely needs to apply them on its own.

| Label | Definition | Assign when |
|-------|------------|-------------|
| `good first issue` | Good for newcomers | The work is self-contained and well-scoped, and it needs little repo context. It is a safe entry point for a first-time contributor. |
| `help wanted` | Extra attention is needed | Maintainers are explicitly inviting someone else to pick this up. |

### Area: mostly automated

These mark *what part of the codebase* a change touches. Dependabot applies
them automatically to the PRs it opens. Apply one by hand only when a PR
genuinely fits the area and the bot missed it.

| Label | Definition | Assign when |
|-------|------------|-------------|
| `dependencies` | Pull requests that update a dependency file | A PR bumps or changes a dependency manifest or lockfile. Dependabot normally sets it. |
| `ruby` | Pull requests that update ruby code | A PR changes Ruby code. Dependabot normally sets it. |

### Decision procedure for an agent

1. **Pick the one Type label.** Use `bug` if existing behavior is broken. Use
   `enhancement` for a new or better capability. Use `documentation` for a
   docs-only change. If you cannot pick one, the item is a `question`.
2. **Stop there for a normal open issue.** The Type label, or `question`, is
   usually the whole answer.
3. **Add `good first issue` or `help wanted`** only if that signal is true, and
   only on top of a Type label. Never use one instead of a Type label.
4. **Add an Area label** (`dependencies` or `ruby`) only for a PR that fits it,
   and only if automation missed it.
5. **Add a Resolution label** (`duplicate`, `invalid`, or `wontfix`) *only* in
   the same action that closes the issue. Give a one-line reason in a comment.
6. **Never** add a status-like label such as "wip", "in review", or "blocked".
   The board's **Status** field owns progress. Never invent a label that is not
   in the tables above. If one is genuinely missing, raise it with the
   maintainer first. Label sprawl makes the board harder to filter, not easier.

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
| **Bugs** | A **Backlog for `bug`-labeled issues only**. It is a convenience view that makes open bugs easy to spot. The card is captured, not started, and not committed to. This is not a separate stage in the flow. | Someone captures a `bug` issue. Use this column instead of **Backlog**, so the card shows in the bugs view. Bugs move **directly into In progress** from here; promotion to **Ready** is the non-bug lane's step. |
| **Ready** | Shaped and ready for someone to pick up. It has enough detail to start. **WIP-limited to 5.** | The work is well-understood and prioritized, and Ready has an open slot (see the WIP limit below). |
| **In progress** | Someone is working on it now. | You start work. You open a worktree, run `/team`, or begin to code. |
| **In review** | Implementation is complete. A PR is ready and under review. | Someone **marks the card's pull request ready for review**. That is the trigger: a card sits in **In progress** for as long as its PR is a draft. |
| **Done** | Merged and complete. An issue closed without a merged PR also lands here, through the issue-close automation. | The PR is merged, or the issue is closed without one (the issue-close automation moves the card). |

> **The Bugs column.** `Bugs` is an entry bucket, not a stage. It holds the same
> captured-but-not-started state as `Backlog`, reserved for `bug` issues so they
> are easy to find at a glance. **Two lanes share one tail.** A `bug` enters at
> `Bugs` and moves straight into `In progress`, because the `Bugs` column *is*
> its ready-to-pull state. A non-bug enters at `Backlog` and is promoted to
> `Ready` first. From `In progress` on, both lanes run the same stages, and
> promotion to `Ready` is the non-bug lane's step.

> **WIP limit on `Ready`.** The `Ready` column is capped at **5** cards. This is
> a work-in-progress limit. When the column is full, promote a new card only by
> **a swap**, and never above the cap. Pick what is genuinely most important and
> move the displaced card back to `Backlog`. GitHub Projects' column limits are
> a view-level UI setting, and the API does not expose them reliably. Treat this
> number as the source of truth, and keep the board UI limit in agreement. The
> [`/groom-backlog`](skills.md#groom-backlog) skill consumes this number. Its
> promotion mode carries the same `5` as this repo's worked example, and it
> swaps a card out rather than exceed the cap. A change here must thus change
> there too. A tripwire in `tests/groom-backlog-skill.test.ts` pins the two
> numerals together. This is the WIP-limited-kanban discipline that the
> loop-driven controller in
> [#90](https://github.com/bostonaholic/team/issues/90) builds on. Other columns
> can carry their own limits under that model.

**Move the card as the work moves.** Pull a card into **In progress** when you
start, not after. Pull it from `Ready` for non-bug work, or from `Bugs` for bug
work. When someone marks the PR ready for review, move the card to
**In review** — a review-ready PR is what moves the card, so a card sits in
**In progress** for as long as its PR is a draft. When the PR merges, move the
card to **Done**.

The simplest way is to drag the card on the board UI. From the CLI, two small
helper scripts in `.claude/scripts/` compose over a pipe. One resolves an issue
number to its board item ID. The other sets a Status column by name:

```sh
# Move issue #42's card to "In review":
.claude/scripts/project-item-id.sh 42 | .claude/scripts/project-set-status.sh "In review"
```

`project-item-id.sh <issue-number>` prints the board item ID to stdout. It
prints nothing else, so it pipes cleanly.
`project-set-status.sh <status> [item-id]` takes the column name and reads the
item ID from stdin or from a second argument. The column name is
case-insensitive: `Backlog`, `Bugs`, `Ready`, `In progress`, `In review`, or
`Done`. Both scripts resolve every GitHub node ID at runtime, so they continue
to work if someone recreates a field or an option. They are dev-only helpers
under `.claude/`. They are not part of the distributed plugin.

> **Token scopes.** Reading the board needs the `read:project` scope and
> editing a card needs `project`; a default `gh auth login` token carries
> neither. Without them `gh issue edit --add-project` reports the project as
> not found and the scripts above fail with gh's own message naming the
> scope. Grant it once: `gh auth refresh -s project`.

> **The script checks each move. It does not assume it.**
> `project-set-status.sh` does not trust the edit's exit code. It fires `gh
> project item-edit` and does not suppress the command's output. It then
> **re-reads the authoritative project-side status. It fails loudly if that
> status does not match the column you asked for.** It prints `... (verified)`
> only when the read-back agrees. A zero exit from the script thus means the
> move genuinely landed, not only that GitHub accepted the mutation. This closes
> [#141](https://github.com/bostonaholic/team/issues/141), where an edit
> reported success but the board looked unchanged. >
> **UI-refresh trap.** The GraphQL value is authoritative. An *already-open*
> board tab is not. The Projects UI does not always live-update an open view. A
> move that the script reports as `(verified)` can thus look stale in a tab you
> left open. **Hard-refresh the board**, or reopen the view, to see it. Trust
> the script's verified read-back over a stale tab. When you edit by hand, never
> pipe `item-edit` through `tail`, `head`, or any command that swallows its
> output. That masks a silent or partial write. Let the script do the check
> instead.

## How it ties to the QRSPI pipeline

A Team run (`/team`, or the individual `/team-*` phases) maps onto the board
like this:

- **Shaping work, before any run** →
  [`/groom-backlog`](skills.md#groom-backlog) is the one board-touching command
  that is not a pipeline phase. Its board-level pass places and prioritizes
  items, and it fixes hygiene across the whole board. Its promotion mode moves
  a single card from **Backlog** to **Ready** after that item meets the
  ready-to-work standard. Both halves plan and wait for your approval. Nothing
  moves before you answer. Neither half ever starts a run.
- **Picking up work** → the card moves to **In progress** **automatically** as
  the first action of the run. It moves from whichever entry column holds it:
  **Ready**, **Backlog**, or **Bugs**. Give `/team` or `/team-fix` a ticket id
  or an issue. Its Setup step then does the generic, best-effort "move to
  in-progress" that `skills/team/SKILL.md` and `skills/team-fix/SKILL.md`
  define. The runtime stays tracker-agnostic. **This repo's concrete binding**
  is the board scripts under `.claude/scripts/`. For an issue number `<N>`:
  ```sh
  .claude/scripts/project-item-id.sh <N> | .claude/scripts/project-set-status.sh "In progress"
  ```
  The move is best-effort. If the script cannot resolve the card, because there
  is no board item or the description is free-form, the run continues without
  it. The move never blocks the pipeline. You no longer need to move the card
  by hand before you launch.
- **Opening the PR** → the PR phase links the PR to the issue. This covers
  `/team-pr`, the `/team` PR gate, and `/team-fix` Ship. The link is
  `Closes #<N>` as the final line of the PR body, so the issue closes on merge.
  In a multi-repo run, only the home repo's PR carries the closing keyword.
  Companion PRs carry a non-closing qualified reference, either
  `owner/repo#<N>` or the issue URL. The pipeline opens the PR as a **draft**.
  A draft is not under review, so **the card stays in In progress**. The
  generic contract in those skills forbids the in-review move while the PR is a
  draft.
- **Marking the PR ready for review** → the card moves to **In review**. The
  human marks the PR ready. The generic, best-effort "move to in-review" that
  the PR-phase skills define fires at this moment, never when someone opens the
  draft. **This repo's concrete binding** is the same board scripts. For an
  issue number `<N>`:
  ```sh
  .claude/scripts/project-item-id.sh <N> | .claude/scripts/project-set-status.sh "In review"
  ```
  The move is best-effort. If the script cannot resolve the card, the run
  continues. The move never blocks the PR.
- **Merge** → the card moves to **Done** **automatically**. The PR carries
  `Closes #<N>`, so the merge closes the issue. The board's built-in "an item
  is closed → Done" automation then moves the card. In a multi-repo run,
  close-on-merge fires from the home repo PR's merge specifically. Companion
  PRs carry no closing keyword. No manual move and no `/shipit` board logic
  applies, because `/shipit` stays tracker-agnostic. The built-in "pull request
  merged → Done" automation also moves a PR that someone added to the board as
  its own item.

The pipeline persists its own intermediate state as artifacts in
`docs/plans/<id>/`. It tracks live in-session progress with TodoWrite. See
[Architecture § State Management](architecture.md#9-state-management). Those
artifacts are *execution* state. The board is *work* state. The board answers
"what are we doing, and where is it?" The artifacts answer "how does this
specific feature get built?"

## Read next

- **[Overview](index.md)**: what Team is and how the pipeline runs.
- **[Architecture](architecture.md)**: full design and artifact conventions.
