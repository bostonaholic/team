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
