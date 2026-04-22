# Structure: simplify-orchestration

Strangler-fig rewrite of the TEAM router: introduce `state.json` + `.approved`
marker substrate first, migrate hooks/resume to prefer it, then cut the router
over, then delete the legacy event-log code paths. Each slice keeps the
pipeline runnable end-to-end so an in-progress `/team` session never wedges.

## Slices

### Slice 1: `state.json` schema + helper module (write-only)
**Goal:** Establish the new persistence substrate without breaking anything —
the router still drives on events, but every state change is mirrored to a
`state.json` snapshot readers can adopt later.
**Layers touched:** new `lib/state.mjs` helper, `skills/team/SKILL.md` (gate
handlers write the snapshot alongside their event append).
**Scope:**
- Add `lib/state.mjs` exporting `readState(topic)`, `writeState(topic, patch)`,
  `initState(topic, beadsId, today)`, and a `PHASE` enum including
  `QUESTION | RESEARCH | DESIGN | STRUCTURE | PLAN | WORKTREE | IMPLEMENT | PR | SHIPPED`
  (router-flagged: include `QUESTION` and `RESEARCH`, not just the post-design
  phases from the design doc schema).
- Schema fields exactly match design decision 1 plus the two extra phases.
- Router SKILL.md: inside each existing gate handler, add "also write
  `~/.team/<topic>/state.json`" as a mirror of the event append. Keep all
  existing event-log writes untouched.
**Tests:**
- `node -e "import('./lib/state.mjs').then(m => m.initState('test-topic', null, '2026-04-22'))"` creates `~/.team/test-topic/state.json` with the correct shape.
- Run a dry `/team` through the DESIGN phase against a scratch topic; assert
  `jq '.phase, .designRevisionCount'` returns expected values AND the events
  log still has the usual entries.
**Verification checkpoint:** `cat ~/.team/<topic>/state.json | jq .` prints a
valid object containing all 10 fields; `~/.team/<topic>/events.jsonl` is also
still present with identical content to before.
**Rollback:** Delete `lib/state.mjs` and revert SKILL.md gate-handler edits.
No reader depends on `state.json` yet.
**Dependencies:** none.
**Atomic commit message:** `feat(state): introduce state.json snapshot substrate (write-only)`

### Slice 2: `.approved` sidecar markers on design/structure gates
**Goal:** Human approval produces a file artifact (`<design>.md.approved`,
`<structure>.md.approved`) in addition to the event. Downstream consumers can
migrate to checking for the marker instead of scanning the log.
**Layers touched:** `skills/team/SKILL.md` (HUMAN gate handler only).
**Scope:**
- In the HUMAN gate handler, after a user approves, `touch` the sidecar
  marker file alongside appending `design.approved`/`structure.approved` to
  the log. Rejection path unchanged.
- Document the sidecar convention in SKILL.md.
**Tests:**
- Run `/team` to the design gate, approve. Assert both
  `docs/plans/<today>-<topic>-design.md.approved` exists and
  `events.jsonl` contains `design.approved`.
- Reject once, then approve: the marker file appears only after approval;
  `designRevisionCount` in `state.json` is `1`.
**Verification checkpoint:** `ls docs/plans/*.approved` shows the marker after
approval, is absent before.
**Rollback:** Remove the `touch` line from the HUMAN gate handler; delete any
stray `.approved` files. Nothing yet reads them.
**Dependencies:** Slice 1 (so `designRevisionCount` has a place to live).
**Atomic commit message:** `feat(gates): emit .approved sidecar markers on human gate pass`

### Slice 3: Hooks prefer `state.json`, fall back to event log
**Goal:** `pre-compact-anchor.mjs` and `session-start-recover.mjs` read the
new snapshot when present and only replay events when it is missing. This is
the strangler seam — existing pipelines keep working, new pipelines exercise
the new read path.
**Layers touched:** `hooks/pre-compact-anchor.mjs`, `hooks/session-start-recover.mjs`.
**Scope:**
- Add a `readSnapshot(topic)` helper (either imported from `lib/state.mjs` or
  inlined per the stateless-hook pattern from `pre-bash-guard.mjs`).
- Both hooks: if `~/.team/<topic>/state.json` exists, format anchor/recovery
  notice from it (topic, phase, counters, "run /team-resume"). Else fall back
  to today's `deriveState()` replay.
- Per design pattern decision 4 target: keep the hooks well under the 5000ms
  budget. Do not yet delete the fallback.
**Tests:**
- Run a pipeline started AFTER slice 1 deploys through compaction: assert
  the PreCompact hook output matches the 4-line snapshot format (grep
  `additionalContext` for `phase=DESIGN`).
- Delete `state.json` on a scratch topic but leave `events.jsonl`; restart
  session and confirm the SessionStart hook still emits a recovery notice
  via the legacy path.
**Verification checkpoint:** With `state.json` present, the PreCompact anchor
no longer includes "last 3 events" lines; with only `events.jsonl` present,
it still does.
**Rollback:** Revert the two hook files. Neither the snapshot writer nor the
router has changed behavior yet.
**Dependencies:** Slice 1.
**Atomic commit message:** `feat(hooks): prefer state.json snapshot, fall back to event log`

### Slice 4: `team-resume` becomes an artifact inspector
**Goal:** `/team-resume` reports phase from artifact presence alone — the
7-signal partial-work table is gone. No router changes yet.
**Layers touched:** `skills/team-resume/SKILL.md`.
**Scope:**
- Rewrite per design decision 5. Target ~40 lines. Lists
  `docs/plans/<date>-<topic>-*` files, checks `.approved` markers, prints
  "you are at phase X; continue?".
- Still prefers `state.json` when present; only the heavy log-replay logic
  is removed.
**Tests:**
- Run through DESIGN then compact; `/team-resume` reports
  `phase=DESIGN, designRevisionCount=0, awaiting=structure` without reading
  `events.jsonl`.
- Start from an empty `~/.team/`; `/team-resume` reports "no active
  pipeline" with a helpful prompt.
**Verification checkpoint:** Diff `wc -l skills/team-resume/SKILL.md` before
and after: drops from ~100 to ~40. Manual run through a scratch pipeline
produces the new report.
**Rollback:** Restore previous SKILL.md from git. Hooks and router unchanged.
**Dependencies:** Slices 1-3.
**Atomic commit message:** `refactor(team-resume): rewrite as thin artifact inspector`

### Slice 5: Router rewrite — phase-table loop replaces event loop
**Goal:** The router in `skills/team/SKILL.md` drives from `state.json` +
artifact presence + the embedded phase table. Event-log writes are deleted
in this slice (the big cutover). See design section "New router loop".
**Layers touched:** `skills/team/SKILL.md` (structural rewrite, not edit).
**Scope:**
- Replace `:42-77` loop with the phase-table loop from the design doc.
- Setup step: initialize or load `state.json`. Remove first-event append.
- Loop: look up phase in the phase table, assert predecessor artifacts
  exist, dispatch agent(s), write artifacts, run the gate, update
  `state.json`, advance phase.
- Gates: HUMAN touches `.approved` (already present from slice 2);
  MECHANICAL, ROUTER-EMIT, AGGREGATE gates update counters in `state.json`
  instead of appending events.
- Stop writing to `events.jsonl` entirely. The file may still exist from
  previous pipelines — do not delete it here.
- Preserve target length ~210 lines per design.
**Tests:**
- Fresh scratch topic: run `/team` through QUESTION → RESEARCH → DESIGN
  approval → STRUCTURE approval. Assert `events.jsonl` was never created;
  `state.json` reflects `phase=PLAN` and the two `.approved` markers exist.
- Rejection path: reject a design once, approve on retry. Assert
  `designRevisionCount=1` in `state.json`.
- Existing pipeline mid-flight (pre-upgrade `events.jsonl` present): the
  router should error clearly "no state.json found, this pipeline predates
  the upgrade — please restart" per the design's accepted risk.
**Verification checkpoint:** `/team test-feature` completes two phases
without any file appearing under `~/.team/<topic>/` other than `state.json`.
**Rollback:** This is the high-risk slice. Revert `skills/team/SKILL.md` to
pre-slice-5 git state. Hooks still read `state.json` preferentially but fall
back, so older pipelines keep working. Keep slice 5 on its own commit to
make revert clean.
**Dependencies:** Slices 1-4. Slice 2's sidecar markers, slice 3's hook
preference, and slice 4's resume inspector must all work before the router
can stop emitting events.
**Atomic commit message:** `refactor(router): replace event loop with phase-table loop driven by state.json`

### Slice 6: All nine `team-<phase>` entry points use artifact prereqs
**Goal:** The partial-entry skills stat predecessor artifacts instead of
scanning `events.jsonl` per research Q17.
**Layers touched:** `skills/team-question/SKILL.md`,
`skills/team-research/SKILL.md`, `skills/team-design/SKILL.md`,
`skills/team-structure/SKILL.md`, `skills/team-plan/SKILL.md`,
`skills/team-worktree/SKILL.md`, `skills/team-implement/SKILL.md`,
`skills/team-pr/SKILL.md`, `skills/team-fix/SKILL.md`.
**Scope:**
- Per design decision 2 and "Patterns to follow" bullet 4: each skill stat's
  the predecessor file under `docs/plans/<date>-<topic>-<predecessor>.md`
  (or its `.approved` sidecar for gates), prints a clear error if missing,
  otherwise delegates to the router phase dispatcher.
- `team-fix` per design "Out of scope": only the prerequisite-check swap,
  no contract changes.
**Tests:**
- From a topic that has only `task.md` and `research.md`: running
  `/team-design` proceeds; `/team-structure` errors with "design not yet
  approved — run /team-design first"; `/team-plan` errors similarly.
- Each skill shows no `events.jsonl` read in a `strace`-style log (or a
  grep of the SKILL.md file for `events.jsonl` returns no matches).
**Verification checkpoint:** `grep -r events.jsonl skills/team-*/SKILL.md`
returns zero matches.
**Rollback:** Revert the nine SKILL.md files. Router already runs on
`state.json`, so entry-point skills reverting does not re-break anything;
they would just fail prereq checks differently.
**Dependencies:** Slice 5 (router must already run without the log).
**Atomic commit message:** `refactor(skills): partial entry points gate on artifact presence, not events`

### Slice 7: Delete `lib/events.mjs` and the event-log fallback paths
**Goal:** Excise dead code. The router no longer writes `events.jsonl`,
hooks prefer `state.json`, and no entry point reads the log — the fallback
and the library are unreferenced.
**Layers touched:** delete `lib/events.mjs`; prune fallback from
`hooks/pre-compact-anchor.mjs`, `hooks/session-start-recover.mjs`; prune the
legacy `readStateFile()` path (research Q6 flagged it as already-dead).
**Scope:**
- `rm lib/events.mjs`.
- Both hooks: delete the `deriveState`/`readEventLog` branch, delete
  `findActiveSession()`'s events.jsonl scanning, delete the dead
  `readStateFile()` reader. Hooks become stateless readers of
  `~/.team/<topic>/state.json` per design pattern bullet 1. Target <60 and
  <80 lines respectively.
**Tests:**
- `node --check hooks/pre-compact-anchor.mjs` and
  `node --check hooks/session-start-recover.mjs` pass.
- `grep -r "lib/events" .` returns zero matches except the to-be-deleted
  teamflow files (which slice 8 removes).
- End-to-end: fresh pipeline through two phases with compaction triggered
  mid-DESIGN; recovery works identically to slice 3.
**Verification checkpoint:** `ls lib/` does not contain `events.mjs`;
`grep -R events.jsonl hooks/ skills/` is empty.
**Rollback:** Restore `lib/events.mjs` from git; restore fallback branches.
Slices 1-6 keep functioning without this excision.
**Dependencies:** Slices 5-6.
**Atomic commit message:** `refactor: delete lib/events.mjs and legacy event-log fallback`

### Slice 8: Delete `teamflow/` tree
**Goal:** Remove the dev sidecar. It is not referenced by
`.claude-plugin/plugin.json` (research Q13) and its only external import
(`lib/events.mjs`) was removed in slice 7.
**Layers touched:** delete `teamflow/` directory (26 files per files.md).
**Scope:**
- `git rm -r teamflow/`.
- Remove the `dev server` and `dev demo` invocations from any `package.json`
  scripts that reference teamflow.
**Tests:**
- `ls teamflow/` returns "no such file".
- `grep -R teamflow . --include='*.json' --include='*.mjs'` returns zero
  matches (docs handled in slice 9).
- Full `/team` pipeline through PLAN phase still succeeds — confirms
  teamflow was truly dev-only.
**Verification checkpoint:** `git status` shows only deletions under
`teamflow/`. Plugin install (fresh clone + `/plugin install .`) still works.
**Rollback:** `git revert` the deletion commit.
**Dependencies:** Slice 7 (teamflow imported `lib/events.mjs`; deleting it
first would break teamflow's build, so keep this order).
**Atomic commit message:** `chore: delete teamflow dashboard (dev sidecar no longer needed)`

### Slice 9: Documentation sync
**Goal:** Docs describe the new orchestration model; stale references gone.
**Layers touched:** `AGENTS.md`, `docs/architecture.md`, delete
`docs/event-catalog.md`, delete `tests/teamflow-dashboard-tests.sh`,
`skills/team/registry.json` (add `$comment` that `consumes`/`produces` are
documentation-only per design decision 6).
**Scope:**
- `AGENTS.md`: drop `## Teamflow Dashboard`, `## Shared Event Library`, the
  Teamflow row in the runtime-vs-dev table, and the `lib/events.mjs`
  mention (CLAUDE.md currently references it — verify scope).
- `docs/architecture.md`: replace event-driven sections with
  "`state.json` snapshot + artifact-presence" description. Note `.approved`
  marker convention.
- `rm docs/event-catalog.md`; `rm tests/teamflow-dashboard-tests.sh`.
- `skills/team/registry.json`: add `$comment` top-level field noting
  documentation-only semantics; retain `agents[]`.
- `.claude/hooks/check-registry-sync.mjs` unchanged (design pattern bullet 2).
**Tests:**
- `grep -R events.jsonl docs/ AGENTS.md` returns zero matches.
- `grep -R Teamflow docs/ AGENTS.md` returns zero matches.
- The dev hook `.claude/hooks/check-registry-sync.mjs` still passes on a
  Write to any `agents/*.md` — the `$comment` addition does not break the
  cross-check.
**Verification checkpoint:** A fresh reader following `AGENTS.md` + `docs/architecture.md`
can describe the pipeline without the word "event log" appearing.
**Rollback:** `git revert` — docs-only slice, zero runtime risk.
**Dependencies:** Slice 8 (teamflow section removal is cleaner once the
code is gone).
**Atomic commit message:** `docs: align AGENTS.md and architecture.md with state.json orchestration model`

## Cross-slice concerns

- **Phase enum placement.** The router flagged that the design's initial
  state.json writes `phase="QUESTION"` but the design's enum only lists
  `DESIGN..SHIPPED`. Fixed in **slice 1** by defining the enum as
  `QUESTION | RESEARCH | DESIGN | STRUCTURE | PLAN | WORKTREE | IMPLEMENT | PR | SHIPPED`.
- **Strangler seam ordering.** Slices 1-4 build the new substrate and its
  readers alongside the legacy log. Slice 5 is the single atomic cutover.
  Slices 6-9 are garbage collection. Any revert of slice 5 (or earlier)
  leaves the pipeline functional on the legacy path.
- **In-flight pipelines at upgrade.** Per design risks: users with an active
  `events.jsonl` must restart after slice 5 ships. Call this out in the
  slice-5 commit message (and therefore the eventual PR body).
- **Dev hook invariant.** `.claude/hooks/check-registry-sync.mjs` must keep
  passing across every slice — its contract (agent frontmatter vs.
  `registry.json`) is untouched by this structure.

## Out of structure

- Agent system prompts (`agents/*.md`) — design "Out of scope".
- Blind-research invariant enforcement — design "Out of scope".
- `team-fix` compressed contract beyond the prereq-check swap — design
  "Out of scope".
- New schema for `registry.json` beyond the `$comment` annotation — design
  "Out of scope" and deferred open question.
- Building a replacement dashboard — design "Out of scope".
- Migration tooling for existing `events.jsonl` files — design "Out of scope"
  (clean-break upgrade accepted).
- Moving `state.json` into the repo at `docs/plans/*-state.json` — deferred
  open question.
