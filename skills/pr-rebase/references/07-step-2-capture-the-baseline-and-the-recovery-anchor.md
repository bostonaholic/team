Before this operation, read [artifact schema](../team/references/artifacts.md).
Resolve these links from the installed `SKILL.md` directory. If a read fails, stop and report its resolved path.

### Step 2 — capture the baseline and the recovery anchor

**This runs before the fetch and before the rebase.** It is what makes step
6's verdict meaningful.

1. Capture the anchors, and the remote tip *as it stands now* — the pre-fetch
   sha is the value step 7's publish is verified against, whichever
   publisher runs it:

   ```sh
   ORIG_SHA="$(git rev-parse HEAD)"
   REMOTE_SHA_BEFORE="$(git rev-parse "${PUSH_REMOTE:?}/$BRANCH" 2>/dev/null)"   # empty = never pushed
   ```

   The lease is taken against `$PUSH_REMOTE` — the remote the branch is
   actually pushed to (step 0) — because a lease measured against a
   different remote's same-named branch authorizes nothing meaningful.

   The merge base is deliberately *not* captured here — it is computed
   after the fetch (step 3), against the base as it actually stands.

2. Run the project's checks. Read the
   [verify playbook](../team/playbooks/verify.md)
   for detection and speed order — do not invent a check the project does
   not configure. Record, per check: the exact command, its exit status, and
   the individual failing test names where the runner reports them. Test
   *names* are what makes the comparison precise; a bare "12 failed" cannot
   distinguish a pre-existing failure from a new one.

   A check suite is the long wait this procedure runs twice, so spend it per
   [execution rules](../team/references/execution.md): one backgrounded call the harness reports
   on, never a foreground `sleep` sized to just miss the turn ceiling.

   **A check blocked by the project's own dev/build lock is a stop, not
   `UNKNOWN`.** When a local `next dev` holds `.next` (or the project's
   equivalent build cache), the check cannot execute, but that is a state the
   user can free in seconds — classifying it `UNKNOWN` silently disables the
   strongest check. Stop, name the holder, and ask the user to free it; or
   run that check before declaring the baseline. Probe the live process, not
   the lock file: a stale lock file with no holder must not stop the run.

   Scope both probes to this project so an unrelated dev server cannot match,
   and treat them as best-effort detection of the project's own dev/build
   lock, not a complete check. A build cache like `.next` is a directory, so
   the `lsof` arm searches it recursively (`lsof +D`) and tests for *output*,
   not exit status: a flat `lsof -- <dir>/.next` exits non-zero with no output
   even while a process holds files inside it, and `lsof +D` itself returns
   non-zero even when it lists a holder, so only its listing is trustworthy.
   A missing build directory lists no holder and reads as free. The `pgrep`
   arm matches only a process's argv, not its working directory, so a dev
   server launched from elsewhere whose argv omits the project root can escape
   it. An explicit `if … then … exit 1; fi` is required — an `A || B && C`
   chain parses as `(A || B) && C`, so the free path's non-match becomes the
   whole command's non-zero status.

   ```sh
   if [ -n "$(lsof +D "<project-root>/<build-dir>" 2>/dev/null)" ] \
      || pgrep -f "<project-root>/.*<dev-or-build-command>" >/dev/null 2>&1; then
     echo "stop: a live process holds this project's dev/build lock — free it and re-run" >&2
     exit 1
   fi
   ```

3. Classify each check `PASS`, `FAIL`, or `UNKNOWN`. `UNKNOWN` is for a
   check that could not execute because tooling is unavailable — a missing
   dependency, a command not found. A held dev/build lock is a stop (above),
   never `UNKNOWN`. A `FAIL` baseline is fine and does not stop the rebase.
   An `UNKNOWN` baseline permanently disables that check as evidence (Hard
   Rule 9).

4. Write it all to the rebase log, and keep the log as the working record
   for the rest of the run so none of it has to stay resident in context:

   - Resolve `<ID>` by matching `$BRANCH` against the directories under
     `docs/plans/`. On no match, create
     `docs/plans/<YYYY-MM-DD>-rebase-<branch-slug>/`. On several matches,
     ask rather than guess.
   - Write `docs/plans/<ID>/rebase-<n>.md`, where `<n>` is one past the
     highest existing `rebase-<n>.md` — append a new file per run, never
     overwrite a previous one.
   - Frontmatter per [artifact schema](../team/references/artifacts.md), plus the
     branch, `$ORIG_SHA`, `$REMOTE_SHA_BEFORE`, the resolved base and which
     discovery tier supplied it, and the baseline table. Step 3 appends
     `$MERGE_BASE` once the fetch has run.

   `docs/plans/**` is local scratch and is never committed.

5. Report the recovery anchor to the user now, in plain text:
   `Recovery: git reset --hard <ORIG_SHA>` — and repeat it at every
   subsequent stop (Hard Rule 8).
