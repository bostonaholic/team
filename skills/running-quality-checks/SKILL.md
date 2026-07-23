---
name: running-quality-checks
description: Mechanical verification procedure for the verifier agent — detect available checks from project configuration, run them fastest-first in speed order, capture evidence, and derive a PASS/FAIL verdict. Loaded when pre-completion quality checks need to run.
user-invocable: false
---

# Running Quality Checks

The verifier's procedure: detect the checks the project configures, run
them in speed order, and report evidence. No opinions — just evidence.

## Process

1. **Detect available checks.** Inspect project configuration to find
   runnable checks:
   - `package.json` scripts (format, lint, typecheck, build, test)
   - `Makefile` targets
   - CI configuration (`.github/workflows/`, `.circleci/`, etc.)
   - Tool configuration files (`.eslintrc`, `tsconfig.json`, `prettier.config`,
     `biome.json`, etc.)

2. **Run checks in speed order.** Execute each detected check, fastest first:
   1. **Format** — Prettier, Biome format, or equivalent (`--check` mode)
   2. **Lint** — ESLint, Biome lint, Clippy, or equivalent
   3. **Type check** — TypeScript `tsc --noEmit`, mypy, or equivalent
   4. **Build** — Production build command
   5. **Test** — Test suite execution

3. **Capture results.** For each check, record:
   - The exact command run
   - The exit code
   - For failures: the relevant error output (trimmed to essential lines)
   - For passes: one-line confirmation

## Verdict Logic

- **PASS** — All detected checks passed (at least one check must exist).
- **FAIL** — One or more detected checks failed. List every failure.
- **FAIL** — No checks detected at all. A project with zero configured quality
  checks (no linter, no type checker, no test suite, no build) cannot pass
  verification. Report what is missing and recommend configuring at least
  format, lint, and test scripts.

## Rules

- Run every check you can detect. Do not skip checks unless they are not
  configured in the project.
- Do NOT fix failures. Report them exactly as they occur.
- Do NOT interpret results beyond pass/fail. No suggestions, no opinions.
- Keep output concise. For failures, include only the lines needed to
  understand what went wrong. Do not dump entire build logs.
- If a check hangs for more than 120 seconds, kill it and report TIMEOUT.
- **Do NOT retry to mask intermittent failures.** Each check runs once. If
  a test or check fails, report it. If you happen to know the same test
  passed in a previous run (e.g., the orchestrator re-dispatched after a
  code fix), note the intermittency in the report
  (`### Notes — Intermittent: testFoo passed on retry; the underlying race
  condition is unresolved`). Reruns that turn red → green without a code
  change are evidence of a flake or a real intermittent bug, not a
  verdict of PASS.
- **Coverage is reported, not gated.** If the project has a coverage tool
  configured, run it and report the coverage delta for changed files
  (e.g., "coverage on changed files: 73% → 78%"). Do NOT gate on an
  absolute coverage threshold. Coverage tells you what is NOT tested; it
  does not tell you what IS tested is good. Pair with mutation testing
  when available; require coverage to trend upward rather than mandating
  a fixed threshold.
