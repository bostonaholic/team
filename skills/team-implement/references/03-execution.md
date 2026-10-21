1. **Verify** `$ARGUMENTS/1-task.md` in every mode and `$ARGUMENTS/8-plan.md`
   in resume mode, or bootstrap `$ARGUMENTS/1-task.md` in standalone mode.
2. Dispatch `test-architect` → revalidates every acceptance test against
   `$ARGUMENTS/1-task.md`, then produces failing tests. A test without task
   support returns to PLAN and never enters the Red suite. In standalone
   mode it derives acceptance criteria from `$ARGUMENTS/1-task.md` instead
   of `7-structure.md`. If those tests already exist, skip this dispatch:
   resume at step 5, the hand-off, when the "IMPLEMENT complete" rule in
   the "Branch state" section of the
   [artifact schema](../team/references/artifacts.md) holds, otherwise at
   step 4. For a change whose stated contract is zero behavior change,
   skip this dispatch, record the reason on a named line, and run step 3 in
   its inverted form.
3. **Mechanical gate** — confirm all tests fail with assertion errors
   (not crashes), the test-architect reports
   `Expected results derived independently: YES`, **and** every static check
   the project defines passes (typecheck, lint, format, build — read the
   [verify playbook](../team/playbooks/verify.md) and detect them the way it
   does). On crash, fix test infrastructure before proceeding. On a failing
   static check, or a report saying
   `Expected results derived independently: NO`, send it back to the
   `test-architect`. This gate applies to a fresh `test-architect` run only.
   A resumed run that skips step 2 skips this gate too.
   Gather the suite and static-check results, the inverted baseline
   included, in one fresh subagent per
   [step delegation](../team/references/step-delegation.md). Rerun one
   reported assertion failure yourself and decide the gate inline.
   **Inverted for a zero-behavior-change refactor:** capture the suite and
   the static checks as a baseline **before** any file moves
   ([durable state rules](../team/principles/durable-state.md)), and advance
   only when they reproduce it — green is the correct state throughout, and
   a new failure is a regression. Structural checks carry what the tests
   cannot express here: a `grep` with an exact expected match count, a path
   that must no longer exist.
4. Dispatch `implementer` → executes slices with per-slice commits. It
   revalidates every action against `$ARGUMENTS/1-task.md`. In standalone
   mode it works from that task artifact and the failing tests.
5. **Hand-off.** When the implementer returns its completion report, present
   it and tell the user **"Next: run `/team-code-review docs/plans/<id>/`"**.
   IMPLEMENT dispatches no reviewer.
