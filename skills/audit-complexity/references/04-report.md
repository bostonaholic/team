## Report

Two JSON files hold the audit's data, and each has one owner. The skill
writes `report.json`. `scripts/inventory.mjs` writes `inventory.json`, and
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
    "date": "<YYYY-MM-DD>",
    "coverage": "<top-level-relative coverage file, only when given>",
    "commit": "<git rev-parse HEAD at step 5>"
  },
  "lanes": ["<one lane object per the lane analyst brief>"],
  "gaps": [{ "file": "<path>", "reason": "<why it was not measured>" }]
}
```

Each lane entry carries `functions`, `fanOut`, `mutableState`, and
`hotFunctions`, as the lane analyst brief defines them. A hot function holds
`name`, `line`, `endLine`, `cyclomatic`, `decisions`, `nesting`,
`deepestLine`, and `params`. With `scope.coverage`, every hot function
other than `<module>` also holds `coverage`: either
`{ "hit": [<line>], "missed": [<line>] }` with `crap`, a number with 2
decimals, or `{ "reason": "<why no score>" }` with no `crap`.

### `inventory.json`

```json
{
  "version": 1,
  "commit": "<HEAD at step 2>",
  "pathspecs": ["<scope.pathspecs, copied>"],
  "exclude": ["<scope.exclude path, copied>"],
  "coverage": "<scope.coverage, copied, only when given>",
  "dirty": ["<inventory path that differs from HEAD>"],
  "files": {
    "<top-level-relative path>": { "status": "text", "lines": 0 }
  }
}
```

- `files` holds every tracked file that matches a pathspec and no
  exclusion. That set is the inventory.
- `status` gives each path exactly one of these values. The script opens
  only a regular file whose real path stays inside the top level.
  - `text`: a readable file that the analysts can measure.
  - `binary`: a NUL byte in the first 8,000 bytes, which is git's own test.
  - `missing`: a tracked file deleted from the work tree.
  - `submodule`: index mode 160000. The audit never reads submodule
    contents.
  - `symlink`: index mode 120000, a symlink in the work tree, or a path
    whose real path leaves the top level through a symlinked directory.
  - `unreadable`: a directory, FIFO, or other file that is not regular, or
    any other read error.
- `lines` counts line feeds, plus 1 for an unterminated last line, and is 0
  unless `status` is `text`.
- `coverage` is present only when `scope.coverage` is. Before it copies
  the path, the script exits 1 unless the path is a string with no leading
  `/` and no `..` segment, and names a non-empty `text` file under the
  statuses above.
- `dirty` lists the inventory paths whose work-tree or index content
  differs from HEAD when the script ran.
- Every git call pins the output the script parses, so user, repository,
  and system git config change no number.

### Rules the renderer enforces

- Both `version` values are 1, and `skill` is `audit-complexity`.
- `scope.commit`, `scope.pathspecs`, and the `scope.exclude` paths match
  `inventory.json` `commit`, `pathspecs`, and `exclude`.
- No exclusion equals or contains a named path.
- Every `text` file in `inventory.json` sits in exactly one lane's `files`
  or in `gaps`. Every lane or gap file is a `text` file in `inventory.json`.
- Each lane file has exactly one entry or one `skipped` record, never both.
  Each entry and `skipped` record names a file of its lane.
- `functions`, `fanOut`, `mutableState.count`, and every hot-function
  number are integers of 0 or more.
- Each location `kind` is `global`, `field`, or `param`, and `count` is at
  least the number of listed locations.
- Each hot function has `1 <= line <= endLine <= lines`, where `lines` comes
  from `inventory.json`. `cyclomatic` equals the length of `decisions` plus 1,
  and every decision line and `deepestLine` falls inside `line..endLine`.
- An entry has at most 6 hot functions, and never more than `functions`.
- A `<module>` hot function has `line` 1, `endLine` equal to the file's
  `lines`, and `params` 0.
- `scope.coverage` equals `inventory.json` `coverage`, or both are absent.
- Without `scope.coverage`, no hot function carries `coverage` or `crap`.
  With it, every hot function other than `<module>` carries `coverage`,
  and `<module>` carries neither.
- `coverage` holds a non-empty `reason` or both `hit` and `missed`, never
  both forms. List lines are integers inside `line..endLine`, appear once
  across both lists, and number at least 1 in total.
- `crap` appears only with the lists. It is a finite number within 0.01 of
  `cyclomatic² × (missed / (hit + missed))³ + cyclomatic`, where `hit` and
  `missed` are the list lengths. The error names the expected value.

### `report.md`

The renderer lays out these sections, in order:

1. **Summary.** The root, commit, date, scope, and exclusions, and the file
   counts. Without a coverage file, `Not run: no coverage file was given.`
   With one, a second table: combined CRAP, average CRAP, the files with a
   CRAP score, and the scored functions. A file's CRAP is the sum over its
   scored hot functions, at most 6 per file. Combined CRAP sums those
   files, and average CRAP divides it by the number of files with a score.
   Both show 1 decimal, and both show `-` when no function has a score.
2. **Files.** Measured lane files ranked by the highest `cyclomatic` among
   their hot functions, with ties by `lines`, most first, then by path. A
   file with no hot function shows `-` and ranks below every file that has
   one. The table shows at most 25 rows, then the omitted count.
3. **Functions.** Every hot function ranked by `cyclomatic`, with ties by
   file, then line, and its nesting, length (`endLine - line + 1`), and
   parameters. The table shows at most 25 rows, then the omitted count. Its
   heading states that a function ranked fourth or lower in its own file
   can be missing.
4. **Change risk.** Without a coverage file, only
   `Not run: no coverage file was given.` With one, scored hot functions
   ranked by the renderer's own CRAP recount, then `cyclomatic`, file, and
   line, with each function's coverage as a floored whole percent and its
   CRAP to 1 decimal. The table shows at most 25 rows, then the omitted
   count. Its text states the formula, the source of each value, the
   6-function cap, the `<module>` exemption, the commit limit, the record
   match rule, and the nested-line rule. A `Not scored` table follows, one
   row per file with a `reason`, with its count and distinct reasons,
   sorted by path and not capped.
5. **Lanes.** One table per lane, with one row per measured file: its
   fan-out, its mutable-state count, its function count, its highest
   cyclomatic complexity, nesting, length, and parameters among its hot
   functions. Length and parameters skip `<module>`, because it spans the
   whole file.
6. **Gaps.** Every `gaps` record and every `skipped` record, with its
   reason.
7. **Not measured.** Every `inventory.json` file whose `status` is not
   `text`, with its status.

The report labels every analyst value as "estimated by reading". `lines`
comes from the script and is an exact count. Hit and missed lines come
from the coverage file through the analysts, and no script parses that
file.
