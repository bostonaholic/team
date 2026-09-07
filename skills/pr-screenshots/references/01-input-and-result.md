## Input and result

### Resolve the PR once

`$ARGUMENTS` carries a PR number or a full PR URL. Validate it before it
reaches any command, using the technique at
`skills/pr-watch-as-reviewer/references/02-input.md`, lines 11-42: an anchored
pattern, then a parameter-expansion split of the string that already matched
it. Never use `[^/]+` for an owner or repo segment: that class admits `$`,
backticks, parentheses, and spaces. Never use `$BASH_REMATCH` either — zsh
matches the same pattern and leaves it unset.

**The pattern is this skill's own, and its host segment is a variable.** That
sibling's pattern is anchored at `^https://github\.com/`, and this skill
supports GitHub Enterprise in three later places — the guarded split below, the
attachment allowlist, and the read-back. Reusing an anchored-at-github.com
pattern would refuse every Enterprise PR URL as malformed before any of that
handling could run, leaving Enterprise reachable only by bare number from a
checkout. The claim and the validator have to say the same thing, so the host
is a charset here:

```bash
PR_URL_PATTERN='^https://[A-Za-z0-9.-]{1,253}/[A-Za-z0-9._-]{1,39}/[A-Za-z0-9._-]{1,100}/pull/[0-9]+$'
case "$ARGUMENTS" in
  ''|*[!0-9]*) ARG_NUMBER='' ;;               # not a bare PR number
  *)           ARG_NUMBER="$ARGUMENTS" ;;     # bare number — repo comes from the checkout
esac
if [ -z "$ARG_NUMBER" ]; then
  [[ "$ARGUMENTS" =~ $PR_URL_PATTERN ]] || { echo "malformed PR argument" >&2; exit 1; }
  REST="${ARGUMENTS#https://}"
  ARG_HOST="${REST%%/*}"  ; REST="${REST#*/}"
  ARG_OWNER="${REST%%/*}" ; REST="${REST#*/}"
  ARG_REPO="${REST%%/*}"
  ARG_NUMBER="${ARGUMENTS##*/}"
fi
```

Resolve the canonical URL in one call, then bind the four values from it. The
resolution call carries `--repo` too, whenever the argument supplied one: for a
URL argument `$ARG_NUMBER` is the trailing number alone, and `gh pr view` with
no `--repo` resolves a bare number against the *current directory's* default
repository. A full URL for one repository, run from a checkout of another,
would otherwise silently resolve the other repository's PR of the same number —
and every later call inherits that resolution, ending with a `## Screenshots`
section written into an unrelated PR.

```bash
if [ -n "$ARG_OWNER" ]; then
  PR_URL="$(gh pr view "$ARG_NUMBER" --repo "$ARG_HOST/$ARG_OWNER/$ARG_REPO" --json url --jq .url)"
else
  PR_URL="$(gh pr view "$ARG_NUMBER" --json url --jq .url)"
fi
case "$PR_URL" in
  https://*/*/*/pull/[0-9]*) : ;;
  *) exit 1 ;;                       # not a PR URL, so nothing below may split it
esac
REST="${PR_URL#https://}"
PR_HOST="${REST%%/*}" ; REST="${REST#*/}"
OWNER="${REST%%/*}"   ; REST="${REST#*/}"
REPO="${REST%%/*}"
NUMBER="${PR_URL##*/}"
case "$PR_HOST$OWNER$REPO" in *[!A-Za-z0-9._-]*) exit 1 ;; esac
case "$NUMBER" in ""|*[!0-9]*) exit 1 ;; esac
REPO_SPEC="$PR_HOST/$OWNER/$REPO"    # gh's own [HOST/]OWNER/REPO form
```

**The split is guarded, and the host is a bound value of its own.** Stripping a
literal `https://github.com/` prefix is a no-op on every other host: a GitHub
Enterprise URL would leave `OWNER` as `https:` and `REPO` empty, and each later
`--repo` would carry a repository that cannot exist. The shape test refuses a
URL that is not a PR URL before any segment is read out of it, and the charset
tests refuse a host, owner, repository, or number carrying anything else.
`PR_HOST` is the value step C's attachment allowlist is derived from
(`references/02-upload-and-body-edit.md`), so an Enterprise install harvests
against its own host rather than a hardcoded one.

**`REPO_SPEC` carries the host, and every later call uses it.** `--repo
"$OWNER/$REPO"` resolves against whichever host `gh` considers default, so on
an Enterprise PR it names a repository on github.com. `gh` accepts
`[HOST/]OWNER/REPO`, so binding the host into the spec once makes every
`gh pr view` and `gh pr edit` below land on the host the URL actually named.
The read-back's `gh api` takes the same host through `--hostname "$PR_HOST"`
(`references/03-verify.md`).

The `else` branch is the bare-number form, which has no repository of its own
and resolves against the checkout by design; with no checkout it resolves
nothing, which is the refusal below.

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
    { "path": "/Users/dev/Desktop/shots/login.png", "caption": "Login", "state": "default" },
    { "path": "/Users/dev/Desktop/shots/login-error.png", "caption": "Login", "state": "error", "note": "seeded" }
  ],
  "notes": ["2 states skipped — see manifest"]
}
```

Per entry: `path` and `caption` are required, `state` and `note` are optional.
One top-level `notes` list carries caller-supplied discrepancy lines. Captions
need not be unique.

The top-level `root` is **required and absolute**. It is the directory every
entry's `path` must resolve inside, and it is the directory the caller's images
**already live in** — a Desktop, a Downloads directory, `$ARGUMENTS/screenshots/`
for a `team-pr` run. It is never the `mktemp -d` directory this JSON is written
to: nothing here copies or stages the caller's images, so a root taken from
where the JSON sits would fail every entry of the run this skill exists to
serve. What `root` bounds is scope, not trust — the check that survives a
hostile entries file is in `references/02-upload-and-body-edit.md`, step B.

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

`splice.mjs` backstops the HTML half of this rule in code: it refuses a section
carrying an unescaped `<a`, `<img`, or any other raw tag, so a weakened or
skipped escape is a refusal rather than an `<a href>` in a public body. The
count half is backstopped by `--landed`. Neither backstop replaces the
normalization; both exist because the normalization is the part a rewrite can
quietly drop.

The members, all of them caller data:

| String | Where it renders |
| --- | --- |
| Each entry's `caption` | Bold body text in the section |
| Each line of the top-level `notes` list | One blockquoted (`> `) body line each, resolved and degraded alike |
| Each entry's `path` | The degraded form, and any failure line |
| Each failure `reason` | The `Not uploaded:` line |

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
`references/02-upload-and-body-edit.md`: the headroom check, the check for an
image reference to a path being attached, and `splice.mjs --check`, which runs
every structural refusal computable from the body alone. All of them land on
`refused`, because all of them run before the first attach.

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
