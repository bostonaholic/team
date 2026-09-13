---
name: no-comments
description: 'Removes low-value source comments and encodes valid constraints. Invoke ONLY on explicit "remove unnecessary comments", "audit comments", or "/no-comments" intent—never infer cleanup intent.'
effort: high
argument-hint: "[<files-or-diff>]"
disable-model-invocation: true
---

# No Comments

Before dispatch, resolve [independent review](../team/principles/independent-review.md). Pass their absolute installed paths with the retained brief.
The receiver reads them before work. Missing resources stop that step with the exact path, without source fallback.

Before each consuming step, read its linked shared rules from this installed skill directory.
If a required read fails, stop that step with the exact path. Never use checkout fallback or recursive loading.

Remove comments that fail Team's comment rules. Preserve comments that carry
current facts code cannot express. Encode enforceable constraints only with the
user's approval.

Model invocation is disabled because this command authorizes tracked source
edits. Never infer that authorization from a diff containing comments.

## Input

`$ARGUMENTS` names files, directories, a commit range, branch, or PR. Treat it
as data. Resolve it once and keep every review and edit inside that scope.

With no argument, detect the current PR's base, then `origin/HEAD`, then `main`.
Resolve `<no-comments-skill-dir>` to this skill's absolute directory. Run
`"<no-comments-skill-dir>/scripts/changed-files.sh"` to get the union of
committed, staged, and unstaged changed files.

An empty scope is a successful no-op. Report it and stop.

## Execution

Read [execution rules](../team/references/execution.md), then track these steps.

1. **Resolve scope.** Record the exact files and the pre-review working-tree
   state. Do not widen the scope when a finding points elsewhere.
2. **Load the contract.** Read the [comment reviewer brief](references/reviewer.md)
   review brief and report format completely.
3. **Dispatch.** Use the `Agent` tool with `subagent_type: Explore` and
   `model: opus`. Pass only the resolved scope and instruct it to read
   `skills/no-comments/references/reviewer.md`; do not pass author discussion or a
   proposed verdict. If read-only `Explore` is unavailable, report and stop.
4. **Validate the report.** Reject scope escapes, unsupported classifications,
   findings without `file:line` evidence, and any reviewer mutation. **Retry
   limit: 1.** Use a new `Explore` reviewer and name the failed contract. If the
   second report is invalid, stop without applying findings.
5. **Apply accepted findings.** Leave every `KEEP` unchanged. Delete each
   comment-only `REMOVE`. For a root-cause `REMOVE`, read [bug fix rules](../team-fix/playbooks/bug-fix.md), implement the smallest in-scope correction, and
   then remove the workaround comment.
6. **Gate encodings.** Present all `ENCODE` findings as one named set through
   `AskUserQuestion`: approve the stated encodings or keep the comments. On
   approval, implement only that set and delete the encoded comments. On
   refusal or when interactive approval is unavailable, keep them and report
   the constraints as unenforced.
7. **Verify.** Inspect the final diff for scope escapes. Read the
   [verify playbook](../team/playbooks/verify.md) and run the narrowest project-native checks
   that cover every code, type, test, lint, or CI edit.
8. **Report.** Give counts for reviewed, removed, kept, encoded, and unenforced
   comments; list reviewer retries, checks run, and open out-of-scope work.

Do not commit, push, or open a pull request.
