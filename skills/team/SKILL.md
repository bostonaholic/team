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
that describes its phase, approval state, and revision count). Live
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
   begins. Best-effort and tracker-agnostic: if the project defines no
   tracker-move mechanism (e.g. free-form text with no ticket, or a
   tracker the environment can't reach), skip silently and continue.
   Never block the pipeline on a tracker update.
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
   marking completed any phases whose artifacts are present and (for
   human-gated phases) carry `approved: true`. Then mark the first incomplete
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
  3. Verify predecessor artifacts exist on disk and (for human-gated
     phases) carry `approved: true` in their frontmatter. If missing,
     report a desync and suggest re-invoking the same /team-* command.
  4. Dispatch the agent(s) (parallel where the phase table marks them).
  5. Parse the subagent's final assistant text for an open-questions
     envelope (see `skills/agent-open-questions/SKILL.md` — the
     canonical contract):
     a. Scan the Task tool result for fenced ```json blocks in order.
        Per Decision 5 (first-block-wins), the FIRST block whose
        top-level object contains an `openQuestions` array is the
        envelope. Ignore other fenced JSON blocks (e.g. the
        `{designPath, ...}` summary at the end of an artifact-complete
        message) when an envelope is present.
     b. If an envelope is present, call `AskUserQuestion` with the
        parsed `openQuestions` array verbatim.
        - **Size cap.** `AskUserQuestion` accepts 1–4 questions per
          call. If the envelope carries more than 4, render only the
          first 4 and `SendMessage` the subagent with a note that the
          remainder must be re-emitted in a follow-up envelope or
          deferred into the artifact (per the agent-open-questions
          ≤ 4 cap).
     c. Free-text escape hatch: if a chosen option's `description`
        declares that the orchestrator must follow up with free-text
        input (or the subagent's prompt explicitly requires it for that
        branch), ask the user a plain-text follow-up question and
        incorporate the response into the resume message. This is
        necessary because `AskUserQuestion` returns only the chosen
        `label` — no free-text field. The questioner's multi-repo flow
        is the canonical worked example.
     d. Resume the same subagent via the Task tool's
        `SendMessage(to: <agentId>, message: <user selections verbatim,
        plus any free-text follow-up response>)`. The subagent receives
        the selections as a new user turn with its prior transcript
        intact; this is NOT a fresh dispatch.
     e. On malformed JSON or a missing `label`, follow the two-attempt
        path: attempt 1 = `SendMessage` the subagent the exact parse
        error and request a corrected envelope; attempt 2 failure =
        write `docs/plans/<id>/dispatch-failure.md` with frontmatter
        `phase: <current>, status: parse-failed`, mark the phase halted
        in TodoWrite, and surface the artifact path to the user.
     f. If no envelope is present, proceed to step 6.
     g. **User cancels the `AskUserQuestion` prompt mid-flight.** Do
        NOT `SendMessage` the subagent (it remains paused awaiting a
        resume that will never come). Mark the current phase halted
        in TodoWrite, surface a "user cancelled at <phase>" message
        to the user, and stop the loop. The next `/team-*` invocation
        re-enters the loop at the same phase: on resume detection the
        subagent is re-dispatched fresh, re-emits the envelope, and
        the orchestrator re-renders the prompt.
  6. Write each returned artifact to docs/plans/<id>/<name>.md
     with the YAML frontmatter the agent specifies (see the agent file
     and skills/qrspi-workflow/SKILL.md).
  7. Run the gate for this phase:
     - HUMAN (design): present the artifact, wait for verdict.
       On approve, edit the artifact's frontmatter to set
       `approved: true` and `approved_at: <ISO-8601>`. On reject,
       increment `revision: <n+1>` on the new draft and re-dispatch.
     - MECHANICAL (tests-failing): run the suite; on assertion-only
       failure, advance.
     - ROUTER-EMIT (worktree, PR): perform the action.
     - AGGREGATE (5 reviewers): dispatch in parallel, collect results,
       sort findings into severity tiers; auto-loop on any Blocking or
       Major finding (never consulting the user), tracking the round count
       in TodoWrite, capped at 5 rounds; consult only on Minor-and-below.
       Before the fan-out, run the external-reviewer on-ramp
       (`skills/team-implement/SKILL.md`): per-run request ▸ `.claude/team.json`
       ▸ detect-and-prompt (`AskUserQuestion`, recorded via `--set`) ▸ off.
  8. Update TodoWrite — mark current phase `completed` and the next one
     `in_progress`.
  9. Goto loop.
```

### Phase table

| Phase      | Agent(s)                                                | Predecessor artifact                                            | Next phase on pass |
|------------|---------------------------------------------------------|-----------------------------------------------------------------|--------------------|
| WORKTREE   | (orchestrator-emit)                                     | (none — description in `$ARGUMENTS`)                            | QUESTION           |
| QUESTION   | `questioner`                                            | worktree prepared (+ description in `$ARGUMENTS`)               | RESEARCH           |
| RESEARCH   | `file-finder`, `researcher` (parallel, isolated)        | `docs/plans/<id>/questions.md`                                  | DESIGN             |
| DESIGN     | `design-author` (→ human gate)                          | `docs/plans/<id>/research.md`                                   | STRUCTURE          |
| STRUCTURE  | `structure-planner`                                     | `docs/plans/<id>/design.md` (frontmatter `approved: true`)      | PLAN               |
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
   deferred until after the design gate (see "Orchestrator-Emit Gate
   (post-design-gate secondary worktrees)" below). **If the run was started
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

### Human Gate (design approval)

When the `design-author` returns a draft:

1. Confirm `docs/plans/<id>/design.md` exists with frontmatter
   `approved: false` and `approved_at: null`.
2. Present the design **in full** to the user, and **print the absolute
   worktree-rooted `design.md` path** (the worktree path computed at the
   leading WORKTREE phase joined with `docs/plans/<id>/design.md`) so the
   reviewer can open the file cleanly without hunting for the worktree.
3. Use `AskUserQuestion` to capture the verdict. Use a single question
   with a `Decision` header and three options: **Approve**, **Request
   changes**, **Reject**. Do not ask "Do you approve?" as free text —
   `AskUserQuestion` is the canonical Claude Code tool for multi-choice
   user prompts.
4. If approved → edit the artifact's frontmatter to set `approved: true`
   and `approved_at: <ISO-8601 timestamp>`.
5. If request-changes → re-dispatch `design-author` with the user's
   feedback. The new draft must increment `revision: <n+1>` in its
   frontmatter. Cap at `revision: 5`.

### Structure (no gate — autonomous)

When the `structure-planner` returns `docs/plans/<id>/structure.md`,
record it and advance to PLAN immediately. There is no approval wait —
**design is the only human gate**. Structure was formerly human-gated; it
now auto-advances. The artifact carries no `approved`/`approved_at`/
`revision` frontmatter.

### Orchestrator-Emit Gate (post-design-gate secondary worktrees)

The home worktree is born at the leading WORKTREE phase. Secondary worktrees
(multi-repo mode) are created **after the design gate**, because the set of
repos a topic touches is only confirmed during the design open-questions step
(`repos.md`). This is the documented asymmetry: the home worktree exists from
phase 1, while secondary repos lag until post-design-gate.

When the design gate passes:

1. **Detect mode.** If `docs/plans/<id>/repos.md` exists, you are in
   **multi-repo mode** — create one secondary worktree per additional repo
   listed in that file, all on the same `<id>` branch. Otherwise you are in
   **single-repo mode** and nothing further is needed here (the home worktree
   already exists). See `skills/worktree-isolation/SKILL.md` for the topology
   and `skills/team-worktree/SKILL.md` for the procedure.
2. **Append a `## Worktrees` section to `repos.md`**, post-design-gate,
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
   into a severity tier (see `skills/code-review/SKILL.md` → "Severity Tiers
   and the Auto-Fix Boundary"):
   - **Blocking** — security CRITICAL/HIGH, any verification failure,
     code-review REQUEST CHANGES, any `issue (blocking)` comment.
   - **Major** — `suggestion (non-blocking)`, security MEDIUM, ux REQUEST CHANGES.
   - **Minor and below** — `nitpick (non-blocking)`, security LOW, doc gaps,
     COMMENT-level notes.
2. Track the round count by appending a TodoWrite item like
   "Review round 2" each retry. Cap at 5 rounds.
3. While any **Blocking or Major** finding remains and under cap → dispatch
   implementer to fix, passing the typed failure class(es). After fixes, all
   5 reviewers re-run from scratch. **Never** stop to consult the user while a
   Blocking or Major finding is open — loop automatically (the consult guard).
4. If at cap → escalate to the user with all unresolved findings.
5. Once Blocking and Major are clean → if any **Minor-and-below** findings
   remain, present them to the user, who decides; otherwise advance
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
   is not a human gate (the only human gate is design approval), so
   opening the PR needs no approval. Push the branch and
   open the PR as a **draft** (`gh pr create --draft`). See
   `skills/team-pr/SKILL.md` for the canonical procedure.
3. In multi-repo mode this opens **one draft PR per repo with commits
   ahead**, and the PR bodies cross-link to each other so reviewers can
   see the full change set.
4. **Ticket → in-review.** If `task.md` frontmatter has `ticketId` set:
   **link the PR to the ticket** so the tracker closes it — and any board
   automation moves it to its done state — when the PR merges (GitHub:
   `Closes #<n>` in the PR body); then **move the ticket to the tracker's
   in-review state**. Best-effort and tracker-agnostic — skip silently if
   the project defines no tracker-move mechanism; never block the pipeline.
   Because the link auto-closes the ticket on merge, the orchestrator never
   closes tickets by hand. Surface the `ticketId` in the completion report.
5. Mark all TodoWrite items complete.
6. **Leave the worktree(s) in place.** Do not remove a worktree when a
   PR is opened — the user may need to iterate on the branch (push
   follow-up commits, address review feedback). Clean up a worktree only
   after its PR is merged or when the user explicitly asks. When cleanup
   does happen, cherry-pick or rebase commits onto the target branch in
   that repo, then let Claude Code or `git worktree remove` remove the
   worktree. After removal, update the repo's local default branch with
   the merge: `git -C <repo-root> pull --rebase origin <base>` (rebase,
   never a merge commit — linear history is the rule). In multi-repo
   mode, do this for every involved repo. As the last teardown step,
   delete the feature's local planning docs (`rm -rf docs/plans/<id>`,
   verified untracked) — the QRSPI scratch dir is removed alongside the
   branch and worktree, not left behind.

## Rules

- Artifacts in `docs/plans/<id>/` are the single durable record of
  pipeline state. Each artifact's YAML frontmatter describes its phase,
  approval state, and revision count.
- TodoWrite is the orchestrator's live coordination ledger. It is
  session-scoped and is rebuilt on entry to any `/team-*` command by
  scanning artifacts.
- `AskUserQuestion` is the canonical Claude Code tool for any
  multi-choice user prompt **from the orchestrator** — design
  approval, worktree-vs-in-place. Free-text prompts
  ("Do you approve?") are not the convention. Free-form text input
  remains appropriate when the question genuinely has no enumerable
  options (e.g. capturing the user's revision feedback after they pick
  "Request changes"). **Subagents that need user input emit the
  `openQuestions` envelope per `skills/agent-open-questions/SKILL.md`;
  the orchestrator parses, renders the prompt via `AskUserQuestion`,
  and resumes the subagent via `SendMessage`. The orchestrator-side
  parse + render + resume sequence is documented in the phase loop
  above (step 5).** Subagents must not call `AskUserQuestion` directly.
- File artifacts in `docs/plans/<id>/` are the durable communication
  protocol. Always write phase findings to disk before advancing.
- The only human gate is **design approval**. Never present the structure
  or the plan to the user for approval — design is the human contract; the
  structure and plan are autonomous tactical artifacts.
- The phase loop pauses for the user only at (a) the human gate (design
  approval), (b) `openQuestions` envelopes, (c) aggregate-cap escalation,
  and (d) Minor-findings consultation. Everywhere else, advance phases
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
`docs/plans/<id>/repos.md` (schema in `skills/qrspi-workflow/SKILL.md`).
The questioner creates `repos.md` if the user's description names
multiple repos; the design-author confirms or amends the list during
the open-questions step. Once `repos.md` exists, every downstream phase
respects it: research spans every listed repo, slices and plan steps
carry `[repo: <name>]` annotations, secondary worktrees are created
after the design gate (the home worktree already exists from the leading
WORKTREE phase), the implementer changes directory between them per
step, and PR opens one PR per repo. When `repos.md` is absent, the
pipeline runs in single-repo mode (today's default).

### Approval marker convention

Human approval flips the `approved` field in the gated artifact's own
YAML frontmatter from `false` to `true` and stamps an `approved_at`
ISO-8601 timestamp. Downstream phases verify approval by re-reading the
artifact (`grep -qE '^approved:[[:space:]]*true[[:space:]]*$' <artifact>`).
See `skills/qrspi-workflow/SKILL.md` for the full frontmatter convention.
