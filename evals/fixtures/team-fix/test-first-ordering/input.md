---
agent: team-fix
tier: periodic
deps:
  - skills/team-fix/**
---

# Self-contained task: plan a compressed bug fix, test-first

Apply the team-fix (compressed bug-fix) pipeline to the bug below. The
load-bearing property is ordering: the pipeline is
`REPRODUCE → RED (failing test) → GREEN (minimal fix) → VERIFY → SHIP`, so a
failing test that reproduces the bug must come BEFORE the code fix. Do not jump
straight to the fix.

Bug report:

> `parseDuration("90m")` returns `90` (treats the value as seconds) instead of
> `5400`. The minute suffix `m` is ignored. Reproduces on the latest main.

Tiny repo state — the only relevant file:

```js
// src/time/parse-duration.js
export function parseDuration(input) {
  return Number(input.replace(/[a-z]/gi, ""));
}
```

Walk the pipeline in your response: state how you reproduce the bug, then write
the FAILING test that reproduces it (asserting `parseDuration("90m") === 5400`),
then the minimal fix, then verify. Make the ordering explicit — the failing
test must appear before the fix. Do not run commands; just describe the steps
and show the test and fix code.
