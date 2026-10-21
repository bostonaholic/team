Before this operation, read [external-data rules](../../team/references/external-data.md).
Resolve links in this file from this file's own directory. `<team-pr-skill-dir>` is the absolute directory that holds the installed `skills/team-pr/SKILL.md`. If a read fails, stop and report its resolved path.

## Screenshot Upload

Caller policy only. The upload mechanics, the section's markdown shape, and the body write live in [screenshot rules](screenshot-rules.md), its procedure references, and `<team-pr-skill-dir>/scripts/`. This file decides whether to run and when.

### When to call

Do **not** call when the branch is non-UI (the section is omitted). Otherwise
run `node "<team-pr-skill-dir>/scripts/manifest-entries.mjs" "$ARGUMENTS" "$ARGUMENTS/entries.json"`.
A rerun after Execution step 4 rewrites the same file.

- Exit 0: continue. The printed `entries_file` is the absolute path of the
  entries file, whose schema is in
  [screenshot input and result](screenshot-input-and-result.md).
  `result.json` comes back beside it, so bind `ENTRIES_DIR` to its directory
  wherever a fence below names it.
- Exit 1 or 2: do not upload. The body's capture-failure or degraded note
  stands.

The draft PR already exists, opened in Execution step 7, and its body already
carries the section in its pre-upload degraded form: open first, then attach
and rewrite.

### Run the upload

Bind `UPLOAD_ARGS` to the PR's URL followed by `--entries` and the printed `entries_file`, both written out as literal text. Assign it in the same shell call that runs `resolve-pr.sh` ([screenshot input and result](screenshot-input-and-result.md)): shell variables do not persist between calls, so a value bound in an earlier call reaches the script empty and the script refuses. Then follow [screenshot rules](screenshot-rules.md) and its procedure references in order. One run per PR phase, on the home repository's PR.

### Read the result

`result.json` is the contract:

```bash
ENTRIES_DIR='<directory of the printed entries_file>'
RESULT_FILE="$ENTRIES_DIR/result.json"   # the upload writes it beside the entries file
[ -r "$RESULT_FILE" ] || exit 2
```

Three fields decide what happens next:

- `section` — the exact markdown written, or null. Null means no write landed
  a verified URL, so the open-time degraded note stands as the final section.
- `operator_note` — carried verbatim into the operator-facing completion
  report, never into a PR body.
- `failures` — named in the report, one line per entry, so a missing image is
  visible rather than silently absent.

The upload procedure owns the section's wording, the failure list, and the degraded form.
Never edit the `## Screenshots` section a second time from this skill:
`team-pr` renders it once, at open time, in the pre-upload wording, and the
upload's single write replaces it.

### Multi-repo

One run, on the home repository's PR. Never one run per repository: that
re-uploads the same image once per repo and orphans the extra assets.

When the returned `section` is non-null, copy that exact string into each
companion PR's body, one companion at a time.

This loop is the home write run once per companion, so it runs the same
committed scripts the home write runs rather than restating them.

Run steps 1 to 3 for one companion as **one shell call**, the fence below, so
every value the write and the read-back expand is bound in that same call:

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

1. Bind that companion's own values with `resolve-pr.sh` over the companion's
   URL. The host is not optional: `--repo "$OWNER/$REPO"` resolves against
   whichever host `gh` considers default, so on an Enterprise PR every call
   in the fence would name a repository on github.com.

   `$COMPANION_DIR` is bound *inside* this loop and nowhere above it. Bound
   once outside, a refusal here would leave the write putting the previous
   companion's body over this companion's description.

2. Splice the section in and write it, once. The fence stops on a non-zero
   exit and passes that exit through:

   | Exit | Means | Do |
   | --- | --- | --- |
   | 0 | The companion body was written | Read it back, step 3 |
   | 1 | Refused — `result.json` carries no `section`, the splice refused with `unchanged: <reason>`, or another writer landed first | Report the reason and leave that companion alone. Its body is byte-identical |
   | 2 | Fault — an unreadable or malformed input, a failed `gh` call, or `splice.mjs: <message>` | Report it as a fault, not as a refusal |

3. Read that companion's own rendered body back, against its own host, owner,
   repository, and number. The fence runs this only after exit 0.

   `--hostname` is mandatory: without it the read-back checks whatever PR of
   that number exists on the default host.

   Apply the assertions in [screenshot verify](screenshot-verify.md). When
   `body_html` comes back empty, run that file's fallback fence with `RUN_DIR`
   re-bound to this companion's printed `COMPANION_DIR`, never to the home
   run's: `resolve-pr.sh` wrote this companion's `pr-host`, `owner`, `repo`,
   `number`, and `repo-spec` there. A companion whose read-back does not pass
   is named in the report and left *as written* — never reverted, never retried.

When the returned `section` is `null`, touch no companion body at all. Each
companion already carries the open-time degraded note, which is the correct
thing for it to say.

**Failure posture:** every branch ends with an open PR, a visible note, and
local paths. Upload problems never block the PR, retry-loop, or prompt the
user — the upload is an enhancement per
[focused work rules](../../team/principles/focused-work.md).
