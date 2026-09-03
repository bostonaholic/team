---
name: running-quality-checks
description: Run all configured project checks once and return an evidenced PASS or FAIL.
user-invocable: false
---

# Running Quality Checks

## Input

Inspect manifests, make targets, CI, and tool configuration. Run only checks
the project configures.

## Required actions

Run every detected check once, in speed order:

1. Format in check-only mode
2. Lint
3. Type check
4. Build
5. Test

For each, record the exact command, exit code, one-line pass evidence, or the
essential failure output. Kill a check after 120 seconds and report TIMEOUT.
Do not fix failures, invent checks, interpret beyond pass/fail, or retry a red
check without a code change. A red→green rerun without a change is an
unresolved intermittent failure.

Run configured coverage and report the changed-file delta. Coverage never
gates on an absolute threshold.

## Output

- **PASS:** every detected check passed and at least one existed.
- **FAIL:** any check failed, timed out, or no checks were detected.

List every failure. When no checks exist, name the missing quality controls.
