# Verify playbook

Resolve links from the installed `skills/team/` directory and read each step's linked rules before it. If a read fails, stop that step and report the resolved path; never use checkout fallback or recursive loading.

## Two roles, two verdicts

A producer (the implementer, the author) exercises its own change before
handoff. An independent reviewer (the verifier agent) judges the result and
reproduces consequential claims; self-checking grants no approval. A green
build is not evidence for a behavior nobody drove.

## Pick the surface, then the recipe

Match the check to the acceptance claim's surface. Nonvisual work needs no
screenshot.

| Claim surface | Exercise it with | Expected observable evidence |
| --- | --- | --- |
| Library | a real consumer program that imports it | compile/run output, returned values, files written |
| CLI | invocation + filesystem/stdio | exit code, stdout/stderr, files created or changed |
| Service | requests + resulting state | HTTP status, response body, persisted or queried state |
| UI interaction | drive the app as a user | rendered routes, interaction outcomes, error states |

A plan step names the behavior it proves and the surface it exercises.

## Reuse the project's own tools

Reuse the project's run/test/control tools first: package scripts, Makefile
targets, CI steps, seed data, auth setup, and cleanup. Add only a missing
scoped helper, and prove it works. Never build a generic workflow engine or a
new CLI wrapping existing scripts.

## Maintain the capability index

Keep a project-local capability index, starting with the affected
capabilities rather than the whole application. Each entry records its
**invocation**, **prerequisites** (install, seed data, credentials,
services), **expected behavior**, **evidence** location, and **cleanup** of
owned state, which leaves the evidence intact.

## Detect available checks

Inspect `package.json` scripts (format, lint, typecheck, build, test),
`Makefile` targets, CI configuration (`.github/workflows/`, `.circleci/`,
etc.), and tool configuration files (`.eslintrc`, `tsconfig.json`,
`prettier.config`, `biome.json`, etc.). A check the project does not
configure is not a detected check.

## Run checks in speed order

Run every detected check, fastest first: 1. **Format** (`--check` mode),
2. **Lint**, 3. **Type check** (e.g. `tsc --noEmit`, mypy), 4. **Build**
(production), 5. **Test**.

Checks interfere: a production build and a dev-server-backed browser suite
usually share one build directory, so the second fails on the first's state.
Clear the build directory and run the browser suite alone. A suite that boots
its own servers is unsafe beside anything else, another agent's dev server
included.

## Record evidence

For each check, record the exact command, the exit code, and the essential
error lines for a failure or a one-line confirmation for a pass.

An evidence record names the **revision**, **environment**, **action**,
**expected outcome**, **observed outcome**, and **output location**.
Distinguish tests, runtime observations, and unavailable checks.

## Verdict logic

- **PASS** — at least one check exists, every detected check passed, and
  every acceptance claim was exercised on its surface.
- **FAIL** — any of: a detected check failed (list every failure); a claimed
  behavior could not be reproduced; no checks detected at all (no linter,
  type checker, test suite, or build) — report what is missing and recommend
  configuring at least format, lint, and test scripts.
- **UNKNOWN** — a required tool or capability is unavailable. Never report an
  unexecuted, skipped, or unavailable check as passed. Distinguish failed
  behavior (a product defect) from unavailable tooling (an environment gap).

## Rules

- Do NOT fix failures. Report them exactly as they occur.
- Do NOT interpret results beyond pass/fail. No suggestions, no opinions.
- If a check hangs for more than 120 seconds, kill it and report TIMEOUT.
- **Do NOT retry to mask intermittent failures.** Each check runs once; report
  any failure. If the same test passed in a previous run (e.g. a re-dispatch
  after a code fix), note it under `### Notes` (`Intermittent: testFoo passed
  on retry, race unresolved`). Red → green without a code change is a flake
  or intermittent bug, not PASS.
- **A baseline is comparable only under the same isolation.** When this run is
  the before side of a before/after comparison ([durable state rules](principles/durable-state.md)),
  run both sides the same way: a false red recorded as the pre-change state
  reclassifies a later regression as pre-existing.
- **Coverage is reported, not gated.** If a coverage tool is configured, run it
  and report the delta for changed files (e.g. "73% → 78%"). Never gate on an
  absolute threshold; require an upward trend. Pair with mutation testing when
  available. Report test count and coverage as data, never as proof the tests
  are good ([value bar](references/testing.md#value-bar)).

## Separate three failures

When a maintained verification recipe stops passing, find the cause before
touching code:

1. **Documentation drift** (the recipe no longer matches how the capability
   runs): fix the index entry.
2. **Harness defect** (the check itself is broken): fix the harness.
3. **Product regression**: report it; never rewrite expected behavior to
   conceal it.
