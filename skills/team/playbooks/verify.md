# Verify playbook

Before each consuming step, read its linked shared rules. Resolve links from this installed playbook directory.
If a required read fails, stop that step with the exact path. Never use checkout fallback or recursive loading.

The VERIFY procedure: drive the behavior a change claims, record action and
outcome, and report evidence. No opinions — just evidence.

## Two roles, two verdicts

Verification separates two jobs. A producer (the implementer, the author)
exercises its own change before handoff. An independent reviewer (the verifier
agent, pr-verify) judges the resulting work and reproduces consequential
claims. Self-checking grants no approval authority. A green build is not
evidence for a behavior nobody drove.

## Pick the surface, then the recipe

Match the check to the acceptance claim's surface. No screenshot requirement
applies to nonvisual work.

| Claim surface | Exercise it with | Expected observable evidence |
| --- | --- | --- |
| Library | a real consumer program that imports it | compile/run output, returned values, files written |
| CLI | invocation + filesystem/stdio | exit code, stdout/stderr, files created or changed |
| Service | requests + resulting state | HTTP status, response body, persisted or queried state |
| UI interaction | drive the app as a user | rendered routes, interaction outcomes, error states |

A plan step must name the behavior it proves and the surface it exercises.

## Reuse the project's own tools

Locate the project's existing run/test/control tools before adding anything:
package scripts, Makefile targets, CI steps, seed data, auth setup, and cleanup
procedure. Reuse them first. Add only a missing scoped helper, and prove it
works. Never build a generic workflow engine or a new CLI to wrap existing
scripts.

## Maintain the capability index

Keep a project-local capability index. Each
entry records:

- **invocation** — the command or interaction that drives the capability
- **prerequisites** — install, seed data, credentials, services it needs
- **expected behavior** — the observable result
- **evidence** — where output and records land
- **cleanup** — how owned state is torn down, and that evidence survives cleanup

Start with the affected capabilities. Do not catalog an entire application
before its first useful run.

## Detect available checks

Inspect project configuration to find runnable checks:

- `package.json` scripts (format, lint, typecheck, build, test)
- `Makefile` targets
- CI configuration (`.github/workflows/`, `.circleci/`, etc.)
- Tool configuration files (`.eslintrc`, `tsconfig.json`, `prettier.config`,
  `biome.json`, etc.)

## Run checks in speed order

Execute each detected check, fastest first:

1. **Format** — Prettier, Biome format, or equivalent (`--check` mode)
2. **Lint** — ESLint, Biome lint, Clippy, or equivalent
3. **Type check** — TypeScript `tsc --noEmit`, mypy, or equivalent
4. **Build** — Production build command
5. **Test** — Test suite execution

Checks interfere. A production build and a dev-server-backed browser suite
share one build directory in most frameworks that have one, so back-to-back
in a single sequence the second reads state the first wrote and fails on
assertions that read exactly like regressions. Clear the build directory and
run the browser suite alone. A suite that boots its own servers is unsafe
beside anything else, another agent's dev server included.

## Record evidence

For each check, record:

- The exact command run
- The exit code
- For failures: the relevant error output (trimmed to essential lines)
- For passes: one-line confirmation

An evidence record names the **revision**, **environment**, **action**,
**expected outcome**, **observed outcome**, and **output location**.
Distinguish tests, runtime observations, and unavailable checks.

## Verdict logic

- **PASS** — Every detected check passed, and every acceptance claim was
  exercised on its surface (at least one check must exist).
- **FAIL** — One or more detected checks failed, or a claimed behavior could
  not be reproduced. List every failure.
- **FAIL** — No checks detected at all. A project with zero configured quality
  checks (no linter, no type checker, no test suite, no build) cannot pass
  verification. Report what is missing and recommend configuring at least
  format, lint, and test scripts.
- **UNKNOWN** — A required tool or capability is unavailable. Never report an
  unexecuted, skipped, or unavailable check as passed. Distinguish failed
  behavior (a product defect) from unavailable tooling (an environment gap).

## Rules

- Run every check you can detect. A check the project does not configure is
  not a detected check.
- Do NOT fix failures. Report them exactly as they occur.
- Do NOT interpret results beyond pass/fail. No suggestions, no opinions.
- Keep output concise. For failures, include only the lines needed to
  understand what went wrong. Do not dump entire build logs.
- If a check hangs for more than 120 seconds, kill it and report TIMEOUT.
- **Do NOT retry to mask intermittent failures.** Each check runs once. If
  a test or check fails, report it. If you happen to know the same test
  passed in a previous run (e.g., the orchestrator re-dispatched after a
  code fix), note the intermittency in the report
  (`### Notes — Intermittent: testFoo passed on retry, the underlying race condition is unresolved`).
  Reruns that turn red → green without a code change are evidence of a
  flake or a real intermittent bug, not a verdict of PASS.
- **A baseline is comparable only under the same isolation.** When this run is
  the before side of a before/after comparison ([durable state rules](principles/durable-state.md)),
  run both sides the same way. A false red recorded as the pre-change state
  reclassifies a later regression as pre-existing — a failure in the safe
  direction, which is why it goes unnoticed.
- **Coverage is reported, not gated.** If the project has a coverage tool
  configured, run it and report the coverage delta for changed files
  (e.g., "coverage on changed files: 73% → 78%"). Do NOT gate on an
  absolute coverage threshold. Coverage tells you what is NOT tested. It
  does not tell you what IS tested is good. Pair with mutation testing
  when available. Require coverage to trend upward rather than mandating a
  fixed threshold.

## Separate three failures

When a maintained verification recipe stops passing, separate the three causes
before touching code:

1. **Documentation drift** — the recipe no longer matches how the capability
   actually runs. Fix the index entry.
2. **Harness defect** — the check itself is broken (a bad fixture, a stale
   selector). Fix the harness.
3. **Product regression** — the capability genuinely stopped working. Report
   it; never rewrite expected behavior to conceal it.
