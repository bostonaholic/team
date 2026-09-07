## Input and result

### Resolve the PR once

`$ARGUMENTS` carries the whole invocation — `<pr-number-or-url>` **and**
`--entries <path>`, which is what `SKILL.md` advertises and what `team-pr`
sends. `scripts/resolve-pr.sh` splits it, validates the PR token alone,
resolves the PR in one call, and writes each derived value into the run's own
directory. Run it first, and bind the values the inline `gh` commands
below and in `references/03-verify.md` expand:

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

`$RUN_DIR` is this run's whole state. Every script below reads its inputs from
it and writes its outputs back into it, so no value has to survive from one
command to the next in a session's shell:

| File | Written by | Holds |
| --- | --- | --- |
| `pr-url` | `resolve-pr.sh` | The canonical PR URL, on the base repository |
| `pr-host`, `owner`, `repo`, `number` | `resolve-pr.sh` | Its four segments |
| `repo-spec` | `resolve-pr.sh` | `[HOST/]OWNER/REPO`, for every `--repo` |
| `entries-file` | `resolve-pr.sh` | The `--entries` path, or empty |
| `pre-image.md` | `pre-image.sh` | The body as read before the first attach |
| `after.md` | `pre-image.sh`, `upload.sh` | The body as of the last read |
| `assets.tsv` | `pre-image.sh`, `upload.sh` | One line per landed entry |
| `failures.tsv` | `pre-image.sh`, `upload.sh` | One line per failed entry |
| `section.md`, `new-body.md` | step D of `references/02-upload-and-body-edit.md` | The rendered section, and the spliced body |

Exit 1 is a refusal, and it names the argument on stderr. The rules it
enforces:

- **The flags come off first, and the PR token is validated alone.**
  `412 --entries /tmp/e/entries.json` tested as one token is not a bare number
  and does not match the URL pattern, so it would refuse the whole `team-pr`
  path and the `argument-hint` `SKILL.md` advertises.
- **The split is on whitespace**, so an entries path holding a space arrives as
  two tokens and lands on "more than one PR argument" — a loud refusal that
  names the argument, never a silently truncated path.
- **A repeated `--entries` refuses too, in either spelling.** A second value
  overwriting the first would let `412 --entries a.json --entries b.json`
  upload from a manifest the caller may not have named on purpose, silently,
  while the same repetition of the PR token refuses loudly. A malformed form
  refuses rather than guessing, and "the last one wins" is a guess.
- **The PR token is matched against an anchored pattern, then split by
  parameter expansion** — the technique at
  `skills/pr-watch-as-reviewer/references/02-input.md`, lines 11-42. Never
  `[^/]+` for an owner or repository segment: that class admits `$`, backticks,
  parentheses, and spaces.
- **The pattern is this skill's own, and its host segment is a variable.** That
  sibling's pattern is anchored at `^https://github\.com/`, and this skill
  supports GitHub Enterprise in three later places — the guarded split, the
  attachment allowlist, and the read-back. Reusing an anchored-at-github.com
  pattern would refuse every Enterprise PR URL as malformed before any of that
  handling could run, leaving Enterprise reachable only by bare number from a
  checkout. The claim and the validator have to say the same thing.
- **The resolution call carries `--repo` whenever the argument supplied one.**
  For a URL argument the trailing number alone is what `gh pr view` receives,
  and with no `--repo` it resolves that number against the *current
  directory's* default repository. A full URL for one repository, run from a
  checkout of another, would otherwise silently resolve the other repository's
  PR of the same number — and every later call inherits that resolution, ending
  with a `## Screenshots` section written into an unrelated PR.
- **The split of the resolved URL is guarded, and the host is a bound value of
  its own.** Stripping a literal `https://github.com/` prefix is a no-op on
  every other host: a GitHub Enterprise URL would leave `OWNER` as `https:` and
  `REPO` empty, and each later `--repo` would carry a repository that cannot
  exist. A shape test refuses a URL that is not a PR URL before any segment is
  read out of it, and charset tests refuse a host, owner, repository, or number
  carrying anything else. `pr-host` is the value step C's attachment allowlist
  is derived from (`references/02-upload-and-body-edit.md`), so an Enterprise
  install harvests against its own host rather than a hardcoded one.
- **`repo-spec` carries the host, and every later call uses it.** `--repo
  "$OWNER/$REPO"` resolves against whichever host `gh` considers default, so on
  an Enterprise PR it names a repository on github.com. `gh` accepts
  `[HOST/]OWNER/REPO`, so binding the host into the spec once makes every
  `gh pr view` and `gh pr edit` below land on the host the URL actually named.
  The read-back's `gh api` takes the same host through `--hostname "$PR_HOST"`
  (`references/03-verify.md`).
- **A bare number resolves against the checkout by design**, and with no
  checkout it resolves nothing — which is the refusal below.

`gh pr view` returns the URL on the **base** repository, which is the PR a fork
contribution is edited on. Every later call carries `--repo "$REPO_SPEC"`, so
no command depends on the remote set of the current checkout.

A merged, closed, or draft PR is in scope. Edit it and say which state was
edited.

### The entries file

One input, one file, JSON — because a caption may hold a tab, which no
delimiter-separated format survives. `team-pr` writes it from the capture
manifest. A session with no `--entries` flag writes the same JSON itself under
`$(mktemp -d)` from the request — the paths exactly as the user gave them, and
`root` set to the directory those images already live in, never to the
directory the JSON was just written to. That is what lets a caller with no
pipeline artifacts say "add these three screenshots to PR 412" and have it
work.

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
basename with its extension removed.** The rule is stated so it is not
invented: `caption` is required, so a session handed three bare paths has to
produce one, and two sessions left to decide would write two different sets of
captions for the same three files. Never describe the image instead — nothing
here has looked at it, and a guessed description is a claim in a public body.
Ask only when the basename is empty after normalization.

Write the file with `jq`, never by pasting the paths into a JSON string: a path
is caller text, and a quote or a backslash in one rewrites the document rather
than filling a slot in it (`principle-never-interpolate`). This is the whole
step, and its captions are the basename defaults the example above carries —
each entry's caption is that entry's own path, basename-only and
extension-stripped, and nothing else:

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

The top-level `root` is **required and absolute**. It is the directory every
entry's `path` must resolve inside, and it is the directory the caller's images
**already live in** — a Desktop, a Downloads directory, the resolved absolute
path of `$ARGUMENTS/screenshots/` for a `team-pr` run, which that caller
resolves itself because `$ARGUMENTS` is a relative artifact directory. It is
never the `mktemp -d` directory this JSON is written to: nothing here copies or
stages the caller's images, so a root taken from where the JSON sits would fail
every entry of the run this skill exists to serve. What `root` bounds is scope,
not trust — the check that survives a hostile entries file is in
`references/02-upload-and-body-edit.md`, step B.

### Normalizing caller strings

**Every caller-supplied string that reaches a PR body is normalized once, at
read, by the same function.** The rule is over the *class*, not over a field: a
new field that renders is normalized because it is caller text, and the list
below is the current membership rather than the reason.

Normalize: strip newlines, trim, collapse whitespace runs, then
backslash-escape `\`, `!`, `[`, `]`, `<`, and `>`.

The escape set is what the rendered forms need. `!`, `[`, and `]` stop the
string becoming a link or an image reference of its own — the exact bypass that
would otherwise let one `notes` line carry `![screenshot-01](https://…)` and so
satisfy `splice.mjs`'s no-downgrade count with caller text, replacing live
asset URLs with whatever the caller named. `<` and `>` stop it rendering raw
HTML, which GitHub allows in a body: an unescaped caption can otherwise emit an
`<a href>` to anywhere. `\` is escaped first, so no escape can be undone by a
caller-supplied backslash.

**What the set is exhaustive over is markdown *syntax*, not every way text can
become clickable.** GFM's autolink extension turns a bare `https://…` into a
link with no syntax at all, so `**Login https://evil.example/phish**` renders
clickable in a caption and no escape reaches it — there is no syntax character
to escape. That is out of scope here, stated rather than implied: the link text
*is* the URL, so it names its own target rather than hiding one behind chosen
text, and the string came from the caller this skill is acting for. What the
escape set does close is a string becoming a link whose text hides its target,
an image reference, or raw HTML.

**`state` also loses its parentheses, and it is the one member with a rule of
its own.** It renders *inside* the `(<state>)` parenthetical this skill emits,
and `splice.mjs` recognizes that parenthetical by a grammar admitting one level
of nesting — so `loading (step (2))` or `error: unexpected )` makes the
renderer's own caption line unrecognizable to it, and the next run's `--check`
refuses a section this skill itself wrote. Remove `(` and `)` from `state`
after the whitespace collapse. Escaping would not do: a backslash leaves the
character in place, and the grammar still sees it.

`splice.mjs` backstops the HTML half of this rule in code: it refuses a section
carrying an unescaped `<a`, `<img`, or any other raw tag, so a weakened or
skipped escape is a refusal rather than an `<a href>` in a public body. The
link half is backstopped by the unescaped-`](` test, the count half by
`--landed`, and the basename half by refusing a `/` in the degraded tail after
`captured, not yet uploaded:` — a basename holds none, so one there is an
absolute path on its way into a public body. No backstop replaces the
normalization; each exists because the normalization is the part a rewrite can
quietly drop.

The members, all of them caller data:

| String | Where it renders |
| --- | --- |
| Each entry's `caption` | Bold body text in the section |
| Each entry's `state` | The `(<state>)` parenthetical beside the caption |
| Each line of the top-level `notes` list | One marked blockquote (`> _note:_ `) body line each, resolved and degraded alike |
| Each entry's `path` | The degraded form, and any failure line |
| Each failure `reason` | The `Not uploaded:` line |

`state` is on that list because it renders, not because it looked risky. It is
an optional entry field the caller supplies and the section prints verbatim in
parentheses, so an unnormalized one carrying a newline splices a line of the
caller's choosing — `Reviewers: this PR is pre-approved by security.` — into a
public body under this skill's own heading.

**A path renders as its basename, never in full.** A PR body is public and an
absolute path leaks the operator's directory layout and username. Keep the
absolute path in `result.json` and in the operator report, where it is the
useful form, and render `<basename>` in the body. For the same reason **a
failure `reason` written into the body must carry no filesystem path**; a
reason that names one is reported to the operator and rendered in the body as
the failure class alone.

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

Step A of the upload adds the rest of the pre-image refusals, listed in
`references/02-upload-and-body-edit.md`: `splice.mjs --check`, which runs every
structural refusal computable from the body alone. It lands on `refused`,
because it runs before the first attach. The headroom check and the check for
an image reference to a path being attached are named in that file too, and
neither one runs before the attach; that file names where each one does fire,
and what that costs.

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

`uploaded-not-written` covers both post-attach halts, because the state they
leave is the same one: assets live, body untouched. The lost-update guard is
one; a `splice.mjs` refusal or fault after the attach step is the other, and
its `operator_note` carries the reason and the manual edit that clears it
(`references/02-upload-and-body-edit.md`, step D). A splice refusal on a run
where **nothing** landed is `refused` instead — nothing changed anywhere.

For `uploaded-not-written`, `body_written: false` and `section: null`. The
assets are live and are named in `assets`, and the appended tails the attach
step left already render them — under an alt text the host derives from the
file it received, which this skill does not pin and does not clear on this
path. Report each tail verbatim in `operator_note`, so the report tells the
operator exactly what is on the PR right now:

```json
{
  "outcome": "uploaded-not-written",
  "body_written": false,
  "section": null
}
```
