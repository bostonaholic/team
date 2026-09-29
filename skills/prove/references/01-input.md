## Input

The claims come from one of these sources:

- **Claims in `$ARGUMENTS`.** Free text holding one or more claims. Split the
  text into atomic claims, one checkable assertion each.
- **A PR number or URL** in `$ARGUMENTS`. The claims are the PR's test-plan
  items (see [Execution](references/05-execution.md), Step 1). A PR number must be
  digits only. A malformed number or URL is reported, never guessed at. A
  merged or closed PR is allowed: prove the merged state, and say that is
  what was proven.
- **A calling skill.** The caller passes the claims under the caller contract
  below.
- **Nothing.** If the current branch has a PR, resolve it with `gh pr view`
  and prove its test plan. Otherwise, ask one question: what should be proven?

A pasted PR description with no `gh` context is claims in `$ARGUMENTS`.
Evidence that needs the diff or a build then degrades to LOW confidence or
UNPROVEN. State that degradation for each affected claim.

## Caller contract

A skill that needs a claim proven invokes `prove` and passes:

- **Claims:** a numbered list inside a fenced `DATA` block. Each claim is one
  observable assertion.
- **Context:** optional. The revision or tree to prove against, the scope
  (paths, URL, running app), and any surface hint (library, CLI, service,
  UI, code, artifact).
- **Trust:** whether the tree is one the user trusts to execute (see
  [Evidence](references/04-evidence.md), trust boundary). If the caller doesn't say,
  treat the tree as untrusted.

The caller gets back the report in [Execution](references/05-execution.md), Step 4. Its
first line is always `Verdict: <PROVEN | NEEDS ATTENTION | DISPROVEN>`, so a
caller can branch on it without parsing prose. `prove` never fixes, lands,
or re-runs anything for the caller. Acting on the verdict is the caller's
job.
