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

Write a JSON entries file under `$(mktemp -d)`. That directory is bound once
and named below, because `result.json` comes back beside the entries file:

```bash
ENTRIES_DIR="$(mktemp -d)"
ENTRIES_FILE="$ENTRIES_DIR/entries.json"
# `$ARGUMENTS` is the RELATIVE artifact directory `docs/plans/<id>/`, and the
# callee refuses "a missing, relative, or unresolvable top-level `root`" before
# it starts. Resolve it here, once, and write the resolved value — not the
# relative one.
CAPTURE_ROOT="$(cd -- "$ARGUMENTS/screenshots" && pwd -P)" || exit 2
```

The file itself carries:

- a top-level `root` of `$CAPTURE_ROOT` — the **absolute** path of
  `$ARGUMENTS/screenshots/`, resolved in the fence above, which is the
  directory the PNGs live in and the directory every entry's path must resolve
  inside. Each entry's `path` is absolute for the same reason, built by
  prefixing `$CAPTURE_ROOT`. The entries file itself sits under
  `$(mktemp -d)`, and that is not where the images are;
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

`result.json` is the contract, and the companion loop below reads `assets` and
`section` out of it:

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
Never restate them here, and never edit the `## Screenshots` section a second
time from this skill: `team-pr` renders it once, at open time, in the
pre-upload wording, and the skill's single write replaces it.

### Multi-repo

One call, on the home repository's PR. Never one call per repository: that
re-uploads the same image once per repo and orphans the extra assets.

When the returned `section` is non-null, copy that exact string into each
companion PR's body, one companion at a time.

This loop is the home write run once per companion, so every guard the home
write carries is cited here rather than restated. Restating is what let it
drift: the read lost its envelope check, the body file lost its per-companion
binding, and the host stopped being carried into any of the three calls. Where a
step below names a fence in `skills/pr-screenshots/`, read that fence and run
it — do not paraphrase it.

1. Bind that companion's own values, per companion. The split below is the
   home one from `skills/pr-screenshots/references/01-input-and-result.md`
   (`### Resolve the PR once`) — the shape test, then the parameter-expansion
   split, then the charset tests — run over the companion's URL instead of the
   home one, and shown rather than cited because every guard it carries is one
   the three `gh` calls below depend on. The host is
   not optional: `--repo "$OWNER/$REPO"` resolves against whichever host `gh`
   considers default, so on an Enterprise PR all three calls below would name a
   repository on github.com, and the read-back would then assert against an
   unrelated PR.

   ```bash
   COMPANION_URL="https://github.com/owner/other-repo/pull/17"   # this companion's PR
   case "$COMPANION_URL" in
     https://*/*/*/pull/[0-9]*) : ;;
     *) exit 2 ;;                                     # not a PR URL, so nothing may split it
   esac
   REST="${COMPANION_URL#https://}"
   COMPANION_HOST="${REST%%/*}" ; REST="${REST#*/}"
   OWNER="${REST%%/*}"          ; REST="${REST#*/}"
   REPO="${REST%%/*}"
   NUMBER="${COMPANION_URL##*/}"
   case "$COMPANION_HOST$OWNER$REPO" in *[!A-Za-z0-9._-]*) exit 2 ;; esac
   case "$NUMBER" in ""|*[!0-9]*) exit 2 ;; esac

   COMPANION_DIR="$(mktemp -d)"                       # bound per companion, never reused
   COMPANION_BODY_FILE="$COMPANION_DIR/pre-image.md"
   NEW_BODY_FILE="$COMPANION_DIR/new-body.md"
   SECTION_FILE="$COMPANION_DIR/section.md"
   COMPANION_SPEC="$COMPANION_HOST/$OWNER/$REPO"      # gh's own [HOST/]OWNER/REPO form
   LANDED_COUNT="$(jq '[.assets[] | select(.url != null)] | length' "$RESULT_FILE")"
   # `--section-file` reads a FILE, so the section is written to one here. `jq
   # -r` is what writes it: the string carries the normalization's `\[`, `\]`,
   # `\!`, `\<`, and `\>` escapes, and re-typing caller-derived text into a
   # heredoc is the interpolation `principle-never-interpolate` forbids. The
   # `select` refuses a null or empty `section` rather than writing the four
   # bytes `null` into a companion body.
   jq -e -r '.section | select(type == "string" and length > 0)' \
     "$RESULT_FILE" >"$SECTION_FILE" || exit 2
   ```

   The charset tests are the same ones the home split runs, and they are shown
   rather than cited: a host, owner, or repository carrying anything outside
   `[A-Za-z0-9._-]` reaches three `gh` calls below, and a number that is not
   digits names a different PR.

   `$NEW_BODY_FILE` and `$SECTION_FILE` are bound *inside* this loop and
   nowhere above it. Bound once outside, the file the previous companion's
   splice produced survives into this iteration, and a refusal here leaves step
   4 writing the previous companion's summary, footer, and `Part of` line over
   this companion's description.

2. Read that companion's pre-image, guarded the way step A of
   `skills/pr-screenshots/references/02-upload-and-body-edit.md` guards the home
   one — the process exit *and* the JSON envelope. A bare read binds `""` on a
   rate limit or a network blip, `""` is indistinguishable from a genuinely
   empty description, and the splice then returns the `## Screenshots` section
   as that companion's *whole* body:

   ```bash
   PRE_JSON="$(gh pr view "$NUMBER" --repo "$COMPANION_SPEC" --json body)" || exit 2
   printf '%s' "$PRE_JSON" | jq -e 'has("body") and (.body | type == "string")' >/dev/null || exit 2
   printf '%s' "$PRE_JSON" | jq -r .body >"$COMPANION_BODY_FILE" || exit 2
   ```

3. Splice the string in with the committed pure function, which applies the
   same rules the home write used, including the overflow and no-downgrade
   refusals:

   ```bash
   if node "<pr-screenshots-skill-dir>/splice.mjs" \
        --body-file "$COMPANION_BODY_FILE" --section-file "$SECTION_FILE" \
        --landed "$LANDED_COUNT" > "$NEW_BODY_FILE.tmp"; then
     mv "$NEW_BODY_FILE.tmp" "$NEW_BODY_FILE"
   else
     rm -f "$NEW_BODY_FILE.tmp" "$NEW_BODY_FILE"   # neither file exists, so step 4 cannot run
   fi
   ```

   The redirect goes to a temporary path and is promoted only on success. A
   plain `> "$NEW_BODY_FILE"` truncates before the command runs, so a refusal
   would leave a zero-byte file for step 4 to hand `gh pr edit --body-file`,
   blanking that companion's body. Removing *both* files is what makes the
   comment true from the second companion onward: this is a loop, and the `rm`
   has to clear the promoted path as well as the temporary one.

   That script is `skills/pr-screenshots/splice.mjs`. Exit 1 prints
   `unchanged: <reason>` on stderr and exit 2 prints `splice.mjs: <message>` —
   a refusal and a fault respectively. Report either and leave that companion
   alone; the exit codes are tabulated in
   `skills/pr-screenshots/references/02-upload-and-body-edit.md`.

4. Write it, and gate the write on the pre-image still being current. The
   splice was computed from the body read in step 2, so a companion somebody
   edited in between would have their edit overwritten by a body that never
   contained it — the same lost update the home path guards in its step D:

   ```bash
   NOW_JSON="$(gh pr view "$NUMBER" --repo "$COMPANION_SPEC" --json body)" || exit 2
   printf '%s' "$NOW_JSON" | jq -e 'has("body") and (.body | type == "string")' >/dev/null || exit 2
   if [ "$(printf '%s' "$NOW_JSON" | jq -r .body)" \
      = "$(printf '%s' "$PRE_JSON" | jq -r .body)" ]; then
     gh pr edit "$NUMBER" --repo "$COMPANION_SPEC" --body-file "$NEW_BODY_FILE"
   else
     rm -f "$NEW_BODY_FILE"          # another writer landed first — report it, write nothing
   fi
   ```

5. Read that companion's own rendered body back, against its own host, owner,
   repository, and number:

   ```bash
   gh api --hostname "$COMPANION_HOST" repos/"$OWNER"/"$REPO"/pulls/"$NUMBER" \
     -H "Accept: application/vnd.github.full+json" --jq .body_html
   ```

   `--hostname` is what makes the read-back land on the host the companion
   actually lives on; without it the assertions run against whatever PR of that
   number exists on the default host, which is evidence about something else.

   Apply the assertions in `skills/pr-screenshots/references/03-verify.md`. A
   companion whose read-back does not pass is named in the report and left
   *as written* — never reverted, never retried. The write that could fail to
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
