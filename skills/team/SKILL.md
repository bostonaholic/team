---
name: team
description: Full 8-phase autonomous feature implementation pipeline (QRSPI). Trigger on "hey team", "build a feature", "implement end to end", "autonomous implementation", or "/team".
effort: medium
argument-hint: "<ticket id, issue URL, or feature description>"
---

# Team — Phase-Table Orchestrator

You are the Team orchestrator. The orchestrator is the **main Claude Code
session itself** — not a sub-agent. You drive a feature from description
to shipped code by walking a linear phase table, dispatching specialist
agents, and coordinating progress via TodoWrite.

You hold no special state of your own. The durable record is the set of
artifacts under `docs/plans/<id>/*.md` (each carrying YAML frontmatter
that describes its phase and revision metadata). Live
in-session coordination uses TodoWrite.

## Input

`$ARGUMENTS` may be:

- A ticket identifier (e.g. `ENG-1234`) — used as `<id>` prefix and
  recorded as `ticketId` on `task.md`.
- An issue URL (e.g. `https://github.com/org/repo/issues/42`) — fetched
  via `gh issue view` to extract the title and body.
- Free-form text — used directly as the feature description.

If `$ARGUMENTS` is empty, ask the user to describe the feature and stop.

## Setup

1. **Resolve `$ARGUMENTS`** to a description (fetch issue via `gh` if a
   URL; lookup tracker if a ticket-only ID; otherwise use as-is).
2. **Capture `ticketId`** — if `$ARGUMENTS` starts with a ticket-like
   pattern (e.g., `<system>-<id>`), set it aside as `ticketId` for
   `task.md`. Otherwise leave `ticketId` as `null`.
3. **Move the ticket to in-progress.** If a `ticketId` or issue was
   resolved in steps 1–2, move that ticket to its tracker's in-progress
   state — this is the first action of the run, before any other work
   begins. Best-effort per the ticket-lifecycle rules in
   `skills/tracking-tickets/SKILL.md` — skip silently when no tracker
   mechanism exists; never block the pipeline on a tracker update.
4. **Derive `<id>`:**
   - With ticket: `<TICKET>-<kebab-topic>` (e.g., `ENG-1234-add-auth`)
   - Without ticket: `<YYYY-MM-DD>-<kebab-topic>` (e.g.,
     `2026-05-01-add-auth`)
5. **Seed the TodoWrite ledger** with one item per phase, in order:
   `Worktree → Question → Research → Design → Structure → Plan → Implement → PR`.
   Mark `Worktree` as `in_progress`.
   See `skills/progress-tracking/SKILL.md` for the per-step tracking convention agents follow within each phase.
   The home worktree and `docs/plans/<id>/` are both created at the leading
   WORKTREE phase (see "Orchestrator-Emit Gate (leading worktree)" below) —
   not here.
6. **Resolve the canonical artifact directory.** Because artifacts now live
   inside the worktree (authored there at the leading WORKTREE phase), run
   `git worktree list` and look for a worktree path whose basename is `<id>`
   (the `.claude/worktrees/<id>` convention). If one exists, the canonical
   artifact directory is `<worktree-path>/docs/plans/<id>/` — use it for
   resume detection and for the rest of the session (thread its absolute path
   into every downstream dispatch). If no worktree for `<id>` exists, fall
   back to the in-place home `docs/plans/<id>/` (the fallback path from the
   leading WORKTREE phase). This is the orchestrator-side mirror of the
   recovery hooks' worktree discovery.
7. **Resume detection.** If artifacts already exist for `<id>` under the
   canonical artifact directory resolved in step 6, fast-forward the ledger by
   marking completed any phases whose artifacts are present. DESIGN is
   complete only when the latest `design-review-<n>.md` carries a passing
   verdict (APPROVE or COMMENT); a `design.md` with no passing review
   resumes **at the review step**, never a re-draft (any `approved` fields
   left by older runs are ignored). Then mark the first incomplete
   phase `in_progress`. **Never re-dispatch a phase whose artifact already
   exists** — re-running QUESTION over an existing `task.md`, for example,
   would overwrite in-progress work (data loss).

You hold the description in your own context. Downstream of QUESTION the
description must NEVER appear in any artifact or agent payload outside
`task.md` and the questioner's own outputs.

## The Phase Loop

```
loop:
  1. Inspect TodoWrite. If all phases are completed → exit.
  2. Identify the in_progress phase. Look it up in the phase table to
     get the expected agent(s) and predecessor artifact path(s).
  3. Verify predecessor artifacts exist on disk (for STRUCTURE, that
     includes a `design-review-<n>.md` with a passing verdict). If missing,
     report a desync and suggest re-invoking the same /team-* command.
  4. Dispatch the agent(s) (parallel where the phase table marks them).
     Subagents never pause for user input — each resolves its own open
     questions and records them as assumptions in its artifact.
  5. Write each returned artifact to docs/plans/<id>/<name>.md
     with the YAML frontmatter the agent specifies (see the agent file
     and skills/artifact-frontmatter/SKILL.md).
  6. Run the gate for this phase:
     - REVIEW (design): dispatch the adversarial design review (see
       "Design Review Gate (design)" below); write the verdict to
       `design-review-<n>.md`. On APPROVE or COMMENT, advance. On
       REQUEST CHANGES, re-dispatch design-author with the findings
       verbatim and `revision: <n+1>`, capped at 5 → terminal halt.
     - MECHANICAL (tests-failing): run the suite; on assertion-only
       failure, advance.
     - ROUTER-EMIT (worktree, PR): perform the action.
     - AGGREGATE (5 reviewers): dispatch in parallel, collect results,
       sort findings into severity tiers; auto-loop on any Blocking or
       Major finding (never consulting the user), tracking the round count
       in TodoWrite, capped at 5 rounds (at cap, terminal halt); record
       Minor-and-below for the PR body's `## Review notes`.
  7. Update TodoWrite — mark current phase `completed` and the next one
     `in_progress`.
  8. Goto loop.
```

### Phase table

| Phase      | Agent(s)                                                | Predecessor artifact                                            | Next phase on pass |
|------------|---------------------------------------------------------|-----------------------------------------------------------------|--------------------|
| WORKTREE   | (orchestrator-emit)                                     | (none — description in `$ARGUMENTS`)                            | QUESTION           |
| QUESTION   | `questioner`                                            | worktree prepared (+ description in `$ARGUMENTS`)               | RESEARCH           |
| RESEARCH   | `file-finder`, `researcher` (parallel, isolated)        | `docs/plans/<id>/questions.md`                                  | DESIGN             |
| DESIGN     | `design-author` (→ design review)                       | `docs/plans/<id>/research.md`                                   | STRUCTURE          |
| STRUCTURE  | `structure-planner`                                     | `docs/plans/<id>/design.md` + passing `design-review-<n>.md`    | PLAN               |
| PLAN       | `planner`                                               | `docs/plans/<id>/structure.md`                                  | IMPLEMENT          |
| IMPLEMENT  | `test-architect`, `implementer`, 5 reviewers (parallel) | `docs/plans/<id>/plan.md`                                       | PR                 |
| PR         | (orchestrator-emit)                                     | aggregate gate passed                                           | SHIPPED            |

For RESEARCH, dispatch `file-finder` and `researcher` in parallel passing
each only the `docs/plans/<id>/questions.md` path. Combine their returned
content into a single `docs/plans/<id>/research.md` artifact (with the
frontmatter the researcher's documentation specifies) before advancing.

`skills/team/registry.json` is an inventory of the 13 specialist agents
for documentation purposes only. The orchestrator dispatches based on
the phase table above, not on registry contents.

## Research Isolation Invariant

The questioner is the only agent that ever sees the raw description from
`$ARGUMENTS`. When dispatching the questioner, pass the full description.
When the questioner returns:

1. Confirm `task.md` and `questions.md` exist in `docs/plans/<id>/`. The
   questioner writes them directly with the required YAML frontmatter
   (see the agent file).
2. Mark Question complete in TodoWrite and Research `in_progress`.

When dispatching `file-finder` and `researcher`, pass them only the path
`docs/plans/<id>/questions.md`. They are forbidden from reading
`task.md` and the orchestrator must not provide the original description
in their context.

## Gate Handling

### Orchestrator-Emit Gate (leading worktree)

This is the **first** phase — it runs before QUESTION, off the description in
`$ARGUMENTS` alone (there is no predecessor artifact). It exists so a `/team`
run authors `docs/plans/<id>/` inside an isolated worktree on branch `<id>`
from phase 1, keeping the home checkout's `git status` clean for the whole run.

1. **Create the home worktree** on branch `<id>` off `origin/HEAD`, using
   Claude Code's native worktree support (single-repo block in
   `skills/team-worktree/SKILL.md` → "Create the worktree(s)"). Only the home
   repo gets a worktree at this phase; multi-repo secondary worktrees are
   deferred until after the design review (see "Orchestrator-Emit Gate
   (post-design-review secondary worktrees)" below). **If the run was started
   from inside a linked worktree on a non-default branch, reuse it instead of
   creating a new one** (see "Detect existing worktree" in
   `skills/team-worktree/SKILL.md`); if that worktree is on the default branch,
   stop rather than implement on it.
2. **Create `docs/plans/<id>/` inside the worktree.** The artifact directory
   lives in the worktree from the start, so no copy is ever needed.
3. **Compute the worktree's absolute path once** and thread it into every
   downstream dispatch as the worktree-rooted `docs/plans/<id>/` path. The
   main session does NOT `cd` into the worktree; it passes absolute paths to
   each agent.
4. **Edge — branch `<id>` already exists** (re-invocation): if a worktree is
   already on branch `<id>`, reuse it; do not recreate.
5. **Edge — home-worktree creation fails** (shallow clone, certain CI systems,
   permissions): report loudly and fall back to **in-place for the entire
   run** — author `docs/plans/<id>/` at the home-repo root, where the absolute
   path threaded downstream is the home-repo root. Never block the pipeline
   because worktree creation failed (mirror the best-effort fallback in
   `skills/worktree-isolation/SKILL.md` → "Fallback").

### Design Review Gate (design)

When the `design-author` returns a draft:

1. Confirm `docs/plans/<id>/design.md` exists. If the latest
   `design-review-<n>.md` already carries a passing verdict (APPROVE or
   COMMENT), skip the review and advance to STRUCTURE — a resumed
   session never re-reviews a passed design.
2. **Dispatch the adversarial review.** Call the `Agent` tool with
   `subagent_type: Explore` (the built-in read-only agent type), passing
   the `## Review brief` from
   `skills/eng-design-doc-review/SKILL.md` as the prompt (reference that
   skill's brief — never duplicate it here), with the artifact directory
   substituted. Each round gets a fresh subagent context. `Explore`
   holds no Write/Edit tools, so the reviewer **cannot** modify
   `design.md` or forge a verdict artifact; the verdict is written by
   the orchestrator alone (step 3), and the recovery hooks fail closed
   on anything but a recorded passing verdict. If the environment lacks
   the `Explore` agent type, treat the dispatch failure like a reviewer
   crash (step 6) — never substitute a full-tool agent silently.
3. **Write the verdict artifact.** Record the reviewer's findings and
   verdict verbatim to `docs/plans/<id>/design-review-<n>.md`, where
   `<n>` is the highest existing `<n>` + 1 (1 when none exists) —
   never overwrite an earlier round's record. Frontmatter: `topic`,
   `date`, `phase: design-review`, and
   `verdict: <APPROVE|REQUEST CHANGES|COMMENT>` (convention in
   `skills/qrspi-workflow/SKILL.md`).
4. On **APPROVE or COMMENT** → the review passes; advance to STRUCTURE
   in the same turn.
5. On **REQUEST CHANGES** → re-dispatch `design-author` with the
   reviewer's findings verbatim. The new draft increments
   `revision: <n+1>` in its frontmatter, then a fresh review round runs.
   Cap at `revision: 5`; at cap, halt terminally and report the
   unresolved findings — no PR. The halt message names the absolute
   worktree-rooted `docs/plans/<id>/` path, so the human can open
   `design.md` and the `design-review-<n>.md` records directly.
6. On an **unparseable verdict or a reviewer crash** → re-dispatch the
   review once with the error; on second failure, halt loudly. Never
   advance on a missing verdict — fail closed.

### Structure (no gate — autonomous)

When the `structure-planner` returns `docs/plans/<id>/structure.md`,
record it and advance to PLAN immediately. There is no approval wait —
nothing is presented for approval mid-run. Structure was formerly gated;
it now auto-advances. The artifact carries no `approved`/`approved_at`/
`revision` frontmatter.

### Orchestrator-Emit Gate (post-design-review secondary worktrees)

The home worktree is born at the leading WORKTREE phase. Secondary worktrees
(multi-repo mode) are created **after the design review**, because the set of
repos a topic touches is only confirmed once the design lands (`repos.md`).
This is the documented asymmetry: the home worktree exists from
phase 1, while secondary repos lag until post-design-review.

When the design review passes:

1. **Detect mode.** If `docs/plans/<id>/repos.md` exists, you are in
   **multi-repo mode** — create one secondary worktree per additional repo
   listed in that file, all on the same `<id>` branch. Otherwise you are in
   **single-repo mode** and nothing further is needed here (the home worktree
   already exists). See `skills/worktree-isolation/SKILL.md` for the topology
   and `skills/team-worktree/SKILL.md` for the procedure. Create the
   worktrees **without a confirmation prompt** — the phase loop never
   pauses mid-run; the "Confirm with the user" dialog in
   `skills/team-worktree/SKILL.md` applies only to standalone human
   invocation of `/team-worktree`. The resolved repo set is already
   recorded loudly in `design.md` (`## Decisions made`/`## Risks`) and
   echoed in the PR body's `## Review notes`. Before each
   `git worktree add`, re-check **containment**: the repo path's
   `realpath` must be a direct child of the home repo's parent
   directory; refuse and report any repo that fails (`repos.md` may
   have been authored without a Bash-side path check).
2. **Append a `## Worktrees` section to `repos.md`**, post-design-review,
   **back-recording the home worktree path** created at the leading WORKTREE
   phase plus each secondary repo's worktree path, so later `/team-*`
   invocations can rediscover every worktree from that one file. The other
   repos' worktrees do not duplicate the artifacts; agents that need them read
   from the home worktree path the orchestrator passes in.
3. **Edge — a secondary repo's worktree fails to create** (shallow clone, CI,
   permissions): report it and continue. That repo's portion of the work runs
   in its main tree; the pipeline is never blocked (mirror
   `skills/worktree-isolation/SKILL.md` → "Fallback").

### Mechanical Gate (test confirmation)

When the `test-architect` returns failing tests:

1. Run the test suite.
2. If all tests fail with assertion errors (not crashes), advance.
3. If tests crash or error, fix infrastructure and re-run.

### Aggregate Gate (review collection)

When the 5 reviewers (security, docs, ux, code, verifier) have all
returned:

1. Collect all verdicts from the most recent round and sort every finding
   into a severity tier — **Blocking**, **Major**, or **Minor and below** —
   per the authoritative table in `skills/review-severity-tiers/SKILL.md`
   ("Severity Tiers and the Auto-Fix Boundary"). Consult that table rather
   than restating it here.
2. Track the round count by appending a TodoWrite item like
   "Review round 2" each retry. Cap at 5 rounds.
3. While any **Blocking or Major** finding remains and under cap → dispatch
   implementer to fix, passing the typed failure class(es). After fixes, all
   5 reviewers re-run from scratch. **Never** stop to consult the user while a
   Blocking or Major finding is open — loop automatically (the no-consult
   rule).
4. If at cap → **terminal halt**: report every unresolved finding with
   its severity tier, naming the absolute worktree-rooted
   `docs/plans/<id>/` artifact path so the human can inspect the run's
   record directly. No PR is opened, no consultation happens — the run
   ends there.
5. Once Blocking and Major are clean → record any **Minor-and-below**
   findings for the PR body's `## Review notes` section, tagged by
   source reviewer — never present them mid-run — and advance
   to PR **in the same turn** — do not summarize and end the turn. The
   run is complete only when the draft PR URL is reported.

**The loop is: IMPLEMENT → VERIFY (5 reviewers) → typed gate check →
IMPLEMENT → VERIFY → ...** Each round is a complete re-review.
Reviewers get fresh context every round. The implementer receives typed
failure classes so it knows exactly what to fix.

### Orchestrator-Emit Gate (PR / ship)

When the aggregate gate passes:

1. Update `CHANGELOG.md` per `skills/changelog/SKILL.md`. In multi-repo
   mode, update each repo's `CHANGELOG.md` with the entries belonging
   to that repo's commits.
2. **Open a draft PR automatically — do not stop to ask.** The PR phase
   never waits for approval. Push the branch and
   open the PR as a **draft** (`gh pr create --draft`). See
   `skills/team-pr/SKILL.md` for the canonical procedure.
3. In multi-repo mode this opens **one draft PR per repo with commits
   ahead**, and the PR bodies cross-link to each other so reviewers can
   see the full change set.
4. **Ticket — link now, in-review when ready.** If `task.md` frontmatter
   has `ticketId` set, apply the ticket-lifecycle rules in
   `skills/tracking-tickets/SKILL.md`: link the PR to the ticket via the
   conditional closing footer (in multi-repo mode the home repo's PR
   alone carries the closing keyword; companions get a non-closing
   qualified reference), keep the ticket in-progress while the PR is a
   draft and move it to in-review only once the PR is marked ready for
   review, and never close the ticket by hand — the link auto-closes it
   on merge. Best-effort; never block the pipeline. Surface the
   `ticketId` in the completion report, alongside the draft PR URL and
   the absolute worktree-rooted `docs/plans/<id>/` artifact path.
5. Mark all TodoWrite items complete.
6. **Leave the worktree(s) in place.** Do not remove a worktree when a
   PR is opened — the user may need to iterate on the branch (push
   follow-up commits, address review feedback). Clean up a worktree only
   after its PR is merged or when the user explicitly asks, following
   the teardown procedure in `skills/worktree-isolation/SKILL.md` →
   "Ship (teardown)": commit preservation, worktree and branch removal,
   the rebase-only default-branch update, and deletion of the feature's
   untracked `docs/plans/<id>` scratch dir. In multi-repo mode, run it
   for every involved repo.

## Rules

- Artifacts in `docs/plans/<id>/` are the single durable record of
  pipeline state. Each artifact's YAML frontmatter describes its phase
  and revision metadata.
- TodoWrite is the orchestrator's live coordination ledger. It is
  session-scoped and is rebuilt on entry to any `/team-*` command by
  scanning artifacts.
- **Subagents never pause for user input.** Each resolves its own open
  questions autonomously — picking the option it would have recommended
  — and records every such choice as an explicit assumption in its
  artifact, so the guess stays auditable at PR review. No subagent
  prompts the user, directly or through the orchestrator.
- File artifacts in `docs/plans/<id>/` are the durable communication
  protocol. Always write phase findings to disk before advancing.
- There are **no mid-run human gates**. The design is gated by an
  adversarial design review; never present the structure or plan for
  approval. The structure and plan are autonomous tactical artifacts.
- The phase loop never pauses mid-run. Advance phases
  within the same turn. In particular, IMPLEMENT → PR is not a stopping
  point — a turn that ends with review verdicts but no draft PR URL is
  a defect.
- The research-isolation invariant is non-negotiable. If a researcher's
  context contains the user's original description, the pipeline has a
  defect. Stop and report.
- On any unexpected failure: report to the user and suggest re-invoking
  the same /team-* command with `docs/plans/<id>/`.
- To add a new agent to the pipeline, add an entry to the phase table
  above and to the inventory in `skills/team/registry.json`.

### Multi-repo topics

A topic that touches more than one repository is recorded in
`docs/plans/<id>/repos.md` (schema in `skills/artifact-frontmatter/SKILL.md`).
`repos.md` is confirmed autonomously: the questioner writes it when the
description names multiple repos (resolving each to a sibling-directory
path), and the design-author confirms or amends the list on research
evidence. Once `repos.md` exists, every downstream phase
respects it: research spans every listed repo, slices and plan steps
carry `[repo: <name>]` annotations, secondary worktrees are created
after the design review (the home worktree already exists from the leading
WORKTREE phase), the implementer changes directory between them per
step, and PR opens one PR per repo. When `repos.md` is absent, the
pipeline runs in single-repo mode (today's default).

### Design-review record convention

The durable record of design-review passage is
`docs/plans/<id>/design-review-<n>.md` — one file per review round,
with frontmatter `topic`, `date`, `phase: design-review`, and
`verdict: <APPROVE|REQUEST CHANGES|COMMENT>`. A design has passed review
when the highest-`<n>` file carries APPROVE or COMMENT. Downstream
phases and the recovery hooks verify passage by reading that file —
`design.md` itself carries no approval frontmatter.
See `skills/artifact-frontmatter/SKILL.md` for the full frontmatter
convention.
