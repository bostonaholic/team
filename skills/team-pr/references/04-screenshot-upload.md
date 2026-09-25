Before this operation, read [external-data rules](../team/references/external-data.md).
Resolve these links from the installed `SKILL.md` directory. If a read fails, stop and report its resolved path.

## Screenshot Upload

Caller policy only. The upload mechanics, the section's markdown shape, and the
body write live in one place — `skills/pr-screenshots/` — and this file decides
whether to run, when, and which manifest entries qualify.

### When to call

Call when the manifest carries `## Captured` entries whose PNGs exist on disk.
Do **not** call when the branch is non-UI (the section is omitted), when
capture could not run (`status` any `skipped-*` value or a malformed manifest),
or when every listed PNG is missing from disk.

The draft PR already exists, opened in Execution step 7, and its body already
carries the section in its pre-upload degraded form: open first, then attach
and rewrite.

### Build the entries file

Write a JSON entries file under `$(mktemp -d)`, bound once as below because
`result.json` comes back beside the entries file:

```bash
ENTRIES_DIR="$(mktemp -d)"
ENTRIES_FILE="$ENTRIES_DIR/entries.json"
# `$ARGUMENTS` is relative and the callee refuses a relative `root`: write the resolved value.
CAPTURE_ROOT="$(cd -- "$ARGUMENTS/screenshots" && pwd -P)" || exit 2
```

The file itself carries:

- a top-level `root` of `$CAPTURE_ROOT` — the **absolute** path of
  `$ARGUMENTS/screenshots/`, the directory the PNGs live in and every entry's
  path must resolve inside, never the `$(mktemp -d)` directory holding the
  entries file. Each entry's `path` is absolute, built by prefixing
  `$CAPTURE_ROOT`;
- one entry per `## Captured` entry whose PNG exists on disk, in manifest
  order, carrying `path`, `caption`, and the entry's `state`;
- a `## Captured` entry whose PNG is missing from disk is dropped, and the
  discrepancy adds one line to the top-level `notes` list;
- a manifest with `status: partial` adds one `notes` line naming how many
  states were skipped and pointing at the manifest.

The file's schema, and the worked `jq -n --args` construction that writes it,
are in `skills/pr-screenshots/references/01-input-and-result.md`. Use that
construction: a path and a caption are caller text, so each is bound as a `jq`
argument and never pasted into a JSON string
([external-data rules](../team/references/external-data.md)).

### Call the skill

Call the Skill tool with `pr-screenshots`, passing the PR's URL and
`--entries <path>` for the file just written. One call per run, on the home
repository's PR.

### Read the result

`result.json` is the contract:

```bash
RESULT_FILE="$ENTRIES_DIR/result.json"   # the skill writes it beside the entries file
[ -r "$RESULT_FILE" ] || exit 2
```

Three fields decide what happens next:

- `section` — the exact markdown written, or null. Null means no write landed
  a verified URL, so the open-time degraded note stands as the final section.
- `operator_note` — carried verbatim into the operator-facing completion
  report, never into a PR body.
- `failures` — named in the report, one line per entry, so a missing image is
  visible rather than silently absent.

The skill owns the section's wording, the failure list, and the degraded form.
Never edit the `## Screenshots` section a second time from this skill:
`team-pr` renders it once, at open time, in the pre-upload wording, and the
skill's single write replaces it.

### Multi-repo

One call, on the home repository's PR. Never one call per repository: that
re-uploads the same image once per repo and orphans the extra assets.

When the returned `section` is non-null, copy that exact string into each
companion PR's body, one companion at a time.

This loop is the home write run once per companion, so it runs the same
committed scripts the home write runs rather than restating them.

1. Bind that companion's own values with `resolve-pr.sh` over the companion's
   URL. The host is not optional: `--repo "$OWNER/$REPO"` resolves against
   whichever host `gh` considers default, so on an Enterprise PR every call
   below would name a repository on github.com.

   ```bash
   COMPANION_URL="https://github.com/owner/other-repo/pull/17"   # this companion's PR
   COMPANION_DIR="$(mktemp -d)"                       # bound per companion, never reused
   "<pr-screenshots-skill-dir>/scripts/resolve-pr.sh" "$COMPANION_URL" "$COMPANION_DIR" || exit 2
   COMPANION_HOST="$(cat "$COMPANION_DIR/pr-host")"
   OWNER="$(cat "$COMPANION_DIR/owner")"
   REPO="$(cat "$COMPANION_DIR/repo")"
   NUMBER="$(cat "$COMPANION_DIR/number")"
   ```

   `$COMPANION_DIR` is bound *inside* this loop and nowhere above it. Bound
   once outside, a refusal here would leave the write putting the previous
   companion's body over this companion's description.

2. Splice the section in and write it, once:

   ```bash
   "<pr-screenshots-skill-dir>/scripts/write-companion.sh" "$COMPANION_DIR" "$RESULT_FILE"
   ```

   | Exit | Means | Do |
   | --- | --- | --- |
   | 0 | The companion body was written | Read it back, step 3 |
   | 1 | Refused — `result.json` carries no `section`, the splice refused with `unchanged: <reason>`, or another writer landed first | Report the reason and leave that companion alone. Its body is byte-identical |
   | 2 | Fault — an unreadable or malformed input, a failed `gh` call, or `splice.mjs: <message>` | Report it as a fault, not as a refusal |

3. Read that companion's own rendered body back, against its own host, owner,
   repository, and number:

   ```bash
   gh api --hostname "$COMPANION_HOST" repos/"$OWNER"/"$REPO"/pulls/"$NUMBER" \
     -H "Accept: application/vnd.github.full+json" --jq .body_html
   ```

   `--hostname` is mandatory: without it the read-back checks whatever PR of
   that number exists on the default host.

   Apply the assertions in `skills/pr-screenshots/references/03-verify.md`. A
   companion whose read-back does not pass is named in the report and left
   *as written* — never reverted, never retried.

When the returned `section` is `null`, touch no companion body at all. Each
companion already carries the open-time degraded note, which is the correct
thing for it to say.

**Failure posture:** every branch ends with an open PR, a visible note, and
local paths. Upload problems never block the PR, retry-loop, or prompt the
user — the upload is an enhancement per
[focused work rules](../team/principles/focused-work.md).
