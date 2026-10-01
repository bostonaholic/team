## Execution

Read the installed [execution rules](../team/references/execution.md)
before step 1. Resolve `<skill-dir>` to this installed skill directory and
`<out>` to the absolute output directory.

1. **Check the preconditions.** Finish this step before any write.
   - Parse `$ARGUMENTS` per the [input](01-input.md) rules. On an unknown
     flag, stop and name it.
   - On an `--out` value that breaks the input rules, stop and name the
     broken rule.
   - On a `--coverage` value that breaks the input rules, stop and name the
     broken rule. A coverage path inside the output directory breaks them.
   - Run `git rev-parse --show-toplevel`, then `git rev-parse --verify HEAD`.
     When either fails, stop and state that the audit needs a git work tree
     with at least one commit.
   - When `<out>/report.json`, `<out>/inventory.json`, or `<out>/report.md` is
     a symlink, stop and name it.
   - When any of those three files exists and `<out>/report.json` does not
     hold `skill: "audit-complexity"`, stop. The directory holds another
     tool's files, so choose another `--out`.

2. **Collect the inventory.** Build `scope.exclude` per the
   [input](01-input.md) rules. Write `<out>/report.json` with the Write
   tool. It holds only `version: 1`, `skill: "audit-complexity"`, and
   `scope` with `root`, `pathspecs`, `exclude`, and `date`, and `coverage`
   when `--coverage` names a file, per the [report](04-report.md) schema.
   Then run:

   ```bash
   node <skill-dir>/scripts/inventory.mjs <out>/report.json
   ```

   The script reads `scope`, runs read-only git commands at the top level,
   and writes `<out>/inventory.json`. User paths reach it only through
   `report.json`, never through the command text. On exit 1, relay its
   stderr line and stop. Exit 1 covers a git failure, a bad `report.json`, a
   symlinked `inventory.json`, a pathspec that matches no tracked file, and
   a bad coverage path or file.

   When `inventory.json` lists no file with `status: "text"`, stop, name the
   pathspecs, and dispatch nothing.

3. **Split the text files into lanes.** Take every `inventory.json` file with
   `status: "text"`, and place each one in exactly one lane or gap:
   - First, put documentation, data, configuration, and lock files into
     `gaps` with reason `not source code`, by extension and path.
   - Split the rest along owner boundaries: the module, package, or feature
     that owns the code, never a file-name prefix.
   - Keep each lane to at most 25 files and 4,000 lines, counted from
     `inventory.json` `lines`. Split a larger owner by its sub-owners.
   - Give a file over 4,000 lines its own lane. A scope with one file is
     one lane.

   Print the lane count before dispatch.

4. **Measure each lane.** Dispatch one analyst per lane with the
   [lane analyst brief](03-lane-analyst.md), through the `Agent` tool with
   `subagent_type: Explore` and `model: sonnet`. Keep at most 4 in flight
   and batch the rest. Each prompt carries the brief, the lane name, its
   owner paths, and its file list with each file's `lines`. When
   `scope.coverage` is set, each prompt also carries the coverage path and
   `<top>`, the path that `git rev-parse --show-toplevel` printed in step 1.
   - Retry a return that is not the brief's JSON once, with the parse error.
   - On a second failure, or on a host with no `Agent` tool or `Explore`
     type, measure that lane inline with the same brief.
   - Never substitute a full-tool agent.

   A file the analyst cannot measure, such as minified code, comes back as
   a `skipped` record. Keep it as returned.

5. **Assemble the report.** Run `git rev-parse HEAD` again and put its
   output in `scope.commit`. Never copy `inventory.json` `commit`: the
   renderer compares the two to detect a HEAD that moved during the audit.
   Add `lanes`, one analyst return each, and `gaps`. Write `report.json` in
   one Write call.

6. **Render the report.** Run:

   ```bash
   node <skill-dir>/scripts/render-report.mjs <out>/report.json
   ```

   Exit 0 writes `<out>/report.md` and ends this step. Exit 1 lists every
   error on stderr and writes nothing. Fix `report.json` and render again.
   Stop after 3 rejected renders, and report the remaining errors with the
   JSON path. When an error says HEAD moved, do not edit the JSON. Tell the
   user to rerun the audit.

7. **Reply.** Print these items:
   - The rendered summary.
   - The top 5 files and the top 5 functions.
   - With a coverage file, the top 5 functions by CRAP, and one count per
     `Not scored` reason kind. All `no coverable line in <line>-<endLine>`
     reasons count as one kind.
   - The paths of `report.json`, `inventory.json`, and `report.md`.
   - Each exclusion with its reason.
   - One count per gap reason, and one count per `Not measured` status.
   - One line for each `skipped` record and each check the run skipped.

   When any lane ran inline, state that the analysts' read-only rule held by
   prompt only, because the main session can write. For a large scope,
   recommend named scope paths for the next run.
