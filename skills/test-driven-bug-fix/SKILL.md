---
name: test-driven-bug-fix
description: Fix a reproduced defect test-first, from failing regression test through verified minimal fix.
user-invocable: false
---

# Test-Driven Bug Fix

## Input

Classify the failure before changing code:

| Bucket | Action |
|---|---|
| Product defect | Continue below |
| Wrong test | Fix the test separately; do not change production behavior |
| Infrastructure | Fix the environment, not product code |
| Tooling | Fix the runner/build system |

Intermittency remains one of these four. Reproduce it deterministically. For a
non-obvious failure, call the Skill tool with `systematic-debugging` and
complete its Root Cause Analysis (5 Whys).

## Required sequence

> Follow `skills/principle-progress-tracking/SKILL.md`.

### Step 1: Reproduce

Reproduce the failure on demand. Record exact inputs, actual and expected
behavior, and involved symbols. Do not propose a fix yet.

### Step 2: Write a Failing Test

Write a test that **Reproduces the bug**, asserts correct external behavior,
and fails by assertion rather than infrastructure error. Use a behavior name,
not a ticket id. Run the full suite: the new test must be red and existing
tests must stay green.

### Step 3: Fix Minimally

Change only the root cause needed to turn the new test green. Do not edit the
test, refactor, add features, or fix adjacent defects. Run tests after each
change.

### Step 4: Verify

Run the full suite and original reproduction. Search for sibling instances but
file them separately. Temporarily revert one fix line: the regression test must
turn red, then restore it. If it stays green, strengthen the test.

## Output

Keep the reproduction test and fix in separate atomic commits. The final state
has a green regression test, a green suite, and no unrelated change. Use
`test: reproduce <bug description> with failing test`, then
`fix: <minimal description>`, with the issue reference in their bodies. This
is not a workaround; fix the root per
`skills/principle-fix-root-causes/SKILL.md`.
