Before this operation, read [external-data rules](../../team/references/external-data.md). Links resolve from this file's directory. `<team-pr-skill-dir>` holds the installed `skills/team-pr/SKILL.md`. If a read fails, stop and report its resolved path.

## Screenshot Upload

Caller policy only: whether and when to run. Mechanics, section shape, and the body write live in [screenshot rules](screenshot-rules.md) and its references.

### When to call

Do **not** call for a non-UI branch (the section is omitted). Otherwise run `node "<team-pr-skill-dir>/scripts/manifest-entries.mjs" "$ARGUMENTS" "$ARGUMENTS/entries.json"`. A rerun after Execution step 4 rewrites the same file.

- Exit 0: continue. The printed `entries_file` is the entries file's absolute path ([schema](screenshot-input-and-result.md#the-entries-file)); bind `ENTRIES_DIR` to its directory, where `result.json` comes back.
- Exit 1 or 2: do not upload. The body's capture-failure or degraded note stands.

### Run the upload

Bind `UPLOAD_ARGS` to the PR's URL followed by `--entries` and the printed `entries_file`, written out literally in the same shell call that runs `resolve-pr.sh` ([screenshot input and result](screenshot-input-and-result.md)). Then follow [screenshot rules](screenshot-rules.md) and its procedure references in order. One run per PR phase, on the home repository's PR.

### Read the result

`result.json` is the contract:

```bash
ENTRIES_DIR='<directory of the printed entries_file>'
RESULT_FILE="$ENTRIES_DIR/result.json"   # the upload writes it beside the entries file
[ -r "$RESULT_FILE" ] || exit 2
```

- `section` — the exact markdown written, or null. Null means the open-time degraded note stands as the final section.
- `operator_note` — carried verbatim into the operator-facing completion report, never into a PR body.
- `failures` — named in the report, one line per entry.

Never edit `## Screenshots` a second time from `team-pr`: it renders the degraded form once at open (Execution step 7), and the upload's single write replaces it.

### Multi-repo

One run, on the home PR — never one per repository (that orphans duplicate assets). When `section` is `null`, touch no companion body. Otherwise copy it into each companion body, one companion at a time, running steps 1 to 3 as **one shell call**:

```bash
ENTRIES_DIR='<directory of the printed entries_file>'
RESULT_FILE="$ENTRIES_DIR/result.json"
COMPANION_URL='https://github.com/owner/other-repo/pull/17'   # this companion's PR, filled in literally
# Step 1: bind this companion's own values.
COMPANION_DIR="$(mktemp -d)"                       # bound per companion, never reused
'<team-pr-skill-dir>/scripts/resolve-pr.sh' "$COMPANION_URL" "$COMPANION_DIR" || exit 2
printf 'COMPANION_DIR=%s\n' "$COMPANION_DIR"
COMPANION_HOST="$(cat "$COMPANION_DIR/pr-host")"
OWNER="$(cat "$COMPANION_DIR/owner")"
REPO="$(cat "$COMPANION_DIR/repo")"
NUMBER="$(cat "$COMPANION_DIR/number")"
# Step 2: splice the section in and write it, once.
'<team-pr-skill-dir>/scripts/write-companion.sh' "$COMPANION_DIR" "$RESULT_FILE" || exit $?
# Step 3: read this companion's own rendered body back.
gh api --hostname "$COMPANION_HOST" repos/"$OWNER"/"$REPO"/pulls/"$NUMBER" \
  -H "Accept: application/vnd.github.full+json" --jq .body_html
```

1. Bind `$COMPANION_DIR` *inside* the loop only, or a refusal lets the write put the previous companion's body over this one.
2. `write-companion.sh` exit codes:

   | Exit | Do |
   | --- | --- |
   | 0 | The body was written; read it back, step 3 |
   | 1 | Refused (no `section`, `unchanged: <reason>`, or another writer landed first): report the reason; that companion is byte-identical |
   | 2 | Fault (bad input, failed `gh` call, or `splice.mjs: <message>`): report it as a fault |

3. After exit 0, apply [screenshot verify](screenshot-verify.md) against the companion's own host (`--hostname` is mandatory); for an empty `body_html`, run its fallback with `RUN_DIR` re-bound to this companion's printed `COMPANION_DIR`, never the home run's. A failed read-back is named in the report and left *as written* — never reverted, never retried.

**Failure posture:** every branch ends with an open PR, a visible note, and local paths; the upload is an enhancement ([hard rules](screenshot-rules.md#hard-rules)).
