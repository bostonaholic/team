## Report

`report.json` is the single source of truth. Agents read it; people read
`report.md`, which `scripts/render-report.mjs` renders from it and nobody
edits by hand. The renderer rejects a report that breaks any rule below,
names each broken rule, and writes nothing.

### `report.json`

```json
{
  "version": 1,
  "scope": {
    "root": "<repository name>",
    "paths": ["<scope path>"],
    "discovery": "<command or pattern that lists the inventory>",
    "commit": "<git sha>",
    "dirty": ["<uncommitted path in scope>"],
    "date": "<YYYY-MM-DD>"
  },
  "baseline": {
    "command": "<suite command>",
    "status": "ran",
    "reason": "<why it did not run; only for not-run>",
    "failures": [{ "file": "<test file>", "name": "<test name>", "assertion": "<printed failure>" }]
  },
  "inventory": ["<test file>"],
  "lanes": ["<one lane object per the lane auditor brief>"],
  "layers": [
    { "contract": "<what the suites guard>", "keeper": "<keeper suite>", "retire": ["<test file>"], "carry": ["<assertion to move into the keeper>"] }
  ],
  "downgraded": [{ "id": "<test id>", "from": "D", "reason": "<skeptic's reason>" }],
  "gaps": [{ "file": "<test file>", "reason": "<why it was not audited>" }]
}
```

Each lane object is the lane auditor's return, with `"verified": true`
added to every `C` and `D` test that step 6 confirmed.

### Rules the renderer enforces

- `version` is `1`. `scope.commit`, `scope.discovery`, and `scope.date` are
  set.
- `baseline.status` is `ran` with a `command`, or `not-run` with a `reason`.
- Every `inventory` file sits in exactly one lane's `files` or in `gaps`,
  and every lane file is in `inventory`.
- Every test's `file` is in its lane's `files`, and every test `id` is
  unique.
- Each mark carries the fields the lane auditor brief requires, and a
  `junkClass` is one of the five named classes.
- Every `C` and `D` test has `verified: true`.
- No `D` test appears in `baseline.failures`.
- Every `seams[].freedBy` and `downgraded[].id` names an existing test, and
  every downgraded test is now `R`.

### `report.md`

The renderer lays out, in order: a summary table of files, tests, marks,
baseline failures, and gaps; the baseline; product-bug leads; the `D`,
`C`, and `F` candidates with their evidence, grouped by lane; the
redundant layers; the test-only production code; the downgraded
candidates; the suggested change batches, one per lane holding a `D` or
`C`; the auditors' notes, such as untested code they found; the per-lane
ledger of every test; and the gaps.
