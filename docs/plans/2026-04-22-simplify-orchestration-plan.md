# Plan: simplify-orchestration

## Context

Tactical plan for the strangler-fig rewrite approved in
`docs/plans/2026-04-22-simplify-orchestration-structure.md`. The TEAM router
moves from an append-only `events.jsonl` event log to a single
`~/.team/<topic>/state.json` snapshot plus `.approved` sidecar markers; nine
phase-entry skills switch from log scans to artifact stats; `lib/events.mjs`,
`teamflow/`, `docs/event-catalog.md`, and `tests/teamflow-dashboard-tests.sh`
are deleted. The design doc
(`docs/plans/2026-04-22-simplify-orchestration-design.md`) and research doc
(`docs/plans/2026-04-22-simplify-orchestration-research.md`) contain the
background; this plan is for the implementer.

## Sequencing and verification

- **Strict order 1 → 9.** Slices are not parallelizable. Each slice's steps
  within the slice may be interleaved, but no slice may start until the
  prior slice's acceptance tests pass and its commit has landed.
- **Between slices**, run the slice's "Verification" command(s) and confirm
  the "Expected output" matches. If output diverges, stop and reconcile
  before moving on — the strangler property holds only if each slice ends
  in a working state.
- **Slice 5 is the single high-risk commit.** After slice 5 lands:
  1. Delete `~/.team/` entirely (`\rm -rf ~/.team/`) to guarantee a clean
     slate.
  2. Run a full `/team scratch-topic-<date>` against a throwaway topic
     through at least DESIGN approval + STRUCTURE approval.
  3. Confirm `ls ~/.team/scratch-topic-<date>/` shows **only**
     `state.json` (no `events.jsonl`).
  4. Confirm both `docs/plans/<today>-scratch-topic-<date>-design.md.approved`
     and `...-structure.md.approved` files exist.
  5. Only then proceed to slice 6.
- **Dev hook invariant.** `.claude/hooks/check-registry-sync.mjs` fires on
  every Write/Edit to `agents/*.md` or `skills/team/registry.json`. Do not
  change `consumes`/`produces` in agent frontmatter. Slice 9 adds a
  `$comment` field at the **top level** of `registry.json` — the hook only
  inspects `registry.agents`, so the addition is safe. Verify by editing a
  sample agent after slice 9 and confirming no mismatch warning.
- **Engineering standards.** Apply `skills/engineering-standards/SKILL.md`
  per-slice: every commit leaves the tree runnable, each new module has
  exactly one reason to change, and no slice introduces code that is not
  exercised by its own acceptance tests.
- **No test runner ships with the plugin.** Verification uses `node --check`,
  `grep`, `jq`, `ls`, and end-to-end `/team` dry-runs. The `teamflow/` tree
  (which contained the only vitest suite) is deleted in slice 8, so no
  project-level test runner remains afterward.

## Gotcha: the duplicated `findActiveSession()`

The 38-line `findActiveSession()` function is byte-for-byte identical
between `hooks/pre-compact-anchor.mjs` and `hooks/session-start-recover.mjs`
(research Q's "Patterns Observed"). **Do not dedupe it in slice 3** — slice
3 is the strangler seam and its minimal change keeps the revert surface
small. **Dedupe via deletion in slice 7**: both copies collapse to a
single `findActiveSnapshot()` helper that scans for `state.json` files (or
one inlined per hook, preserving the zero-import hook-pattern from
`pre-bash-guard.mjs`). Slice 7 targets <60 / <80 lines per hook; inlining
is fine.

## Gotcha: `lib/state.mjs` must stay stateless

The `lib/state.mjs` module introduced in slice 1 is imported by the router
(in SKILL.md pseudocode) and optionally by the hooks. It must follow the
`hooks/pre-bash-guard.mjs` discipline:

- Only imports from `node:fs/promises`, `node:path`, `node:os`.
- No module-level side effects (no I/O at import time).
- Pure function exports — every function takes its inputs explicitly
  (`topic`, patch objects) and returns a value or a Promise.
- No global registry, no cached module state.

## Slices

---

### Slice 1: `state.json` schema + helper module (write-only)

**Acceptance tests** (from structure.md):
- `node -e` one-liner invoking `initState('test-topic', null, '2026-04-22')`
  creates `~/.team/test-topic/state.json` with the correct 10-field shape.
- Dry `/team` through DESIGN against a scratch topic: `jq '.phase,
  .designRevisionCount' ~/.team/<topic>/state.json` returns expected values
  AND `~/.team/<topic>/events.jsonl` still contains the usual entries.

**Steps:**

1. `lib/state.mjs` (new file) — Create a stateless module following the
   `hooks/pre-bash-guard.mjs` discipline (zero side effects on import,
   pure exported functions). Export:
   - `PHASE` — a frozen object with string values
     `QUESTION | RESEARCH | DESIGN | STRUCTURE | PLAN | WORKTREE | IMPLEMENT | PR | SHIPPED`
     (per structure cross-slice note; this is wider than the design schema's
     `DESIGN..SHIPPED` set on purpose — the router initializes to QUESTION).
   - `statePath(topic)` — returns
     `join(homedir(), '.team', topic, 'state.json')`. Model after
     `sessionDir()` in the current `lib/events.mjs:22`.
   - `readState(topic)` — `async`, returns the parsed object or `null` if
     the file does not exist / is malformed. Do not throw on ENOENT.
   - `writeState(topic, patch)` — `async`, reads current state, shallow
     merges `patch` on top, sets `lastUpdated` to `new Date().toISOString()`,
     writes atomically (write to `state.json.tmp`, `rename`).
   - `initState(topic, beadsId, today)` — `async`, writes a new snapshot
     with the schema:
     ```
     { topic, today, beadsId, phase: PHASE.QUESTION,
       startedAt: <now ISO>, lastUpdated: <now ISO>,
       designRevisionCount: 0, structureRevisionCount: 0,
       verificationRetryCount: 0, currentSlice: null }
     ```
     Ensure `~/.team/<topic>/` exists (`mkdir({recursive: true})`) before
     writing.
   - `[sequential]` — slice 1 has no other step dependencies.

2. `skills/team/SKILL.md` — inside each existing gate handler and the setup
   step, mirror every event-log write with a corresponding `state.json`
   write. Do not remove or alter any existing event-log writes. Specifically:
   - **Setup step 6** (`:32-36`): after appending `feature.requested`, also
     call `initState(topic, beadsId, today)` (add a plain-English imperative
     line since SKILL.md is Markdown-as-instructions, not code). Reference
     pattern from existing step 6's imperative wording.
   - **Human gate — design approval** (`:99-110`): after step 4
     "approved → append `design.approved`", add a new step "also
     `writeState(topic, { phase: 'STRUCTURE' })`". After step 5
     "rejected → append `design.revision-requested`", add "also
     `writeState(topic, { designRevisionCount: <count + 1> })`".
   - **Human gate — structure approval** (`:112-122`): analogous —
     `phase: 'PLAN'` on approve; `structureRevisionCount` bump on reject.
   - **Router-emit gate — worktree** (`:124-131`): after appending
     `worktree.prepared`, add `writeState(topic, { phase: 'IMPLEMENT' })`.
   - **Mechanical gate — tests** (`:134-138`): on `tests.confirmed-failing`,
     no phase change (still IMPLEMENT) but persist `lastUpdated` via a
     no-op `writeState(topic, {})`.
   - **Aggregate gate — review collection** (`:140-170`): on each
     `hard-gate.*-failed` emission, also
     `writeState(topic, { verificationRetryCount: <count + 1> })`.
   - **Router-emit gate — PR** (`:172-185`): on `feature.shipped`, also
     `writeState(topic, { phase: 'SHIPPED' })`. The cleanup step that
     deletes `~/.team/<topic>/` remains unchanged — it removes the directory
     including `state.json`.
   - `[parallel with step 1]` conceptually, but practically: finish step 1
     first so the SKILL.md edits refer to real exports.

**Verification:** 
- `node -e "import('./lib/state.mjs').then(m => m.initState('test-slice1', null, '2026-04-22').then(() => m.readState('test-slice1'))).then(s => { if (s.phase !== 'QUESTION' || s.designRevisionCount !== 0) process.exit(1); console.log('ok'); })"` prints `ok`.
- `jq 'keys | length' ~/.team/test-slice1/state.json` returns `10`.
- `\rm -rf ~/.team/test-slice1` after verification.
- Run `/team slice1-scratch` through the design gate, reject once, approve:
  `jq '.designRevisionCount, .phase' ~/.team/slice1-scratch/state.json`
  returns `1` and `"STRUCTURE"`.
- `wc -l ~/.team/slice1-scratch/events.jsonl` still reports the usual
  entries (>= 4 lines).

**Commit:** `feat(state): introduce state.json snapshot substrate (write-only)`

---

### Slice 2: `.approved` sidecar markers on design/structure gates

**Acceptance tests** (from structure.md):
- Run `/team` to DESIGN gate, approve → both
  `docs/plans/<today>-<topic>-design.md.approved` exists AND
  `events.jsonl` contains `design.approved`.
- Reject once, then approve → marker appears only after approval;
  `designRevisionCount=1` in `state.json`.

**Steps:**

1. `skills/team/SKILL.md` — in the **Human Gate (design approval)** block
   (`:99-110`), modify step 4 from "If approved → append `design.approved`
   event" to additionally `touch docs/plans/<today>-<topic>-design.md.approved`
   **before** the state.json write from slice 1. Rejection path (step 5)
   unchanged — no marker on reject.

2. `skills/team/SKILL.md` — same treatment for **Human Gate (structure
   approval)** (`:112-122`): approval path touches
   `docs/plans/<today>-<topic>-structure.md.approved`.

3. `skills/team/SKILL.md` — add a short Markdown subsection titled
   `### Approval marker convention` under the "Rules" block (after `:205`).
   Two sentences: "human approval creates a zero-byte sidecar file at
   `<artifact>.approved`; the sidecar is the durable signal that downstream
   phases check." `[sequential]` after steps 1–2 so the documentation
   reflects what was implemented.

**Verification:**
- `\rm -rf ~/.team/slice2-scratch docs/plans/*slice2-scratch*` to isolate.
- Run `/team slice2-scratch`, approve design, approve structure.
- `ls docs/plans/*slice2-scratch*.approved | wc -l` returns `2`.
- Separate run `\rm -rf ~/.team/slice2b docs/plans/*slice2b*`; `/team slice2b`
  to design gate; reject once; `ls docs/plans/*slice2b*design.md.approved`
  returns "No such file"; approve; repeat — file now exists;
  `jq '.designRevisionCount' ~/.team/slice2b/state.json` returns `1`.

**Commit:** `feat(gates): emit .approved sidecar markers on human gate pass`

---

### Slice 3: Hooks prefer `state.json`, fall back to event log

**Acceptance tests** (from structure.md):
- Pipeline started after slice 1 through compaction: `additionalContext`
  contains `phase=DESIGN`, formatted as the 4-line snapshot output (no
  "last 3 events" block).
- Delete `state.json` on a scratch topic while leaving `events.jsonl`;
  restart session → SessionStart hook still emits a recovery notice via
  the legacy path.

**Steps:**

1. `hooks/pre-compact-anchor.mjs` — at the top of `main()` (currently
   `:114`), **before** calling `findActiveSession()`, try to read the most
   recently modified `~/.team/*/state.json`:
   - Reuse `teamDir()` from `lib/events.mjs` (already imported).
   - Inline a `findActiveSnapshot()` helper (do not factor into
     `lib/state.mjs` yet — dedupe happens in slice 7) that
     `readdir(~/.team/)`, filters to directories, `stat`s each
     `state.json`, picks the one with the latest `mtimeMs`, parses and
     returns `{ topic, snapshot }` or `null`.
   - If a snapshot is found and its `phase !== 'SHIPPED'`, build a 4-line
     anchor:
     ```
     [TEAM Pipeline State -- Anchor before compaction]
     Phase: <snapshot.phase> | Topic: <snapshot.topic>
     Counters: designRev=<n> structureRev=<n> verifyRetry=<n>
     Run /team-resume to continue the pipeline.
     ```
   - Write that to `additionalContext` and exit. Do **not** call
     `formatAnchorContext` in this branch.
   - If no snapshot: fall through to the existing `findActiveSession()` /
     `deriveState()` path (unchanged).
   - `[sequential]` — this must land before step 2 starts.

2. `hooks/session-start-recover.mjs` — same treatment at the top of
   `main()` (currently `:167`). The snapshot-branch formatter emits a
   recovery notice:
   ```
   [TEAM Pipeline Recovery]
   An active TEAM pipeline was detected. Resume with /team-resume.

   Phase: <snapshot.phase> | Topic: <snapshot.topic>
   Counters: designRev=<n> structureRev=<n> verifyRetry=<n>
   Started: <snapshot.startedAt>
   To resume: run /team-resume
   ```
   `[parallel with step 1]` once step 1 is complete — two independent files.

3. Do **not** touch `lib/events.mjs`, `lib/state.mjs`, or any SKILL.md in
   this slice. Both hooks keep their `lib/events.mjs` imports (for
   fallback).

**Verification:**
- `node --check hooks/pre-compact-anchor.mjs` and
  `node --check hooks/session-start-recover.mjs` both exit 0.
- Stage a `state.json` manually:
  ```
  mkdir -p ~/.team/slice3-scratch
  echo '{"topic":"slice3-scratch","phase":"DESIGN","designRevisionCount":0,"structureRevisionCount":0,"verificationRetryCount":0,"startedAt":"2026-04-22T12:00:00Z","lastUpdated":"2026-04-22T12:00:00Z"}' > ~/.team/slice3-scratch/state.json
  ```
  Pipe an empty stdin to the hook: `echo '{}' | node hooks/pre-compact-anchor.mjs 2>&1 | grep -q 'phase=DESIGN\|Phase: DESIGN'`. Expect exit 0 with the phase in stderr.
- Remove `state.json`, keep only `events.jsonl` from a real prior run; run
  the SessionStart hook; confirm it emits the legacy `formatRecoveryContext`
  output (contains "Event Count:" line).

**Commit:** `feat(hooks): prefer state.json snapshot, fall back to event log`

---

### Slice 4: `team-resume` becomes an artifact inspector

**Acceptance tests** (from structure.md):
- After DESIGN + compact on a slice-3-era pipeline: `/team-resume` reports
  `phase=DESIGN, designRevisionCount=0, awaiting=structure` without reading
  `events.jsonl`.
- From an empty `~/.team/`, `/team-resume` reports "no active pipeline"
  with a helpful prompt.

**Steps:**

1. `skills/team-resume/SKILL.md` — full rewrite. Target ~40 lines
   (currently 43). Structure:
   - YAML frontmatter: unchanged `name:` and `description:` — but update
     `description:` to remove "Replays `~/.team/<topic>/events.jsonl`"
     phrasing. New description: "Resume an interrupted TEAM pipeline by
     inspecting docs/plans/ artifacts and `~/.team/<topic>/state.json`.
     Trigger on 'resume the pipeline', 'continue where we left off', or
     '/team-resume'."
   - Body sections:
     - `## Execution` — prefers `state.json` via `lib/state.mjs`'s
       `readState`. Step 1: scan `~/.team/*/state.json`, pick the most
       recent by `lastUpdated`. Step 2: if none, report
       "No active pipeline. Run /team to start." and stop. Step 3: from
       `snapshot.topic` and `snapshot.today`, list files matching
       `docs/plans/<today>-<topic>-*.md` and their `.approved` sidecars.
       Step 4: report phase, revision counters, present artifacts, ask
       "Continue?"
     - `## Phase inference` — short table mapping artifact-presence to
       expected next phase (task.md → research, research.md → design,
       design.md.approved → structure, structure.md.approved → plan,
       plan.md → worktree, etc.).
   - Delete the current `## How It Works`, `## QRSPI partial-work signals`
     sections entirely. No 7-signal table.

**Verification:**
- `wc -l skills/team-resume/SKILL.md` ≤ 45.
- `grep -c events.jsonl skills/team-resume/SKILL.md` returns `0`.
- Manual: stage a scratch `state.json` + design artifact + `.approved`
  marker; run `/team-resume`; confirm the report names the phase and the
  artifacts without referencing the event log.
- With empty `~/.team/`, run `/team-resume`; confirm "No active pipeline"
  message.

**Commit:** `refactor(team-resume): rewrite as thin artifact inspector`

---

### Slice 5: Router rewrite — phase-table loop replaces event loop

**Acceptance tests** (from structure.md):
- Fresh scratch topic: `/team` through QUESTION → RESEARCH → DESIGN
  approve → STRUCTURE approve. Assert `~/.team/<topic>/events.jsonl` was
  never created; `state.json` reflects `phase=PLAN`; both `.approved`
  markers exist.
- Rejection path: reject design once, approve on retry. Assert
  `designRevisionCount=1` in `state.json`.
- Pre-upgrade pipeline (`events.jsonl` present, no `state.json`): router
  errors clearly "no state.json found, this pipeline predates the upgrade
  — please restart".

**Steps:**

1. `skills/team/SKILL.md` — structural rewrite (not surgical edit). Target
   ~210 lines (current 206). Replace the following regions wholesale:
   - **`## Setup`** (`:18-39`): remove "Append the first event to
     `events.jsonl`" step. Replace step 6 with:
     - "If `~/.team/<topic>/state.json` exists, load it with
       `readState(topic)` and resume from `state.phase`."
     - "Else call `initState(topic, beadsId, today)`."
   - **`## The Event Loop`** (`:41-77`): rename the section to
     **`## The Phase Loop`** and replace the entire fenced block with the
     pseudocode from the design doc "New router loop" section
     (`design.md:181-207`). Keep the same tone — imperative English in a
     code-fenced block, not actual code.
   - **`## Blind Research Invariant`** (`:79-95`): retain but update step
     2: "Write `task.md`, `questions.md`, `brief.md` to `docs/plans/`.
     Persist `{taskPath, questionsPath, briefPath}` into `state.json` only
     if downstream state needs them (they do not per the schema) — just
     advance `phase` to `RESEARCH`. No event append."
   - **`## Gate Handling`** subsections (`:97-185`):
     - Human gates: drop the "append event" step. Approval path: touch
       `.approved` (already added in slice 2 — keep it) and
       `writeState(topic, { phase: <next> })`. Rejection path: increment
       the revision counter via `writeState`.
     - Router-emit (worktree): `writeState(topic, { phase: 'IMPLEMENT',
       worktreePath, branch })` — worktree path and branch become optional
       fields in state.json (non-load-bearing, for observability).
     - Mechanical gate: advance on success via `writeState(topic, {})` (no
       phase change — still IMPLEMENT sub-step); failure stops.
     - Aggregate gate: `verificationRetryCount` is incremented via
       `writeState` instead of appended as events. The 5-retry cap still
       applies.
     - Router-emit PR gate: on ship, `writeState(topic, { phase:
       'SHIPPED' })`, then delete `~/.team/<topic>/`.
   - **`## Rules`** (`:187-205`): remove bullets 1–3 (append-only,
     single-writer, gapless seq). Replace with:
     - "`state.json` is the single source of pipeline state; update it via
       `lib/state.mjs` only."
     - "Approval markers (`.approved` sidecars) are the durable record of
       human gate passes."
     - Keep remaining bullets (artifact files, human gates, blind research
       invariant, registry-as-dispatch-table). The last bullet about
       adding agents via `registry.json` stays, but note that
       `consumes`/`produces` are now documentation (see slice 9).
   - **Pre-upgrade detection.** At the top of `## Setup`, add a guard: if
     `~/.team/<topic>/events.jsonl` exists but `state.json` does not,
     stop with: "Found a pre-upgrade events.jsonl for topic <topic> but
     no state.json. This pipeline predates the state.json migration.
     Please delete `~/.team/<topic>/` and restart."
2. Do **not** modify `skills/team/registry.json` in this slice (slice 9).
   The router simply stops reading it for dispatch; it still loads it as
   a documentation reference.
3. Do **not** delete `lib/events.mjs` yet (slice 7). The hooks still
   reference it via fallback.

**Verification:**
- `wc -l skills/team/SKILL.md` in [190, 230].
- `grep -c events.jsonl skills/team/SKILL.md` returns `0`.
- `grep -c "append.*event" skills/team/SKILL.md` returns `0` (case-insensitive
  variations OK — spot-check manually).
- Fresh scratch: `\rm -rf ~/.team/slice5a docs/plans/*slice5a*; /team
  slice5a`. Go through DESIGN + STRUCTURE approve.
  - `ls ~/.team/slice5a/` shows only `state.json`.
  - `jq '.phase' ~/.team/slice5a/state.json` returns `"PLAN"`.
  - `ls docs/plans/*slice5a*.approved | wc -l` returns `2`.
- Rejection: `\rm -rf ~/.team/slice5b docs/plans/*slice5b*; /team slice5b`;
  at DESIGN gate, reject once with short feedback, then approve.
  `jq '.designRevisionCount' ~/.team/slice5b/state.json` returns `1`.
- Pre-upgrade: `mkdir -p ~/.team/slice5c; echo '{"seq":1,"event":"feature.requested"}' > ~/.team/slice5c/events.jsonl; /team slice5c`
  — expect the router to abort with the "predates the state.json
  migration" message. `\rm -rf ~/.team/slice5c` after.

**After-slice checkpoint (explicit pause):** Per structure cross-slice
notes, slice 5 is the single high-risk cutover. Before starting slice 6:
1. `\rm -rf ~/.team/`
2. Run `/team slice5-smoke` end-to-end through at least PLAN phase.
3. Confirm no `events.jsonl` anywhere under `~/.team/`.
4. Pause for self-review: reread the rewritten `skills/team/SKILL.md`
   line-by-line with the design doc's "New router loop" pseudocode
   adjacent. Reconcile any drift.

**Commit:** `refactor(router): replace event loop with phase-table loop driven by state.json`

---

### Slice 6: All nine `team-<phase>` entry points use artifact prereqs

**Acceptance tests** (from structure.md):
- From a topic with only `task.md` and `research.md`: `/team-design`
  proceeds; `/team-structure` errors "design not yet approved — run
  /team-design first"; `/team-plan` errors similarly.
- `grep -r events.jsonl skills/team-*/SKILL.md` returns zero matches.

**Steps:** each skill below gets the same treatment — replace its
event-log scan with an artifact `existsSync` check. `[parallel]` across
all nine files (no interdependencies).

1. `skills/team-question/SKILL.md` — rewrite step 3 (`:23`). Remove the
   `events.jsonl` append (router handles state.json init now). Replace
   step 4 (`:24`) with "If a state.json already exists for this topic,
   resume; else the router bootstraps it."

2. `skills/team-research/SKILL.md` — replace step 1–2 (`:22-24`):
   "stat `docs/plans/<today>-<topic>-task.md`. If missing, run
   `/team-question $ARGUMENTS` first." Remove the `events.jsonl` scan.

3. `skills/team-design/SKILL.md` — replace step 1–2 (`:12-14`): "stat
   `docs/plans/<today>-<topic>-research.md`. If missing, report 'No
   research found. Run /team-research first.' and stop."

4. `skills/team-structure/SKILL.md` — replace step 1–2 (`:12-14`): "stat
   `docs/plans/<today>-<topic>-design.md.approved`. If missing, report
   'Design not yet approved — run /team-design first.' and stop."

5. `skills/team-plan/SKILL.md` — replace step 1–2 (`:12-14`): "stat
   `docs/plans/<today>-<topic>-structure.md.approved`. If missing,
   report 'Structure not yet approved — run /team-structure first.'
   and stop."

6. `skills/team-worktree/SKILL.md` — replace step 1–2 (`:12-14`): "stat
   `docs/plans/<today>-<topic>-plan.md`. If missing, report 'No plan
   drafted. Run /team-plan first.' and stop." Step 4 (`:17-18`) —
   replace "Append `worktree.prepared` event" with
   "`writeState(topic, { phase: 'IMPLEMENT', worktreePath, branch })`".

7. `skills/team-implement/SKILL.md` — replace step 1–2 (`:17-19`): stat
   `state.json` and check `phase === 'IMPLEMENT'` OR `worktreePath` is
   set. If missing, report 'No worktree prepared. Run /team-worktree
   first.' and stop. Leave the 3 internal sub-step descriptions
   unchanged. Any internal event-name references (`tests.written`,
   `hard-gate.*-failed`) remain as **descriptive labels** of the
   verifier/reviewer output classes, not as log entries — the aggregate
   gate logic moved to `state.json.verificationRetryCount` in slice 5.
   Add a short note: "events named here are internal signals routed via
   state.json, not log lines."

8. `skills/team-pr/SKILL.md` — replace step 1–2 (`:12-14`): stat
   `state.json` and check `phase === 'PR'`. If missing, report
   'Verification not passed. Run /team-implement first.' and stop. Step
   3 (`:14-16`) — replace "Extract beads ID from the first event" with
   "read `beadsId` from `state.json`". Step 8 (`:32`) — replace "Append
   `feature.shipped` event" with "`writeState(topic, { phase:
   'SHIPPED' })`".

9. `skills/team-fix/SKILL.md` — per design "Out of scope": only the
   prerequisite swap. Remove the `Setup` step 2 JSON event-append block
   (`:52-56`). Replace with "Call `initState(topic, beadsId, today)` to
   bootstrap state.json." The phase-transition table (`:65-72`) becomes
   state.json counter updates — but keep the table **labels** (Reproduce,
   Red, Green, Verify, Ship) as narrative anchors. The right-most column
   "Event" is replaced with "state.json update" and lists the field
   changes (e.g., Reproduce → `phase: 'IMPLEMENT'`; Ship →
   `phase: 'SHIPPED'`).

**Verification:**
- `grep -r events.jsonl skills/team-*/SKILL.md` returns zero matches.
- `grep -rE 'Append.*event|append.*to.*events' skills/team-*/SKILL.md`
  returns zero matches.
- End-to-end: stage a partial topic (only `task.md` + `research.md` in
  `docs/plans/` + a state.json with `phase: 'DESIGN'`); run
  `/team-structure slice6-scratch` → expect the design-not-approved
  error. Run `/team-plan slice6-scratch` → same.

**Commit:** `refactor(skills): partial entry points gate on artifact presence, not events`

---

### Slice 7: Delete `lib/events.mjs` and the event-log fallback paths

**Acceptance tests** (from structure.md):
- `node --check hooks/pre-compact-anchor.mjs` and
  `node --check hooks/session-start-recover.mjs` pass.
- `grep -r "lib/events" .` returns zero matches except under `teamflow/`
  (deleted next slice).
- Fresh pipeline through two phases with compaction mid-DESIGN: recovery
  works identically to slice 3's snapshot path.

**Steps:**

1. `hooks/pre-compact-anchor.mjs` — rewrite to match
   `hooks/pre-bash-guard.mjs`'s stateless discipline. Target <60 lines.
   - Remove the `lib/events.mjs` import entirely.
   - Delete `readStateFile()`, `findActiveSession()`, `formatRecentEvents`,
     and the `events` parameter of `formatAnchorContext`.
   - Keep a minimal `findActiveSnapshot()` helper that does
     `readdir(~/.team/)`, filters directories, `stat`s each `state.json`,
     returns the one with the latest `mtimeMs` (or `null`).
   - `formatAnchorContext(snapshot)` emits the 4-line string from slice 3.
   - `main()`: find snapshot, if none or `phase === 'SHIPPED'` exit 0,
     else write `{hookSpecificOutput:{additionalContext: ...}}` to stderr,
     exit 0.
   - `[sequential]` — slice 7's two hook files must compile after each
     edit; keep steps atomic.

2. `hooks/session-start-recover.mjs` — same treatment. Target <80 lines.
   - Remove `lib/events.mjs` import.
   - Delete `readStateFile()`, `detectPartialWork()`, `findActiveSession()`.
   - Keep `findActiveSnapshot()` (same as step 1's — inline both copies;
     the dedupe-or-inline call is made here per the "Gotcha" section above;
     inline both).
   - `formatRecoveryContext(snapshot)` emits the recovery notice from
     slice 3.
   - `[parallel with step 1]` after step 1 completes — both hooks become
     self-contained and verifiable independently.

3. `lib/events.mjs` (delete) — `\rm lib/events.mjs`. Do **not** use
   `rm -i`; use `command rm lib/events.mjs`.

**Verification:**
- `node --check hooks/pre-compact-anchor.mjs` exits 0.
- `node --check hooks/session-start-recover.mjs` exits 0.
- `wc -l hooks/pre-compact-anchor.mjs` ≤ 60.
- `wc -l hooks/session-start-recover.mjs` ≤ 80.
- `ls lib/` does not contain `events.mjs`.
- `grep -rn "lib/events" hooks/ skills/ agents/` returns zero matches.
  Teamflow will still have matches (deleted next slice — that is expected).
- Manual: stage a `state.json` + run both hooks via stdin — both emit
  `additionalContext` to stderr and exit 0.

**Commit:** `refactor: delete lib/events.mjs and legacy event-log fallback`

---

### Slice 8: Delete `teamflow/` tree

**Acceptance tests** (from structure.md):
- `ls teamflow/` returns "no such file or directory".
- `grep -R teamflow . --include='*.json' --include='*.mjs'` returns zero
  matches.
- Full `/team` pipeline through PLAN phase still succeeds.

**Steps:**

1. `teamflow/` (delete entire tree) — `git rm -r teamflow/`.
   - The tree includes `src/`, `bin/`, `package.json`, `package-lock.json`,
     `node_modules/`, `tsconfig.json`, `vite.config.ts`, `svelte.config.js`,
     `index.html`, and the `__tests__/` directory per files.md. `git rm -r`
     handles all of them.
   - Note: `node_modules/` is likely `.gitignore`'d; if `git rm -r teamflow`
     complains about untracked files, follow with
     `command rm -rf teamflow/` to clear the working tree.

2. No root `package.json` exists (verified — `ls package.json` returns
   "no such file"), so no `dev server` / `dev demo` scripts to remove.
   Skip this scope item from the structure — it was anticipatory.

**Verification:**
- `ls teamflow/` exits nonzero with "No such file or directory".
- `grep -R teamflow . --include='*.json' --include='*.mjs' --include='*.mts' --include='*.ts'` returns zero matches.
- Docs still reference teamflow (handled in slice 9 — `grep -R teamflow
  docs/ AGENTS.md CLAUDE.md` will have matches; that is expected here).
- Smoke: `\rm -rf ~/.team/slice8-smoke docs/plans/*slice8-smoke*; /team
  slice8-smoke` through PLAN phase. Completes without error.

**Commit:** `chore: delete teamflow dashboard (dev sidecar no longer needed)`

---

### Slice 9: Documentation sync

**Acceptance tests** (from structure.md):
- `grep -R events.jsonl docs/ AGENTS.md CLAUDE.md` returns zero matches.
- `grep -R Teamflow docs/ AGENTS.md CLAUDE.md` returns zero matches.
- `.claude/hooks/check-registry-sync.mjs` still passes on a Write to any
  `agents/*.md` — the `$comment` addition does not break the cross-check.

**Steps:** `[parallel]` across the file edits — they are independent.

1. `CLAUDE.md` — per research Q confirmation, CLAUDE.md contains:
   - Line 26 Teamflow row in the runtime-vs-dev table — delete.
   - Line 87 `lib/events.mjs` mention in the State paragraph — delete and
     rewrite the paragraph: "State is a single `~/.team/<topic>/state.json`
     snapshot plus `.approved` sidecar markers in `docs/plans/`. The state
     helper lives at `lib/state.mjs`. Three-layer compaction defense is
     replaced by the PreCompact hook reading `state.json` directly."
   - Lines 91–99 `## Teamflow Dashboard` section — delete entirely.
   - Lines 101–104 `## Shared Event Library` section — delete entirely.
   - (Note the structure.md says "AGENTS.md"; the repo root-level file
     is actually `CLAUDE.md`. Edit that file — it is the effective
     `AGENTS.md`.)

2. `docs/architecture.md` — rewrite:
   - Section `## 1. Design Philosophy` (`:7-38`): drop "append-only event
     log" phrasing. Replace the "Events are the source of truth" bullet
     with "State is a `state.json` snapshot + artifact presence — the
     router and hooks read snapshots, phase completion is signaled by
     artifact files in `docs/plans/`."
   - Section `## 2. Event Store` and all downstream event-centric
     sections — replace with `## 2. State Snapshot` describing the
     `~/.team/<topic>/state.json` schema (10 fields, mirror slice 1's
     schema) and the `.approved` marker convention. Remove any
     "Teamflow" section.
   - Preserve the QRSPI narrative, the 13 agents, the blind-research
     invariant, and the human-gate philosophy — those are unchanged.

3. `docs/event-catalog.md` (delete) — `git rm docs/event-catalog.md`.

4. `tests/teamflow-dashboard-tests.sh` (delete) —
   `git rm tests/teamflow-dashboard-tests.sh`. If the `tests/` directory
   is then empty, `git rm -r tests/`.

5. `skills/team/registry.json` — add a top-level `$comment` field as the
   first key:
   ```
   "$comment": "consumes/produces fields are documentation-only; dispatch is driven by the phase table in skills/team/SKILL.md and state.json. Retained to keep the agent inventory and its event vocabulary as reference material.",
   ```
   Keep everything else (`phases`, `agents`, `gates`, `joins`) unchanged.
   Verify with `jq . skills/team/registry.json` that JSON still parses.

6. `.claude/hooks/check-registry-sync.mjs` — **no change**. The hook only
   inspects `registry.agents[].{name,consumes,produces}` (see `:85-90`);
   top-level `$comment` is ignored.

**Verification:**
- `grep -rn events.jsonl docs/ AGENTS.md CLAUDE.md` returns zero matches.
  (`AGENTS.md` does not exist at root; the command returns 0 matches for
  missing files, which is fine.)
- `grep -rn -i teamflow docs/ CLAUDE.md` returns zero matches.
- `jq '.["$comment"]' skills/team/registry.json` returns the comment
  string.
- `jq '.agents | length' skills/team/registry.json` returns `13`.
- Write-trigger the dev hook: open `agents/planner.md`, make a no-op
  whitespace edit, save. Confirm no "Registry/frontmatter sync" warning
  fires.
- Read-through sanity: open `CLAUDE.md` + `docs/architecture.md` and scan
  for the word "event log" — should appear zero times outside historical
  narrative.

**Commit:** `docs: align AGENTS.md and architecture.md with state.json orchestration model`

---

## Done Criteria

- All acceptance tests for every slice pass against the final commit.
- No regressions: `/team smoke-final` goes from QUESTION through PR on a
  trivial scratch topic using only `state.json` + artifact-presence.
- `\rm -rf ~/.team/`; `grep -rn events.jsonl .` returns zero matches
  anywhere in the repo.
- `ls lib/` contains only `state.mjs` (plus any pre-existing neighbors —
  currently none).
- `ls teamflow/` fails with "no such file".
- `.claude/hooks/check-registry-sync.mjs` emits no warnings on edits to
  any `agents/*.md` file.
- Every commit in the slice sequence is atomic and reverts cleanly on its
  own without cascading breakage (verify by `git revert` dry-runs on the
  slice-7 and slice-8 commits after slice 9 lands).
