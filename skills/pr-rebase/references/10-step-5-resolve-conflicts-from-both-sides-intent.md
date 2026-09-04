### Step 5 — resolve conflicts from both sides' intent

A rebase stops once per conflicted *commit*, and that stop can carry
**several** conflicted paths. The loop below therefore resolves **every**
path the stop produced, and only then continues the rebase — a
`git rebase --continue` issued after the first path fails with unmerged
files still in the index, or, worse, continues with paths silently
unstaged. Resolve all, then continue once (step 5.7).

List what this stop actually produced:

```sh
git diff --name-only --diff-filter=U
```

**Read the inversion carefully. During a rebase, `--ours` is the upstream
base and `--theirs` is your own commit being replayed.** This is backwards
from a merge, and reversing it is the single most common way a rebase
silently discards the author's work. Address the stages positionally rather
than trusting the flag names.

**Do not assume all three stages exist.** `git show :1:` fails outright on an
add/add conflict, and one of `:2:`/`:3:` is absent on every modify/delete.
Ask the index which stages are present, then branch on the answer:

```sh
git ls-files -u -- "<path>" | cut -d' ' -f3 | cut -f1 | sort -u   # the stage numbers present
```

Each `ls-files -u` line is `<mode> <object> <stage>` and then a tab before the
path, so the first `cut` takes the third space-separated field and the second
trims the path off it. Do not collapse the pair into `awk` addressing a
numbered field: a `$` before a digit is an argument placeholder that the
slash-command loader substitutes before this skill ever reaches you.

| Stages present | Conflict type | What it means |
|----------------|---------------|---------------|
| 1, 2, 3 | content | Both sides edited a common ancestor. The normal case. |
| 2, 3 (no 1) | add/add | Both sides created the file independently. There is no ancestor to diff against — reconcile the two files directly. |
| 1, 2 (no 3) | modify/delete | The base kept it; **your commit deleted it**. |
| 1, 3 (no 2) | delete/modify | **The base deleted it**; your commit kept editing it. |

Read only the stages the table says exist:

```sh
git show ":1:<path>"   # merge base — the common ancestor (absent on add/add)
git show ":2:<path>"   # "ours"   = the BASE branch's version
git show ":3:<path>"   # "theirs" = YOUR commit's version
```

**A modify/delete is a decision, not a merge.** No text reconciles "exists"
with "does not exist", so never resolve one by defaulting to whichever side
is convenient. Reconstruct why the deletion happened (step 5.1's `git log`,
which reports deletions with `--diff-filter=D`); if the history does not
settle it, escalate it as step 5.4 describes. `git rm -- "<path>"` records
the delete and `git add -- "<path>"` records the keep; either way it is a
recorded resolution like any other.

For each conflicted path:

1. **Reconstruct both intents** from history, not from the hunk alone:

   ```sh
   git log --oneline "${MERGE_BASE:?}..${BASE_REMOTE:?}/${BASE:?}" -- "<path>"   # what the base did
   git log --oneline "${MERGE_BASE:?}..${ORIG_SHA:?}"    -- "<path>"   # what your branch did
   ```

   State both in one sentence each before writing any resolution. If you
   cannot state them, you do not yet know enough to resolve the hunk.

2. **Resolve so both intents survive.** Taking one side whole is a valid
   resolution exactly where that side's change is literally contained in the
   other (Hard Rule 4). A generated file is resolved a third way, and
   regenerating was never side-picking: a lockfile, a
   `structure.sql`, a compiled asset, or any other artifact with a
   regeneration command is resolved by **regenerating it** after the source
   conflicts are settled — not by `--ours` / `--theirs`, which produces a
   file consistent with neither side's inputs.

3. **Delegate a large conflicted file to a subagent.** For a conflicted file
   beyond a few hundred lines, dispatch a read-only subagent with the three
   stage blobs and both `git log` outputs, and have it return the
   reconciliation — both intents plus the merged hunk text — rather than
   pulling the whole file into this window. Apply the returned resolution
   inline; the subagent does not write to the index. Launch independent
   per-file subagents in one message.

4. **Escalate an undecidable hunk, and only that hunk.** When both sides
   made a semantic change to the same logic and no evidence in the code,
   the tests, or the history decides between them, fire `AskUserQuestion`
   (header `Conflict`) naming the file and the two intents as the options.
   Leave the rebase in progress — its state lives in `.git`, so it survives
   the turn. Do **not** abort the whole rebase over one hunk, and do not
   guess to avoid asking.

5. **Record the resolution** to the step 2 log before continuing: the path,
   both intents in one sentence each, what was kept, why, and whether it was
   resolved autonomously or escalated. This is the artifact a reviewer reads
   when the rebased diff looks surprising.

6. **Prove no markers survive in THIS path**, then stage it — still inside
   the per-path loop, with no `--continue` yet:

   ```sh
   git grep -nE '^(<{7}|={7}|>{7})( |$)' -- "<path>" && { echo "refusing: conflict markers remain" >&2; exit 1; }
   git add -- "<path>"
   git diff --cached --check
   ```

   The grep runs against the working tree **before** the `git add`, so a
   marker never reaches the index; `git diff --cached --check` then inspects
   what was actually staged. Order matters — run `--check` first and it
   examines an empty staged diff and passes vacuously. The two are
   complementary: `--check` catches the markers git recognizes, the grep
   catches the ones inside strings and comments that it does not.

Then, **once per rebase stop, after every path above is resolved**:

7. **Confirm nothing is left unmerged, and continue:**

   ```sh
   [ -z "$(git diff --name-only --diff-filter=U)" ] \
     || { echo "refusing: unmerged paths remain — resolve them before continuing" >&2; exit 1; }
   GIT_EDITOR=true git rebase --continue
   ```

   The emptiness check is the loop's exit condition, and it is what makes
   the multi-path case correct: it fails loudly if any path from this stop
   was missed, instead of letting `--continue` do it.

   `GIT_EDITOR=true` is required, not decorative. With staged changes,
   `git rebase --continue` opens the editor to confirm the commit message;
   in a non-interactive shell with no `EDITOR` configured git aborts with
   `Terminal is dumb, but EDITOR unset` and the rebase is left mid-flight.
   `true` accepts the existing message unchanged, which is what preserving
   the replayed commit calls for. The same applies to any other rebase
   command this skill runs that can reach an editor.

   A rebase with several conflicting commits stops again after this. Each
   stop re-enters step 5 from the top with its own path list.

**A clean git merge is not a semantic merge.** Before continuing past a
stop, sweep the commit's own files — conflicted or not — for semantic
coupling to what the base changed: a file the base renamed that this
branch still cites by its old path, a moved directory, a renamed symbol.
Git merges those files clean because no lines collide, so nothing stops
at a marker, and the breakage surfaces only at step 6 — or after the
push. Apply such fixups now, stage them into the replayed commit beside
the conflict resolutions, and record each in the step 2 log with the
base change that forced it.

**To abandon mid-rebase**, `git rebase --abort` restores the pre-rebase
state exactly. Never `git rebase --skip` (Hard Rule 3).
