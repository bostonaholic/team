---
title: Skills
description: "The Team plugin's 55 skills: 11 pipeline entry-point slash commands, 8 standalone utilities (shipit, pr-open-comments, pr-watch-as-author, pr-watch-as-reviewer, groom-backlog, pr-cleanup, pr-verify, pr-rebase), and 36 methodology skills loaded by agents, with purpose, arguments, consumers, and behaviors."
audience: [user, developer]
nav_order: 5
nav_label: skills
---

# Team Skills

> **The features you use.** Every entry-point skill is a slash command you can
> run (`/team`, `/team-fix`, …). The methodology skills are the internal
> building blocks the agents load to do their work.
>
> **Source of truth:** the skill bodies themselves, `skills/*/SKILL.md`.
> This page is a hand-maintained reference. When it disagrees with a
> `SKILL.md`, the `SKILL.md` wins.

## Contents

- [Two flavors of skill](#two-flavors-of-skill)
- [Entry-point skills](#entry-point-skills)
- [Standalone utilities](#standalone-utilities)
- [Methodology skills](#methodology-skills)
- [Skill ↔ agent ↔ phase](#skill--agent--phase)
- [Name-collision pairs](#name-collision-pairs)
- [See also](#see-also)

## Two flavors of skill

Every skill lives under `skills/<name>/SKILL.md` as YAML frontmatter plus a
Markdown body. A single frontmatter field, `argument-hint`, sorts the
catalog into two flavors:

- **Entry-point skills carry `argument-hint`.** Claude Code registers them
  as slash commands (`/team`, `/team-research`, and so on). The
  `argument-hint` documents what to pass as `$ARGUMENTS`.
- **Methodology skills omit `argument-hint`.** They are never invoked
  directly — with one exception, `code-review`, which stays user-invocable
  as a standalone review command (see
  [Methodology skills](#methodology-skills)). Agents load them through one
  of two mechanisms: a `skills:`
  YAML list in the agent's frontmatter (e.g., `agents/design-author.md`
  declares `skills: [product-thinking,
  progress-tracking, authoring-designs, writing-prose]`), or an inline
  prose load
  instruction in the agent body (e.g., `Load skills/<name>/SKILL.md for
  …`).

That `argument-hint` marker is the whole flavor distinction. Most
`argument-hint` skills drive a QRSPI phase, but eight (`shipit`,
`pr-open-comments`, `pr-watch-as-author`, `pr-watch-as-reviewer`, `groom-backlog`,
`pr-cleanup`, `pr-verify`, and `pr-rebase`) are standalone utilities. They land a
reviewed PR, triage its unresolved review feedback, and watch it for new
feedback. They also watch it as a reviewer, approve when your threads
resolve, groom a project backlog, tear down branch state after a PR is
finished, verify a PR's test plan, and rebase a branch onto its base
without changing what it does.
None is a pipeline phase. The split is
**11 pipeline entry-point + 8 standalone utility + 36 methodology = 55**.

For *why* the system is shaped this way (the three-tier argument-discovery
design, the discovery-duplication rationale, and the skill load limits),
see [architecture.md §6](architecture.md#6-skills). The architecture page
explains the design. The full per-skill enumeration now lives here.

## Entry-point skills

Each entry-point skill either kicks off a full run (`team`, `team-fix`) or
drives one phase of the QRSPI pipeline. The phases are Worktree, Question,
Research, Design, Structure, Plan, Implement, and PR. What ties most of
them together is a shared argument-resolution chain and a common body
template.

The **downstream phase skills**, `team-question` through `team-pr`, plus
the optional `eng-design-doc-review`, share a consistent body template. It
holds an `## Input` section that describes `$ARGUMENTS` and an
`## Execution` section of numbered steps. It ends with a `## Completion`
section that lists what to report, plus the `Next: run /team-…` handoff to
the next phase. The `team` orchestrator does not follow that template. It
walks a Phase Loop instead (see its entry below).

**Shared argument resolution (three-tier discovery).** Eight of these
skills consume an artifact directory rather than a free-form description:
`team-research`, `team-design`, `team-structure`, `team-plan`,
`team-worktree`, `team-implement`, `team-pr`, and `eng-design-doc-review`.
For all eight, the `docs/plans/<id>/` argument is **optional** and resolves
through the same three-tier chain:

1. **Tier 1: explicit `$ARGUMENTS`.** If you pass a directory path, it is
   used directly.
2. **Tier 2: newest-mtime convention discovery.** With no argument, the
   skill scans `docs/plans/` for the most recently modified topic directory
   that holds the predecessor artifact it needs.
3. **Tier 3: `AskUserQuestion`.** If discovery is ambiguous, the skill
   asks you which topic to operate on.

The entries below say "resolves `$ARGUMENTS` through the shared three-tier
chain above" instead of repeating these tiers. The two skills that take a
free-form description (`team`, `team-question`, `team-fix`) state their own
argument shape.

### team

- **Purpose:** Run the full eight-phase QRSPI pipeline end to end, from a
  raw request to an opened pull request.
- **`$ARGUMENTS`:** `<ticket id, issue URL, or feature description>`.
- **Phase:** Drives all phases (Worktree → Question → Research → Design →
  Structure → Plan → Implement → PR).
- **Key behaviors:** Walks a linear Phase Loop, dispatching the specialist
  agent(s) for each phase per its phase table, then running that phase's
  gate before advancing. Enforces the adversarial design-review gate
  (Design)
  and the aggregate five-reviewer review gate during Implement. That
  aggregate gate sorts every finding into Blocking / Major / Minor-and-below
  tiers and auto-loops on any Blocking or Major (the no-consult rule: the
  user is never asked about any finding mid-run), recording the remaining
  Minor-and-below findings in the PR body's `## Review notes`. With the
  `.team/cross-model-review` opt-in marker, the cross-model pass runs
  before every design-review round (no trigger classes on the design
  path), feeding `cross-model-notes.md` and `cross-model-raw.md`. Its
  body is organized as `## Input`,
  `## Setup`, `## The Phase Loop`, `## Gate Handling`, and `## Rules`,
  not the downstream Input / Execution / Completion template.

### team-question

- **Purpose:** Decompose a raw intent into a task statement plus a neutral
  question set, producing `task.md` and `questions.md`.
- **`$ARGUMENTS`:** `<ticket id, issue URL, or task description>`.
- **Phase:** Question (the pipeline's first phase).
- **Key behaviors:** The only step that sees your original description. It
  emits the neutral `questions.md` so the downstream research sees only the
  questions, not your task framing.

### team-research

- **Purpose:** Run isolated codebase research against the neutral question set.
- **`$ARGUMENTS`:** `[docs/plans/<id>/]` is optional. It resolves through
  the shared three-tier chain above.
- **Phase:** Research (isolated).
- **Key behaviors:** Reads only `questions.md`, never the task, so the
  research carries no opinion-bias. Writes `research.md`.

### team-design

- **Purpose:** Draft the alignment doc and run the adversarial design
  review that gates advancement.
- **`$ARGUMENTS`:** `[docs/plans/<id>/]` is optional. It resolves through
  the shared three-tier chain above.
- **Phase:** Design (design review).
- **Key behaviors:** Dispatches the design-author to write a ~200-line
  `design.md`. The design-author resolves its own open questions as
  recorded assumptions. The skill then runs the adversarial design-review
  loop (`design-review-<n>.md`, where APPROVE and COMMENT advance, cap 5).
  With the `.team/cross-model-review` opt-in marker, the cross-model pass
  runs before every design-review round (no trigger classes on the design
  path), feeding `cross-model-notes.md` and `cross-model-raw.md`.

### team-structure

- **Purpose:** Break the reviewed design into vertical slices with
  per-slice verification checkpoints.
- **`$ARGUMENTS`:** `[docs/plans/<id>/]` is optional. It resolves through
  the shared three-tier chain above.
- **Phase:** Structure (autonomous, no gate).
- **Key behaviors:** Produces the ~2-page `structure.md`, then advances
  to PLAN automatically.

### team-plan

- **Purpose:** Turn the structure into a tactical, file-level
  implementation plan.
- **`$ARGUMENTS`:** `[docs/plans/<id>/]` is optional. It resolves through
  the shared three-tier chain above.
- **Phase:** Plan.
- **Key behaviors:** Writes `plan.md` for the implementer. The plan is a
  tactical artifact, not a human-reviewed gate.

### team-worktree

- **Purpose:** Prepare an isolated git worktree. In a full `/team` run this
  is the **leading** phase, and it runs before QUESTION. `docs/plans/<id>/`
  is thus authored inside the worktree, and the home checkout's
  `git status` stays clean for the whole run.
- **`$ARGUMENTS`:** `[docs/plans/<id>/]` is optional. It resolves through
  the shared three-tier chain above.
- **Phase:** Worktree (the first phase).
- **Key behaviors:** Creates the branch and home worktree first, then
  authors `docs/plans/<id>/` inside it so implementation, and every prior
  phase's artifacts, never touch the main checkout. Loads
  `worktree-isolation` for the single- and multi-repo topology. The
  confirmation dialog fires only on standalone invocation, because a full
  `/team` run creates worktrees without a pause. Multi-repo creation
  refuses any repo path outside the home repo's sibling set (realpath
  containment).

### team-implement

- **Purpose:** Implement the plan. Write tests first, work slice by slice,
  then run the adversarial reviewer loop.
- **`$ARGUMENTS`:** `[docs/plans/<id>/]` is optional. It resolves through
  the shared three-tier chain above.
- **Phase:** Implement.
- **Key behaviors:** Runs the test-first → slice-execution → five-reviewer
  verify sub-pipeline. The verify loop sorts findings into Blocking / Major
  / Minor-and-below tiers. While any Blocking or Major remains it
  re-dispatches the implementer automatically without consulting the user
  (the no-consult rule), capped at 5 rounds. At the cap, terminal halt.
  Minor-and-below findings are recorded in the PR body's `## Review notes`
  once Blocking and Major are clean, and never surfaced mid-run.
- **Standalone Mode:** Invoked with no resolvable directory, it bootstraps
  the missing upstream artifacts inline rather than hard-erroring.

### team-pr

- **Purpose:** Update the changelog, commit, and open the pull request.
- **`$ARGUMENTS`:** `[docs/plans/<id>/]` is optional. It resolves through
  the shared three-tier chain above.
- **Phase:** PR (the pipeline's final phase).
- **Key behaviors:** Loads `git-commit` for commit discipline and
  `changelog` for the changelog update. Adds a PR body from its template.
  Renders a conditional `## Screenshots` section from ux-reviewer's capture
  manifest (`docs/plans/<id>/screenshots/manifest.md`) and uploads the PNGs
  through GitHub's user-attachments pipeline so they render inline. Any
  capture or upload failure degrades to a visible note with local paths,
  and the PR always opens. Leaves the worktree in place after opening the
  PR so you can iterate. Teardown waits until the PR merges or you ask.
  Completion suggests arming `/pr-watch-as-author` once the PR is ready
  for review.
- **Standalone Mode:** Invoked with no resolvable directory, it bootstraps
  the missing upstream artifacts inline rather than hard-erroring.

### team-fix

- **Purpose:** Run a compressed bug-fix pipeline that skips the QRSPI
  ceremony.
- **`$ARGUMENTS`:** `<ticket id, issue URL, or bug description>`.
- **Phase:** Standalone fix flow (not a QRSPI phase). Runs the compressed
  pipeline `WORKTREE → REPRODUCE → RED → GREEN → VERIFY → SHIP`.
- **Key behaviors:** Loads `test-driven-bug-fix` for reproduce-first,
  red-green discipline: a failing test that reproduces the bug, then the
  fix that turns it green. The leading WORKTREE phase is the pipeline's one
  hard gate: a documented branch-gate block resolves the default branch and
  the fix never commits to it. A non-default branch is reused in place;
  otherwise the run isolates into a `<id>` worktree, and a worktree that
  cannot be created degrades to a plain `<id>` branch rather than to the
  default branch. Ship re-asserts the gate before it pushes.

### eng-design-doc-review

- **Purpose:** Adversarially audit `design.md` with fresh context. Its
  `## Review brief` doubles as the pipeline's DESIGN review gate.
  Standalone invocation remains available.
- **`$ARGUMENTS`:** `[docs/plans/<id>/]` is optional. It resolves through
  the shared three-tier chain above.
- **Phase:** Design (review-gate brief) + standalone audit.
- **Key behaviors:** Dispatches the built-in read-only `Explore` subagent
  (not the `design-author` agent) so the audit reads the design with fresh
  eyes. That subagent loads four methodology skills as its review criteria
  (`technical-design-doc`, `code-review`, `engineering-standards`, and
  `documenting-decisions`), which makes this one more consumer of all
  four, plus a conditional fifth — `cross-model-review`, loaded only when
  the brief carries an `## External review input` section.
  Points the report's prose at the seventh-grade bar in `writing-prose`.

## Standalone utilities

Each carries `argument-hint` (so it is a slash command) but is **not** a
QRSPI phase: a self-contained action a user runs on demand.

### shipit

- **Purpose:** Land a reviewed pull request: push unpushed commits, wait for
  CI to go green, then squash-merge (the PR title becomes the commit subject).
- **`$ARGUMENTS`:** `[<pr-number>]` is an optional PR number override.
- **Phase:** None. A standalone land action, not part of the pipeline.
- **Key behaviors:** Discovers the open PR for the current branch through
  the §2B fallback chain (refuses if there is none, or if it is already
  merged/closed). Pushes any unpushed commits. Waits for CI with a
  mechanically bounded poll
  (`timeout 1800 gh pr checks --watch --fail-fast --interval 30`). Handles
  a PR that has fallen behind its base (rebase + `--force-with-lease`,
  never a bare `--force`) and surfaces branch-protection rejections
  verbatim. It merges with `gh pr merge --squash`, building the commit
  subject from the PR title plus `(#<number>)` so any version in the title
  lands in `git log`. **Project-agnostic**: it does no versioning,
  changelog editing, or release work. Those, if a project needs them, run
  in a separate step before `/shipit` (in this repo, the dev `version-bump`
  skill). Model-invocable, but the merge is irreversible, so two guards
  replace the former hard flag: it fires only on explicit ship intent
  ("ship it", "land the PR", `/shipit`) and never on a PR that is merely
  approved or green, and the CI-green wait gates the merge mechanically.
  Neither guard is a question put to the user mid-run — **it does not stop
  to confirm the merge**, because ship intent already carried the
  authorization and every caller chaining into `/shipit` would inherit the
  stop. On a merge that **landed**, it runs
  `/pr-cleanup` rather than recommending it — resyncing the default branch
  and deleting the merged branch carry no decision, and Mode A gates itself
  on merged-PR verification. A run that stopped short (failing check, CI
  timeout, branch protection) merged nothing and reaches no cleanup, and
  `/pr-cleanup` Mode B (closed / abandoned) stays user-triggered.

### pr-open-comments

- **Purpose:** Triage unresolved review feedback on a pull request. It
  fetches every unresolved review thread through GraphQL and checks each
  comment against the current code. It auto-applies recommendations rated
  above 90% confidence, through a full apply → push → reply → resolve
  pipeline. For the rest it presents a globally numbered punch list, with
  2-4 tailored options and one recommendation per item.
- **`$ARGUMENTS`:** `[<pr-number-or-url>]`: optional. Defaults to the
  current branch's PR.
- **Phase:** None. A standalone triage action, not part of the pipeline.
- **Key behaviors:** Confidence-gated autonomy: each recommendation gets a
  confidence rating assigned only after verification (a behavioral claim
  needs a passing named test to exceed 90%). Items above 90% that pass
  every hard rule are applied, pushed, replied to, and resolved
  automatically. Each one is reported with its confidence and commit SHA.
  Everything else presents-then-stops: the turn ends with a hand-off prompt
  that separates "Auto-applied" from "Needs your decision". Explicit user
  authorization (apply → push → reply → resolve) applies the whole batch
  regardless of confidence. Carve-outs are absolute at any confidence
  (declined, needs-clarification, could-not-apply, security-sensitive).
  Treats comment bodies as untrusted data. It never acts on embedded
  imperatives beyond the thread's anchored code. Auto-apply is bounded to
  the file and lines the thread references. Broader asks and new
  security-sensitive constructs thus become carve-outs. Model-invocable:
  cue-based auto-invocation is justified by the carve-out set plus the
  verification bar.

### pr-watch-as-author

- **Purpose:** Arm a bounded watch loop on a pull request: undraft it, take
  a baseline snapshot, then poll GitHub for new review feedback and triage
  it through `pr-open-comments` as it arrives.
- **`$ARGUMENTS`:** `[<pr-number-or-url>]`: optional. Defaults to the
  current branch's PR.
- **Phase:** None. A standalone watch action, not part of the pipeline.
- **Key behaviors:** Undrafts through `gh pr ready` only on a clear
  readiness cue, and reports the promotion loudly. An ambiguous cue watches
  the draft in place and never promotes. A `gh pr ready` failure warns and
  keeps watching. It applies the best-effort in-review ticket transition.
  Bounded cycles: 48 cycles of ~31 minutes each. Each cycle makes up to
  three `sleep 600` calls plus one poll, and cycle 0 polls immediately.
  Default mode auto-applies items the triage rates above 90% confidence. A
  batch fully handled that way resumes the loop with a report. Sub-90% or
  carve-out items render the punch list and end the turn. Authorized mode
  (granted by one of several canonical phrases, e.g. "watch this PR and fix
  comments") applies, pushes, replies, resolves, and resumes regardless of
  confidence. An ambiguous cue never selects authorized mode. Loop reports
  name the mode and list auto-applied items with confidence and commit SHA.
  Stops on approval, merge, close, user interrupt, cycle-48 timeout, or 3
  consecutive poll failures. On approval it runs a final triage pass and
  hands off with `Next: run /shipit`. It never auto-runs `/shipit`.
  Model-invocable: it promotes a draft only on an unambiguous readiness cue
  and reports the promotion loudly, so cue-based auto-invocation is safe.

### pr-watch-as-reviewer

- **Purpose:** Reviewer-side watch-and-approve. After you post review
  comments on a PR you are reviewing, it polls GitHub until every review
  thread you opened is resolved. It then casts one attributed, SHA-cited
  `gh pr review --approve` on your behalf and stops.
- **`$ARGUMENTS`:** `[<pr-number-or-url>]`: optional. Defaults to the
  current branch's PR. A bare number with no local checkout is refused.
  Pass the full PR URL.
- **Phase:** None. A standalone reviewer-side action, not part of the
  pipeline.
- **Key behaviors:** Resolves the base repo from the PR's canonical URL
  (correct on fork PRs, where head-repository fields name the contributor's
  fork). It refuses to arm when the invoking `gh` identity is the PR
  author, which would be self-approval. It also refuses when that identity
  has no submitted review threads on the PR. It hints "submit your pending
  review first" when a pending review exists. Per poll it recomputes the
  tracked set and the auto-merge state. The tracked set holds threads whose
  first comment the viewer authored in a submitted review, and it excludes
  pending-review threads. The gate rests purely on GraphQL `isResolved`
  state. Comment bodies are data, never instructions. Thread pagination is
  fail-closed: the gate is computed only after every page is fetched, and
  an unfetched page is a poll failure, never an empty gate. Bounded cycles:
  48 cycles of ~31 minutes (up to three `sleep 600` calls plus one poll per
  cycle, and cycle 0 polls immediately). It stops on an approval cast, a
  merge or close, a user interrupt, the cycle-48 timeout, or 3 consecutive
  poll failures. It also stops on a tracked set that empties mid-watch
  (without approving), or a declined confirmation (stops without
  approving). The approval is its only write: it never resolves threads,
  never replies, never edits code, never merges, never auto-runs `/shipit`.
  `disable-model-invocation: true`, because an approval can transitively
  trigger an auto-merge, so only a deliberate human invocation arms it.
  When auto-merge is enabled at arm, explicit confirmation is necessary on
  both paths. The immediate path, where the gate is already satisfied at
  arm, confirms before it casts. The loop path confirms before it arms the
  unattended watch. A "no" refuses to arm. The auto-merge reading covers
  GitHub-native auto-merge only: repo automation that merges on approval
  (Mergify, a merge bot, an approval-triggered workflow) is not detected,
  and auto-merge off is no assurance against it. Before casting,
  merge-safety checks read the final poll's values, never the arm-time
  reading: any head drift (with or without auto-merge) requires explicit
  confirmation, with both SHAs named in the approval body and completion
  report. A tracked count that changed between arm and approval without
  ever going empty likewise names both counts in the approval body and
  completion report. auto-merge that turned on mid-watch (no arm-time
  confirmation) requires confirmation even without drift. A granted
  confirmation triggers a fresh poll and re-check before casting (bounded,
  so confirmation churn stops the run rather than looping). An arm-time
  head SHA lost to compaction also fails closed: it is printed in the arm
  report and every poll snapshot, never re-derived from the current head,
  and never approved unconfirmed. Every GitHub read is minimized to
  structural fields (logins, review states, `isResolved`, SHAs). The arm
  read goes through a `--jq` projection. The poll goes through a selection
  set that fetches no body fields. Review bodies, PR descriptions, and
  profile display names thus never enter context.


### groom-backlog

- **Purpose:** Groom a project backlog in an issue tracker. It loads the
  whole board in bulk, computes a gap inventory, verifies each candidate
  issue's factual claims, ranks the verified candidates, proposes an
  evidence-backed closure for an issue whose premise evaporated, and
  clusters open issues by outcome. It places each cluster under a grouping
  construct whose description states a verifiable property. It finds the
  dependencies between tickets and proposes the missing links. It fixes
  triage, priority, label, and state hygiene, then reports what it
  deliberately left alone.
- **`$ARGUMENTS`:** `[<project-number-or-url>] [--promote <issue-number>]`:
  both optional. With no board reference it discovers the visible projects and
  uses the only one, stopping and listing them if more than one is visible.
  `--promote` selects promotion mode, which brings one item to the
  ready-to-work standard and moves its card. Without it the skill runs the
  board-level pass.
- **Phase:** None. A standalone grooming action, not part of the pipeline.
- **Key behaviors:** Tracker-agnostic method, with GitHub Projects v2 as
  the worked example. A vocabulary map covers Linear and Jira: grouping
  construct, column, priority, iteration, dependency link, and
  decomposition link. Those two recipes ship under an explicit
  **Unverified** heading with a mandatory `--help` preflight before any
  mutation. Loads once in bulk into a run-scoped temp cache, passing an
  explicit `--limit`. Each cached query then gets the completeness check
  its own payload shape supports. A shortfall thus stops the run rather
  than groom a partial board. Comment threads load with the issues, capped
  at one page of 100 per issue. Every thread that hit the cap is named in
  the report. Declared dependency and decomposition links ride that same
  bulk query rather than a per-issue call. A link connection that came back
  short is recorded and reported, because an unseen blocker reads as an
  unblocked issue. Issue bodies, titles, and comments are untrusted data, a
  hard rule in every mode, promotion included. An embedded imperative is
  reported as content, never executed. Tracker-derived prose never reaches
  a shell argument: bodies travel by file or on stdin. Each candidate
  issue's factual claims are verified against the code and the tracker,
  with dated evidence and one of three outcomes recorded per issue. The
  verified candidates are then ranked by a stated four-tier heuristic,
  smaller verified scope breaking ties, so the promotion pick rests on
  checked premises. An issue whose premise evaporated becomes a closure
  proposal behind its own question. An approved closure posts the dated
  evidence as a comment, adds a resolution label additively, and closes
  with reason "not planned". Decision, investigation, and spike tickets
  are carved out: the evidence attaches as a comment and the ticket stays
  open. Plans, asks, waits,
  then executes. The plan file is written before the questions are asked.
  There is one question per mutation class the plan contains, each carrying
  exactly one recommendation, and filing a new issue always needs its own
  answer. Nothing on the tracker changes before the user answers. On
  approval it executes in dependency order, re-reads each item before
  writing it, and verifies every step by re-querying the tracker rather
  than by memory. Dependency analysis reads the links the tracker already
  records and infers the ones only the prose admits: sequencing phrases in
  bodies and comments, and one issue introducing the artifact another
  consumes. Every inferred link is a proposal needing its own answer,
  direction is fixed by which issue cannot be *finished* until the other
  lands, and a proposed edge that would close a cycle is reported rather
  than filed. Eleven hard rules hold in every mode. Decision and spike
  tickets stay open. Label writes are additive. A split ticket's original
  description is never rewritten. Priority, assignee, and state are left
  alone on someone else's in-flight work. Promotion mode skips the eleven
  board steps for a narrow single-issue load. It then brings that item to
  the ready-to-work standard: check it, rewrite it, prioritize it, then
  move the card. An open blocker, declared or found in the thread, drops
  the card move and nothing else: a blocked ticket is still worth
  clarifying while it waits. It refuses a `bug` outright, because `Bugs` is
  already its ready-to-pull state. It swaps a card back to `Backlog` rather
  than exceed the `Ready` WIP limit of 5, the number that
  [project-tracking.md](project-tracking.md) owns. It reports a
  pre-existing breach instead of an addition to it. The board pass ends by
  naming the item most worth promoting and printing that command. It never
  performs the promotion itself. Model-invocable: the read-and-plan phase
  mutates nothing and execution requires the user's answer, so those two
  guards make cue-based auto-invocation safe.

### pr-cleanup

- **Purpose:** Tear down local and remote branch state after a pull
  request is finished. Mode A (merged) verifies the PR actually merged,
  removes the branch's worktree, resyncs the default branch, and deletes
  the local branch. Mode B (closed / abandoned) closes the PR(s), then
  deletes every trace — worktree, local and remote branches, planning
  scratch.
- **`$ARGUMENTS`:** `[<pr-number-or-url-or-branch>]` — a PR number or URL
  (its head branch is resolved via `gh`), a branch name, or nothing to
  default to the branch checked out in the invoking directory (captured
  before commands are anchored to the primary clone, so a run from inside
  a worktree targets that worktree's branch, not the primary checkout).
- **Phase:** None. A standalone teardown action, not part of the pipeline.
- **Key behaviors:** Runs a merged-PR verification gate
  (`gh pr list --state merged`) before any `git branch -D`, and the gate
  checks identity and containment, not just a head-branch name match: the
  merged PR's head repository must be this repo (a fork PR sharing the
  branch name licenses nothing) and its merge commit must be an ancestor
  of the default branch. A gate failure halts the run; only the user's
  explicit delete-anyway confirmation re-enters it. Mode B has no
  merged check because the user's explicit abandon request is the gate —
  the skill never infers abandon intent. Refuses protected branch names
  (the detected default, `master`, `develop`, `release/*`) and a dirty
  tree with tracked modifications. Every externally sourced branch name
  must pass a byte-exact (`LC_ALL=C`) character allowlist before it
  reaches any command. Protected names are refused case-insensitively,
  and `git branch -D` runs only when a local branch matches the name byte
  for byte — so `Main` cannot force-delete `main` on a case-insensitive
  filesystem. No destructive command relies on a variable set in an
  earlier shell invocation: the primary-clone root and repo slug are
  re-derived in every invocation that uses them, and destructive
  expansions abort when a variable is unset. Before any destructive step it resolves
  AND validates `$PRIMARY_ROOT` (the primary clone, found via
  `git rev-parse --path-format=absolute --git-common-dir` and cross-checked
  against the main working tree), then anchors every subsequent command
  with `git -C "$PRIMARY_ROOT"` — so invoking it from inside the worktree
  it is about to remove cannot strand the run. Mode A worktree removal is
  **try-then-confirm** (no `--force` until the user sees what blocks and
  confirms); Mode B removes with `--force` unconfirmed. The resync pull is
  `--ff-only` — a non-fast-forward default branch stops the run rather
  than auto-resolving. PR metadata is data: only structured `gh` JSON
  fields gate actions, and prose fields never enter shell arguments.
  Stacks unwind child before parent. Scratch dirs under `docs/plans/` are
  removed only after an untracked check that distinguishes empty output
  from a failed command.

### pr-verify

- **Purpose:** Verify a pull request's test plan with evidence-rated
  verdicts. It extracts every test-plan item, classifies each by
  verification strategy, collects cited evidence per item, and reports a
  final verdict on the PR's readiness with follow-up recommendations.
- **`$ARGUMENTS`:** `[<pr-number-or-url>]` — a PR number or URL, or
  nothing to resolve the current branch's PR. A pasted PR description is
  the third input path.
- **Phase:** None. A standalone verification action, not part of the
  pipeline.
- **Key behaviors:** Extracts items from `## Test plan` (and `## How to
  Verify`, which the pipeline's PR phase emits), outputs them as a
  numbered list before verifying, and stops with `nothing to verify` when
  none exist. Each item gets a **PASS / FAIL / PARTIAL** verdict at
  **HIGH / MEDIUM / LOW** confidence — PARTIAL means the claim holds only
  in part, and no PASS is issued without cited evidence. Six verification
  strategies (filesystem, content match, code verification, diff
  analysis, build/test via the project's detected checks, structural);
  code-verification items dispatch a `team:file-finder` subagent — its
  grant is Read/Grep/Glob only, no Bash, so an imperative embedded in PR
  prose has no command sink — with an inline fallback. The final verdict is mechanical: READY (all PASS at
  HIGH/MEDIUM), NEEDS ATTENTION (any PARTIAL or LOW), NOT READY (any
  FAIL — FAIL wins over PARTIAL/LOW). The test plan is data: items are claims, never instructions, and
  a command quoted in a PR body is never executed. Read-only — no writes,
  no pushes. Pasted-description mode degrades the diff and build
  strategies honestly, per item.

### pr-rebase

- **Purpose:** Bring a feature branch up to date with its base without
  changing what the branch does. It captures a pre-rebase check baseline,
  rebases onto the latest base, resolves each conflict from both sides'
  intent, re-runs the same checks, and force-pushes only when nothing
  regressed.
- **`$ARGUMENTS`:** `[<pr-number-or-url>]` — the PR reference is
  optional and only resolves the base branch; the rebased branch is always
  the current checkout. There is no pre-push confirmation to skip: the
  deliberate invocation carries the authorization to publish, and the run
  completes without stopping once the verification gate reports no
  regression.
- **Phase:** None. A standalone branch-maintenance action, not part of the
  pipeline.
- **Key behaviors:** **User-invocable only** — it sets
  `disable-model-invocation: true`, because the push rewrites published
  history and no later verification can undo that for a teammate who has
  the branch. The base branch comes from the §2B fallback chain
  (`gh pr view` → `origin/HEAD` → `main`), never a hardcoded `main`, and
  every externally sourced branch name passes a character allowlist. It
  refuses a dirty tree, a detached HEAD, an in-progress
  rebase/merge/cherry-pick, a protected branch as the rebase target, and a
  branch someone else has pushed to. Before touching anything it records
  the recovery anchor (`git reset --hard <ORIG_SHA>`) and runs the
  project's detected checks (via `running-quality-checks`) as the
  **baseline**; a check that could not execute is `UNKNOWN` and is barred
  from counting as post-rebase evidence. Conflicts are resolved by
  reconstructing both sides' intent from history — the skill flags the
  rebase inversion (`--ours` is the base, `--theirs` is your commit),
  forbids wholesale side-picking and `git rebase --skip`, regenerates
  generated files instead of picking one, delegates a large conflicted
  file to a read-only subagent, and escalates a genuinely undecidable hunk
  through `AskUserQuestion` without aborting the rebase. Every resolution
  is written to `docs/plans/<id>/rebase-<n>.md` (append-only local
  scratch). Verification re-runs the identical checks and compares at the
  level of individual test names: PASS→FAIL is a regression and **hard
  stops before the push**; FAIL→FAIL is pre-existing and does not block.
  The push is
  `--force-with-lease=<branch>:<pre-fetch-sha> --force-if-includes`, never
  a bare `--force` and never an implicit lease — the skill's own `git
  fetch` advances the remote-tracking ref an implicit lease would read.
  It does not wait for CI and does not merge; `/shipit` lands the PR.

## Methodology skills

The 36 methodology skills carry no `argument-hint` and, with one
exception, are never invoked directly. The exception is `code-review`: it
is a meaningful standalone user action ("review this diff",
`/code-review`) as well as a building block, so it does not set
`user-invocable: false` — and when invoked directly it dispatches the
`code-reviewer` agent rather than reviewing inline, preserving the
fresh-context separation it mandates (see
[architecture.md](architecture.md#methodology-skills-loaded-by-agents-not-directly-invoked)).
Agents load them through one of two mechanisms. The first is a
`skills:` YAML list in the agent's frontmatter. The second is an inline
prose load instruction in the agent body. See the "Two flavors of skill"
section above. The "Loaded by" line for each skill names its consumers from
the per-agent load manifest. An agent typically loads at most three. An
agent's own extracted procedure skill does not count toward that soft
limit: it replaces former inline body content 1:1, so it adds no net
context (see [architecture.md](architecture.md#design-guidelines)).

### qrspi-workflow

- **Purpose:** Phase discipline: the phase sequence, gates, and
  anti-patterns every phase follows.
- **Loaded by:** orchestrator skills.
- **Key behaviors:** The structural backbone of the pipeline: defines the
  phase sequence, the gate mechanics (severity tiers and the no-consult
  rule for the aggregate review gate), the phase-inference table, and an
  anti-patterns catalog. The artifact/frontmatter schema it once carried is
  canonical in `artifact-frontmatter`. This skill keeps pointers.

### artifact-frontmatter

- **Purpose:** The artifact schema contract for `docs/plans/<id>/`.
- **Loaded by:** orchestrator skills and artifact-authoring agents
  just-in-time through pointers (qrspi-workflow, decomposing-intent,
  `team`). No agent preloads it.
- **Key behaviors:** Carries the artifact inventory and `<id>` forms, plus
  the YAML frontmatter schema and phase enum. It also carries the
  `repos.md` and `prd.md` schemas, the topic-consistency invariant, the
  `ticketId` scope rule, and the design-review record mechanics
  (`design-review-<n>.md` verdicts). Defers to
  `hooks/session-start-recover.mjs` as the executable canon for
  `ID_RE`/`PHASE_FILES` rather than forking them.

### researching-codebases

- **Purpose:** Codebase research contract for the Research phase.
- **Loaded by:** researcher.
- **Key behaviors:** Carries the investigation contract (every claim
  cites code read in this run; cross-repo contracts are findings) and
  the compressed research-report output format with its 100-line budget
  (150 in multi-repo mode). How to investigate is left to the model.
  The isolation stance itself (questions.md only,
  never task.md) stays in the researcher agent as identity.

### finding-files

- **Purpose:** File-location search strategy for the Research phase.
- **Loaded by:** file-finder.
- **Key behaviors:** Glob by naming convention, content search,
  import/dependency tracing, directory exploration, and config/manifest
  checks, scoped to the vocabulary in `questions.md`. Deliberately
  self-contained: the file-finder runs on haiku, so the skill carries
  everything inline with no cross-references.

### decomposing-intent

- **Purpose:** Artifact templates and decomposition procedure for the
  Question phase.
- **Loaded by:** questioner.
- **Key behaviors:** Carries the `task.md` and `questions.md` body
  templates, the topic-slug rules, and the process steps. It also carries
  the multi-repo detection flow: an autonomous allowlist, sibling-directory
  resolution with realpath containment, the loud single-repo fallback, and
  the `repos.md` schema pointer. Conditionally loads
  `product-requirements-doc` for vague, multi-story, cross-cutting, or
  behavior-replacing requests, producing `prd.md` alongside `task.md`.

### authoring-designs

- **Purpose:** Design-document authoring procedure for the Design phase.
- **Loaded by:** design-author.
- **Key behaviors:** Carries the repo-scope confirmation flow and the
  autonomous open-questions resolution rule. Self-resolved choices land in
  `## Decisions made`, marked "Assumption — chosen without user review". It
  also carries the `design.md` document template with its six-category
  edge-case walk. When `task.md` references a `prd.md`, reads it first and
  honors its scope boundaries and acceptance criteria per
  `product-requirements-doc`'s "Consuming a PRD downstream" section.

### slicing-work

- **Purpose:** Vertical-slice breakdown methodology for the Structure
  phase.
- **Loaded by:** structure-planner.
- **Key behaviors:** Carries the vertical-slice rationale and the
  `structure.md` document format. Its slicing rules are that every slice
  ends in a passing test and holds 1-3 acceptance tests. Edge cases come
  from the design, and slices order by user value. The skill also carries
  the slicing heuristics: walking-skeleton first, and migrations alone are
  never a slice.

### planning-implementation

- **Purpose:** Tactical planning methodology for the Plan phase.
- **Loaded by:** planner.
- **Key behaviors:** Carries the `plan.md` document template that expands
  each vertical slice into file-level steps with acceptance-test mappings.
  Its tactical rules are one slice at a time, reuse over reinvention, and
  under 300 lines. It also forbids implementation code, keeps slices
  atomic, and matches test coverage to the structure.

### code-review

- **Purpose:** Generator-evaluator separation and the gate verdict
  vocabulary.
- **Loaded by:** code-reviewer, security-reviewer, ux-reviewer,
  technical-writer (4).
- **Key behaviors:** Defines how a reviewer reads with fresh eyes and emits
  a structured verdict. Invoked directly, it dispatches the `code-reviewer`
  agent rather than reviewing inline — the main session holds the
  conversation history the skill forbids. Findings use the format defined in
  `conventional-comments`. The ux-reviewer is the exception: its
  live-verification report uses its own Working/Broken/Could Improve
  format. The gate-type and severity-tier map lives in
  `review-severity-tiers`. Points review-comment prose at the seventh-grade
  bar in `writing-prose`. Carries the Comment red flags check with its
  split severity regime. Ticket or plan references and TODO or FIXME
  comments in code comments block on first occurrence. What-restating
  comments, wordy comments, and commented-out code escalate from
  `suggestion:` to `issue:` when repeated across the diff. The same style
  tier covers the judgment classes. These are process narration, comments
  far from the code they explain, and vague or speculative comments. They
  also include duplicated documentation, fragile positional references,
  stale comments, style divergence, and signature-restating doc comments.
  A constraint-gated
  missing-why finding is capped at `suggestion (non-blocking)` and never
  forces a REQUEST CHANGES verdict. Also carries the
  Code Reviewer inspection contract (the non-negotiable obligations —
  done-criteria verification, the test run, the every-surface check — and
  the unordered per-file coverage checklist). The security review
  methodology lives in `reviewing-security`.

### conventional-comments

- **Purpose:** The Conventional Comments format for review findings.
- **Loaded by:** code-reviewer, security-reviewer, and technical-writer
  (3), the `eng-design-doc-review` subagent loads it for its findings. The
  `ux-reviewer` does not preload it: its Working/Broken/Could Improve
  report is not Conventional Comments.
- **Key behaviors:** Carries the label and decoration syntax and the
  code-directed comment style, which critiques the code and not the coder.
  It also carries the three comment types (`issue`, `suggestion`, and
  `nitpick`) with literal examples. Every comment includes a specific
  `file:line` reference.

### reviewing-security

- **Purpose:** Security review methodology and the severity ladder.
- **Loaded by:** security-reviewer.
- **Key behaviors:** Carries the Security Reviewer process: attack-surface
  identification and OWASP Top 10 checks. The extra vulnerability checks
  cover hardcoded secrets, command injection, path traversal, unsafe regex,
  and missing input validation. It also carries the search-beyond-the-diff
  rule and the CRITICAL/HIGH/MEDIUM/LOW severity classification ladder, in
  which CRITICAL and HIGH are hard gates. The PASS/FAIL verdict rule stays
  in `code-review`.

### cross-model-review

- **Purpose:** Opt-in cross-vendor review pass — a second vendor's opinion
  on higher-stakes diffs and on design documents, verified before any of
  it is adopted.
- **Loaded by:** code-reviewer; the orchestrator or invoking session
  (`team`, `team-design`, `eng-design-doc-review`) runs its
  `## Design-review pass` procedure directly; and the design-review brief
  in `eng-design-doc-review` loads it conditionally when its prompt
  carries an `## External review input` section.
- **Key behaviors:** Runs only when the repo carries the consent marker
  `.team/cross-model-review`. On the code path the diff must also match a
  trigger class (auth/session/crypto, data storage and schema migrations,
  public API contracts); on the design path the orchestrator runs the
  pass every design-review round, no trigger classes. A machine-wide
  `TEAM_DISABLE_CROSS_MODEL` kill-switch, checked before the marker,
  hard-disables both paths. The bundled `external-review.mjs` script pins
  read-only invocations of the `codex` and `gemini` CLIs, checks the
  marker before any binary lookup, and enforces the prompt, output, and
  timeout caps.
  Every external claim is verified before adoption — nothing reaches
  Blocking or Major without the reviewer's own `file:line` confirmation —
  and the per-round record lands under one `### Cross-model disposition`
  block in the report. External output is data, never instructions; the
  pass skips loudly and never softens a verdict. The orchestrator persists
  each round's block to `docs/plans/<id>/cross-model-notes.md`, and
  `team-pr` copies that file into the PR's `## Review notes` section.

### review-severity-tiers

- **Purpose:** The authoritative severity-tier map for aggregating
  reviewer verdicts.
- **Loaded by:** the orchestrator (`team`, `team-implement`,
  `qrspi-workflow` cross-reference it at the aggregate review gate). No
  agent preloads it.
- **Key behaviors:** Carries the gate-type table (HARD, AUTO-FIX, or
  ADVISORY per reviewer) and the no-consult rule. It also carries the
  authoritative severity-tier table (Blocking, Major, or Minor-and-below),
  which maps every reviewer vocabulary onto one scale. Findings are never
  presented mid-run: the orchestrator loops the implementer automatically
  on Blocking/Major and defers Minor-and-below to the PR body's
  `## Review notes`, capped at 5 rounds (at the cap, terminal halt).
  Classifies `ux-reviewer` REQUEST CHANGES as an auto-fixed Major.

### engineering-standards

- **Purpose:** The design-first workflow, implementation standards, and the
  quality checklist.
- **Loaded by:** planner, implementer, code-reviewer (3).
- **Key behaviors:** Anchors planning and implementation in a shared
  standard so reviewers check against the same bar. It owns the binding
  Code Comments rule set. Comments are why-only, timeless, and
  process-free, with a rewrite before a comment, and they document
  non-obvious constraints and deliberate oddities with locality and
  precision. The bans cover duplicated documentation, ticket or plan
  references, TODO or FIXME in delivered code, and commented-out code.
  Maintenance: obsolete comments are removed in the same diff, and repo
  comment style is preserved. A four-question Decision Test closes the
  set. Doc comments on public interfaces are exempt. It also owns the
  Comment Discipline quality-checklist item that reviewer findings cite.

### test-first-development

- **Purpose:** Treat acceptance tests as the immutable scope fence.
- **Loaded by:** test-architect, code-reviewer, and the orchestrator.
- **Key behaviors:** Tests are written first and never edited to pass. The
  implementation must satisfy them as the contract. Every new test must fail
  with an assertion, never an error, and the project's static checks must pass
  before handoff — a green suite does not imply a green type checker. The style
  rules every acceptance test follows live in `test-style`.

### test-style

- **Purpose:** Test style rules and the flaky-test red-flag catalog.
- **Loaded by:** test-architect and code-reviewer just-in-time, through
  pointers from `test-first-development` and `code-review` (no agent
  preloads it).
- **Key behaviors:** Carries the full style-rule set:
  behavior-not-implementation, DAMP setup, narrow assertions, and
  actionable failures. It also carries the deterministic-input rules
  (control the clock, seed all randomness, own your state, impose order,
  and keep hermetic boundaries) and the fidelity ladder. It holds the audit
  checklist too, plus the single copy of the reviewer-facing flaky-test
  red-flag catalog with its canonical time-bomb example pair. The
  always-blocking severity regime for flaky flags stays in `code-review`.

### test-driven-bug-fix

- **Purpose:** Reproduce-first, red-green bug discipline.
- **Loaded by:** team-fix.
- **Key behaviors:** Write a failing test that reproduces the bug, then make
  it green. No fix lands without a reproducing test.

### solid-principles

- **Purpose:** The five object-oriented design principles.
- **Loaded by:** implementer, code-reviewer (2).
- **Key behaviors:** SRP, OCP, LSP, ISP, and DIP as concrete checkpoints
  for new code and review.

### refactoring-to-patterns

- **Purpose:** Code smells and the safe transformations that resolve them
  (Fowler).
- **Loaded by:** implementer.
- **Key behaviors:** Name the smell, apply the pattern in its own commit,
  and keep tests green at every step.

### implementing-slices

- **Purpose:** Slice-by-slice execution procedure for the Implement phase.
- **Loaded by:** implementer.
- **Key behaviors:** Defines the implementer's two dispatch modes: initial,
  and review-fix with typed failure classes. It defines the slice-execution
  loop, in which the implementer implements the steps, runs the slice's
  acceptance tests, commits atomically, and reports. It also defines TDD
  discipline within a slice, blocker handling, and the scope fence.
  Acceptance tests are immutable, and no slices go beyond the plan.

### systematic-debugging

- **Purpose:** Evidence-first root-cause diagnosis.
- **Loaded by:** the implementer's preloaded `implementing-slices` skill
  carries an inline **conditional**
  `Load skills/systematic-debugging/SKILL.md` directive, fired only on a
  **non-obvious** mid-slice failure (it drills the Root Cause Analysis (5
  Whys) chain before editing). For every other agent it remains
  **advisory**: no static `Load skills/<name>/SKILL.md` instruction names
  it. Those agents load it on demand when an investigation begins.
- **Key behaviors:** Gather evidence before theorizing, then isolate the
  root cause rather than patching symptoms.

### running-quality-checks

- **Purpose:** Mechanical verification procedure for the Implement phase's
  verify gate.
- **Loaded by:** verifier.
- **Key behaviors:** Detect the checks the project configures in scripts,
  Makefile targets, CI steps, and tool config. Run them fastest-first in
  speed order: format, lint, typecheck, build, then test. Capture the exact
  command and exit code as evidence, then derive a PASS/FAIL verdict. The
  skill is deliberately self-contained. The verifier runs on haiku, so the
  skill carries everything inline with no cross-references.

### progress-tracking

- **Purpose:** Todo-first progress convention for multi-step procedures.
- **Loaded by:** every multi-step agent (questioner, design-author,
  structure-planner, planner, test-architect, implementer, code-reviewer,
  security-reviewer, ux-reviewer, technical-writer, researcher, verifier).
- **Key behaviors:** A convention, not a gate: it produces no artifact and
  blocks nothing. When a procedure has two or more steps, seed one todo
  item per step before starting and mark each complete as you go. A
  goals-and-constraints procedure seeds one item per natural unit of work
  (a slice, a question, a finding), never one per sentence of guidance.
  The orchestrator owns the phase ledger. An agent tracks its own
  sub-steps in its own context and never merges them up.

### nested-agents

- **Purpose:** Guardrails for the four `Agent`-tool holders that spawn
  read-only nested sub-agents.
- **Loaded by:** researcher, implementer, code-reviewer, security-reviewer
  (4).
- **Key behaviors:** Nesting is an optimization, never a dependency: if the
  `Agent` tool is missing or a dispatch fails, the agent does the work
  inline. Carries the fail-closed version gate (Claude Code ≥ 2.1.172), the
  read-only default, and the depth budget. The per-agent caps follow. The
  researcher fans out at most 4 isolation-preserving exploration scouts.
  The implementer fans out at most 2 read-only scouts, overlapping the
  next slice's scouting with the current slice's work. Scouts are
  long-lived: a follow-up question inside a live scout's territory goes
  to that scout over `SendMessage` instead of a cold respawn, under the
  same caps and isolation invariant. The code-reviewer
  and security-reviewer run the skeptic pass. In that pass, a fresh
  sub-agent receives every hard-gate finding to refute, as a neutral
  falsifiable claim. For a security finding, the claim is about
  exploitability. Skeptics are deliberately one-shot — never a follow-up —
  so each claim meets genuinely fresh context. Default-keep holds on
  anything short of a verified refutation.

### documenting-decisions

- **Purpose:** Creating and managing architecture decision records (ADRs).
- **Loaded by:** planner and orchestrator (per the skill's own
  self-description. no agent body carries an explicit
  `Load skills/documenting-decisions/SKILL.md` instruction and no agent
  declares it through `skills:` frontmatter).
- **Key behaviors:** Capture the decision, its alternatives, and its
  rationale so later readers understand the "why". Points ADR authors at
  the seventh-grade prose bar in `writing-prose`.

### technical-design-doc

- **Purpose:** Technical-design / architecture-doc methodology.
- **Loaded by:** planner (per the skill's own self-description. The
  `planner` agent body loads `engineering-standards` explicitly but does
  not carry an explicit `Load skills/technical-design-doc/SKILL.md`
  instruction).
- **Key behaviors:** Structures the design narrative: current state,
  desired end state, patterns to follow, and trade-offs. Points design-doc
  authors at the seventh-grade prose bar in `writing-prose`.

### product-requirements-doc

- **Purpose:** Optional product-requirements-document methodology.
- **Loaded by:** questioner, through `decomposing-intent`'s conditional
  load, which fires when the request is vague, multi-story, cross-cutting,
  or replaces existing behavior. Also design-author, through
  `authoring-designs`, when `task.md` references a `prd.md`, per the
  skill's "Consuming a PRD downstream" section.
- **Key behaviors:** Frames the problem, users, and success criteria when a
  request warrants a PRD before design. The PRD lands at
  `docs/plans/<id>/prd.md`, referenced from `task.md`. Points PRD authors
  at the seventh-grade prose bar in `writing-prose`.

### product-thinking

- **Purpose:** Product-need reasoning lens for "make something people
  want", which sharpens framing, design, and slicing so the work serves real
  users.
- **Loaded by:** questioner, design-author, structure-planner.
- **Key behaviors:** A reasoning lens, not a gate: it produces no artifact
  of its own and blocks nothing. Four lenses (demand evidence, smallest
  thing people want, named user, talk-to-users mindset) shape the
  pre-implementation phases.

### systems-thinking

- **Purpose:** System-fit reasoning lens that weighs a change's blast radius
  (callers, consumers, sibling implementations, conventions) rather than
  only the diff in front of it.
- **Loaded by:** researcher, structure-planner, and planner (frontmatter).
  implementer, code-reviewer, ux-reviewer (inline). Cited by
  authoring-designs, code-review, and eng-design-doc-review.
- **Key behaviors:** A reasoning lens, not a gate: it produces no artifact
  of its own and blocks nothing. Four lenses (blast radius over diff
  radius, callers and siblings first, conventions are contracts, leave the
  system consistent) shape per-phase `## When ...` guidance. Reviews cite
  the `System Fit` checklist item by name. On greenfield targets "none
  found" is a complete answer.

### writing-prose

- **Purpose:** Plain-language prose quality for authoring and review.
- **Loaded by:** technical-writer, design-author.
- **Key behaviors:** A seventh-grade reading-level bar governs prose the
  agent writes as well as prose it assesses: readable, plain language
  aimed at someone who has not seen the code, clarity over cleverness.
  ASD-STE100 rules run in two modes — strict for instruction text,
  STE-flavored for descriptive prose — with three deltas (sentence cap,
  form, conditional mood) and every ban list shared. A delete-list names
  words to remove, never replace: marketing adjectives, modal hedges,
  filler. A `## Self-lint` checklist runs on any governed text before it
  is final. A bundled scorer, `ste-lint.mjs`, sits next to the skill file
  and reports violations of the mechanical rules per 100 words. It gates
  nothing. The technical-writer's review procedure that applies this
  bar lives in `reviewing-documentation`.

### reviewing-documentation

- **Purpose:** Documentation-gap review methodology and the
  REQUIRED/RECOMMENDED doc-change classification.
- **Loaded by:** technical-writer.
- **Key behaviors:** Carries the technical-writer's review procedure: it
  applies the `writing-prose` principles to reviews. Those are to classify
  by impact, name the failure mode, suggest the direction and not the
  rewrite, and acknowledge what works. It also carries the
  documentation-gap review process (inventory, impact analysis, and
  cross-reference) and the REQUIRED/RECOMMENDED doc-change classification.

### verifying-ux

- **Purpose:** Live application verification procedure for the Implement
  phase's UX gate.
- **Loaded by:** ux-reviewer.
- **Key behaviors:** Detect the project type: UI, API-only, or library.
  Libraries skip live testing. Boot the application, then check routes and
  endpoints with real `curl` requests, including error and edge cases.
  Always stop the server when done.

### git-commit

- **Purpose:** Commit discipline: conventional commits, the 50/72 subject
  and body rule, and atomic commits.
- **Loaded by:** team-pr, and implementer (through `implementing-slices`,
  at the atomic slice-commit step).
- **Key behaviors:** One logical change per commit with a clear, scoped
  message. Points commit-body prose at the seventh-grade bar in
  `writing-prose`.

### changelog

- **Purpose:** Keep a Changelog methodology.
- **Loaded by:** team, team-pr.
- **Key behaviors:** Record user-facing changes under the standard
  Added / Changed / Fixed headings before the PR opens. Points entry
  authors at the seventh-grade prose bar in `writing-prose`.

### tracking-tickets

- **Purpose:** Ticket-lifecycle discipline for tracker-linked runs: the
  in-progress / in-review timing, the conditional PR closing footer, and
  the never-close-by-hand rule.
- **Loaded by:** the PR-opening and pickup hosts just-in-time through
  pointers (`team`, `team-pr`, `team-fix`). No agent preloads it.
- **Key behaviors:** Every tracker interaction is best-effort,
  tracker-agnostic, and never blocks the pipeline. A picked-up ticket moves
  to in-progress as the run's first action. At PR open, a `Closes` footer
  links the PR to the ticket as the final line of the PR body. The footer
  is conditional on `ticketId`, and it is omitted when null, with no
  placeholder. The interpretation rules are codified at the consumption
  site. In multi-repo mode, only the home repo's PR carries the closing
  keyword, and companions get a non-closing qualified reference. The ticket
  moves to in-review only after someone marks the PR ready for review,
  never while it is a draft. No one closes the ticket by hand, because the
  link auto-closes it on merge.

### worktree-isolation

- **Purpose:** Worktree topology for single- and multi-repo work.
- **Loaded by:** orchestrator (team, team-worktree).
- **Key behaviors:** Set up isolated worktrees, so implementation never
  touches the main checkout. Tear them down only after the PR merges, or on
  explicit request. A branch thus stays available for iteration while its
  PR is open.

## Skill ↔ agent ↔ phase

This table ties each skill to the agents or orchestrator skills that load
it and the phase where that happens. The `Invoked / loaded by` column
carries two meanings depending on the row: for **entry-point skills** it
names who *invokes* the skill (you directly, or the orchestrator running a
phase). For **methodology skills** it names the agent(s) that *load* the
skill. For the `$ARGUMENTS` shapes and the three-tier discovery, see the
entry-point section above rather than repeating them here.

| Skill | Invoked / loaded by | Phase / context |
|---|---|---|
| `team` | orchestrator (runs the pipeline) | All phases |
| `team-question` | orchestrator | Question |
| `team-research` | orchestrator → researcher, file-finder | Research |
| `team-design` | orchestrator → design-author | Design (design review) |
| `team-structure` | orchestrator → structure-planner | Structure (autonomous) |
| `team-plan` | orchestrator → planner | Plan |
| `team-worktree` | orchestrator | Worktree |
| `team-implement` | orchestrator → implementer + reviewers | Implement |
| `team-pr` | orchestrator | PR |
| `team-fix` | user or model (direct invocation, on explicit pipeline intent) | Compressed bug-fix flow (outside QRSPI) |
| `eng-design-doc-review` | user (direct invocation). Pipeline DESIGN review gate (brief by reference) | Design review-gate brief + standalone audit. Dispatches a read-only Explore subagent |
| `shipit` | user or model (direct invocation, on explicit ship intent) | Standalone: land a reviewed PR (not a QRSPI phase) |
| `pr-open-comments` | user or model (direct invocation) | Standalone: triage unresolved PR review feedback (not a QRSPI phase) |
| `pr-watch-as-author` | user or model (direct invocation) | Standalone: bounded PR review watch loop (not a QRSPI phase) |
| `pr-watch-as-reviewer` | user (direct invocation) | Standalone: reviewer-side watch-and-approve (not a QRSPI phase) |
| `groom-backlog` | user or model (direct invocation) | Standalone: groom a project backlog (not a QRSPI phase) |
| `pr-cleanup` | user or model (direct invocation; Mode B only on explicit abandon intent) | Standalone: post-PR teardown (not a QRSPI phase) |
| `pr-verify` | user or model (direct invocation) | Standalone: test-plan verification (not a QRSPI phase) |
| `qrspi-workflow` | orchestrator skills | All phases |
| `artifact-frontmatter` | orchestrator skills. Artifact authors (just-in-time through pointers) | All phases: artifact schema |
| `code-review` | code-reviewer, security-reviewer, ux-reviewer, technical-writer | Implement (verify) |
| `conventional-comments` | code-reviewer, security-reviewer, technical-writer | Implement (verify): finding format |
| `review-severity-tiers` | orchestrator (team, team-implement, qrspi-workflow) | Implement (aggregate review gate) |
| `reviewing-security` | security-reviewer | Implement (verify) |
| `cross-model-review` | code-reviewer | Implement (verify) |
| `decomposing-intent` | questioner | Question |
| `authoring-designs` | design-author | Design |
| `researching-codebases` | researcher | Research |
| `finding-files` | file-finder | Research |
| `slicing-work` | structure-planner | Structure |
| `planning-implementation` | planner | Plan |
| `engineering-standards` | planner, implementer, code-reviewer | Plan, Implement |
| `test-first-development` | test-architect, code-reviewer. Orchestrator | Implement |
| `test-style` | test-architect, code-reviewer (just-in-time through pointers) | Implement |
| `test-driven-bug-fix` | team-fix | Bug-fix flow |
| `solid-principles` | implementer, code-reviewer | Implement |
| `refactoring-to-patterns` | implementer | Implement |
| `implementing-slices` | implementer | Implement |
| `running-quality-checks` | verifier | Implement (verify) |
| `verifying-ux` | ux-reviewer | Implement (verify) |
| `systematic-debugging` | implementer (inline Load on non-obvious failures). Other agents when debugging (advisory) | Implement, and Any (debugging) |
| `progress-tracking` | every multi-step agent (convention) | Any (multi-step procedure) |
| `nested-agents` | researcher, implementer, code-reviewer, security-reviewer | Research, Implement (scouts + skeptic passes) |
| `documenting-decisions` | planner, orchestrator (advisory) | Any (when decisions are recorded) |
| `technical-design-doc` | planner | Plan |
| `product-requirements-doc` | questioner (through `decomposing-intent`, conditional). Design-author (through `authoring-designs`) | Question, Design |
| `product-thinking` | questioner, design-author, structure-planner | Question, Design, Structure |
| `systems-thinking` | researcher, structure-planner, planner (frontmatter). Implementer, code-reviewer, ux-reviewer (inline). Authoring-designs, code-review, eng-design-doc-review (citing skills) | Research, Design, Structure, Plan, Implement (incl. verify) |
| `writing-prose` | technical-writer, design-author | Design (authoring bar), and Implement (verify): bar for prose it writes and prose it assesses |
| `reviewing-documentation` | technical-writer | Implement (verify): doc-gap review process + classification |
| `git-commit` | team-pr. Implementer (through `implementing-slices`) | PR, and Implement (slice commits) |
| `changelog` | team, team-pr | PR |
| `tracking-tickets` | orchestrator (team, team-pr, team-fix, just-in-time through pointers) | Setup (ticket pickup), and PR (ticket link + state) |
| `worktree-isolation` | orchestrator (team, team-worktree) | Worktree |

The read-only `Explore` subagent dispatched by `eng-design-doc-review` is
an one more consumer of `technical-design-doc`, `code-review`,
`engineering-standards`, and `documenting-decisions`. It loads all four as
the criteria for the design review.

## Name-collision pairs

Several skills and agents share a stem, which is an easy trap. The pattern
is consistent: the **skill** is the orchestrator or methodology, while the
**agent** is the specialist that does the work.

| Skill | Agent | How they differ |
|---|---|---|
| `team-research` | `researcher` | Skill dispatches the Research phase. The agent is the doer that runs the research. |
| `code-review` | `code-reviewer` | Skill is the review methodology. The agent is the reviewer that applies it. |
| `reviewing-security` | `security-reviewer` | Skill is the security review methodology and severity ladder. The agent is the reviewer that applies it. |
| `reviewing-documentation` | `technical-writer` | Skill is the doc-gap review methodology and classification. The agent is the reviewer that applies it. |
| `team-question` | `questioner` | Skill drives the Question phase. The agent decomposes the intent. |
| `implementing-slices` | `implementer` | Skill is the slice-execution procedure. The agent is the specialist that executes it. |
| `verifying-ux` | `ux-reviewer` | Skill is the live-verification procedure. The agent is the tester that runs it. |
| `authoring-designs` | `design-author` | Skill is the authoring procedure and template. The agent is the author that drafts the design. |
| `finding-files` | `file-finder` | Skill is the search strategy. The agent is the locator that executes it. |
| `planning-implementation` | `planner` | Skill is the plan template and tactical rules. The agent is the engineer that writes the plan. |
| `team-design` | `design-author` | Skill drives the Design phase. The agent drafts the alignment doc. |
| `technical-design-doc` | `technical-writer` | Both contain "technical" but differ: the skill is design-doc methodology. The agent writes documentation during verify. |
| `eng-design-doc-review` | `design-author` | The review skill dispatches a read-only `Explore` subagent, **not** the `design-author` agent, which keeps the audit independent of the author. |

## See also

- **[Architecture](architecture.md)**: the design rationale behind
  skills (two flavors, three-tier discovery, load limits) in §6.
- **[Vision](vision.md)**: the loop-driven end state Team builds toward.
- **[Ethos](ethos.md)**: the principles behind the pipeline.
- **[Overview](index.md)**: the landing page and pipeline overview.
- **`skills/team/registry.json`**: the phase-tagged inventory of the 13
  specialist agents, in the source tree.
