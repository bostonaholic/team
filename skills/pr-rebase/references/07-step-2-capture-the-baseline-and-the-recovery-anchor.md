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

2. Run the project's checks. Call the Skill tool with
   `running-quality-checks`
   for detection and speed order — do not invent a check the project does
   not configure. Record, per check: the exact command, its exit status, and
   the individual failing test names where the runner reports them. Test
   *names* are what makes the comparison precise; a bare "12 failed" cannot
   distinguish a pre-existing failure from a new one.

3. Classify each check `PASS`, `FAIL`, or `UNKNOWN`. `UNKNOWN` is for a
   check that could not execute at all — missing dependencies, a command not
   found, a service it needs is down. A `FAIL` baseline is fine and does not
   stop the rebase. An `UNKNOWN` baseline permanently disables that check as
   evidence (Hard Rule 9).

4. Write it all to the rebase log, and keep the log as the working record
   for the rest of the run so none of it has to stay resident in context:

   - Resolve `<ID>` by matching `$BRANCH` against the directories under
     `docs/plans/`. On no match, create
     `docs/plans/<YYYY-MM-DD>-rebase-<branch-slug>/`. On several matches,
     ask rather than guess.
   - Write `docs/plans/<ID>/rebase-<n>.md`, where `<n>` is one past the
     highest existing `rebase-<n>.md` — append a new file per run, never
     overwrite a previous one.
   - Frontmatter per `skills/artifact-frontmatter/SKILL.md`, plus the
     branch, `$ORIG_SHA`, `$REMOTE_SHA_BEFORE`, the resolved base and which
     discovery tier supplied it, and the baseline table. Step 3 appends
     `$MERGE_BASE` once the fetch has run.

   `docs/plans/**` is local scratch and is never committed.

5. Report the recovery anchor to the user now, in plain text:
   `Recovery: git reset --hard <ORIG_SHA>` — and repeat it at every
   subsequent stop (Hard Rule 8).
