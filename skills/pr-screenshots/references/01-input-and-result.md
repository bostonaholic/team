Before this operation, read [external-data rules](../team/references/external-data.md).
Resolve these links from the installed `SKILL.md` directory. If a read fails, stop and report its resolved path.

## Input and result

### Resolve the PR once

`$ARGUMENTS` carries the whole invocation — `<pr-number-or-url>` **and**
`--entries <path>`, which is what `SKILL.md` advertises and what `team-pr`
sends. Run `scripts/resolve-pr.sh` first: it splits the arguments, validates
the PR token alone, resolves the PR in one call, and writes each derived value
into the run's own directory. Bind the values the inline `gh` commands below
and in `references/03-verify.md` expand:

```bash
RUN_DIR="$(mktemp -d)"                     # every temporary this run writes
"<skill-dir>/scripts/resolve-pr.sh" "$ARGUMENTS" "$RUN_DIR" || exit 1
PR_URL="$(cat "$RUN_DIR/pr-url")"          # the canonical URL, on the base repo
PR_HOST="$(cat "$RUN_DIR/pr-host")"
OWNER="$(cat "$RUN_DIR/owner")"
REPO="$(cat "$RUN_DIR/repo")"
NUMBER="$(cat "$RUN_DIR/number")"
REPO_SPEC="$(cat "$RUN_DIR/repo-spec")"    # gh's own [HOST/]OWNER/REPO form
```

Exit 1 is a refusal, and it names the argument on stderr.

`$RUN_DIR` is this run's whole state: every script reads its inputs from it and
writes its outputs back into it, so `$RUN_DIR` is the one value that has to
survive from one command to the next. A fence that lost the others re-binds
them by re-running the six `cat` lines above against the same `$RUN_DIR`.
Never the `mktemp -d` and `resolve-pr.sh` lines beside them: those resolve the
PR a second time into a fresh directory, and leave `pre-image.md`,
`assets.tsv`, and everything else this run has produced behind in the old one.

**`repo-spec` carries the host, and every later call uses it.** Every inline
`gh pr view` and `gh pr edit` takes `--repo "$REPO_SPEC"`, never
`--repo "$OWNER/$REPO"`, which resolves against whichever host `gh` considers
default and so names a github.com repository on an Enterprise PR. The
read-back's `gh api` takes the host through `--hostname "$PR_HOST"`
(`references/03-verify.md`). `pr-host` is the value step C's attachment
allowlist is derived from (`references/02-upload-and-body-edit.md`).

`gh pr view` returns the URL on the **base** repository, which is the PR a fork
contribution is edited on. Every later call carries `--repo "$REPO_SPEC"`, so
no command depends on the remote set of the current checkout.

A merged, closed, or draft PR is in scope. Edit it and say which state was
edited.

### The entries file

One input, one file, JSON. `team-pr` writes it from the capture manifest. A
session with no `--entries` flag writes the same JSON itself under
`$(mktemp -d)` from the request — the paths exactly as the user gave them, and
`root` set to the directory those images already live in, never to the
directory the JSON was just written to.

```json
{
  "root": "/Users/dev/Desktop/shots",
  "entries": [
    { "path": "/Users/dev/Desktop/shots/login.png", "caption": "login", "state": "default" },
    { "path": "/Users/dev/Desktop/shots/login-error.png", "caption": "login-error", "state": "error", "note": "seeded" }
  ],
  "notes": ["2 states skipped — see manifest"]
}
```

Per entry: `path` and `caption` are required, `state` and `note` are optional.
One top-level `notes` list carries caller-supplied discrepancy lines. Captions
need not be unique.

**When the request names no caption for a path, the caption is that file's
basename with its extension removed.** Never describe the image instead: a
guessed description is a claim in a public body. Ask only when the basename is
empty after normalization.

Write the file with `jq`, never by pasting the paths into a JSON string: a path
is caller text, and a quote or a backslash in one rewrites the document rather
than filling a slot in it ([external-data rules](../team/references/external-data.md)). This is the whole
step; each entry's caption is that entry's own path, basename-only and
extension-stripped:

```bash
ENTRIES_DIR="$(mktemp -d)"
ENTRIES_FILE="$ENTRIES_DIR/entries.json"
CAPTURE_ROOT=/Users/dev/Desktop/shots          # where the images ALREADY live
jq -n --arg root "$CAPTURE_ROOT" '{
  root: $root,
  entries: ($ARGS.positional | map({
    path: .,
    caption: (split("/") | last | sub("\\.[^.]+$"; ""))
  })),
  notes: []
}' --args "$CAPTURE_ROOT/login.png" "$CAPTURE_ROOT/login-error.png" >"$ENTRIES_FILE"
printf '%s\n' "$ENTRIES_FILE" >"$RUN_DIR/entries-file"   # what `upload.sh` reads
```

The last line is what makes this path reachable: `resolve-pr.sh` writes an
empty `entries-file` when the invocation carried no `--entries`, and
`upload.sh` reads that file rather than a variable.

`--args` binds each path as a positional value, so `jq` never parses one. Add a
`caption`, a `state`, or a `note` the request supplied by binding each with its
own `--arg`; add each discrepancy line to `notes` the same way.

What `root` bounds is scope, not trust — the check that survives a hostile
entries file is in `references/02-upload-and-body-edit.md`, step B.

### Normalizing caller strings

**Every caller-supplied string that reaches a PR body is normalized once, at
read, by the same function.** The rule is over the *class*, not over a field: a
new field that renders is normalized because it is caller text, and the list
below is the current membership rather than the reason. No backstop in
`scripts/splice.mjs` replaces the normalization.

Normalize: strip newlines, trim, collapse whitespace runs, then
backslash-escape `\`, `!`, `[`, `]`, `<`, and `>`. `\` is escaped first, so no
escape can be undone by a caller-supplied backslash.

**`state` also loses its parentheses.** It renders inside the `(<state>)`
parenthetical, which `scripts/splice.mjs` recognizes by a grammar admitting one
level of nesting, so an unbalanced or deeper `state` makes the next run's
`--check` refuse a section this skill itself wrote. Remove `(` and `)` from
`state` after the whitespace collapse. Escaping would not do: a backslash
leaves the character in place, and the grammar still sees it.

The members, all of them caller data:

| String | Where it renders |
| --- | --- |
| Each entry's `caption` | Bold body text in the section |
| Each entry's `state` | The `(<state>)` parenthetical beside the caption |
| Each line of the top-level `notes` list | One marked blockquote (`> _note:_ `) body line each, resolved and degraded alike |
| Each entry's `path` | The degraded form, and any failure line |
| Each failure `reason` | The `Not uploaded:` line |

**A path renders as its basename, never in full.** A PR body is public and an
absolute path leaks the operator's directory layout and username. Keep the
absolute path in `result.json` and in the operator report, and render
`<basename>` in the body. For the same reason **a failure `reason` written into
the body must carry no filesystem path**; a reason that names one is reported
to the operator and rendered in the body as the failure class alone.

A caption that is empty after normalization fails its entry. A `notes` line
that is empty after normalization is dropped. The caption is never alt text:
the alt is `screenshot-<NN>`, the entry's index, and holds no caller text at
all.

### Refusals

Each of these fires before any `gh` call and mutates nothing.

- **Zero entries.** Refuse and name the input that is required. There is
  nothing to attach and nothing to write.
- **An `--entries` path that does not exist**, or is not readable. Refuse and
  report the path as given.
- **Invalid JSON**, or a top-level value that is not an object with an
  `entries` array. Refuse and report the parser's own message.
- **An entry lacking `path` or `caption`.** Refuse for the whole run rather
  than dropping the entry: a silently shortened list is indistinguishable from
  a caller that meant to send fewer images. Name the entry by its index in the
  refusal, so a caller sending twelve of them does not have to guess which one.
- **A missing, relative, or unresolvable top-level `root`.** Refuse and name
  the field. Containment cannot be checked against a root that does not
  resolve, and a run that skipped the check would attach from anywhere on the
  machine.
- **A malformed PR number or URL.** Refuse and report it. Never guess.
- **A bare PR number with no local checkout.** No repository context exists to
  bind it to, so refuse and ask for the full PR URL.

### The result

Write `result.json` beside the entries file, and restate it as prose in the
run's report.

| Field | Value |
| --- | --- |
| `owner`, `repo`, `number` | The resolved PR, as bound above |
| `outcome` | One of the six values below |
| `assets` | Array **in entries order** of `{caption, path, url}`, `url` null when that entry did not land |
| `failures` | Array of `{caption, path, reason}` |
| `body_written` | Whether a body write landed |
| `operator_note` | The operator-facing note, or null. Never written into a PR body |
| `section` | The exact markdown written, or null |

`outcome` values:

| Value | Means |
| --- | --- |
| `uploaded` | Every entry landed, the body was written, the read-back passed |
| `partial` | At least one entry landed and at least one failed |
| `degraded` | Nothing landed; the body carries the note and the captured file names as plain text |
| `unverified` | The body was written and the read-back did not pass |
| `uploaded-not-written` | The assets landed and no body was written — the lost-update guard, and any splice refusal or fault reached after the attach step |
| `refused` | Nothing changed anywhere: no asset landed and no body was written |

**`section` is null unless a write landed at least one URL and the read-back
passed.** That is the field `team-pr` copies into companion bodies, so
anything weaker must not travel.

`uploaded-not-written` covers both post-attach halts — the lost-update guard,
and a `scripts/splice.mjs` refusal or fault after the attach step, whose
`operator_note` carries the reason and the manual edit that clears it
(`references/02-upload-and-body-edit.md`, step D). A splice refusal on a run
where **nothing** landed is `refused` instead — nothing changed anywhere.

For `uploaded-not-written`, `body_written: false` and `section: null`. The
assets are live and are named in `assets`, and the appended tails the attach
step left already render them — under an alt text the host derives from the
file it received, which this skill does not pin and does not clear on this
path. Report each tail verbatim in `operator_note`, so the report tells the
operator exactly what is on the PR right now.
