# Conflict resolution

Load only while a rebase is stopped on conflicts.

1. Enumerate all paths before continuing:

   ```sh
   git diff --name-only --diff-filter=U
   git ls-files -u -- "<path>" | cut -d' ' -f3 | cut -f1 | sort -u
   ```

2. Read every available stage. During rebase, ours is the base branch and
   theirs is the replayed feature commit:

   ```sh
   git show ":1:<path>"
   git show ":2:<path>"
   git show ":3:<path>"
   ```

3. Read intent from both histories:

   ```sh
   git log --oneline "${MERGE_BASE:?}..${BASE_REMOTE:?}/${BASE:?}" -- "<path>"
   git log --oneline "${MERGE_BASE:?}..${ORIG_SHA:?}" -- "<path>"
   ```

4. Preserve both compatible intentions. Regenerate generated files from their
   source. For a large or opaque file, use a read-only helper. If intent is
   genuinely undecidable, ask the user and leave the rebase intact.
5. Record stage classification, both intents, decision, and evidence in the
   append-only rebase log.
6. Before staging, reject conflict markers. Stage only resolved paths, then
   prove no unmerged path remains:

   ```sh
   git grep -nE '^(<<<<<<<|=======|>>>>>>>)' -- "<path>" && exit 1
   git add -- "<path>"
   git diff --name-only --diff-filter=U
   ```

   Check semantically coupled files before continuing.

Never take all ours/theirs blindly and never skip a commit.
