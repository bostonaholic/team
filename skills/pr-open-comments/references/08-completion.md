## Completion

Run Completion once per triage pass, as the last action of the pass.
Then give the hand-off prompt in
[Open Questions to Flag](07-open-questions-to-flag.md).

A triage pass is steps 1 to 7 of [Execution](04-execution.md) for one PR.
It includes the step 6 per-item runs. It also includes a whole-batch
directive given with the invocation, such as "fix the PR feedback". The
pass ends at step 8. Never run Completion from a step 6 per-item run.

### Item outcomes

An item gets its outcome at one of these points:

- Options A, B, E, and F: after the option executes.
- Options C and D: after the reply posts.

These items have no outcome:

- An item that takes option G.
- An item whose change you could not make.
- A security-sensitive change that you hold for review.
- An item whose push failed.
- An item that waits on the punch list for the user's choice.

### Pass gate

The pass gate passes when both conditions are true:

- The pass gave at least one item an outcome.
- No item in the pass is left without an outcome.

If the gate fails and the pass has its own `Needs your decision` items,
print nothing and run nothing. If the gate fails and the pass gave no
item an outcome, print nothing and run nothing. If the gate fails for
another reason, run nothing. Print `Review re-request: not sent` with the
URL of each item left without an outcome.

### Run the script

If the pass gate passes, run the script with the PR `url` from step 1 of
[Execution](04-execution.md):

```bash
node "<skill-dir>/scripts/re-request-review.mjs" "<url>"
```

Replace `<skill-dir>` with the absolute path of this skill's directory.
The script reads the PR's review state from GitHub itself. It re-requests
review from each reviewer whose latest review requested changes. It sends
a request only when no feedback on the PR awaits a response. GitHub
notifies each reviewer it requests.

### Report

Add one `Review re-request:` line group to the report. Build it only from
the script's stdout tokens and the URLs that they print. Never quote a
comment body in it. If the script prints one report line, write the group
as one line. Otherwise, write the `Review re-request:` label, then one
indented line per report line.

| Script stdout | Report text |
|---|---|
| `re-requested <login>` | `re-requested @<login> (no feedback awaits a response, latest review CHANGES_REQUESTED)` |
| `already-requested <login>` | `@<login> already has a pending review request` |
| `skipped <login> not-a-user` | `skipped @<login>, not a user account` |
| `skipped invalid-login` | `skipped a reviewer whose login failed validation` |
| `skipped author-unavailable` | `skipped a reviewer whose account is unavailable` |
| `pending <url>` lines, then `not-requested pending-feedback` | `not sent, <n> items await a response: <url>, <url>`, or `1 item awaits` for one item |
| `pending url-unavailable` | count the item in `<n>`, and write `an item with no usable URL` in place of its URL |
| `pending-more <n>` | `and <n> more` after the listed URLs |
| `pending empty-changes-request <login>` | `not sent, @<login> requested changes with no comment. Ask what they want.` |
| `not-requested review-decision APPROVED` | `not sent, the PR is approved` |
| `not-requested no-changes-requested-reviewer` | `not sent, no reviewer requests changes` |
| `not-requested review-state-read-failed` | `not sent, the review-state read failed` |
| `not-requested review-state-incomplete` | `not sent, the PR has more feedback than the script reads` |
| `failed <login> http-<status>` | `failed for @<login> (HTTP <status>)` |
| `failed <login> gh-exit-<code>` | `failed for @<login> (gh exit <code>)` |

Examples:

```
Review re-request: re-requested @alice (no feedback awaits a response, latest review CHANGES_REQUESTED)
Review re-request: not sent, 1 item awaits a response: https://github.com/o/r/pull/412#discussion_r1001
Review re-request: not sent, @bob requested changes with no comment. Ask what they want.
```

Handle the exit code:

- Exit 0: write the report lines from the table.
- Exit 1: name each `failed`, `review-state-read-failed`, and
  `review-state-incomplete` line. Never claim that a request went out for
  a failed login.
- Exit 1 on an authentication failure: suggest `gh auth login` or
  `gh auth refresh`. An `http-401` token or a script stderr that names
  authentication marks this failure.
- Exit 2: report a usage fault. Check the `url` that you passed.

A re-request failure is never fatal. The triage result, its pushes, and a
watch loop stand. Report the failure and continue.
