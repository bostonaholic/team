### 6. Stop conditions

Beyond the [watch loop](watch-loop.md)'s three, this skill adds five stop
conditions, each reported by name:

- **Approval** — run the hand-off in step 7.
- **Merge or close** — the PR reached a terminal state. Report it.
- **Third-party participant** — step 3's third-party check fired.
- **CI fix bound** — a check failed after its second fix attempt. Report
  the check, the head SHA, and both fix SHAs ([CI checks](08-ci-checks.md)).
- **CI exclusion** — a candidate CI fix hit an exclusion. Report the
  candidate diff and the restored paths ([CI checks](08-ci-checks.md)).

Green CI is not a stop. The loop keeps watching feedback until one of the
conditions above ends it.
