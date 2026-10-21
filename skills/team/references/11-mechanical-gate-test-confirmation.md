### Mechanical Gate (test confirmation)

When the `test-architect` returns failing tests:

1. Run the test suite.
2. Run every **static** check the project defines (typecheck, lint, format,
   build), detected as the [verify playbook](playbooks/verify.md) does, minus
   its test entry.
3. Require `Expected results derived independently: YES` in the test-architect
   report.

Steps 1 and 2 run in one fresh subagent per [step delegation](references/step-delegation.md).
Its brief carries the verify playbook path and the test-architect's test files.
It returns each static check's result and, for each failing test, `assertion` or `crash` with its failure line.
Rerun one reported assertion failure yourself, then decide steps 4 to 6 inline.

4. Advance only when all three hold: all tests fail with assertion errors (not
   crashes), that report line says `YES`, **and** every static check passes.
5. If tests crash or error, fix infrastructure and re-run.
6. If the report line is missing or says `NO`, or a static check fails, send
   it back to the `test-architect` and re-run.

#### The refactor case — the gate inverts

For a **zero behavior change** contract, the current suite is the acceptance
suite and its correct state is green, not red:

1. Capture the baseline (the suite and every static check) **before** any file
   moves ([durable state rules](principles/durable-state.md)). A check that
   could not run is UNKNOWN, never a pass.
2. Skip the `test-architect` dispatch and record the reason on a named line
   ([verified results rules](principles/verified-results.md)).
3. Advance only when the checks **reproduce that baseline**. A check red
   before the change stays red; a new failure is a regression.

Structural checks carry acceptance criteria the tests cannot express (a `grep`
with an exact expected match count, a path that must no longer exist). State
the expected result before running the command, so the check can fail.
