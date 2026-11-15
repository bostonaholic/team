Before this operation, read [external-data rules](../../team/references/external-data.md). Links resolve from this file's directory. `<team-pr-skill-dir>` holds the installed `skills/team-pr/SKILL.md`. If a read fails, stop and report its resolved path.

## Screenshot Upload

Caller policy only: whether and when to attach screenshots.

### When to call

Do **not** call for a non-UI branch, or on a step 10 refresh where Screenshots returned `unchanged` ([Execution](02-execution.md) step 4). Otherwise run `node "<team-pr-skill-dir>/scripts/manifest-entries.mjs" "$ARGUMENTS" "$ARGUMENTS/entries.json"`. A rerun after Execution step 4 rewrites the same file.

- Exit 0: continue. The printed `entries_file` is the entries file's absolute path.
- Exit 1 or 2: do not upload. The capture gap reaches the body through the inputs file ([Execution](02-execution.md#step-dispatch)).

### Attach

Attach the screenshots the entries file lists to the home repository's PR at open. Attach them again after each refresh that captured again. In multi-repo mode, then attach the same images to each companion PR.

### Report

Report each PR's outcome and each failed entry with its reason. A failure leaves that PR's body as it was.

**Failure posture:** every branch ends with an open PR; attaching screenshots never blocks the PR.
