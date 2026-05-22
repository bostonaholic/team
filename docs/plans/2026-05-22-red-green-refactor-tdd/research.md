---
topic: red-green-refactor-tdd
date: 2026-05-22
phase: research
---

# Research: red-green-refactor-tdd

This artifact combines two independent blind-research passes against `questions.md`:
the **file-finder** mapped each question to specific paths and line ranges; the
**researcher** read those files and answered the questions from the code itself.

## File Locations

### Question 1: IMPLEMENT phase agents and dispatch order
- **Primary source:** `skills/team/SKILL.md` lines 88-96 (phase table)
- **Supporting source:** `skills/team-implement/SKILL.md` lines 70-93 (sub-step execution order)

The phase table shows IMPLEMENT phase with agents `test-architect`, `implementer`, and 5 reviewers (parallel). The predecessor artifact is "worktree prepared". The team-implement skill documents the execution order: test-architect → mechanical gate → implementer → 5 reviewers.

### Question 2: IMPLEMENT sub-steps in team-implement skill
- **Primary source:** `skills/team-implement/SKILL.md` lines 9-14

Named sub-steps: (1) Test-first — `test-architect` writes failing acceptance tests; (2) Slice execution — `implementer` executes vertical slices with per-slice commits; (3) Code review — 5 parallel reviewers + aggregate hard-gate retry loop. Mechanical gate sits internally between test-architect and implementer (lines 75-76).

### Question 3: test-architect responsibilities and completion signal
- **Primary source:** `agents/test-architect.md` lines 1-121
- Frontmatter (1-7), responsibilities (9-14), files it reads (16-24), completion signal (96-121: Test Architect Report listing tests per slice and "All tests fail cleanly: YES/NO").

### Question 4: implementer responsibilities during normal dispatch
- **Primary source:** `agents/implementer.md` lines 91-151
- Slice-by-slice: read slice spec (97), implement steps (99-102), run slice acceptance tests (103-108), commit atomically (109-115), report (116-119), next slice (120).

### Question 5: Internal gates within IMPLEMENT
- **Primary source:** `skills/team-implement/SKILL.md` lines 75-93
- **Mechanical gate** (75-76): tests must fail with assertion errors, not crashes.
- **Aggregate gate** (82-92): security-review (CRITICAL/HIGH), verification (any failure), code-review (REQUEST CHANGES); max 5 rounds.
- **Supporting source:** `skills/team/SKILL.md` lines 165-191.

### Question 6: How to introduce new agents
- `AGENTS.md` line 60; `skills/team/SKILL.md` lines 238-240; hook `.claude/hooks/check-registry-sync.mjs` lines 1-153.
- Steps: create `agents/<name>.md` with frontmatter; add entry to `skills/team/registry.json` `agents` array; update phase table in `skills/team/SKILL.md`; same commit. Hook enforces sync.

### Question 7: Required agent frontmatter fields
- Example: `agents/test-architect.md` lines 1-7. Validator: `.claude/hooks/check-registry-sync.mjs` line 44.
- Fields observed on every agent: `name`, `description`, `model`, `tools`, `permissionMode`.

### Question 8: How implementer handles refactoring
- **Primary source:** `agents/implementer.md` lines 178-196; references `skills/refactoring-to-patterns/SKILL.md`.
- Line 185-186: do the refactoring in its own commit first with a `refactor:` prefix, then add the feature commit.
- Line 187-188: only refactor what you touch.
- Line 189-191: every refactoring step leaves tests passing.

### Question 9: Test-first-development on acceptance tests vs TDD cycles
- **Primary source:** `skills/test-first-development/SKILL.md` lines 78-102.
- Two levels: feature-level acceptance tests (scope fence, immutable during IMPLEMENT) vs step-level red-green-refactor cycles (owned by the implementer, freely added/modified/removed).

### Question 10: Refactoring-to-patterns on test state and commits
- **Primary source:** `skills/refactoring-to-patterns/SKILL.md` lines 12-30, 157-185.
- Refactor only with passing tests (line 24 explicitly forbids refactoring with failing tests). Procedure: tests pass before starting → smallest change → run tests → commit when green. Implementer guidance (172-185): separate refactor commit before feature commit, name the smell.

### Question 11: Registry.json schema for agent entries
- **Primary source:** `skills/team/registry.json` lines 1-35.
- Agent object: `name` (required, matches file), `phase` (required), `parallel` (optional boolean).

### Question 12: Rule for adding a new agent
- **Primary source:** `skills/team/SKILL.md` lines 238-240.
- Two files must be updated atomically: phase table in `skills/team/SKILL.md` and the `agents` array in `skills/team/registry.json`.

### Question 13: Mechanical gate logic
- **Primary source:** `skills/team/SKILL.md` lines 165-171.
- Run the test suite; advance only if all tests fail with assertion errors; otherwise fix infrastructure and re-run.
- Also in `skills/team-implement/SKILL.md` lines 75-76 and `registry.json:33`.

### Question 14: Maximum fix-and-re-review rounds
- **Primary source:** `skills/team/SKILL.md` lines 173-188. Cap = 5 rounds.
- Also in `skills/team-implement/SKILL.md` lines 89-92 and `registry.json:34` (`maxRetries: 5`).

### Question 15: Structurally similar existing agent-split
- **Primary source:** `skills/team/SKILL.md` lines 85-96.
- The only intra-phase sequential agent pair with a non-human gate between them is the IMPLEMENT phase itself: `test-architect` → mechanical gate → `implementer`. Agent files: `agents/test-architect.md`, `agents/implementer.md`. Coordinating skill: `skills/team-implement/SKILL.md`.

---

## Research Findings

### Q1: IMPLEMENT phase agents in order; predecessor
From `skills/team/SKILL.md:95`:
- Agents: `test-architect` → `implementer` → 5 reviewers (parallel): `code-reviewer`, `security-reviewer`, `technical-writer`, `ux-reviewer`, `verifier`.
- Predecessor: "worktree prepared". `plan.md` must exist on disk for the agents to consume.

### Q2: Named sub-steps and ownership
`skills/team-implement/SKILL.md:9-13` enumerates three sub-steps:
1. **Test-first** — `test-architect` writes failing acceptance tests.
2. **Slice execution** — `implementer` executes vertical slices with per-slice commits.
3. **Code review** — 5 parallel reviewers + aggregate hard-gate retry loop.

TodoWrite seed (line 37): `Test-architect → Mechanical gate → Implementer (per slice) → Review round 1`.

### Q3: test-architect responsibilities, files read, completion signal
Responsibilities (lines 28-96):
1. Learn test conventions from existing test files.
2. Write every acceptance test from `structure.md`, slice by slice — exact names, expected behavior, correct module paths, edge cases.
3. Confirm tests FAIL with assertion errors (not crashes); fix infrastructure (empty stubs, placeholder modules) until every test fails cleanly.
4. Do NOT write implementation code — only stubs/empty exports as minimum scaffolding.

Files read: `structure.md`, `plan.md`, `design.md`, plus existing test files for conventions.

Completion signal (98-117): a `## Test Architect Report` with a per-slice table of (slice name, test name, file, failure reason), setup notes, and the explicit flag `All tests fail cleanly: YES/NO`.

### Q4: implementer per-slice activities before committing
Lines 94-119:
1. Read slice spec — plan's acceptance tests, file-level steps, optional `Repos:` field.
2. Implement steps in given order; `[parallel]` may be any order, `[sequential]` depend on prior steps.
3. Run the slice's acceptance tests — all must pass, prior slices still pass.
4. Commit atomically — one commit per slice using `Commit:` line as subject (one per repo in multi-repo).
5. Report `{slice, testsPassing, commits}`.

Initial dispatch (lines 24-37): read `plan.md`, `structure.md`, optional `repos.md`, failing acceptance tests; run suite to confirm failing baseline.

### Q5: Internal gates
**Between test-architect and implementer (mechanical gate)**: every acceptance test must FAIL with assertion errors, not crashes (`skills/team/SKILL.md:168-173`; `skills/team-implement/SKILL.md:46-48`; `registry.json:33`). If not met → fix infrastructure and re-run; do not advance.

**Between implementer and reviewers**: no named gate. Reviewers are dispatched immediately after the implementer returns; the implicit condition is that the implementer reported all slices complete with tests passing.

### Q6: New agent introduction; check-registry-sync invariant
`skills/team/SKILL.md:239-240`: "add an entry to the phase table above and to the inventory in `skills/team/registry.json`."

Two files atomically: `agents/<name>.md` (new) and `skills/team/registry.json` (new entry). The phase table in `skills/team/SKILL.md` is the third file when the new agent runs in a phase.

`.claude/hooks/check-registry-sync.mjs` (lines 54-113):
- Every `agents/<name>.md` with `name:` frontmatter must have a matching `name` in `registry.json` `agents`.
- Every `registry.json` `agents[*].name` must have a matching `agents/<name>.md`.
- Fires PostToolUse(Write|Edit) on agent files or `registry.json`.
- Emits warnings (does not block).

Note (hook comment lines 13-14): `phase` lives only in `registry.json` (Claude Code agent frontmatter doesn't allow custom fields).

### Q7: Required frontmatter fields; legal values
Every agent file has: `name`, `description`, `model`, `tools`, `permissionMode`.

`model` values observed:
- `opus` — `implementer`, `planner`, `structure-planner`
- `inherit` — `test-architect`, `code-reviewer`, `security-reviewer`, `technical-writer`, `ux-reviewer`, `verifier`, `design-author`, `questioner`, `researcher`
- `haiku` — `file-finder`

`permissionMode` values observed:
- `acceptEdits` — `test-architect`, `implementer`, `planner`, `structure-planner`, `design-author`, `questioner`, `researcher`
- `plan` — `file-finder`, `code-reviewer`, `security-reviewer`, `technical-writer`, `ux-reviewer`, `verifier`

### Q8: How implementer handles refactoring today
`agents/implementer.md:178-195` (Working with existing code) loads `skills/refactoring-to-patterns/SKILL.md` and prescribes:
1. Identify code smells before writing.
2. Separate refactoring from feature work — `refactor:` commit FIRST, then the feature commit second within the same slice.
3. Refactor only what you touch.
4. Every refactoring step leaves tests passing.
5. Name smell + pattern in commit message.

TDD discipline (lines 126-133): "Do not optimize or refactor until the slice's tests pass."
Scope fence (147-153): "Do NOT refactor existing code unless the plan explicitly calls for it."

Net: refactoring of existing code lives in a separate pre-feature `refactor:` commit within the slice; the implementer also does step-level refactor as part of its own TDD loop after slice tests pass. Both refactor responsibilities currently sit on the implementer.

### Q9: test-first-development on acceptance vs step-level TDD
`skills/test-first-development/SKILL.md:78-99`:

**Acceptance tests (scope fence)** (80-87): written in TEST-FIRST by test-architect; verify external behavior; coarse-grained; **immutable during implementation**.

**Step-level TDD (red-green-refactor)** (89-99): during IMPLEMENT, "the developer may use traditional TDD cycles to build up the implementation":
- **Red** — write a small unit test for the next piece of internal logic.
- **Green** — write the minimum code to make it pass.
- **Refactor** — clean up without changing behavior.

Step-level tests are "implementation details" — freely added/modified/removed; not part of the scope fence.

Owner: "the developer" — currently the `implementer` agent during IMPLEMENT.

Key line (98-99): "Acceptance tests define **what** must work. Step-level TDD helps build **how** it works."

### Q10: refactoring-to-patterns: test state and commit discipline
**When permitted (14-29):** making a change easier first; removing duplication (Rule of Three); improving clarity before debugging.
**Prohibited (24):** when tests are failing — fix failing tests first.

**Safe refactoring procedure (158-168):**
1. Ensure tests pass before starting.
2. Smallest possible structural change — one refactoring at a time.
3. Run tests after each change; undo if they break.
4. Commit when tests pass — "each passing checkpoint is a safe point".
5. Repeat.

**Implementer-role guidance (172-185):**
- Separate `refactor:` commit before the feature commit.
- Name the smell and refactoring in the message, e.g. `refactor: extract user validation into UserValidator (Long Method)`.

### Q11: registry.json schema
Agent fields:
- `name` — required string, matches `agents/<name>.md`.
- `phase` — required string in `{QUESTION, RESEARCH, DESIGN, STRUCTURE, PLAN, WORKTREE, IMPLEMENT, PR}`.
- `parallel` — optional `true` for agents that run in parallel with siblings. Currently true on `file-finder`, `researcher`, and the five reviewers.

Other top-level structures (`phases`, `gates`) are documentation-only; `$comment` notes dispatch is driven by the phase table in `SKILL.md`.

### Q12: Two atomically-updated files for a new agent
`skills/team/SKILL.md:239-240`: phase table in `skills/team/SKILL.md` AND `skills/team/registry.json`. CLAUDE.md reinforces "update both in the same commit." The new `agents/<name>.md` file itself is the third (implicit) file the hook will flag if missing.

### Q13: Mechanical-gate logic
**Check:** all acceptance tests from test-architect must FAIL with assertion errors, not crashes/errors.

**Where defined:** orchestrator (`skills/team/SKILL.md:165-173`), sub-step skill (`skills/team-implement/SKILL.md:46-48`), agent itself runs a pre-gate check (`agents/test-architect.md:70-87`), registry data (`registry.json:33`).

**On failure:** fix test infrastructure (placeholder modules, empty exports, fixtures) and re-run; do not advance to implementer.

### Q14: Maximum review rounds
**5 rounds.**
- `skills/team/SKILL.md:183-184` — "Cap at 5 rounds … If at cap → escalate".
- `skills/team-implement/SKILL.md:91-92, 104` — same cap.
- `registry.json:34` — `"maxRetries": 5`.

Tracking: orchestrator appends `Review round N` to TodoWrite each retry (`skills/team/SKILL.md:183`; `skills/team-implement/SKILL.md:89`).

### Q15: Most structurally similar existing agent-split
**Within a single phase with a non-human gate between two agents:** the IMPLEMENT phase itself is the only one — `test-architect` → mechanical gate → `implementer`. This is unique.

**Across phase boundaries with a (human) gate between sequential agents:** the closest analogs are `design-author` → human gate → `structure-planner`, and `structure-planner` → human gate → `planner`. Files: `agents/design-author.md`, `agents/structure-planner.md`, `agents/planner.md`. Orchestrated by `skills/team/SKILL.md` (phase table lines 92-93, human-gate handling lines 143-145).

The IMPLEMENT-phase split is the closest precedent: two agents in sequence with a mechanical gate evaluated by the orchestrator on the test suite's output.
