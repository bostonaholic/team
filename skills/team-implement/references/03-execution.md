1. **Verify** `$ARGUMENTS/1-task.md` in every mode and `$ARGUMENTS/8-plan.md`
   in resume mode, or bootstrap `$ARGUMENTS/1-task.md` in standalone mode.
2. Dispatch `test-architect` → revalidates every acceptance test against
   `$ARGUMENTS/1-task.md`, then writes failing tests. A test without task
   support returns to PLAN and never enters the Red suite. In standalone
   mode it derives acceptance criteria from `1-task.md` instead of
   `7-structure.md`. If those tests already exist, skip this dispatch and
   resume at step 5 (the hand-off) when the "IMPLEMENT complete" rule in the
   "Branch state" section of the
   [artifact schema](../team/references/artifacts.md) holds, otherwise at
   step 4. For a change whose stated contract is zero behavior change, skip
   this dispatch, record the reason on a named line, and run step 3
   inverted.
3. **Mechanical gate** — confirm all tests fail with assertion errors (not
   crashes), the test-architect reports
   `Expected results derived independently: YES`, **and** every static check
   the project defines passes (detect them as the
   [verify playbook](../team/playbooks/verify.md) does). On crash, fix test
   infrastructure first. On a failing static check or
   `Expected results derived independently: NO`, send it back to the
   `test-architect`. The gate applies only to a fresh `test-architect` run;
   a resumed run that skips step 2 skips it too.
   Gather suite and static-check results (inverted baseline included) in one
   fresh subagent per [step delegation](../team/references/step-delegation.md).
   Rerun one reported assertion failure yourself and decide the gate inline.
   **Inverted for a zero-behavior-change refactor:** capture the suite and
   static checks as a baseline **before** any file moves
   ([durable state rules](../team/principles/durable-state.md)), and advance
   only when they reproduce it; green is correct throughout and a new failure
   is a regression. Add structural checks for what tests cannot carry: a
   `grep` with an exact expected match count, a path that must no longer
   exist.
4. Dispatch `implementer` → executes slices with per-slice commits,
   revalidating every action against `$ARGUMENTS/1-task.md`. In standalone
   mode it works from that task and the failing tests.
5. **Hand-off.** Present the implementer's completion report and tell the
   user **"Next: run `/team-code-review docs/plans/<id>/`"**.
