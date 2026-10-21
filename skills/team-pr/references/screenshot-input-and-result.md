Read under [screenshot rules](screenshot-rules.md), whose header (external-data read, link base, `<team-pr-skill-dir>`, failed-read stop) applies here.

## Input and result

### Resolve the PR once

`$UPLOAD_ARGS` carries the whole invocation — `<pr-number-or-url>` **and** `--entries <path>`, which [Screenshot Upload](04-screenshot-upload.md) binds. Assign it on the first line of this fence, in the same call that runs `resolve-pr.sh`; bound in an earlier call, it reaches the script empty and the script refuses.

```bash
UPLOAD_ARGS='<PR URL> --entries <printed entries_file>'   # filled in literally, this call
RUN_DIR="$(mktemp -d)"                     # every temporary this run writes
'<team-pr-skill-dir>/scripts/resolve-pr.sh' "$UPLOAD_ARGS" "$RUN_DIR" || exit 1
PR_URL="$(cat "$RUN_DIR/pr-url")"          # the canonical URL, on the base repo
PR_HOST="$(cat "$RUN_DIR/pr-host")"
OWNER="$(cat "$RUN_DIR/owner")"
REPO="$(cat "$RUN_DIR/repo")"
NUMBER="$(cat "$RUN_DIR/number")"
REPO_SPEC="$(cat "$RUN_DIR/repo-spec")"    # gh's own [HOST/]OWNER/REPO form
printf 'RUN_DIR=%s\n' "$RUN_DIR"
```

Exit 1 is a refusal naming the argument on stderr; report it with `outcome: refused`.

`$RUN_DIR` is this run's whole state. Later fences re-bind it and re-run only the `cat` lines they need — never the `UPLOAD_ARGS`, `mktemp -d`, and `resolve-pr.sh` lines, which would abandon the run state in a fresh directory.

Every inline `gh pr view` and `gh pr edit` takes `--repo "$REPO_SPEC"`, never `--repo "$OWNER/$REPO"` (that resolves against `gh`'s default host, wrong on Enterprise). `gh api` takes `--hostname "$PR_HOST"`.

A merged, closed, or draft PR is in scope. Edit it and say which state was edited.

### The entries file

`manifest-entries.mjs` writes it:

```json
{
  "root": "/Users/dev/Desktop/shots",
  "entries": [
    { "path": "/Users/dev/Desktop/shots/login.png", "caption": "login", "state": "default", "note": "seeded" }
  ],
  "notes": ["2 states skipped — see manifest"]
}
```

Per entry: `path` and `caption` are required, `state` and `note` optional. The top-level `notes` list carries discrepancy lines. Captions need not be unique.

### Normalizing caller strings

**Every caller-supplied string that reaches a PR body is normalized once, at read, by one function.** The `splice.mjs` backstops do not replace it.

Normalize: strip newlines, trim, collapse whitespace runs, then backslash-escape `\`, `!`, `[`, `]`, `<`, and `>`, escaping `\` first. **`state` also loses `(` and `)`** after the whitespace collapse, or the next `--check` refuses this skill's own section.

Strings that render: each entry's `caption`, `state`, and `path`; each top-level `notes` line; each failure `reason`.

**A path renders as its basename, never in full** (a public body would leak the operator's layout and username); the absolute path stays in `result.json` and the operator report. **A failure `reason` in the body carries no filesystem path**: the body gets the failure class, the operator the full reason.

A caption empty after normalization fails its entry. A `notes` line empty after normalization is dropped. The caption is never alt text: the alt is `screenshot-<NN>`, the entry's index.

### Refusals

Refuse before any `gh` call, mutate nothing, and report `outcome: refused`:

- **Zero entries.** Name the required input.
- **An entry lacking `path` or `caption`.** Refuse the whole run rather than dropping the entry, naming the entry by index.

`resolve-pr.sh` (exit 1) refuses a malformed PR argument and a bare PR number with no local checkout; `upload.sh` (exit 1) refuses an unreadable `--entries` path, invalid JSON, and a missing, relative, or unresolvable `root`. Report their stderr reason.

### The result

Write `result.json` beside the entries file, and restate it as prose in the run's report.

| Field | Value |
| --- | --- |
| `owner`, `repo`, `number` | The resolved PR, as bound above |
| `outcome` | One of the six values below |
| `assets` | Array **in entries order** of `{caption, path, url}`, `url` null when that entry did not land |
| `failures` | Array of `{caption, path, reason}` |
| `body_written` | Whether a body write landed |
| `operator_note` | The operator-facing note, or null. Never written into a PR body |
| `section` | The exact markdown written, or null |

| `outcome` | Means |
| --- | --- |
| `uploaded` | Every entry landed, the body was written, the read-back passed |
| `partial` | At least one entry landed and at least one failed |
| `degraded` | Nothing landed; the body carries the note and the captured file names as plain text |
| `unverified` | The body was written and the read-back did not pass |
| `uploaded-not-written` | The assets landed and no body was written — the lost-update guard, or a splice refusal or fault after the attach step |
| `refused` | Nothing changed anywhere: no asset landed and no body was written |

**`section` is null unless a write landed at least one URL and the read-back passed.** `team-pr` copies it into companion bodies, so nothing weaker may travel.

For `uploaded-not-written`, `body_written: false` and `section: null`; `operator_note` carries the reason and the manual edit that clears it ([step D](screenshot-upload-and-body-edit.md)). The live assets are in `assets`, already rendered by the attach step's appended tails, which stay on this path; report each tail verbatim in `operator_note`.
