Before this operation, read [external-data rules](../../team/references/external-data.md). Links resolve from this file's directory. `<team-pr-skill-dir>` holds the installed `skills/team-pr/SKILL.md`. If a read fails, stop and report its resolved path.

## Screenshot Upload

Caller policy only: whether and when to run. The upload, the section shape, and the body write belong to the `attaching-pr-screenshots` skill from the bostonaholic/skills collection.

### When to call

Do **not** call for a non-UI branch (the section is omitted). Otherwise run `node "<team-pr-skill-dir>/scripts/manifest-entries.mjs" "$ARGUMENTS" "$ARGUMENTS/entries.json"`. A rerun after Execution step 4 rewrites the same file.

- Exit 0: continue. The printed `entries_file` is the entries file's absolute path; `result.json` comes back in its directory.
- Exit 1 or 2: do not upload. The capture gap reaches the body through the inputs file ([Execution](02-execution.md#step-dispatch)).

### Run the upload

Call the Skill tool with `attaching-pr-screenshots <home-pr-url> --entries <entries_file>`, once per PR phase, on the home repository's PR. In multi-repo mode, after the home run, call `attaching-pr-screenshots <companion-pr-url> --copy-from <result.json>` once per companion PR, with the home run's `result.json`. Never upload once per repository.

When `attaching-pr-screenshots` is not installed, upload nothing: write an operator note that names the missing skill and the entries file, and keep the PR open.

### Read the result

`result.json`, beside the entries file, is the contract:

- `section` — the exact markdown written, or null. Null means the body keeps the `## Screenshots` section it had, or none, and no companion copy runs.
- `operator_note` — carried verbatim into the operator-facing completion report, never into a PR body.
- `failures` — named in the report, one line per entry.

Report each companion copy's outcome; a refused or faulted copy leaves that companion's body as it was. Never edit `## Screenshots` a second time from `team-pr`.

**Failure posture:** every branch ends with an open PR and a visible note; the upload is an enhancement and never blocks the PR.
