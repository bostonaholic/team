### Mechanical Gate (test confirmation)

When the `test-architect` returns failing tests:

1. Run the test suite.
2. Run every **static** check the project defines — typecheck, lint, format,
   build. Call the Skill tool with `running-quality-checks` and detect them
   the way it does. Skip the test entry there: step 1 already ran it.
3. Advance only when both hold: all tests fail with assertion errors (not
   crashes), **and** every static check passes.
4. If tests crash or error, fix infrastructure and re-run.
5. If a static check fails, send it back to the `test-architect` and re-run.

A failing static check here is not a detail to clean up later. Many runners
execute tests without type-checking them, so a suite can be green while the
type checker is red — and the first actor to notice is otherwise the
`verifier`, one of the five reviewers, which costs a full review round and a
fix round to learn something a static check answers in seconds. Test-first
deliberately produces incomplete stubs, which is exactly the state that
type-checks badly, so this gate is where that shows up.

#### The refactor case — the gate inverts

A change whose stated contract is **zero behavior change** has no test to
write. The acceptance tests already exist: they are the current suite, and
their correct state throughout is green, not red. Writing new tests for the
mechanics of a file move would add tests the task never asked for. So the
gate's polarity inverts:

1. Capture the baseline — the suite and every static check — **before** any
   file moves. A baseline taken after the first move measures the change
   rather than the pre-image (`principle-pre-image-first`), and a check that
   could not run at all is UNKNOWN, never a pass.
2. Skip the `test-architect` dispatch and record the reason on a named line
   (`principle-skip-loudly`). A silent skip is indistinguishable from a
   forgotten one.
3. Advance only when the checks **reproduce that baseline**. A check red
   before the change stays red; a new failure is a regression, not an
   assertion the implementer is about to satisfy.

Structural checks carry the acceptance criteria the tests cannot express
here: a `grep` with an exact expected match count, a path that must no longer
exist, an import graph with no surviving reference to the old name. State the
expected count before running the command, so the check can fail.
