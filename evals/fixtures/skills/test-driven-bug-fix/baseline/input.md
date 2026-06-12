---
agent: skills/test-driven-bug-fix
tier: periodic
deps:
  - skills/test-driven-bug-fix/**
---

Here is a buggy function (inline — do not look for it on disk):

```js
// parses "YYYY-MM" and returns the 1-based month
function parseMonth(s) {
  return new Date(s).getMonth(); // BUG: getMonth() is 0-based
}
// parseMonth("2026-01") returns 0, expected 1
```

Walk through the test-driven bug-fix procedure for this defect in your
response. Describe the failing test you would write first (showing it
reproduces the bug), then the minimal fix, then the green result. Write the
code and test as fenced snippets in your answer — you do not need to create
real files.
