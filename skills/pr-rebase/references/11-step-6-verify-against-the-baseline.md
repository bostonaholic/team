### Step 6 — verify against the baseline

Re-run **the same checks, the same commands, in the same order** as step 2.
Do not add a check that had no baseline, and do not drop one whose
baseline is `PASS` or `FAIL`.
Re-running is conditional on the baseline: a check whose baseline is
`PASS` or `FAIL` is re-run, and one whose baseline is `UNKNOWN` may be
skipped — the verdict table maps it to `UNKNOWN` whatever it returns now,
so re-running it can produce no evidence either way. Report it `UNKNOWN`
in the table regardless.

**A held dev/build lock is a step-specific stop here.** When a re-run cannot
execute because the project's own dev/build lock is held (a local `next dev`
holding `.next`), probe the live process — a stale lock file with no holder
must not stop the run — and stop before step 7. The two arms are best-effort
detection of that lock within this project: the build cache is a directory, so
the `lsof` arm searches it recursively (`lsof +D`) and tests for *output*
rather than exit status — a flat `lsof -- <dir>/.next` exits non-zero with no
output even while a holder lives, and `lsof +D` itself returns non-zero even
when it lists one. A missing build directory reads as free. The `pgrep` arm
matches only argv, not working directory, so a server launched from elsewhere
whose argv omits the project root can escape it:

```sh
if [ -n "$(lsof +D "<project-root>/<build-dir>" 2>/dev/null)" ] \
   || pgrep -f "<project-root>/.*<dev-or-build-command>" >/dev/null 2>&1; then
  echo "stop: a live process holds this project's dev/build lock — free it and re-run" >&2
  exit 1
fi
```

Free the lock and re-run the same checks. If the user declines, report the
recovery anchor `git reset --hard "${ORIG_SHA:?}"` to restore the pre-rebase
branch (Hard Rule 8). The anchor is reported inline, never run from a bare
fence: Hard Rule 10 requires any executed `git reset --hard` to re-derive
`$ORIG_SHA` from the rebase log in the same invocation.

`UNKNOWN` stays reserved for unavailable tooling — a missing dependency or a
command not found. A lock the project's own dev/build process holds is a
stop, never `UNKNOWN`.

Classify each check by comparing `AFTER` to `BASELINE`:

| BASELINE | AFTER | Verdict |
|----------|-------|---------|
| PASS | PASS | clean |
| PASS | FAIL | **regression — blocks the push** |
| FAIL | FAIL | pre-existing; report, does not block |
| FAIL | PASS | fixed by the base; report, does not block |
| UNKNOWN | any | no evidence either way; report as UNKNOWN |

Compare at the level of **individual test names** wherever the runner
reports them, not just the suite's exit status. A suite that failed before
and after can easily be failing for a different reason now, and a
suite-level comparison calls that clean.

**When every row is UNKNOWN, say so in those words.** Zero regressions out
of zero comparisons is not a clean verification, and reporting it as one is
the most misleading thing this skill could do. Carry the no-evidence state
into step 7 and the completion, which must report the publish as
unverified.

**Any regression is a hard stop.** Do not push. Report which check and which
named tests went from green to red, then offer the two real options: revisit
the resolution that caused it (the rebase log names each one), or
`git reset --hard "${ORIG_SHA:?}"` to restore the pre-rebase branch. Append
the outcome to the rebase log either way.

When a regression's cause is not obvious from the log,
`git range-diff "${MERGE_BASE:?}..${ORIG_SHA:?}" "${BASE_REMOTE:?}/${BASE:?}..HEAD"`
shows what each commit's content gained or lost in the replay — it is the
fastest way to find a resolution that quietly dropped a hunk. It is a
diagnostic to reach for on failure, not a required step.
