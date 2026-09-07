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

**Failure posture:** every branch ends with an open PR, a visible note, and
local paths. Upload problems never block the PR, retry-loop, or prompt the
user — the upload is an enhancement per
`principle-optimization-never-dependency`, and its absence
costs nothing but the note.
