## Input and result

### Resolve the PR once

`$ARGUMENTS` carries a PR number or a full PR URL. Validate it before it
reaches any command, with the anchored pattern and the parameter-expansion
split at `skills/pr-watch-as-reviewer/references/02-input.md`, lines 11-42.
Never use `[^/]+` for an owner or repo segment: that class admits `$`,
backticks, parentheses, and spaces.

Resolve the canonical URL in one call, then bind the three values from it:

```bash
PR_URL="$(gh pr view "$ARG_NUMBER" --json url --jq .url)"
REST="${PR_URL#https://github.com/}"
OWNER="${REST%%/*}"
REST="${REST#*/}"
REPO="${REST%%/*}"
NUMBER="${PR_URL##*/}"
```

`gh pr view` returns the URL on the **base** repository, which is the PR a fork
contribution is edited on. Every later call carries `--repo "$OWNER/$REPO"`, so
no command depends on the remote set of the current checkout.

A merged, closed, or draft PR is in scope. Edit it and say which state was
edited.

### The entries file

One input, one file, JSON — because a caption may hold a tab, which no
delimiter-separated format survives. `team-pr` writes it from the capture
manifest. A session with no `--entries` flag writes the same JSON itself under
`$(mktemp -d)` from the request, which is what lets a caller with no pipeline
artifacts use this skill at all.

```json
{
  "entries": [
    { "path": "/tmp/shots/login.png", "caption": "Login", "state": "default" },
    { "path": "/tmp/shots/login-error.png", "caption": "Login", "state": "error", "note": "seeded" }
  ],
  "notes": ["2 states skipped — see manifest"]
}
```

Per entry: `path` and `caption` are required, `state` and `note` are optional.
One top-level `notes` list carries caller-supplied discrepancy lines. Captions
need not be unique.

**Caption normalization runs once, at read.** Strip newlines, trim, collapse
whitespace runs, then backslash-escape `\`, `!`, `[`, and `]`. A caption is
caller text and renders as bold body markdown, so the escape is what stops it
becoming a link or an image reference of its own. A caption that is empty after
normalization fails its entry. The caption is never alt text: the alt is
`screenshot-<NN>`, the entry's index, and holds no caller text at all.

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
  a caller that meant to send fewer images.
- **A malformed PR number or URL.** Refuse and report it. Never guess.
- **A bare PR number with no local checkout.** No repository context exists to
  bind it to, so refuse and ask for the full PR URL.

Step A of the upload adds three more refusals over the pre-image, listed in
`references/02-upload-and-body-edit.md`.

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
| `degraded` | Nothing landed; the body carries the note and the local paths as plain text |
| `unverified` | The body was written and the read-back did not pass |
| `uploaded-not-written` | The assets landed and the body was left untouched — what the lost-update guard returns |
| `refused` | Nothing changed anywhere |

**`section` is null unless a write landed at least one URL and the read-back
passed.** That is the field `team-pr` copies into companion bodies, so
anything weaker must not travel.

For `uploaded-not-written`, `body_written: false` and `section: null`. The
assets are live and are named in `assets`, and the appended tails the attach
step left already render them, so the report tells the operator what is on the
PR right now:

```json
{
  "outcome": "uploaded-not-written",
  "body_written": false,
  "section": null
}
```
