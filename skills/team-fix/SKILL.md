---
name: team-fix
description: Compressed bug-fix pipeline — reproduce, write failing test, minimal fix, verify. Skips Question/Research/Design/Structure/Plan phases. Trigger on "/team-fix <bug description>".
effort: high
argument-hint: "<ticket id, issue URL, or bug description>"
---

# Team Fix — Bug Fix Pipeline

Run the compressed bug-fix pipeline. Goes straight to test-driven fix
discipline without the full QRSPI ceremony.

## Input

`$ARGUMENTS` may be:

- A ticket identifier (e.g. `ENG-1234`) — set aside as `ticketId` on
  `task.md`.
- An issue URL — fetched via `gh issue view` to extract title and body.
- Free-form text — treated as the bug description.

When `$ARGUMENTS` is empty, **discover, don't demand**: ground in repo context
before asking. Read recent `git log` activity and the repo's `README` /
`CLAUDE.md` to surface the likely failing area, then use `AskUserQuestion` with
labeled options to fill any genuine gap. Never bare-stop with a plain "describe
the bug" demand when context is available.

## When to Use

Use `/team-fix` when:

- The bug is well-understood and the affected code is known
- The fix is likely contained to a small number of files
- No architectural decisions are needed — this is a defect correction

Use `/team` (full QRSPI pipeline) when:

- The root cause is unknown and needs investigation
- The fix requires designing new behavior or APIs
- Multiple subsystems may be involved
- The user wants to align on the approach before code is written

## Pipeline

```
REPRODUCE → RED (failing test) → GREEN (minimal fix) → VERIFY → SHIP
```

No Question. No Research. No Design. No Structure. No Plan. No human gate.

## Setup

1. **Resolve the input** to a bug description first. On empty `$ARGUMENTS`,
   ground in repo context, then ask only for genuine gaps, per the
   **"discover, don't demand"** rule in `## Input`. A ticket id or issue URL is
   resolved as `## Input` describes (`gh issue view` for URLs).
2. **Move the ticket to in-progress.** If the input resolved to a ticket id
   or issue, move that ticket to its tracker's in-progress state — this is
   the first action of the fix, before any other work begins. Best-effort
   and tracker-agnostic: if the project defines no tracker-move mechanism
   (e.g. a free-form bug description, or a tracker the environment can't
   reach), skip silently and continue. Never block the pipeline on a tracker
   update.
3. **Derive `<id>`** the same way `/team` does (ticket-prefixed or
   date-prefixed kebab slug). Create `docs/plans/<id>/`.
4. Write a minimal `docs/plans/<id>/task.md` with the standard frontmatter
   (`topic`, `date`, `phase: task`, `ticketId`) plus a brief description
   of the bug. The `topic` value is the kebab portion of `<id>` — i.e.
   `<id>` minus the `<TICKET>-` or `<YYYY-MM-DD>-` prefix. Never use the
   ticket id, the date, or a re-worded description as the topic.
   `ticketId` lives only on `task.md`. This is the single durable record
   for the fix and lets any `/team-*` command pick it up if interrupted.
5. **Seed the TodoWrite ledger** with the bug-fix phases:
   `Reproduce → Red (failing test) → Green (minimal fix) → Verify → Ship`.
   Mark `Reproduce` as `in_progress`.
   See `skills/progress-tracking/SKILL.md` for the per-step tracking convention agents follow within each phase.

## Execution

Follow the test-driven-bug-fix methodology in the
`## Test-Driven Bug Fix Methodology` section below. Read it before
proceeding.

When the failure is non-obvious, Load `skills/systematic-debugging/SKILL.md`
and drill its **Root Cause Analysis (5 Whys)** causal chain to the root before
proposing a fix.

Mark each TodoWrite item `in_progress` when you begin and `completed`
when it finishes.

**Mechanical gate between Red and Green:** the new test must fail with an
assertion failure, not a crash. Do not proceed to the fix until confirmed.

## Test-Driven Bug Fix Methodology

A bug without a failing test is an unverified assumption. A bug fixed without
a failing test may be fixed correctly this time, but has no protection against
regression. The test-driven bug fix discipline ensures that every fix is:

1. **Reproduced** — the bug is confirmed to exist before any code changes
2. **Pinned** — a failing test locks in the expected correct behavior
3. **Fixed minimally** — the smallest change that makes the test pass
4. **Verified** — no regression in existing behavior

### Triage Before Reproducing

Before reproducing, classify the failure into one of four buckets:

| Bucket | Symptom | Action |
|--------|---------|--------|
| **Product** | Real defect in the code under test | Continue with the four-step discipline below |
| **Test impl** | Test wrong; behavior correct | File a separate test-fix; do NOT change production code to satisfy a bad test |
| **Infra** | CI environment, DB, network, container | Fix the env; do not encode the env-fix as a test |
| **Tooling** | Test runner / build system | Fix the tool; the bug is not in the product |

Intermittent failures are not a fifth bucket — they belong in one of the
four above. Quarantining a test as "flaky" without classifying the failure
hides the very intermittent product bug that the test surfaced. The
conditions that make a test flaky are frequently the conditions that
trigger the bug. Reproduce deterministically before fixing — see
`skills/systematic-debugging/SKILL.md`. When the failure is non-obvious,
drill the causal chain to its root first via the **Root Cause Analysis
(5 Whys)** subsection of `skills/systematic-debugging/SKILL.md` before
proposing a fix.

### The Four-Step Discipline

> Follow `skills/progress-tracking/SKILL.md`: when this procedure has two or more steps, seed one todo item per step before starting and mark each complete as you go.

#### Step 1: Reproduce

Before writing any code, reproduce the bug. Understanding exactly when and
why the bug occurs is the prerequisite for everything that follows.

- Run the failing scenario manually or via existing tests
- Identify the exact inputs that trigger the bug
- Understand what the system does (actual behavior) versus what it should
  do (expected behavior)
- Identify which file(s) and function(s) are involved

Do not hypothesize a fix during this step. Observe first.

**Reproduction is complete when you can reliably trigger the bug on demand.**

#### Step 2: Write a Failing Test

Write a test that:

- **Reproduces the bug** — the test exercises the exact scenario that
  triggers the bug
- **Asserts the correct behavior** — the assertion captures what should
  happen, not what currently happens
- **Fails for the right reason** — the test fails with an assertion
  failure (wrong behavior), not an error (broken test infrastructure)

Name the test to document the bug scenario: `test_returns_error_when_token_is_expired`,
not `test_bug_123` or `test_fix`.

Run the test suite and confirm:
- The new test FAILS (the bug exists)
- The new test fails with an assertion failure, not a crash or error
- All existing tests still pass (the test itself is not broken)

**This is the "Red" state. Do not proceed until the test fails correctly.**

#### Step 3: Fix Minimally

Apply the smallest change that makes the failing test pass.

- **Minimal means minimal.** Change only the code that produces the wrong
  behavior. Do not refactor, improve, or extend.
- **Do not change the test.** The test defines correct behavior. If the test
  is wrong, that is a separate problem — do not fix the code to match wrong
  tests.
- **Do not fix other bugs found along the way.** If you discover a related
  bug, note it. File it for later. Fix only the targeted bug.
- **After each change, run the tests.** The failing test should move from
  failing to passing. No existing test should start failing.

**This is the "Green" state. The targeted test passes, all other tests pass.**

#### Step 4: Verify

After the fix:

1. **Run the full test suite.** Every existing test must pass. If any test
   now fails that passed before, the fix introduced a regression — undo and
   investigate.

2. **Re-run the reproduction case.** Confirm that the original bug no longer
   occurs with the original inputs.

3. **Check for related instances.** If the root cause is a pattern (e.g.,
   missing null check), search the codebase for the same pattern. File issues
   for related instances — do not fix them in this commit.

4. **Review the minimal fix with a mutation check.** Temporarily revert one
   line of the fix and re-run the new test. It must go red again. If it
   still passes, the test does not exercise the fix — strengthen the
   assertion or the reproduction inputs. This guards against fixes that
   hide the symptom without addressing the root cause, and against tests
   that drift away from the bug.

### Commit Structure

Each step produces a commit:

```
test: reproduce <bug description> with failing test

Adds a test that fails due to the bug described in <issue reference>.
The test will pass once the fix is applied.
```

```
fix: <minimal description of the fix>

Fixes the root cause identified in the preceding test commit.
All tests now pass including the new reproduction test.

Closes #<issue>
```

Keeping the test commit and fix commit separate makes the intention clear:
the test proves the bug existed, the fix makes it go away.

### What This Is NOT

- **Not a refactoring opportunity.** Bug fixes are not the time to improve
  the surrounding code. The scope is: broken test passes, no regressions.
- **Not a feature addition.** If the correct behavior requires new
  functionality beyond restoring the previous intent, that is a feature, not
  a bug fix.
- **Not a workaround.** A workaround avoids the buggy code path. A fix
  corrects the buggy code. When in doubt, fix the root cause.

## Ship

1. Commit in two commits:
   - `test:` commit with the failing test
   - `fix:` commit with the minimal fix
2. **Open a draft PR automatically — do not stop to ask.** If working on
   a branch, push it and open the PR as a **draft** (`gh pr create
   --draft`). If not on a branch, commit to the working branch.
3. **Ticket — link now, in-review when ready.** If `ticketId` is non-null
   in `task.md`'s frontmatter: **link the PR to the ticket** so the
   tracker closes it — and any board automation moves it to its done state
   — when the PR merges. On GitHub, render the link as a `Closes #<n>`
   footer, emitted as the final line of the PR body. **Never move the
   ticket to in-review while the PR is a draft** — a draft is not under
   review, and Ship opens a draft PR, so the ticket keeps its
   in-progress state at open time; move it to the tracker's in-review
   state **only once the PR is marked ready for review**.
   Best-effort and tracker-agnostic — skip silently if the project defines
   no tracker-move mechanism; never block. Because the link auto-closes the
   ticket on merge, the orchestrator never closes tickets by hand. Surface
   the `ticketId` in the completion report.
4. Mark all TodoWrite items complete.

## Aborting

If reproduction fails: report "Bug could not be reproduced with the
given description." and stop. Do not write a test for an unconfirmed bug.

If the fix is larger than expected (touching many files, requiring new
APIs, or revealing an architectural problem): stop, report the scope,
and recommend switching to the full `/team` pipeline.
