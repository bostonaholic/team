# Design: simplify-orchestration

## Current state

The TEAM router in `skills/team/SKILL.md:42-77` runs an event loop that reads
`~/.team/<topic>/events.jsonl` on every iteration, matches the latest
unconsumed event against `skills/team/registry.json`, dispatches the agent
whose `consumes` matches, writes the artifact the agent returned, then
appends a new event line. Thirty event types are defined in
`lib/events.mjs:39-70`; `deriveState()` (`lib/events.mjs:72-146`) replays the
full log to produce the state object hooks and `team-resume` consume.

Two runtime hooks piggyback on the log. `hooks/pre-compact-anchor.mjs:74-112`
scans every `~/.team/*/events.jsonl`, picks the most recently modified,
derives state, and injects a compaction-anchor string as `additionalContext`.
`hooks/session-start-recover.mjs` does the same work to detect a live
pipeline on session start. `skills/team-resume/SKILL.md:12-22` requires the
log to exist and uses 7 event-presence signals to classify partial work.

All nine partial-entry skills (`team-question`, `team-research`,
`team-design`, `team-structure`, `team-plan`, `team-worktree`,
`team-implement`, `team-pr`, `team-fix`) currently gate their prerequisites
on event presence in the log (research.md Q17).

The `teamflow/` tree is a local Fastify + Svelte 5 dashboard that tails each
per-topic log over SSE. It is a dev-only sidecar, not referenced in
`.claude-plugin/plugin.json` (research.md Q13). It imports `EVENT_TO_PHASE`
from `lib/events.mjs:39` at `teamflow/src/state.ts:12` and is otherwise
self-contained (research.md Q1, Q10).

## Desired end state

The router reads and writes `~/.team/<topic>/state.json` (a ~10-field
snapshot) instead of an append-only event log. It inspects `docs/plans/`
artifact files and `.approved` sidecar markers to decide what phase is
complete. Agent dispatch is driven by a linear phase table baked into the
router skill: for each phase, require predecessor artifact(s), dispatch the
agent(s), write artifacts, update the snapshot, advance the phase.

`hooks/pre-compact-anchor.mjs` is rewritten to read `state.json` directly and
emit a short anchor. `hooks/session-start-recover.mjs` is rewritten the same
way. Both lose their dependency on `lib/events.mjs`, which is deleted.

`skills/team-resume/SKILL.md` becomes a thin artifact inspector: "these
files exist under `docs/plans/<date>-<topic>-*`; you are at phase X;
continue?" The `teamflow/` tree, `docs/event-catalog.md`, and the 30-event
vocabulary are all deleted.

`~/.team/<topic>/` contains one file: `state.json`. Nothing else.

## Patterns to follow

- Stateless, single-purpose hook pattern in `hooks/pre-bash-guard.mjs` —
  zero external imports, reads stdin, writes one JSON output, exits. The
  rewritten PreCompact and SessionStart hooks should match this shape
  (research.md Q14).
- Dispatch-table file layout from `skills/team/registry.json:12-93` — keep
  `agents` (13 entries, `consumes`/`produces`) as the authoritative list
  even though `consumes`/`produces` become documentation rather than
  runtime-consumed. Team-registry-sync dev hook at
  `.claude/hooks/check-registry-sync.mjs` continues to work unchanged.
- Artifact-path convention in `skills/team/SKILL.md:69-74` — the router
  persists agent output to `docs/plans/<today>-<topic>-<phase>.md` before
  advancing. This pattern survives; the subsequent event append is what
  goes away.
- Partial-skill prerequisite check pattern — each `team-<phase>` skill
  stat's the predecessor artifact, prints a clear error if missing, and
  otherwise delegates to the same router phase dispatcher.

## Decisions made

1. **Substrate: `state.json` snapshot + artifact-presence ground truth
   (Q1 = B+C).** A single `~/.team/<topic>/state.json` holds counters,
   timestamps, and identity fields. Artifact files in `docs/plans/` are the
   source of truth for "did phase N finish?" Alternative A (memory-only)
   rejected: loses retry counters across compaction. Alternative C-alone
   rejected: cannot express `verificationRetryCount` or `currentSlice`
   without a snapshot.

   Schema (minimum viable fields):
   ```json
   {
     "topic": "simplify-orchestration",
     "today": "2026-04-22",
     "beadsId": "team-x7z" | null,
     "phase": "DESIGN" | "STRUCTURE" | "PLAN" | "WORKTREE" | "IMPLEMENT" | "PR" | "SHIPPED",
     "startedAt": "2026-04-22T14:03:11Z",
     "lastUpdated": "2026-04-22T14:47:02Z",
     "designRevisionCount": 0,
     "structureRevisionCount": 0,
     "verificationRetryCount": 0,
     "currentSlice": null
   }
   ```

2. **Prerequisite detection: artifact presence (Q2 = A).** Each
   `team-<phase>` skill stat's the predecessor file under `docs/plans/`.
   No snapshot read needed for prereqs. Alternative B rejected: couples
   partial skills to snapshot schema unnecessarily.

3. **Approval gates: `.approved` sidecar markers (Q2, refinement).** Human
   approval of design is recorded by touching `docs/plans/<today>-<topic>-design.md.approved`
   (empty file). Structure approval: `<...>-structure.md.approved`. Trivially
   testable (`existsSync`), leaves artifact content immutable, survives
   compaction and worktree moves. Alternative (renaming the artifact to
   `design-approved.md`) rejected: would break existing tooling that
   globs for `*-design.md`.

4. **Compaction resilience: PreCompact hook, simplified (Q3 = A).** The
   PreCompact hook reads `state.json` (one file, ~200 bytes), formats a
   4-line anchor (topic, phase, counters, "run /team-resume"), injects it
   as `additionalContext`. The SessionStart hook does the same. No event
   replay, no multi-directory scan beyond `readdir(~/.team/)` to find the
   most recently touched `state.json`. Alternative (drop PreCompact
   entirely) rejected: post-compaction agent would have zero pipeline
   awareness.

5. **`team-resume`: thin artifact inspector (Q4 = A).** Lists the
   `docs/plans/<date>-<topic>-*` files present, compares against the
   expected sequence (task → research → design → structure → plan →
   worktree → implement), reports the gap, asks the user whether to
   continue. Drops the 7-signal partial-work table; most signals collapse
   to "artifact N exists, N+1 does not." Alternative (remove `team-resume`
   entirely) rejected: the skill is the canonical single-command recovery
   path and users have muscle memory for it.

6. **Deletion scope: aggressive clean break (Q5 = A).** Delete
   `lib/events.mjs`, the entire `teamflow/` tree, `docs/event-catalog.md`,
   `tests/teamflow-dashboard-tests.sh`, and the event-replay sections of
   the router skill. Rewrite both runtime hooks and `team-resume`. Remove
   Teamflow references from `AGENTS.md` (section `## Teamflow Dashboard`
   and the row in the runtime-vs-dev table) and `docs/architecture.md`.
   Alternative (conservative stubs) rejected: leaves ambiguous dead code
   the next contributor must re-decipher.

## File-level action list

**Delete outright**
- `teamflow/` (entire tree — 26 files: server, state engine, Svelte client,
  tests, build config)
- `lib/events.mjs`
- `docs/event-catalog.md`
- `tests/teamflow-dashboard-tests.sh`

**Rewrite (structural replacement, not edit)**
- `skills/team/SKILL.md` — replace the event loop in `:42-77` with a
  linear phase table; remove event-append instructions from gate handlers;
  document `state.json` and `.approved` markers. Target length unchanged
  (~210 lines).
- `hooks/pre-compact-anchor.mjs` — strip `lib/events.mjs` import, read
  `~/.team/*/state.json`, emit 4-line anchor. Target <60 lines (down from
  138).
- `hooks/session-start-recover.mjs` — same treatment. Target <80 lines.
- `skills/team-resume/SKILL.md` — rewrite as artifact inspector. Target
  ~40 lines.

**Modify**
- `AGENTS.md` — remove the `## Teamflow Dashboard` section, the
  `lib/events.mjs` mention, the `## Shared Event Library` section, and the
  Teamflow row in the runtime-vs-dev table.
- `docs/architecture.md` — remove event-log and Teamflow sections; note
  the `state.json` + artifact-presence orchestration model.
- `skills/team/registry.json` — retain `agents[]` as documentation; add a
  top-level comment (`$comment` field) noting that `consumes`/`produces`
  are documentation-only after this change. Gates/joins sections can stay
  as a reference contract for humans reading the registry.
- `.claude/hooks/check-registry-sync.mjs` — unchanged behavior; still
  cross-checks agent frontmatter against `registry.json`.
- All nine `skills/team-<phase>/SKILL.md` entry points — replace
  "scan events.jsonl for <event>" with "stat
  `docs/plans/<date>-<topic>-<predecessor>.md`".

**Unchanged**
- `.claude-plugin/plugin.json` (no Teamflow reference today)
- `hooks/pre-bash-guard.mjs`, `hooks/post-write-validate.mjs`
- All 13 `agents/*.md`
- All methodology skills

## New router loop (replaces events-based loop)

```
setup:
  1. Parse $ARGUMENTS, derive topic, check beads ID, set today.
  2. mkdir -p ~/.team/<topic>/ and docs/plans/.
  3. If ~/.team/<topic>/state.json exists → load it, resume from state.phase.
     Else → write initial state.json with phase="QUESTION", startedAt=now.

loop:
  1. Read state.json. If phase == "SHIPPED" → exit.
  2. Look up the phase in the phase table to get expected agent(s) and
     predecessor artifact path(s).
  3. If predecessor artifacts are missing, raise an error — state.json is
     desynced from disk (user likely deleted artifacts).
  4. Dispatch the agent(s) (parallel when the phase table marks them so).
  5. Write returned artifact(s) to docs/plans/<today>-<topic>-<name>.md.
  6. Run the gate for this phase:
     - HUMAN (design, structure): present artifact, wait. On approve,
       touch <artifact>.approved. On reject, increment revisionCount in
       state.json, dispatch the same agent with revision feedback.
     - MECHANICAL (tests-failing): run suite, advance on assertion-only failure.
     - ROUTER-EMIT (worktree, PR): router performs the action.
     - AGGREGATE (5 reviewers): dispatch in parallel, collect results, run
       hard-gate evaluation, increment verificationRetryCount on failure,
       cap at 5 and escalate.
  7. Update state.json: bump phase, refresh lastUpdated, persist counters.
  8. Goto loop.
```

## Out of scope

- Changes to agent system prompts (`agents/*.md`).
- Changes to the blind-research invariant or its enforcement.
- Changes to `skills/team-fix/SKILL.md`'s compressed bug-fix contract
  beyond the prerequisite-check swap.
- Replacing `registry.json` with a different schema (we keep the file;
  the router simply stops consuming `consumes`/`produces` for dispatch).
- Building a new dashboard or visibility tool.
- Migration from any existing `events.jsonl` files (the user accepts a
  clean break; in-flight pipelines at upgrade time will need to restart).

## Open questions (deferred)

- Should `registry.json` be trimmed to only the fields the new router
  actually uses, or retained in full for documentation? Defer to the
  structure phase.
- Should `state.json` live at `~/.team/<topic>/state.json` or
  `docs/plans/<today>-<topic>-state.json` (inside the repo)? Current
  choice follows existing `~/.team/` convention; revisit if we want the
  snapshot to travel with the branch.

## Risks

- **Underestimated `deriveState()` coverage.** The user flagged this. Field
  inventory confirms only `phase`, `topic`, `beadsId`, `startedAt`,
  `backwardTransitions` (now `verificationRetryCount`), `testFiles`, and
  `currentSlice` are load-bearing. Path fields are observability only and
  derivable from `docs/plans/` globs.
- **Loss of audit trail.** The event log was a forensic record of every
  dispatch. Post-change, the only record is `git log` on
  `docs/plans/*` and the state snapshot. If a pipeline misbehaves, we
  cannot replay history. Acceptable per the user's aggressive-deletion
  choice.
- **In-flight pipelines at upgrade time.** Any user with an active
  `events.jsonl` will need to restart the pipeline after upgrading the
  plugin. Document in the commit message; acceptable for a dev plugin.
- **`.approved` marker drift.** If the user edits an artifact after
  approving, the marker becomes stale. Mitigation: deferred; the human
  gate is a trust contract, not a cryptographic one.
- **Registry desync risk.** `registry.json` becomes partially documentation;
  the dev hook `.claude/hooks/check-registry-sync.mjs` still enforces
  consistency with agent frontmatter, so the risk is contained.
