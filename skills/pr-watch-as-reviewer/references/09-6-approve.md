### 6. Approve

**Pre-cast re-review sweep.** The approval covers every tracked item of
both shapes,
so before any merge-safety check, every tracked thread and every tracked
comment must hold a
current verdict of addressed or answered. Re-review any item that
lacks one: a thread that resolved during a confirmation wait, a comment
engaged during that wait, a verdict
voided by a reopen, or verdicts lost to a compaction. When the head
moved after a verdict was recorded, re-check the threads whose `path`
the new commits touch — an addressed verdict can be un-fixed by a later
push, and a verdict rendered at head B proves nothing about head C's
version of that file. **A tracked comment has no `path`, so it cannot be
narrowed that way: re-check every tracked comment whenever the head
moved after its verdict.** Failing closed on the whole set is the only
sound option when the item does not say which files it covers. A
rejected verdict here rebuts and blocks the cast, before any
confirmation is asked — resume polling on the loop path, and on the
immediate path stop and report the open dispute rather than starting a
loop that was not asked for. A pending
verdict here means the approval condition does not hold: never cast, and
on the loop path resume polling. A thread the skill itself resolved is
re-checked here on exactly the same terms as one the author resolved:
its resolved bit proves nothing about head C, and re-reading the branch
is the only thing that does.

Run the pre-cast merge-safety checks when the approval condition holds.
This covers the loop path and the immediate path. On the immediate path
the pre-cast confirmation was already granted when auto-merge was
enabled at arm, and no confirmation exists otherwise. They read the
**final poll's** values — the most recent run of the step-4 query, under
step 4's live re-read rule. Each triggered check requires an explicit
confirmation before casting. A declined confirmation is the
**confirmation declined** stop — stop without approving and report which
check was declined.

- **Head drift.** Compare the arm-time `headRefOid` against the
  `headRefOid` from the final poll. When they differ, the author pushed
  commits after you armed. The approval would then cover code your
  threads never gated on. When the head moved, with auto-merge enabled
  or not, require an explicit confirmation before casting. Name both
  SHAs in the approval body and the completion report. With auto-merge
  on, an unconfirmed cast would merge code no human re-read,
  irreversibly.
- **Auto-merge without an arm-time confirmation.** When the final poll
  shows auto-merge enabled and no auto-merge confirmation exists from
  arm, require an explicit confirmation before casting. This holds even
  when the head never moved. Either it was off at arm and flipped on
  mid-watch, or the arm-time record is unrecoverable. The arm-time gate
  cannot have covered a state that did not exist at arm.
- **Unrecoverable drift baseline (fail closed).** The drift check's
  baseline is the arm-time head SHA printed in the arm report and
  repeated in every snapshot line. When a compaction left no copy
  recoverable from the transcript, never re-derive it from the current
  head. A baseline read from the value under test proves nothing. and
  never approve unconfirmed: require an explicit confirmation that names
  the missing baseline, or stop.

**A granted confirmation is itself a stale read.** The checks above run
against a poll that precedes the confirmation wait. An unattended "yes"
can arrive hours later. That is time enough for auto-merge to flip on,
for the head to move again, or for a resolved thread to reopen. After
any granted confirmation, re-run the step-4 poll, which becomes the
final poll. That covers a confirmation from one of these checks, and one
from the immediate path. Then re-evaluate the step-2 approval condition
and every check above against that poll, before you cast. A check the
fresh poll newly triggers requires its own confirmation — and a check
that re-triggers with values different from those the granted
confirmation covered counts as newly triggered: a drift confirmed at
head B never covers a cast at head C. A re-trigger on the same values
stays covered, so an unchanged drift never re-asks and a drifted head
stays approvable. When the fresh poll fails the step-2 approval
condition itself (a thread reopened during the wait), never cast: on the
loop path, resume polling — the gate has not cleared. On the immediate
path, there is no loop to resume and none is silently started — stop and
report the reopened gate under the **confirmation declined** stop, and
offer to re-arm. Neither outcome consumes a confirmation round, because
the cap counts confirmations asked. The confirm-then-re-poll loop is
bounded per `principle-bounded-loops`: at three
consecutive re-polls that each trigger a new confirmation, stop without
approving and report the churn under the **confirmation declined** stop —
re-arming remains available.

Cast one approval against `$PR_URL`, the canonical URL bound in step 1.
Pass the body on stdin (`--body-file -` with a quoted heredoc), so the
body text is never interpolated into the shell command:

```bash
gh pr review --approve "$PR_URL" --body-file - <<'GH_APPROVE_EOF'
Approved automatically: all <T> review threads and <C> PR comments from @<viewer> are settled, and each settlement was re-reviewed against the diff and accepted. <R> of those threads were resolved by this review after the reply was checked against the branch; the rest the author resolved. The comments carry no resolve state, so their settlement was judged from the change and the replies rather than read from a resolved flag. Head commit at approval time: <approval-head-SHA>. Armed at head commit: <arm-head-SHA>.
GH_APPROVE_EOF
```

The body states the two counts separately, and when `<C>` is non-zero it
names how those comments were judged. That sentence is the audit trail
for the weaker evidence: a reader can otherwise not tell whether the
approval rested on resolves the author clicked or on inferences the
watch drew. `<R>` is the same disclosure for the resolves: an approval
that counted threads the approver itself closed must say so, or a reader
auditing it cannot tell the two apart. Drop that sentence when `<R>` is
zero. When `<C>` is zero, drop the comment count and that sentence
entirely and say "all `<T>` review threads opened by @`<viewer>` are
resolved" — a thread-only approval should read exactly as it did before
plain comments were tracked, with no dead clause about a shape that did
not appear.

The body never names this skill, a slash command, or an agent — internal
tooling names mean nothing to the reader and read as process noise.
"Approved automatically" carries the automated-attribution disclosure
without naming any tooling; the rest of the body states substance only:
what was verified and at which SHAs. A user or project convention may
prescribe an additional disclosure marker (an emoji prefix, a footer) —
apply it on top; it composes with this rule, which only forbids the
tooling name. The body carries the head commit SHA current at approval
time. That SHA is the `headRefOid` from the final
poll, and the confirmation rule above guarantees no wait separates that
poll from the cast. The body also carries the arm-time head SHA and the
settled-item counts. When the two SHAs are equal, collapse the two SHA
sentences into "Head commit at arm and approval time: <head-SHA>." An
unexplained automated approval is unauditable, and an approval that
hides head drift is unauditable too. When `<T>` or `<C>` differs from the
matching arm-time tracked count, items were deleted or added mid-watch —
a gate
cleared by deletion must not read as one cleared by settlement — so name
both counts for the shape that changed, in the body and the completion
report, the way the two head
SHAs are handled. When the arm-time SHA was unrecoverable and the user
confirmed the cast anyway, say so in the body in place of the arm-time
SHA — never invent one.

Error mappings — the approve is attempted directly, with no pre-flight
check:

- A 422 self-approval rejection is reported verbatim and never retried.
- A rejection because the viewer holds a pending review maps to:
  submit (or delete) your pending review, then re-arm — never the raw
  API error.
- Any other failure (permissions, org policy, archived repository) is
  surfaced verbatim and stops the watch.
