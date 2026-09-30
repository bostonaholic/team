## Report

Two JSON files hold the audit's data, and each has one owner. The skill
writes `report.json`. `scripts/git-history.mjs` writes `history.json`, and
no agent edits it. `scripts/render-report.mjs` joins the two and writes
`report.md`, which nobody edits by hand. When any rule below breaks, the
renderer names each broken rule and writes nothing.

### `report.json`

Step 2 writes `version`, `skill`, and `scope` without `commit`. Step 5 adds
`scope.commit`, `lanes`, and `gaps`.

```json
{
  "version": 1,
  "skill": "audit-complexity",
  "scope": {
    "root": "<repository name>",
    "pathspecs": ["<top-level-relative path>"],
    "exclude": [{ "path": "<top-level-relative path>", "reason": "<evidence>" }],
    "since": null,
    "date": "<YYYY-MM-DD>",
    "commit": "<git rev-parse HEAD at step 5>"
  },
  "lanes": ["<one lane object per the lane analyst brief>"],
  "gaps": [{ "file": "<path>", "reason": "<why it was not measured>" }]
}
```

`since` is the literal `--since` value, or `null` when the flag is absent.
Each lane entry carries `functions`, `fanOut`, `mutableState`, and
`hotFunctions`, as the lane analyst brief defines them. A hot function holds
`name`, `line`, `endLine`, `cyclomatic`, `decisions`, `nesting`,
`deepestLine`, and `params`.

### `history.json`

```json
{
  "version": 1,
  "commit": "<HEAD at step 2>",
  "pathspecs": ["<scope.pathspecs, copied>"],
  "exclude": ["<scope.exclude path, copied>"],
  "since": null,
  "commitsScanned": 0,
  "files": {
    "<top-level-relative path>": { "status": "text", "lines": 0, "commits": 0 }
  }
}
```

- `files` holds every tracked file that matches a pathspec and no
  exclusion. That set is the inventory.
- `status` is `text` or `binary`. `binary` means a NUL byte in the first
  8,000 bytes, which is git's own test.
- `lines` counts line feeds, plus 1 for an unterminated last line, and is 0
  unless `status` is `text`.
- `commits` counts the commits in the window, reachable from HEAD, that
  touch the file. A rename counts for its new path. A merge commit counts
  zero.
- `commitsScanned` counts every commit in the window, across the whole
  repository.

### Rules the renderer enforces

- Both `version` values are 1, and `skill` is `audit-complexity`.
- `scope.commit`, `scope.pathspecs`, the `scope.exclude` paths, and
  `scope.since` match `history.json` `commit`, `pathspecs`, `exclude`, and
  `since`. `null` never matches a string.
- No exclusion equals or contains a named path.
- Every `text` file in `history.json` sits in exactly one lane's `files` or
  in `gaps`. Every lane or gap file is a `text` file in `history.json`.
- Each lane file has exactly one entry or one `skipped` record, never both.
  Each entry and `skipped` record names a file of its lane.
- `functions`, `fanOut`, `mutableState.count`, and every hot-function
  number are integers of 0 or more.
- Each location `kind` is `global`, `field`, or `param`, and `count` is at
  least the number of listed locations.
- Each hot function has `1 <= line <= endLine <= lines`, where `lines` comes
  from `history.json`. `cyclomatic` equals the length of `decisions` plus 1,
  and every decision line and `deepestLine` falls inside `line..endLine`.
- An entry has at most 6 hot functions, and never more than `functions`.
- A `<module>` hot function has `line` 1, `endLine` equal to the file's
  `lines`, and `params` 0.

### `report.md`

The renderer lays out these sections, in order:

1. **Summary.** The root, commit, date, scope, and exclusions, the literal
   `since` window, `commitsScanned`, and the file counts.
2. **Hotspots.** Measured lane files ranked by score, commits × lines. A
   file with score 0 drops out, and equal scores rank by path. Each row
   also shows the file's highest cyclomatic complexity. The table shows at
   most 25 rows, then the omitted count.
3. **Functions.** Every hot function ranked by `cyclomatic`, with ties by
   file, then line, and its nesting, length (`endLine - line + 1`), and
   parameters. The table shows at most 25 rows, then the omitted count. Its
   heading states that a function ranked fourth or lower in its own file
   can be missing.
4. **Lanes.** One table per lane, with one row per measured file: its
   fan-out, its mutable-state count, its function count, and its highest
   cyclomatic complexity, nesting, length, and parameters among its hot
   functions. Length and parameters skip `<module>`, because it spans the
   whole file.
5. **Gaps.** Every `gaps` record and every `skipped` record, with its
   reason.
6. **Not measured.** Every `history.json` file whose `status` is not
   `text`, with its status.

The report labels every analyst value as "estimated by reading". The script
values, commits and lines, are exact counts.
