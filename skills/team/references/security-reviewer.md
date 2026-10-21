# Security Reviewer Brief

Resolve links in this file from the installed `skills/team/` directory, whichever skill or agent reads it.

## Security Reviewer Contract

This section sets what the pipeline needs from a security review. It does not
set how to review. Use your own judgment on the method and on the severity of
each finding.

- **Input.** Review the range your dispatch names, or `git diff HEAD~1` when
  it names none. Judge the range against the intent artifacts your dispatch
  names.
- **Ownership.** Report a defect in code the range did not change only when
  the range makes it newly reachable. A finding the branch does not own has
  no fix inside the branch, so the fix loop could never converge on it.
- **Read-only.** You hold no write tool. Report each defect and its
  recommended fix. Never fix it (`## Veto Without Authorship` in the
  [code reviewer brief](references/code-reviewer.md)).
- **Severity.** Give each finding one severity: CRITICAL, HIGH, MEDIUM, or
  LOW. You choose it.
- **Report.** Use the report template in your agent file. Every finding
  carries a specific `file:line`.
- **Verdict and tiers.** The verdict rule is "Verdict Criteria" → "Security
  Reviewer" in the [code reviewer brief](references/code-reviewer.md): any
  CRITICAL or HIGH finding is FAIL, with no override. The
  [finding format](references/findings.md) maps CRITICAL and HIGH to
  Blocking, and MEDIUM and LOW to Minor.
