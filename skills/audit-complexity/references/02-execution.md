## Execution

Read the installed [execution rules](../team/references/execution.md)
before step 1. Resolve `<skill-dir>` to this installed skill directory and
`<out>` to the absolute output directory.

1. **Check the preconditions.** Finish this step before any write.
   - Parse `$ARGUMENTS` per the [input](01-input.md) rules. On an unknown
     flag, stop and name it.
   - On an `--out` value that breaks the input rules, stop and name the
     broken rule.
   - Run `git rev-parse --show-toplevel`, then `git rev-parse --verify HEAD`.
     When either fails, stop and state that the audit needs a git work tree
     with at least one commit.
   - When `<out>/report.json`, `<out>/history.json`, or `<out>/report.md` is
     a symlink, stop and name it.
   - When any of those three files exists and `<out>/report.json` does not
     hold `skill: "audit-complexity"`, stop. The directory holds another
     tool's files, so choose another `--out`.

2. **Collect the history.** Build `scope.exclude` per the
   [input](01-input.md) rules. Write `<out>/report.json` with the Write
   tool. It holds only `version: 1`, `skill: "audit-complexity"`, and
   `scope` with `root`, `pathspecs`, `exclude`, `since`, and `date`, per the
   [report](04-report.md) schema. Put `since: null` when `--since` is
   absent. Then run:

   ```bash
   node <skill-dir>/scripts/git-history.mjs <out>/report.json
   ```

   The script reads `scope`, runs read-only git commands at the top level,
   and writes `<out>/history.json`. User paths reach it only through
   `report.json`, never through the command text. On a long history, run it
   in the background per the execution rules. On exit 1, relay its stderr
   line and stop. Exit 1 covers a git failure, a bad `report.json`, a
   symlinked `history.json`, and a pathspec that matches no tracked file.

   When `history.json` lists no file with `status: "text"`, stop, name the
   pathspecs, and dispatch nothing.

3. **Split the text files into lanes.** Take every `history.json` file with
   `status: "text"`, and place each one in exactly one lane or gap:
   - First, put documentation, data, configuration, and lock files into
     `gaps` with reason `not source code`, by extension and path.
   - Split the rest along owner boundaries: the module, package, or feature
     that owns the code, never a file-name prefix.
   - Keep each lane to at most 25 files and 4,000 lines, counted from
     `history.json` `lines`. Split a larger owner by its sub-owners.
   - Give a file over 4,000 lines its own lane. A scope with one file is
     one lane.

   Print the lane count before dispatch.

4. **Measure each lane.** Dispatch one analyst per lane with the
   [lane analyst brief](03-lane-analyst.md), through the `Agent` tool with
   `subagent_type: Explore` and `model: sonnet`. Keep at most 4 in flight
   and batch the rest. Each prompt carries the brief, the lane name, its
   owner paths, and its file list with each file's `lines`.
   - Retry a return that is not the brief's JSON once, with the parse error.
   - On a second failure, or on a host with no `Agent` tool or `Explore`
     type, measure that lane inline with the same brief.
   - Never substitute a full-tool agent.

   A file the analyst cannot measure, such as minified code, comes back as
   a `skipped` record. Keep it as returned.

5. **Assemble the report.** Run `git rev-parse HEAD` again and put its
   output in `scope.commit`. Never copy `history.json` `commit`: the
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
   - The top 5 hotspots and the top 5 functions.
   - The paths of `report.json`, `history.json`, and `report.md`.
   - Each exclusion with its reason.
   - One count per gap reason, and one count per `Not measured` status.
   - One line for each `skipped` record and each check the run skipped.

   When any lane ran inline, state that the analysts' read-only rule held by
   prompt only, because the main session can write. For a large scope,
   recommend named scope paths for the next run.
