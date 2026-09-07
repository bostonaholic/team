## Screenshot Upload

Caller policy only. The upload mechanics, the section's markdown shape, and the
body write live in one place — `skills/pr-screenshots/` — and this file decides
whether to run, when, and which manifest entries qualify.

### When to call

Call only when `$ARGUMENTS/screenshots/manifest.md` carries `## Captured`
entries whose PNGs exist on disk. In every other case — manifest absent,
`status` any `skipped-*` value, a malformed manifest, or every listed PNG
missing from disk — do **not** call. The rendering rules in
`references/03-pr-body-template.md` already produced the final section (absent,
or note-only) and there is nothing to upload.

The draft PR already exists, opened in Execution step 7, and its body already
carries the section in its pre-upload degraded form. That is the sequencing:
open first, then attach and rewrite.

### Build the entries file

Write a JSON entries file under `$(mktemp -d)`:

- a top-level `root` of `$ARGUMENTS/screenshots/` — the directory the PNGs
  live in, which is the directory every entry's path must resolve inside. The
  entries file itself sits under `$(mktemp -d)`, and that is not where the
  images are;
- one entry per `## Captured` entry whose PNG exists on disk, in manifest
  order, carrying `path`, `caption`, and the entry's `state`;
- a `## Captured` entry whose PNG is missing from disk is dropped, and the
  discrepancy adds one line to the top-level `notes` list;
- a manifest with `status: partial` adds one `notes` line naming how many
  states were skipped and pointing at the manifest.

The file's schema is in
`skills/pr-screenshots/references/01-input-and-result.md`.

### Call the skill

Call the Skill tool with `pr-screenshots`, passing the PR's URL and
`--entries <path>` for the file just written. One call per run, on the home
repository's PR.

### Read the result

`result.json` is the contract. Three fields decide what happens next:

- `section` — the exact markdown written, or null. Null means no write landed
  a verified URL, so the open-time degraded note stands as the final section.
- `operator_note` — carried verbatim into the operator-facing completion
  report, never into a PR body.
- `failures` — named in the report, one line per entry, so a missing image is
  visible rather than silently absent.

The skill owns the section's wording, the failure list, and the degraded form.
Never restate them here, and never edit the `## Screenshots` section a second
time from this skill: `team-pr` renders it once, at open time, in the
pre-upload wording, and the skill's single write replaces it.

### Multi-repo

One call, on the home repository's PR. Never one call per repository: that
re-uploads the same image once per repo and orphans the extra assets.

When the returned `section` is non-null, copy that exact string into each
companion PR's body, one companion at a time:

1. Read that companion's pre-image with
   `gh pr view "$NUMBER" --repo "$OWNER/$REPO" --json body --jq .body`, using
   that companion's own owner, repository, and number.
2. Splice the string in with the committed pure function, which applies the
   same rules the home write used, including the overflow and no-downgrade
   refusals. `--landed` is the number of `assets` entries whose `url` is
   non-null:

   ```bash
   if node "<pr-screenshots-skill-dir>/splice.mjs" \
        --body-file "$COMPANION_BODY_FILE" --section-file "$SECTION_FILE" \
        --landed "$LANDED_COUNT" > "$NEW_BODY_FILE.tmp"; then
     mv "$NEW_BODY_FILE.tmp" "$NEW_BODY_FILE"
   else
     rm -f "$NEW_BODY_FILE.tmp"        # no body file exists, so step 3 cannot run
   fi
   ```

   The redirect goes to a temporary path and is promoted only on success. A
   plain `> "$NEW_BODY_FILE"` truncates before the command runs, so a refusal
   would leave a zero-byte file for step 3 to hand `gh pr edit --body-file`,
   blanking that companion's body.

   That script is `skills/pr-screenshots/splice.mjs`. Exit 1 prints
   `unchanged: <reason>` on stderr and exit 2 prints `splice.mjs: <message>` —
   a refusal and a fault respectively. Report either and leave that companion
   alone; the exit codes are tabulated in
   `skills/pr-screenshots/references/02-upload-and-body-edit.md`.
3. Write it with one
   `gh pr edit "$NUMBER" --repo "$OWNER/$REPO" --body-file "$NEW_BODY_FILE"`.
4. Read that companion's own rendered body back, against its own
   `<owner>/<repo>/<number>`:

   ```bash
   gh api repos/"$OWNER"/"$REPO"/pulls/"$NUMBER" \
     -H "Accept: application/vnd.github.full+json" --jq .body_html
   ```

   Apply the assertions in `skills/pr-screenshots/references/03-verify.md`. A
   companion whose read-back does not pass is named in the report and left
   **as written** — never reverted, never retried. The write that could fail to
   render is the write that gets checked.

When the returned `section` is `null`, touch no companion body at all. Each
companion already carries the open-time degraded note, which is the correct
thing for it to say.

A cross-repository rendering failure is not a branch this run takes. It is the
design change such a failure would force — calling the skill once per
repository, at the cost of re-uploading every image per repo. The
per-companion read-back exists to detect that case, not to route around it.

The footer rules survive the companion edit intact: each PR still re-emits
exactly one closing line in footer position, and a companion PR re-emits its
non-closing `Part of owner/repo#<n>` reference the same way, per
`references/02-execution.md`. The splice lifts that footer out and re-emits it
byte-identical, so a companion edit neither duplicates nor drops it.

**Failure posture:** every branch ends with an open PR, a visible note, and
local paths. Upload problems never block the PR, retry-loop, or prompt the
user — the upload is an enhancement per
`principle-optimization-never-dependency`, and its absence
costs nothing but the note.
