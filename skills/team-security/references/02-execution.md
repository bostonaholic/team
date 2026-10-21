The [team-review execution reference](../team-review/references/02-execution.md)
is the only statement of the review loop. Read it completely first, with the
record schema and record states in the
[artifact schema](../team/references/artifacts.md). Then run its steps 1 to 9
in order, with each delta below in place of the text it names. A step with no
delta runs as written.

| Step | Delta for SECURITY |
|---|---|
| 1. **Read state.** | List the `$ARGUMENTS/security-review-<n>.md` files whose `<n>` is numeric. Ignore a file with a non-numeric suffix, such as `security-review-final.md`. The TodoWrite item is `Security round <n>`. |
| 2. **Pin the range.** | No change. |
| 3. **Dispatch.** | Dispatch `security-reviewer` alone. Its payload carries `Security round: <n>` in place of `Review round: <n>`, plus the canonical artifact directory, the range lines, and the intent paths. Send no `Locked acceptance tests` line. The tree check runs as written around this one dispatch. |
| 4. **Validate each report.** | Only the no-parseable-verdict case applies. |
| 5. **Tier sort.** | The one reviewer span: from the `#### [SEVERITY] <title>` heading through that finding's last field. The tree-check line is unchanged. The `### Major` tier always reads `None.`, because no security severity maps to Major. The heading stays, so one record-state rule serves both record families. |
| 6. **Persist the cross-model record.** | Skip. `security-reviewer` runs no cross-model pass. |
| 7. **Write the record.** | The file is `security-review-<n>.md`, with `phase: security-review`. `## Reports` holds one `### security-reviewer` subsection. |
| 8. **Fix loop.** | The typed classes are `security`, plus `review` for a tree-check finding. The ledger item is `Security round <n+1> (<b> Blocking, <m> Major open)`, with the reconsider suffix when the streak requires it. The FAIL streak counts `security-review-<n>.md` records. The blocker halt names the newest `security-review-<n>.md`. Recovery re-invokes `/team-security` bare. |
| 9. **Hand-off at PASS.** | Replace the step with the hand-off below. |

**Locked acceptance tests.** When a CRITICAL or HIGH finding can be fixed only
by editing a locked acceptance test, the implementer cannot fix it, because
the test list stays locked during SECURITY. The implementer reports a
blocker, and step 8 halts loudly per its blocker rule. That halt is how such
a finding ends the loop. The finding stays Blocking, and the operator decides
the next move.

**Hand-off at PASS.** Present the security verdict and the PASS round number.
MEDIUM and LOW findings stay under `### Minor and below` in the record for the
PR's `review-notes` comment. Never present them mid-run. Then classify the
newest `$ARGUMENTS/review-<n>.md` again per the artifact schema. A SECURITY fix
commit moves HEAD, so it leaves that record stale.

- **Full pipeline** (the TodoWrite ledger holds a `PR` phase item that `/team`
  seeded): do **not** end the turn. Return to the `/team` phase loop in the
  same turn. Its SECURITY gate advances to PR, or moves the run back to
  REVIEW when the `review-<n>.md` record is no longer PASS and current.
- **Standalone**, with the newest `review-<n>.md` PASS and current: tell the
  user **"Next: run `/team-pr docs/plans/<id>/`"**.
- **Standalone**, otherwise: tell the user
  **"Next: run `/team-review docs/plans/<id>/`"**. Every shipped commit must
  pass REVIEW, and a security fix can break a test, the build, or a done
  criterion that only REVIEW judges.
- Never load `team-review` or `team-pr`.

Every halt names the absolute `docs/plans/<id>/` path and the newest
`security-review-<n>.md` path.
