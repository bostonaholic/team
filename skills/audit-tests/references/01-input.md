## Input

`$ARGUMENTS` holds optional scope paths and an optional `--out <dir>`.

- **Scope.** Each path is a directory, file, or glob that narrows the
  audit. With no path, the scope is the whole repository. A subsystem name
  that is not a path resolves to the directories that own it; state the
  resolution in one line before you start.
- **Output directory.** Default: `docs/plans/<YYYY-MM-DD>-audit-tests/`
  under the repository root, with today's date. An existing directory is
  reused: `report.json` and `report.md` in it are overwritten, and nothing
  else there is touched. Never stage or commit the output.

## Find the tests

Build the **inventory**: every test file in scope, as repository-relative
paths.

1. Read the project's test configuration first: the runner's config file,
   the test script in the project manifest, and the CI test step. Their
   include and exclude patterns are the source of truth.
2. With no configured pattern, use the ecosystem's naming convention for
   test files, such as a `test` or `spec` marker in the file name or a
   dedicated tests directory.
3. Exclude dependency, vendored, generated, and build-output directories,
   plus fixture data that holds no test declarations.

Record the discovery rule you used, as one command or pattern, in
`scope.discovery`. A reader must be able to re-run it and get the same
inventory.

Find the suite command the same way the
[verify playbook](../team/playbooks/verify.md) detects checks. Record it in
`baseline.command`, or record why none exists.
