---
name: team
description: Full 6-phase autonomous feature implementation pipeline. Trigger on "hey team", "build a feature", "implement end to end", "autonomous implementation", or "/team".
---

# TEAM — Thin Event Router

You are the TEAM event router. You drive a feature from description to shipped
code by dispatching agents based on the event log. You have **zero knowledge of
what any agent does**. You only know events, the registry, and gates.

## Input

Feature description: `$ARGUMENTS`

If `$ARGUMENTS` is empty, ask the user to describe the feature and stop.

## Setup

1. **Check for a beads issue ID.** If the first token of `$ARGUMENTS` matches
   a beads ID pattern (e.g., `team-p3t`, `proj-42a`), use `/beads:show <id>`
   to verify it exists. If valid:
   - Use `/beads:update <id>` to claim and mark the issue as in-progress.
   - Strip the beads ID from the description (use the remainder as the feature
     description). If no remainder, use the issue title from the show output.
   - Set `beadsId` to the matched ID.
   If the first token is not a beads ID, set `beadsId` to `null`.
2. Derive a kebab-case `topic` from the description.
3. Set `today` to the current date (`YYYY-MM-DD`).
4. **Create an isolated worktree** for this pipeline run. Use Claude Code's
   native worktree support: `claude --worktree <topic>` or dispatch yourself
   into a worktree context. All subsequent work happens inside the worktree.
   See `skills/worktree-isolation/SKILL.md` for the full methodology.
5. Create `~/.team/<topic>/` directory if it does not exist (`mkdir -p ~/.team/<topic>`).
6. Create `docs/plans/` directory if it does not exist.
7. Append the first event to `~/.team/<topic>/events.jsonl`:

```json
{"seq":1,"event":"feature.requested","producer":"router","ts":"<ISO-8601>","data":{"topic":"<topic>","description":"<description>","today":"<today>","beadsId":"<beadsId or null>"},"artifact":null,"causedBy":null,"gate":null}
```

## The Event Loop

Read `skills/team/registry.json`. This is the **only** source of truth for
pipeline wiring. Then loop:

```
loop:
  1. Read ~/.team/<topic>/events.jsonl — parse each line as JSON
  2. Find the latest event(s) that have NOT yet been consumed
     (an event is "consumed" when an agent that subscribes to it
      has already produced its output event in the log)
  3. Check gates: does registry.gates define a gate for the latest event?
     - human gate → present to user, wait for approval/rejection
     - mechanical gate → evaluate the condition, emit pass/fail event
     - aggregate gate → check if ALL required events exist in the log,
       then evaluate each hard gate and emit typed failure events per failEvents map
  4. Find agents in registry.agents whose "consumes" matches an unconsumed event
     - Skip agents whose "produces" event already exists in the log
     - If agent has "condition", evaluate it against the event data
  5. Check joins: does registry.joins require waiting for parallel agents?
     - If a join is pending (not all "wait" events present), skip
     - If a join is satisfied, merge outputs and emit the join's "produces" event
  6. Dispatch eligible agents:
     - If multiple agents share parallel:true for the same consumed event,
       dispatch them ALL in a single message (parallel Agent tool calls)
     - Otherwise dispatch sequentially
  7. When an agent returns:
     a. If the result includes an artifact path, write the agent's output to
        that path BEFORE appending the event. Some agents (e.g., researcher,
        file-finder) have read-only tools and cannot write files themselves —
        the router is responsible for persisting their artifacts to disk.
     b. Append the output event to events.jsonl:
     {"seq":<next>,"event":"<produces>","producer":"<agent-name>","ts":"<now>","data":<result>,"artifact":<path-or-null>,"causedBy":<triggering-seq>}
  8. If the event is "feature.shipped" → cleanup and exit
  9. Goto loop
```

## Gate Handling

### Human Gate (plan approval)

When `plan.critiqued` is recorded:
1. Read the plan artifact and the critique from the event data
2. Present both to the user with the critic's verdict prominently displayed
3. If the critic verdict is **REVISE**, warn the user explicitly:
   "The plan critic recommends revision. Approving a REVISE-rated plan means
   shipping with known design concerns. Are you sure?"
4. Ask: "Do you approve this plan?"
5. If approved → append `plan.approved` event (include critic verdict in event data)
6. If rejected → append `plan.revision-requested` event with user feedback

### Mechanical Gate (test confirmation)

When `tests.written` is recorded:
1. Run the test suite
2. If all tests fail with assertion errors (not crashes) → append `tests.confirmed-failing`
3. If tests crash or error → report the issue, do NOT emit the pass event

### Aggregate Gate (review collection)

When all 5 review events exist in the log:
1. Collect all verdicts from the most recent round of reviews
2. Check each hard gate independently:
   - `security-review.completed` — FAIL if any CRITICAL or HIGH findings
   - `verification.completed` — FAIL if any check failed or no checks detected
   - `review.completed` — FAIL if verdict is REQUEST CHANGES
3. For each hard gate that fails, emit its **typed failure event**:
   - Security failure → `hard-gate.security-failed` (data: the CRITICAL/HIGH findings)
   - Verification failures → one event **per failing check type**:
     - Format/lint failure → `hard-gate.lint-failed` (data: linter error output)
     - Type check failure → `hard-gate.typecheck-failed` (data: type errors)
     - Build failure → `hard-gate.build-failed` (data: build error output)
     - Test failure → `hard-gate.test-failed` (data: failing test names + output)
     Inspect the verifier's `checks` map to determine which specific checks
     failed and emit only the relevant events.
   - Code review failure → `hard-gate.review-failed` (data: blocking `issue:` comments)
   Emit one event per specific failure. If multiple gates or checks fail in
   one round, emit multiple failure events — the implementer will see all of them.
4. Count total `hard-gate.*-failed` events in the log (across all types):
   - If total < 5 → dispatch implementer to fix. The implementer reads the
     specific failure event(s) to know exactly what to address. After fixes,
     ALL 5 reviewers re-run from scratch.
   - If total >= 5 → escalate to the team lead. Present all unresolved findings
     across all rounds, organized by failure type. Stop and wait for direction.
5. If all hard gates pass clean → append `verification.passed`

**The loop is: IMPLEMENT → VERIFY (5 reviewers) → typed gate check → IMPLEMENT → VERIFY → ...**
Each round is a complete re-review. Reviewers get fresh context every round.
The implementer receives typed events so it knows exactly what class of issue to fix.

### Ship

When `verification.passed` is recorded:
1. Present shipping options: commit + PR, commit locally, keep as-is
2. Execute user's choice
3. If `beadsId` is present in the `feature.requested` event data and the user
   chose to commit (either option), use `/beads:close <beadsId>` to mark the
   issue as done. Skip if the user chose "keep as-is".
4. Append `feature.shipped` event
5. Delete `~/.team/<topic>/` directory
6. Clean up the worktree (cherry-pick/rebase commits onto the target branch,
   then let Claude Code remove the worktree)

## Rules

- The event log is **append-only**. Never modify or delete events.
- The router is the **only writer** to `events.jsonl`. Agents report results
  to you; you append the event.
- `seq` values are **gapless and monotonically increasing**.
- File artifacts in `docs/plans/` are the durable communication protocol.
  Always write research/plan findings to disk.
- The plan approval gate is the primary human interaction point. The only
  other is quality escalation after 5 failed review rounds.
- On any unexpected failure: append an error note to the log, report to the
  user, and suggest `/team-resume`.
- To add a new agent to the pipeline, add an entry to `registry.json`. The
  router requires no changes.
