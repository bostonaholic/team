## Input

`$ARGUMENTS` holds optional scope paths, an optional `--out <dir>`, and an
optional `--coverage <file>`.

- **Path base.** Every relative path, named, `--out`, or `--coverage`,
  resolves against the repository top level that `git rev-parse
  --show-toplevel` prints. It never resolves against the session's
  directory. From `packages/api/`, `src` means `<top>/src`.
- **Scope.** Each named path is a top-level-relative directory or file. With
  no named path, the pathspec is `.`, the whole repository. A subsystem
  name that is not a path resolves to the top-level-relative directories
  that own it. State the resolution in one line before you start. Paths
  match literally, never as globs: `app/[id]` matches only the path
  `app/[id]` and what sits under it.
- **Output directory.** Default: `<top>/docs/plans/<YYYY-MM-DD>-audit-complexity/`,
  with today's date. An `--out` value must obey these rules:
  - It holds only the characters `A-Z`, `a-z`, `0-9`, `.`, `_`, `/`, and `-`.
  - It holds no `..` segment.
  - It does not start with `-`.
  - It names a directory, or a path that does not exist yet.

  Stop on any other value before you write anything. A run writes only
  `report.json`, `inventory.json`, and `report.md` there, and touches nothing
  else. Never stage or commit the output.
- **Coverage file.** Optional. Without it, the report states that CRAP did
  not run. A `--coverage` value must obey these rules:
  - It appears at most once, and it has a value.
  - It holds only the characters `A-Z`, `a-z`, `0-9`, `.`, `_`, `/`, and `-`.
  - It holds no `..` segment.
  - It does not start with `-` or `/`.
  - It does not lie inside the output directory.

  Stop on any other value before you write anything. The audit only reads
  the file. It never runs tests, and never writes, moves, or regenerates
  the file. The file must hold these records, in any format:
  - Records keyed by source path. Each source path is top-level-relative,
    starts with `./`, or is absolute under the top level.
  - Per-line records under each source path, each a line number with a hit
    count.
  - Each coverable line that did not run, listed with a count of 0.
  - The records of different source files on different text lines.

## Keep vendored and generated code out

Before step 2 of the [execution](02-execution.md), build `scope.exclude`. It
holds one `{ path, reason }` record for the top directory of each tracked
tree of these kinds, or for a single file when no such directory holds it:

- **Vendored dependencies.** Evidence: a `linguist-vendored` entry in
  `.gitattributes`, or the project's manifest naming the path as vendored.
- **Generated code.** Evidence: a `linguist-generated` entry in
  `.gitattributes`, or a generated-code header in the file.
- **Build output.** Evidence: the project's manifest or build config naming
  the path as output.

Put the evidence in `reason`. When the output directory sits under the top
level, add it too, with reason `audit output`. A directory name alone, such
as `vendor` or `dist`, is not evidence. Never exclude a path that equals or
contains a named path.

`inventory.mjs` applies every exclusion to every `git ls-files` call, as a
literal path, so an excluded path never enters the inventory.
