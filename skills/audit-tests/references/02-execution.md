## Execution

Read the installed [testing rules](../team/references/testing.md) before
step 1. Its authoring gate, junk patterns, retention bar, and removal
evidence are the criteria every mark answers to. Resolve `<skill-dir>` to
this installed skill directory.

1. **Pin the head.** Record `git rev-parse HEAD` in `scope.commit`. Note
   uncommitted changes in scope under `scope.dirty`; they are audited as
   they stand.

2. **Run the baseline once.** Run `baseline.command` over the scope and
   record every failing test with its file and the assertion it printed.
   Wait on a long run in the background per the
   [execution rules](../team/references/execution.md). When the suite
   cannot run, set `baseline.status` to `not-run` with the reason; every
   later mark then rests on reading alone, and the report says so.

3. **Split the inventory into lanes** along production owner boundaries:
   the module, package, or feature whose behavior the tests exercise, never
   a file-name prefix. Every inventory file lands in exactly one lane, or
   in `gaps` with the reason it could not be placed. Keep each lane to at
   most 25 test files; split a larger owner by its sub-owners.

4. **Build each lane's ledger.** Dispatch one auditor per lane with the
   [lane auditor brief](03-lane-auditor.md), through the `Agent` tool with
   `subagent_type: Explore` and `model: sonnet`. Keep at most 4 in flight
   and batch the rest. Each prompt carries the brief, the lane name, its
   owner paths, its file list, its baseline failures, and the absolute path
   of the testing rules. A return that is not the brief's JSON is retried
   once with the parse error; a second failure, or a host with no `Agent`
   tool or `Explore` type, audits that lane inline with the same brief.
   Never substitute a full-tool agent.

5. **Find the redundant layers.** Read the ledgers across lanes. Where
   several suites guard one contract, name the **keeper**: the suite at the
   strongest boundary, preferring a real boundary with a fake dependency
   over a mocked collaborator. List the files the keeper retires and the
   assertions it must absorb first. Correct any mark this pass changes,
   such as an **R** that a keeper now covers becoming a **C**.

6. **Verify every C and D.** For each, dispatch one fresh read-only
   skeptic (`Explore`, `model: sonnet`, at most 4 in flight) with a
   neutral claim and no verdict: "`<remainingProof>` fails when
   `<caughtBug>` happens, so `<test>` at `<file:line>` is not the only
   guard." Ask it to refute the claim from the code. **CONFIRMED** sets
   `verified: true`. **REFUTED** or inconclusive downgrades the test to
   **R** and records it under `downgraded` with the skeptic's reason. With
   no `Agent` tool, check each claim inline by reading the named proof.

7. **Render the report.** Write `report.json` per the [report](04-report.md)
   schema into the output directory, then run:

   ```bash
   node <skill-dir>/scripts/render-report.mjs <out>/report.json
   ```

   Exit 0 writes `report.md` beside it. Exit 1 lists every schema error on
   stderr and writes nothing: fix the JSON and render again. Stop after 3
   rejected renders and report the remaining errors with the JSON path.

8. **Reply.** Print the rendered summary table, both report paths, and the
   **D** and **C** candidates grouped by lane. Name every skipped check,
   unplaced file, and downgraded candidate on its own line.
